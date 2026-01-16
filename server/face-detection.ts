import * as faceapi from '@vladmandic/face-api';
import * as tf from '@tensorflow/tfjs-node';
import * as path from 'path';
import * as fs from 'fs';

let modelsLoaded = false;

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  landmarks?: {
    leftEye: { x: number; y: number };
    rightEye: { x: number; y: number };
    nose: { x: number; y: number };
    leftMouth: { x: number; y: number };
    rightMouth: { x: number; y: number };
  };
}

export interface FaceRegionMask {
  faceBox: FaceBox | null;
  faceMask: boolean[];
  bodyMask: boolean[];
  width: number;
  height: number;
}

async function loadModels(): Promise<void> {
  if (modelsLoaded) return;

  const modelPath = path.join(process.cwd(), 'models');
  
  if (!fs.existsSync(modelPath)) {
    fs.mkdirSync(modelPath, { recursive: true });
  }

  try {
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
    modelsLoaded = true;
    console.log('Face detection models loaded successfully');
  } catch (error) {
    console.log('Face detection models not found, will use fallback detection');
  }
}

export async function detectFace(imageBuffer: Buffer, targetWidth: number, targetHeight: number): Promise<FaceBox | null> {
  try {
    await loadModels();

    if (!modelsLoaded) {
      return fallbackFaceDetection(targetWidth, targetHeight);
    }

    // NOTE: imageBuffer should already be the PREPROCESSED image (same crop/resize applied)
    // This ensures face coordinates are directly in the target coordinate space
    const tensor = tf.node.decodeImage(imageBuffer, 3);
    const tensorShape = tensor.shape;
    const detectedHeight = tensorShape[0] as number;
    const detectedWidth = tensorShape[1] as number;
    
    console.log(`Face detection on ${detectedWidth}x${detectedHeight} image (target: ${targetWidth}x${targetHeight})`);
    
    const detection = await faceapi.detectSingleFace(tensor as any).withFaceLandmarks();
    tensor.dispose();

    if (!detection) {
      console.log('No face detected, using fallback');
      return fallbackFaceDetection(targetWidth, targetHeight);
    }

    const box = detection.detection.box;
    const landmarks = detection.landmarks;

    // If image dimensions match target, no scaling needed (coordinates already correct)
    // If they differ slightly (due to PNG encoding), scale proportionally
    const scaleX = targetWidth / detectedWidth;
    const scaleY = targetHeight / detectedHeight;
    
    console.log(`Face box: (${Math.round(box.x * scaleX)}, ${Math.round(box.y * scaleY)}) ${Math.round(box.width * scaleX)}x${Math.round(box.height * scaleY)}`);

    const faceBoxResult: FaceBox = {
      x: box.x * scaleX,
      y: box.y * scaleY,
      width: box.width * scaleX,
      height: box.height * scaleY,
      landmarks: {
        leftEye: { x: landmarks.getLeftEye()[0].x * scaleX, y: landmarks.getLeftEye()[0].y * scaleY },
        rightEye: { x: landmarks.getRightEye()[0].x * scaleX, y: landmarks.getRightEye()[0].y * scaleY },
        nose: { x: landmarks.getNose()[3].x * scaleX, y: landmarks.getNose()[3].y * scaleY },
        leftMouth: { x: landmarks.getMouth()[0].x * scaleX, y: landmarks.getMouth()[0].y * scaleY },
        rightMouth: { x: landmarks.getMouth()[6].x * scaleX, y: landmarks.getMouth()[6].y * scaleY },
      }
    };

    return faceBoxResult;
  } catch (error) {
    console.log('Face detection failed, using fallback:', error);
    return fallbackFaceDetection(targetWidth, targetHeight);
  }
}

function fallbackFaceDetection(width: number, height: number): FaceBox {
  const faceWidth = width * 0.4;
  const faceHeight = height * 0.5;
  const x = (width - faceWidth) / 2;
  const y = height * 0.15;

  return {
    x,
    y,
    width: faceWidth,
    height: faceHeight,
  };
}

