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

export async function detectFace(imageBuffer: Buffer, width: number, height: number): Promise<FaceBox | null> {
  try {
    await loadModels();

    if (!modelsLoaded) {
      return fallbackFaceDetection(width, height);
    }

    const tensor = tf.node.decodeImage(imageBuffer, 3);
    const detection = await faceapi.detectSingleFace(tensor as any).withFaceLandmarks();
    tensor.dispose();

    if (!detection) {
      return fallbackFaceDetection(width, height);
    }

    const box = detection.detection.box;
    const landmarks = detection.landmarks;

    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      landmarks: {
        leftEye: landmarks.getLeftEye()[0],
        rightEye: landmarks.getRightEye()[0],
        nose: landmarks.getNose()[3],
        leftMouth: landmarks.getMouth()[0],
        rightMouth: landmarks.getMouth()[6],
      }
    };
  } catch (error) {
    console.log('Face detection failed, using fallback:', error);
    return fallbackFaceDetection(width, height);
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

  const expandedBox = {
    x: Math.max(0, faceBox.x - faceBox.width * 0.2),
    y: Math.max(0, faceBox.y - faceBox.height * 0.2),
    width: faceBox.width * 1.4,
    height: faceBox.height * 1.4,
  };

  const bodyBox = {
    x: Math.max(0, faceBox.x - faceBox.width * 0.8),
    y: Math.max(0, faceBox.y - faceBox.height * 0.3),
    width: faceBox.width * 2.6,
    height: faceBox.height * 2.5,
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