export function createFaceRegionMask(
  faceBox: FaceBox | null,
  width: number,
  height: number
): FaceRegionMask {
  const totalPixels = width * height;
  const faceMask = new Array(totalPixels).fill(false);
  const bodyMask = new Array(totalPixels).fill(false);

  if (!faceBox) {
    return { faceBox: null, faceMask, bodyMask, width, height };
  }

  // TIGHTER face expansion - only 1.1x to focus on actual facial features
  // This prevents threads from criss-crossing the entire head area
  const expandedBox = {
    x: Math.max(0, faceBox.x - faceBox.width * 0.05),
    y: Math.max(0, faceBox.y - faceBox.height * 0.05),
    width: faceBox.width * 1.1,
    height: faceBox.height * 1.1,
  };

  // Body box is more conservative - just below/around face
  const bodyBox = {
    x: Math.max(0, faceBox.x - faceBox.width * 0.3),
    y: Math.max(0, faceBox.y - faceBox.height * 0.1),
    width: faceBox.width * 1.6,
    height: faceBox.height * 2.0,
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;

      if (x >= expandedBox.x && x <= expandedBox.x + expandedBox.width &&
          y >= expandedBox.y && y <= expandedBox.y + expandedBox.height) {
        faceMask[idx] = true;
      }

      if (x >= bodyBox.x && x <= bodyBox.x + bodyBox.width &&
          y >= bodyBox.y && y <= bodyBox.y + bodyBox.height) {
        bodyMask[idx] = true;
      }
    }
  }

  return { faceBox, faceMask, bodyMask, width, height };
}

// Get face overdraw threshold - balance between preventing muddy accumulation and allowing enough detail
export function getFaceOverdrawThreshold(region: 'face' | 'body' | 'background'): number {
  switch (region) {
    case 'face': return 0.80;    // Raised to 0.80 to allow more face detail before throttling
    case 'body': return 0.80;
    case 'background': return 0.90;
  }
}

export function getRegionForPixel(
  x: number,
  y: number,
  regionMask: FaceRegionMask
): 'face' | 'body' | 'background' {
  const idx = y * regionMask.width + x;
  
  if (regionMask.faceMask[idx]) return 'face';
  if (regionMask.bodyMask[idx]) return 'body';
  return 'background';
}

export function getMinPinSkipForRegion(
  region: 'face' | 'body' | 'background',
  qualityPreset?: 'fast' | 'balanced' | 'high'
): number {
  switch (region) {
    case 'face': return 2;
    case 'body': return 4;
    case 'background':
      // Background uses 6-8 range based on quality preset
      // Higher quality = smaller skip = more detail
      if (qualityPreset === 'high') return 6;
      if (qualityPreset === 'balanced') return 7;
      return 8; // fast or default
  }
}

export function getEffectiveMinSkip(
  currentRegion: 'face' | 'body' | 'background',
  candidateRegion: 'face' | 'body' | 'background',
  qualityPreset?: 'fast' | 'balanced' | 'high',
  baseMinSkip?: number
): number {
  const currentSkip = getMinPinSkipForRegion(currentRegion, qualityPreset);
  const candidateSkip = getMinPinSkipForRegion(candidateRegion, qualityPreset);
  
  // If either pin is in face region, allow smaller skip (more detail for face)
  // But ensure we don't go below face's minimum of 2
  if (currentRegion === 'face' || candidateRegion === 'face') {
    return 2; // Face priority: allow detailed lines
  }
  
  // Both pins are in body or background - use the larger of the two region skips
  // to ensure body/background regions maintain their proper spacing
  // Also ensure we don't go below the base minSkip if provided
  const regionMax = Math.max(currentSkip, candidateSkip);
  return baseMinSkip !== undefined ? Math.max(regionMax, baseMinSkip) : regionMax;
}

export function isLineInFaceRegion(
  x0: number, y0: number,
  x1: number, y1: number,
  regionMask: FaceRegionMask
): boolean {
  const midX = (x0 + x1) / 2;
  const midY = (y0 + y1) / 2;
  const idx = Math.floor(midY) * regionMask.width + Math.floor(midX);
  return regionMask.faceMask[idx] || false;
}

export function getLineFaceOverlap(
  pixels: number[],
  regionMask: FaceRegionMask
): number {
  if (pixels.length === 0) return 0;
  let facePixels = 0;
  for (const idx of pixels) {
    if (regionMask.faceMask[idx]) facePixels++;
  }
  return facePixels / pixels.length;
}
