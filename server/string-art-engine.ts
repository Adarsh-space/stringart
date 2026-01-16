import { type GenerationParams, type Pin, type ThreadConnection, type StringArtResult, type ThreadColorSummary, type AccuracyMetrics } from "@shared/schema";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { detectFace, createFaceRegionMask, getRegionForPixel, getMinPinSkipForRegion, getEffectiveMinSkip, isLineInFaceRegion, getLineFaceOverlap, type FaceBox, type FaceRegionMask } from "./face-detection";

// Export helper functions for SVG and PDF generation
export function generateSVG(result: StringArtResult): string {
  const { imageWidth, imageHeight, pins, connections, frameType, params } = result;
  const padding = 20;
  const svgWidth = imageWidth + padding * 2;
  const svgHeight = imageHeight + padding * 2;
  
  // Use actual thread parameters from generation
  const threadWidth = params?.threadWidth || 0.5;
  const threadOpacity = params?.threadOpacity || 0.15;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <rect width="100%" height="100%" fill="white"/>
  <g transform="translate(${padding}, ${padding})">`;

  // Draw frame outline
  if (frameType === "circular") {
    const cx = imageWidth / 2;
    const cy = imageHeight / 2;
    const r = Math.min(imageWidth, imageHeight) / 2 - 5;
    svg += `\n    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ddd" stroke-width="2"/>`;
  } else {
    svg += `\n    <rect x="5" y="5" width="${imageWidth - 10}" height="${imageHeight - 10}" fill="none" stroke="#ddd" stroke-width="2"/>`;
  }

  // Draw threads with actual thread width and opacity
  for (const conn of connections) {
    const fromPin = pins[conn.fromPin];
    const toPin = pins[conn.toPin];
    if (!fromPin || !toPin) continue;
    
    const color = conn.color || "#000000";
    svg += `\n    <line x1="${fromPin.x}" y1="${fromPin.y}" x2="${toPin.x}" y2="${toPin.y}" stroke="${color}" stroke-width="${threadWidth}" stroke-opacity="${threadOpacity}"/>`;
  }

  // Draw pins
  for (const pin of pins) {
    svg += `\n    <circle cx="${pin.x}" cy="${pin.y}" r="2" fill="#333"/>`;
  }

  svg += `\n  </g>\n</svg>`;
  return svg;
}

export function generatePDF(result: StringArtResult): Buffer {
  // Simple PDF generation using raw PDF format
  const { pins, connections, totalThreads, threadColors, accuracyScore } = result;
  
  // Create instruction pages
  const instructions: string[] = [];
  instructions.push("STRING ART ASSEMBLY GUIDE");
  instructions.push("");
  instructions.push(`Total Threads: ${totalThreads}`);
  instructions.push(`Total Pins: ${pins.length}`);
  if (accuracyScore) {
    instructions.push(`Accuracy Score: ${accuracyScore}%`);
  }
  instructions.push("");
  
  if (threadColors && threadColors.length > 0) {
    instructions.push("THREAD COLORS NEEDED:");
    for (const tc of threadColors) {
      instructions.push(`  ${tc.colorName} (${tc.color}): ${tc.count} threads (${tc.percentage}%)`);
    }
    instructions.push("");
  }
  
  instructions.push("STEP-BY-STEP INSTRUCTIONS:");
  instructions.push("");
  
  let currentPin = connections[0]?.fromPin ?? 0;
  for (let i = 0; i < Math.min(connections.length, 500); i++) {
    const conn = connections[i];
    const color = conn.color ? ` [${conn.color}]` : "";
    instructions.push(`Step ${i + 1}: Pin ${conn.fromPin + 1} -> Pin ${conn.toPin + 1}${color}`);
  }
  
  if (connections.length > 500) {
    instructions.push(`... and ${connections.length - 500} more steps`);
  }
  
  const text = instructions.join("\n");
  
  // Generate minimal PDF
  const content = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${text.length + 50} >>
stream
BT
/F1 10 Tf
50 750 Td
12 TL
${text.split("\n").map(line => `(${line.replace(/[()\\]/g, "\\$&")}) '`).join("\n")}
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
${400 + text.length}
%%EOF`;

  return Buffer.from(content);
}

interface PixelData {
  width: number;
  height: number;
  data: number[]; // Grayscale values 0-255 (inverted: 0=white, 255=black for string art)
}

interface ColorPixelData {
  width: number;
  height: number;
  data: { r: number; g: number; b: number }[]; // RGB values
}

interface LABColor {
  L: number;
  a: number;
  b: number;
}

// Predefined thread color palette with LAB values for perceptual matching
const THREAD_PALETTE = [
  { hex: "#000000", name: "Black", lab: { L: 0, a: 0, b: 0 } },
  { hex: "#FFFFFF", name: "White", lab: { L: 100, a: 0, b: 0 } },
  { hex: "#8B4513", name: "Brown", lab: { L: 37, a: 18, b: 35 } },
  { hex: "#CD853F", name: "Tan", lab: { L: 60, a: 16, b: 45 } },
  { hex: "#FFE4C4", name: "Beige", lab: { L: 92, a: 4, b: 16 } },
  { hex: "#FF0000", name: "Red", lab: { L: 53, a: 80, b: 67 } },
  { hex: "#DC143C", name: "Crimson", lab: { L: 47, a: 71, b: 42 } },
  { hex: "#FF6347", name: "Coral", lab: { L: 62, a: 53, b: 47 } },
  { hex: "#FF69B4", name: "Hot Pink", lab: { L: 65, a: 62, b: -13 } },
  { hex: "#FFA500", name: "Orange", lab: { L: 75, a: 27, b: 75 } },
  { hex: "#FFD700", name: "Gold", lab: { L: 87, a: -2, b: 84 } },
  { hex: "#FFFF00", name: "Yellow", lab: { L: 97, a: -22, b: 94 } },
  { hex: "#9ACD32", name: "Yellow Green", lab: { L: 76, a: -35, b: 57 } },
  { hex: "#00FF00", name: "Lime", lab: { L: 88, a: -86, b: 83 } },
  { hex: "#228B22", name: "Forest Green", lab: { L: 50, a: -42, b: 36 } },
  { hex: "#006400", name: "Dark Green", lab: { L: 36, a: -43, b: 39 } },
  { hex: "#00CED1", name: "Turquoise", lab: { L: 75, a: -33, b: -12 } },
  { hex: "#00BFFF", name: "Sky Blue", lab: { L: 72, a: -17, b: -43 } },
  { hex: "#0000FF", name: "Blue", lab: { L: 32, a: 79, b: -108 } },
  { hex: "#000080", name: "Navy", lab: { L: 12, a: 47, b: -64 } },
  { hex: "#8B008B", name: "Purple", lab: { L: 30, a: 56, b: -45 } },
  { hex: "#9400D3", name: "Violet", lab: { L: 40, a: 74, b: -72 } },
  { hex: "#808080", name: "Gray", lab: { L: 54, a: 0, b: 0 } },
  { hex: "#A9A9A9", name: "Dark Gray", lab: { L: 70, a: 0, b: 0 } },
  { hex: "#D3D3D3", name: "Light Gray", lab: { L: 85, a: 0, b: 0 } },
];

interface GeneratorState {
  targetImage: PixelData;
  colorImage?: ColorPixelData; // Original color data for color mode
  progressImage: number[]; // Current accumulated darkness (linear density 0-1)
  densityImage: number[]; // Accumulated density in linear space (0-1)
  colorProgressImage?: { r: number; g: number; b: number }[]; // Color progress for color mode
  colorDensityImage?: { r: number; g: number; b: number }[]; // Color density in linear space
  edgeMap: number[]; // Edge weights
  edgeGradientX: number[]; // Edge gradient X direction for alignment
  edgeGradientY: number[]; // Edge gradient Y direction for alignment
  pins: Pin[];
  connections: ThreadConnection[];
  pinUsageCount: number[];
  currentPin: number;
  lineCache: Map<string, number[]>; // Cache for line pixel indices
  lineSoftCache: Map<string, { idx: number; weight: number }[]>; // Soft-edge pixel cache
  overdrawMap: number[]; // Track overdraw per pixel
  // Accuracy metrics
  currentMSE: number;
  currentSSIM: number;
  targetSum: number; // Pre-computed for efficiency
  // Multi-resolution buffers for v4.0 optimization
  targetLowRes?: PixelData;  // 1/4 scale (128x128)
  targetMidRes?: PixelData;  // 1/2 scale (256x256)
  progressLowRes?: number[]; // Low-res progress
  progressMidRes?: number[]; // Mid-res progress
  // Edge-guided candidate cache
  edgeGuidedCandidates?: Map<number, number[]>; // Pin -> edge-aligned candidate pins
  // Per-channel color targets for true color mode
  channelTargets?: {
    cyan: number[];
    magenta: number[];
    yellow: number[];
    black: number[];
  };
  // Current channel being optimized
  currentChannel?: 'cyan' | 'magenta' | 'yellow' | 'black';
  // Face region mask for face-focused optimization
  faceRegionMask?: FaceRegionMask;
  faceBox?: FaceBox | null;
}

// Callback for progress updates - now includes accuracy metrics
type ProgressCallback = (
  currentThread: number,
  totalThreads: number,
  stage: string,
  previewData?: string,
  accuracy?: { mse: number; ssim: number; similarity: number }
) => void;

export class StringArtEngine {
  private params: GenerationParams;
  private state: GeneratorState | null = null;
  private cancelled = false;

  constructor(params: GenerationParams) {
    this.params = params;
  }

  cancel(): void {
    this.cancelled = true;
  }

  async generate(
    imageDataUrl: string,
    onProgress: ProgressCallback
  ): Promise<StringArtResult> {
    this.cancelled = false;

    // Step 1: Preprocess image
    onProgress(0, this.params.maxThreads, "Preprocessing image...");
    const imageData = await this.preprocessImage(imageDataUrl);

    // Step 1.5: Detect face in image for face-focused optimization
    onProgress(0, this.params.maxThreads, "Detecting face...");
    let faceBox: FaceBox | null = null;
    let faceRegionMask: FaceRegionMask | undefined;
    try {
      const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      faceBox = await detectFace(imageBuffer, imageData.width, imageData.height);
      if (faceBox) {
        faceRegionMask = createFaceRegionMask(faceBox, imageData.width, imageData.height);
        console.log(`Face detected at (${Math.round(faceBox.x)}, ${Math.round(faceBox.y)}) size ${Math.round(faceBox.width)}x${Math.round(faceBox.height)}`);
      }
    } catch (error) {
      console.log('Face detection skipped:', error);
    }

    // Step 2: Generate pins (with face-aware distribution if face detected)
    onProgress(0, this.params.maxThreads, "Generating pins...");
    const pins = this.generatePinsWithFaceAwareness(imageData.width, imageData.height, faceBox);

    // Step 3: Generate edge map if enabled
    let edgeMap: number[] = [];
    if (this.params.useEdgeDetection) {
      onProgress(0, this.params.maxThreads, "Detecting edges...");
      edgeMap = this.generateEdgeMap(imageData);
    }

    // Step 3.5: Load color image if color mode enabled
    let colorImage: ColorPixelData | undefined;
    if (this.params.colorMode === "color") {
      onProgress(0, this.params.maxThreads, "Loading color data...");
      colorImage = await this.preprocessColorImage(imageDataUrl, imageData.width, imageData.height);
    }

    // Pre-compute target sum for SSIM
    let targetSum = 0;
    for (const val of imageData.data) {
      targetSum += val;
    }

    // Step 4: Initialize state
    // Initialize color progress image if in color mode (starts white)
    const pixelCount = imageData.width * imageData.height;
    const colorProgressImage = colorImage ? 
      new Array(pixelCount).fill(null).map(() => ({ r: 255, g: 255, b: 255 })) : 
      undefined;
    const colorDensityImage = colorImage ?
      new Array(pixelCount).fill(null).map(() => ({ r: 0, g: 0, b: 0 })) :
      undefined;

    // Generate edge gradients for edge-aligned line selection
    const { gradientX, gradientY } = this.generateEdgeGradients(imageData);

    this.state = {
      targetImage: imageData,
      colorImage,
      progressImage: new Array(pixelCount).fill(255),
      densityImage: new Array(pixelCount).fill(0), // Linear density starts at 0
      colorProgressImage,
      colorDensityImage,
      edgeMap,
      edgeGradientX: gradientX,
      edgeGradientY: gradientY,
      pins,
      connections: [],
      pinUsageCount: new Array(pins.length).fill(0),
      currentPin: 0,
      lineCache: new Map(),
      lineSoftCache: new Map(),
      overdrawMap: new Array(pixelCount).fill(0),
      currentMSE: this.calculateMSE(imageData.data, new Array(pixelCount).fill(255)),
      currentSSIM: 0,
      targetSum,
      faceRegionMask,
      faceBox,
    };

    // Step 5: Greedy optimization with REAL-TIME thread-by-thread visualization
    onProgress(0, this.params.maxThreads, "Generating threads...");
    
    // V4.2: Use INTERLEAVED color optimization for color mode (colors cooperate, not fight)
    if (this.params.colorMode === "color" && colorImage) {
      await this.runInterleavedColorOptimization(onProgress);
    } else if (this.params.qualityPreset === "high") {
      // V4.0: Use multi-scale pipeline for "high" quality (better structure preservation)
      await this.runMultiScaleOptimization(onProgress);
    } else {
      await this.runAdvancedGreedyOptimization(onProgress);
    }

    // Step 5.25: Face refinement pass - extra threads focused on face region
    if (!this.cancelled && this.state.faceRegionMask && this.state.faceBox) {
      onProgress(
        this.state.connections.length,
        this.params.maxThreads,
        "Adding face detail threads..."
      );
      await this.runFaceRefinementPass(onProgress);
    }

    // Step 5.5: Local refinement pass - only for monochrome mode
    // (Color mode already has per-channel optimization)
    if (!this.cancelled && this.params.colorMode !== "color") {
      onProgress(
        this.state.connections.length,
        this.params.maxThreads,
        "Running local refinement..."
      );
      await this.runLocalRefinement(onProgress);
    }

    // Step 6: Simulated annealing refinement (only for monochrome)
    if (this.params.useSimulatedAnnealing && !this.cancelled && this.params.colorMode !== "color") {
      onProgress(
        this.state.connections.length,
        this.params.maxThreads,
        "Refining with simulated annealing..."
      );
      await this.runEnhancedSimulatedAnnealing(onProgress);
    }

    // Step 7: Genetic algorithm refinement (only for monochrome high quality)
    if (this.params.qualityPreset === "high" && !this.cancelled && this.params.colorMode !== "color") {
      onProgress(
        this.state.connections.length,
        this.params.maxThreads,
        "Running genetic optimization..."
      );
      await this.runGeneticRefinement(onProgress);
    }

    // Step 8: Backtracking cleanup (only for monochrome)
    if (this.params.colorMode !== "color") {
      onProgress(
        this.state.connections.length,
        this.params.maxThreads,
        "Cleaning up low-value threads..."
      );
      await this.runPerceptualBacktracking();
    }

    // Step 9: Calculate thread color summary
    let threadColors: ThreadColorSummary[] | undefined;
    if (this.params.colorMode === "color") {
      // Color mode - count threads by CMYK channel
      const colorCounts = new Map<string, { color: string; name: string; count: number }>();
      for (const conn of this.state.connections) {
        const color = conn.color || "#000000";
        const name = conn.colorName || "Unknown";
        const existing = colorCounts.get(color);
        if (existing) {
          existing.count++;
        } else {
          colorCounts.set(color, { color, name, count: 1 });
        }
      }
      threadColors = Array.from(colorCounts.values())
        .map(c => ({
          color: c.color,
          colorName: c.name,
          count: c.count,
          percentage: Math.round((c.count / this.state!.connections.length) * 100)
        }))
        .sort((a, b) => b.count - a.count);
    } else {
      // Monochrome mode - single black thread
      threadColors = [{
        color: "#000000",
        colorName: "Black",
        count: this.state.connections.length,
        percentage: 100,
      }];
      // Set all connections to black
      for (const conn of this.state.connections) {
        conn.color = "#000000";
      }
    }

    // Calculate final accuracy metrics
    const finalMSE = this.calculateCurrentMSE();
    const finalSSIM = this.calculateSSIM();
    const similarity = Math.max(0, Math.min(100, (1 - finalMSE / 65025) * 100 * 0.6 + finalSSIM * 100 * 0.4));

    // Step 10: Generate result - use color preview for color mode
    const previewDataUrl = this.params.colorMode === "color" 
      ? this.generateColorPreviewDataUrl()
      : this.generatePreviewDataUrl();

    const result: StringArtResult = {
      id: randomUUID(),
      imageWidth: imageData.width,
      imageHeight: imageData.height,
      frameType: this.params.frameType,
      pins: this.state.pins,
      connections: this.state.connections,
      totalThreads: this.state.connections.length,
      params: this.params,
      createdAt: new Date().toISOString(),
      previewDataUrl,
      threadColors,
      accuracyScore: Math.round(similarity * 10) / 10,
      mse: Math.round(finalMSE * 100) / 100,
      ssim: Math.round(finalSSIM * 1000) / 1000,
    };

    return result;
  }

  // ============================================================
  // CONTINUE GENERATION (add more threads to existing result)
  // Note: Face-focused optimization is not available in continue mode
  // since we don't have access to the original image for face detection.
  // Uses standard minPinSkip for all candidates.
  // ============================================================

  async continueGeneration(
    existingResult: StringArtResult,
    additionalThreads: number,
    onProgress: ProgressCallback
  ): Promise<StringArtResult> {
    this.cancelled = false;

    // Reconstruct state from existing result
    const width = existingResult.imageWidth;
    const height = existingResult.imageHeight;
    const totalPixels = width * height;

    // Initialize progress image by re-rendering existing threads
    const progressImage = new Array(totalPixels).fill(255);
    const colorProgressImage = this.params.colorMode === "color" 
      ? new Array(totalPixels).fill(null).map(() => ({ r: 255, g: 255, b: 255 }))
      : undefined;

    // Re-apply existing connections to rebuild progress state
    // Also track overdraw and density for v3.0 scoring consistency
    const threadOpacity = this.params.threadOpacity;
    const overdrawMap = new Array(totalPixels).fill(0);
    const densityImage = new Array(totalPixels).fill(0);
    
    for (const conn of existingResult.connections) {
      const fromPin = existingResult.pins[conn.fromPin];
      const toPin = existingResult.pins[conn.toPin];
      if (!fromPin || !toPin) continue;

      const pixels = this.bresenhamLine(fromPin.x, fromPin.y, toPin.x, toPin.y, width, height);
      
      for (const idx of pixels) {
        // Gamma-corrected blending for monochrome
        const currentLinear = Math.pow(progressImage[idx] / 255, 2.2);
        const blendedLinear = currentLinear * (1 - threadOpacity);
        progressImage[idx] = Math.max(0, Math.round(Math.pow(blendedLinear, 1/2.2) * 255));

        // Track overdraw and density for scoring
        overdrawMap[idx]++;
        const oldDensity = densityImage[idx];
        densityImage[idx] = oldDensity + threadOpacity * (1 - oldDensity);

        // Update color progress if in color mode - use SUBTRACTIVE absorption (matching v4.2)
        if (colorProgressImage && conn.color) {
          const colorR = parseInt(conn.color.slice(1, 3), 16);
          const colorG = parseInt(conn.color.slice(3, 5), 16);
          const colorB = parseInt(conn.color.slice(5, 7), 16);
          const colorRLinear = Math.pow(colorR / 255, 2.2);
          const colorGLinear = Math.pow(colorG / 255, 2.2);
          const colorBLinear = Math.pow(colorB / 255, 2.2);
          
          const current = colorProgressImage[idx];
          const currentRLinear = Math.pow(current.r / 255, 2.2);
          const currentGLinear = Math.pow(current.g / 255, 2.2);
          const currentBLinear = Math.pow(current.b / 255, 2.2);
          
          // Subtractive blending in linear space: thread absorbs light
          const absorbR = (1 - colorRLinear) * threadOpacity;
          const absorbG = (1 - colorGLinear) * threadOpacity;
          const absorbB = (1 - colorBLinear) * threadOpacity;
          
          const newRLinear = currentRLinear * (1 - absorbR);
          const newGLinear = currentGLinear * (1 - absorbG);
          const newBLinear = currentBLinear * (1 - absorbB);
          
          colorProgressImage[idx] = {
            r: Math.max(0, Math.min(255, Math.round(Math.pow(newRLinear, 1/2.2) * 255))),
            g: Math.max(0, Math.min(255, Math.round(Math.pow(newGLinear, 1/2.2) * 255))),
            b: Math.max(0, Math.min(255, Math.round(Math.pow(newBLinear, 1/2.2) * 255))),
          };
        }
      }
    }

    // Calculate pin usage from existing connections
    const pinUsageCount = new Array(existingResult.pins.length).fill(0);
    for (const conn of existingResult.connections) {
      pinUsageCount[conn.fromPin]++;
      pinUsageCount[conn.toPin]++;
    }

    // Get current pin (last toPin from connections)
    const lastConn = existingResult.connections[existingResult.connections.length - 1];
    const currentPin = lastConn ? lastConn.toPin : 0;

    // We need the original target image - create a simple grayscale from existing
    // For proper continuation, we'd need to store the original image
    // For now, we'll create a target from the preview or work without it
    const targetData = new Array(totalPixels).fill(128); // Placeholder

    this.state = {
      targetImage: { data: targetData, width, height },
      progressImage,
      densityImage, // Use the computed density from replayed threads
      colorProgressImage,
      colorDensityImage: colorProgressImage ? new Array(totalPixels).fill(null).map(() => ({ r: 0, g: 0, b: 0 })) : undefined,
      edgeMap: [],
      edgeGradientX: new Array(totalPixels).fill(0),
      edgeGradientY: new Array(totalPixels).fill(0),
      pins: existingResult.pins,
      connections: [...existingResult.connections],
      pinUsageCount,
      currentPin,
      lineCache: new Map(),
      lineSoftCache: new Map(),
      overdrawMap, // Use the computed overdraw from replayed threads
      currentMSE: 0,
      currentSSIM: 0,
      targetSum: 0,
    };

    // Continue greedy optimization for additional threads
    const startThread = existingResult.connections.length;
    const totalThreads = startThread + additionalThreads;
    
    onProgress(startThread, totalThreads, "Continuing generation...");

    // Run additional threads
    const delayPerThread = 0;
    const previewInterval = Math.max(1, Math.floor(additionalThreads / 50));
    let lastPreviewUpdate = 0;

    // Pre-compute target LAB for color mode
    let targetLab: { L: number; a: number; b: number }[] | undefined;
    if (this.params.colorMode === "color" && this.state.colorProgressImage) {
      // Rebuild target LAB from color progress (approximation for continue)
      targetLab = new Array(totalPixels);
      for (let i = 0; i < totalPixels; i++) {
        // Use current progress as rough target (imperfect but functional)
        const current = this.state.colorProgressImage[i];
        targetLab[i] = this.rgbToLAB(current.r, current.g, current.b);
      }
      this.recentColorCounts.clear();
    }

    for (let threadNum = startThread; threadNum < totalThreads && !this.cancelled; threadNum++) {
      const pinCount = this.state.pins.length;
      let bestPin = -1;
      let bestScore = -Infinity;
      let bestColor = this.THREAD_COLOR_PALETTE[0]; // Default black

      if (this.params.colorMode === "color" && this.state.colorProgressImage && targetLab) {
        // V4.2 Interleaved: evaluate all colors for each candidate
        const candidates = this.generateColorCandidates(this.state.currentPin, this.params.minPinSkip, 25, 10);
        
        for (const candidatePin of candidates) {
          for (const colorOption of this.THREAD_COLOR_PALETTE) {
            const score = this.evaluateColoredLine(
              this.state.currentPin,
              candidatePin,
              colorOption,
              this.params.threadOpacity,
              targetLab
            );
            
            if (score > bestScore) {
              bestScore = score;
              bestPin = candidatePin;
              bestColor = colorOption;
            }
          }
        }
      } else {
        // Monochrome mode with face-aware adaptive skip
        const currentPinCoord = this.state.pins[this.state.currentPin];
        const { width } = this.state.targetImage;
        
        for (let i = 0; i < pinCount; i++) {
          if (i === this.state.currentPin) continue;
          
          const dist = Math.abs(i - this.state.currentPin);
          const wrapDist = pinCount - dist;
          
          // Use adaptive skip based on regions (face=2, body=4, background=6)
          let effectiveMinSkip = this.params.minPinSkip;
          if (this.state.faceRegionMask && currentPinCoord) {
            const currentRegion = getRegionForPixel(Math.floor(currentPinCoord.x), Math.floor(currentPinCoord.y), this.state.faceRegionMask);
            const candidatePinCoord = this.state.pins[i];
            if (candidatePinCoord) {
              const candidateRegion = getRegionForPixel(Math.floor(candidatePinCoord.x), Math.floor(candidatePinCoord.y), this.state.faceRegionMask);
              // Use effective skip: smaller for face, larger for body/background
              effectiveMinSkip = getEffectiveMinSkip(currentRegion, candidateRegion, this.params.qualityPreset);
            }
          }
          
          if (Math.min(dist, wrapDist) < effectiveMinSkip) continue;

          const score = this.calculatePerceptualLineScore(this.state.currentPin, i);
          if (score > bestScore) {
            bestScore = score;
            bestPin = i;
          }
        }
      }

      if (bestPin === -1) {
        // Random fallback
        const attempts = 10;
        for (let a = 0; a < attempts; a++) {
          const randomPin = Math.floor(Math.random() * pinCount);
          const dist = Math.abs(randomPin - this.state.currentPin);
          const wrapDist = pinCount - dist;
          if (randomPin !== this.state.currentPin && Math.min(dist, wrapDist) >= this.params.minPinSkip) {
            bestPin = randomPin;
            break;
          }
        }
      }

      if (bestPin !== -1) {
        if (this.params.colorMode === "color" && this.state.colorProgressImage) {
          // Apply colored line using v4.2 method
          this.applyColoredLine(this.state.currentPin, bestPin, bestColor, this.params.threadOpacity);
          this.state.connections.push({
            fromPin: this.state.currentPin,
            toPin: bestPin,
            color: bestColor.hex,
            colorName: bestColor.name
          });
          this.state.pinUsageCount[bestPin]++;
          this.state.currentPin = bestPin;
        } else {
          this.applyLineGammaCorrected(this.state.currentPin, bestPin);
          this.state.connections.push({
            fromPin: this.state.currentPin,
            toPin: bestPin,
            color: "#000000"
          });
          this.state.pinUsageCount[bestPin]++;
          this.state.currentPin = bestPin;
        }
      }

      // Progress update
      if (threadNum - lastPreviewUpdate >= previewInterval) {
        const previewData = this.params.colorMode === "color" 
          ? this.generateColorPreviewDataUrl()
          : this.generatePreviewDataUrl();
        
        onProgress(threadNum + 1, totalThreads, `Thread ${threadNum + 1} of ${totalThreads}`, previewData);
        lastPreviewUpdate = threadNum;
      }

      await new Promise((resolve) => setTimeout(resolve, delayPerThread));
    }

    // Generate final result
    let threadColors: ThreadColorSummary[] | undefined;
    if (this.params.colorMode === "color") {
      threadColors = this.assignThreadColorsLAB();
    } else {
      threadColors = [{
        color: "#000000",
        colorName: "Black",
        count: this.state.connections.length,
        percentage: 100,
      }];
    }

    const previewDataUrl = this.params.colorMode === "color" 
      ? this.generateColorPreviewDataUrl()
      : this.generatePreviewDataUrl();

    return {
      id: randomUUID(),
      imageWidth: width,
      imageHeight: height,
      frameType: this.params.frameType,
      pins: this.state.pins,
      connections: this.state.connections,
      totalThreads: this.state.connections.length,
      params: this.params,
      createdAt: new Date().toISOString(),
      previewDataUrl,
      threadColors,
    };
  }

  // Helper for bresenham line without state dependency
  private bresenhamLine(x0: number, y0: number, x1: number, y1: number, width: number, height: number): number[] {
    const pixels: number[] = [];
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = Math.round(x0);
    let y = Math.round(y0);
    const endX = Math.round(x1);
    const endY = Math.round(y1);

    while (true) {
      if (x >= 0 && x < width && y >= 0 && y < height) {
        pixels.push(y * width + x);
      }
      if (x === endX && y === endY) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
    return pixels;
  }

  // ============================================================
  // LAB COLOR SPACE MATCHING (Perceptually accurate)
  // ============================================================

  private rgbToLAB(r: number, g: number, b: number): LABColor {
    // Convert RGB to XYZ
    let rr = r / 255;
    let gg = g / 255;
    let bb = b / 255;

    rr = rr > 0.04045 ? Math.pow((rr + 0.055) / 1.055, 2.4) : rr / 12.92;
    gg = gg > 0.04045 ? Math.pow((gg + 0.055) / 1.055, 2.4) : gg / 12.92;
    bb = bb > 0.04045 ? Math.pow((bb + 0.055) / 1.055, 2.4) : bb / 12.92;

    const x = (rr * 0.4124 + gg * 0.3576 + bb * 0.1805) * 100;
    const y = (rr * 0.2126 + gg * 0.7152 + bb * 0.0722) * 100;
    const z = (rr * 0.0193 + gg * 0.1192 + bb * 0.9505) * 100;

    // Convert XYZ to LAB (D65 illuminant)
    let xx = x / 95.047;
    let yy = y / 100.0;
    let zz = z / 108.883;

    xx = xx > 0.008856 ? Math.pow(xx, 1/3) : (7.787 * xx) + (16 / 116);
    yy = yy > 0.008856 ? Math.pow(yy, 1/3) : (7.787 * yy) + (16 / 116);
    zz = zz > 0.008856 ? Math.pow(zz, 1/3) : (7.787 * zz) + (16 / 116);

    return {
      L: (116 * yy) - 16,
      a: 500 * (xx - yy),
      b: 200 * (yy - zz)
    };
  }

  private deltaE(lab1: LABColor, lab2: LABColor): number {
    // CIE76 Delta E - perceptual color difference
    return Math.sqrt(
      Math.pow(lab1.L - lab2.L, 2) +
      Math.pow(lab1.a - lab2.a, 2) +
      Math.pow(lab1.b - lab2.b, 2)
    );
  }

  private findClosestPaletteColorLAB(r: number, g: number, b: number): { hex: string; name: string } {
    const targetLAB = this.rgbToLAB(r, g, b);
    let closest = THREAD_PALETTE[0];
    let minDist = Infinity;

    for (const color of THREAD_PALETTE) {
      const dist = this.deltaE(targetLAB, color.lab);
      if (dist < minDist) {
        minDist = dist;
        closest = color;
      }
    }

    return { hex: closest.hex, name: closest.name };
  }

  private assignThreadColorsLAB(): ThreadColorSummary[] {
    if (!this.state || !this.state.colorImage) return [];

    const { colorImage, pins, connections } = this.state;
    const colorCounts: Map<string, { color: string; name: string; count: number }> = new Map();

    for (const conn of connections) {
      // If color already assigned during generation, just count it
      if (conn.color) {
        const name = THREAD_PALETTE.find(p => p.hex === conn.color)?.name || "Unknown";
        const existing = colorCounts.get(conn.color);
        if (existing) {
          existing.count++;
        } else {
          colorCounts.set(conn.color, { color: conn.color, name, count: 1 });
        }
        continue;
      }

      const fromPin = pins[conn.fromPin];
      const toPin = pins[conn.toPin];
      
      if (!fromPin || !toPin) continue;

      // MULTI-SAMPLE along line for better color accuracy
      const samples = this.sampleLineColors(fromPin, toPin, colorImage, 5);
      if (samples.length === 0) continue;

      // Average the samples
      let avgR = 0, avgG = 0, avgB = 0;
      for (const s of samples) {
        avgR += s.r;
        avgG += s.g;
        avgB += s.b;
      }
      avgR = Math.round(avgR / samples.length);
      avgG = Math.round(avgG / samples.length);
      avgB = Math.round(avgB / samples.length);

      // Find closest palette color using LAB (perceptual)
      const { hex, name } = this.findClosestPaletteColorLAB(avgR, avgG, avgB);
      conn.color = hex;

      // Count colors
      const existing = colorCounts.get(hex);
      if (existing) {
        existing.count++;
      } else {
        colorCounts.set(hex, { color: hex, name, count: 1 });
      }
    }

    // Convert to summary array
    const total = connections.length;
    const summary: ThreadColorSummary[] = Array.from(colorCounts.values())
      .map(c => ({
        color: c.color,
        colorName: c.name,
        count: c.count,
        percentage: Math.round((c.count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    return summary;
  }

  private sampleLineColors(fromPin: Pin, toPin: Pin, colorImage: ColorPixelData, numSamples: number): { r: number; g: number; b: number }[] {
    const samples: { r: number; g: number; b: number }[] = [];

    for (let i = 0; i < numSamples; i++) {
      const t = (i + 1) / (numSamples + 1); // Evenly distributed along line
      const x = Math.floor(fromPin.x + t * (toPin.x - fromPin.x));
      const y = Math.floor(fromPin.y + t * (toPin.y - fromPin.y));
      
      if (x >= 0 && x < colorImage.width && y >= 0 && y < colorImage.height) {
        const idx = y * colorImage.width + x;
        const pixel = colorImage.data[idx];
        if (pixel) {
          samples.push(pixel);
        }
      }
    }

    return samples;
  }

  // ============================================================
  // ACCURACY METRICS (MSE + SSIM)
  // ============================================================

  private calculateMSE(target: number[], current: number[]): number {
    if (target.length !== current.length || target.length === 0) return Infinity;
    
    let sum = 0;
    for (let i = 0; i < target.length; i++) {
      const diff = target[i] - current[i];
      sum += diff * diff;
    }
    return sum / target.length;
  }

  private calculateCurrentMSE(): number {
    if (!this.state) return Infinity;
    return this.calculateMSE(this.state.targetImage.data, this.state.progressImage);
  }

  private calculateSSIM(): number {
    if (!this.state) return 0;
    
    const { targetImage, progressImage } = this.state;
    const n = targetImage.data.length;
    if (n === 0) return 0;

    // Calculate means
    let meanX = 0, meanY = 0;
    for (let i = 0; i < n; i++) {
      meanX += targetImage.data[i];
      meanY += progressImage[i];
    }
    meanX /= n;
    meanY /= n;

    // Calculate variances and covariance
    let varX = 0, varY = 0, covXY = 0;
    for (let i = 0; i < n; i++) {
      const dx = targetImage.data[i] - meanX;
      const dy = progressImage[i] - meanY;
      varX += dx * dx;
      varY += dy * dy;
      covXY += dx * dy;
    }
    varX /= n;
    varY /= n;
    covXY /= n;

    // SSIM constants
    const C1 = 6.5025; // (0.01 * 255)^2
    const C2 = 58.5225; // (0.03 * 255)^2

    // SSIM formula
    const numerator = (2 * meanX * meanY + C1) * (2 * covXY + C2);
    const denominator = (meanX * meanX + meanY * meanY + C1) * (varX + varY + C2);
    
    return numerator / denominator;
  }

  // ============================================================
  // V4.0: MULTI-RESOLUTION DOWNSAMPLING
  // ============================================================

  private downsampleImage(source: number[], srcWidth: number, srcHeight: number, scale: number, useLinearSpace: boolean = false): { data: number[]; width: number; height: number } {
    const dstWidth = Math.floor(srcWidth * scale);
    const dstHeight = Math.floor(srcHeight * scale);
    const data = new Array(dstWidth * dstHeight).fill(0);
    
    const invScale = 1 / scale;
    
    for (let dy = 0; dy < dstHeight; dy++) {
      for (let dx = 0; dx < dstWidth; dx++) {
        // Box filter - average source pixels (optionally in linear space)
        const sx0 = Math.floor(dx * invScale);
        const sy0 = Math.floor(dy * invScale);
        const sx1 = Math.min(srcWidth - 1, Math.floor((dx + 1) * invScale));
        const sy1 = Math.min(srcHeight - 1, Math.floor((dy + 1) * invScale));
        
        let sum = 0;
        let count = 0;
        for (let sy = sy0; sy <= sy1; sy++) {
          for (let sx = sx0; sx <= sx1; sx++) {
            const val = source[sy * srcWidth + sx];
            // Convert to linear space for accurate averaging if requested
            sum += useLinearSpace ? Math.pow(val / 255, 2.2) : val;
            count++;
          }
        }
        const avgVal = count > 0 ? sum / count : 0;
        // Convert back to gamma space if we were in linear
        data[dy * dstWidth + dx] = useLinearSpace ? Math.pow(avgVal, 1/2.2) * 255 : avgVal;
      }
    }
    
    return { data, width: dstWidth, height: dstHeight };
  }

  private initializeMultiResolutionBuffers(): void {
    if (!this.state) return;
    
    const { targetImage, progressImage } = this.state;
    const { width, height } = targetImage;
    
    // Create 1/4 scale (low-res) buffers - use linear space for accurate averaging
    const lowRes = this.downsampleImage(targetImage.data, width, height, 0.25, true);
    this.state.targetLowRes = { data: lowRes.data, width: lowRes.width, height: lowRes.height };
    this.state.progressLowRes = new Array(lowRes.width * lowRes.height).fill(255);
    
    // Create 1/2 scale (mid-res) buffers
    const midRes = this.downsampleImage(targetImage.data, width, height, 0.5, true);
    this.state.targetMidRes = { data: midRes.data, width: midRes.width, height: midRes.height };
    this.state.progressMidRes = new Array(midRes.width * midRes.height).fill(255);
  }

  private updateMultiResProgressImages(): void {
    if (!this.state) return;
    
    const { progressImage, targetImage } = this.state;
    const { width, height } = targetImage;
    
    // Update low-res progress - use linear space for consistency
    if (this.state.progressLowRes && this.state.targetLowRes) {
      const lowRes = this.downsampleImage(progressImage, width, height, 0.25, true);
      this.state.progressLowRes = lowRes.data;
    }
    
    // Update mid-res progress
    if (this.state.progressMidRes && this.state.targetMidRes) {
      const midRes = this.downsampleImage(progressImage, width, height, 0.5, true);
      this.state.progressMidRes = midRes.data;
    }
  }

  // ============================================================
  // V4.2: INTERLEAVED MULTI-COLOR OPTIMIZATION
  // ============================================================
  // Each thread evaluates ALL colors and picks the best (color + line) combination.
  // Uses a SINGLE shared RGB canvas so colors cooperate instead of fighting.

  // CMYK color definitions for thread colors
  private readonly THREAD_COLOR_PALETTE = [
    { hex: "#000000", name: "Black", rgb: { r: 0, g: 0, b: 0 } },
    { hex: "#00BCD4", name: "Cyan", rgb: { r: 0, g: 188, b: 212 } },
    { hex: "#E91E63", name: "Magenta", rgb: { r: 233, g: 30, b: 99 } },
    { hex: "#FFEB3B", name: "Yellow", rgb: { r: 255, g: 235, b: 59 } },
  ];

  // Run interleaved color optimization: for each thread, test all colors and pick the best
  private async runInterleavedColorOptimization(onProgress: ProgressCallback): Promise<void> {
    if (!this.state || !this.state.colorImage) return;

    const { colorImage, targetImage, pins, edgeMap, edgeGradientX, edgeGradientY } = this.state;
    const { width, height } = targetImage;
    const { maxThreads, threadOpacity, minPinSkip, qualityPreset } = this.params;
    const pixelCount = width * height;
    const pinCount = pins.length;

    onProgress(0, maxThreads, "Initializing interleaved color optimization...");

    // Pre-compute target LAB colors for fast comparison
    const targetLab = new Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      const { r, g, b } = colorImage.data[i];
      targetLab[i] = this.rgbToLAB(r, g, b);
    }

    // Initialize shared RGB progress canvas (starts white)
    this.state.colorProgressImage = new Array(pixelCount).fill(null).map(() => ({ r: 255, g: 255, b: 255 }));
    this.state.connections = [];
    this.state.pinUsageCount = new Array(pinCount).fill(0);
    this.state.currentPin = 0;
    
    // Reset color usage tracking for balance
    this.recentColorCounts.clear();

    // Stage-based parameters for structure → detail progression
    const stages = [
      { name: "Structure", threads: Math.floor(maxThreads * 0.25), opacity: threadOpacity * 1.3, minSkip: Math.max(2, Math.floor(pinCount / 8)) },
      { name: "Mid Detail", threads: Math.floor(maxThreads * 0.35), opacity: threadOpacity * 1.1, minSkip: Math.max(2, Math.floor(pinCount / 15)) },
      { name: "Fine Detail", threads: Math.floor(maxThreads * 0.40), opacity: threadOpacity * 0.9, minSkip: minPinSkip }
    ];

    // Timing
    const targetTimeMs = 90000;
    const delayPerThread = Math.max(1, Math.floor(targetTimeMs / maxThreads));
    let globalThreadNum = 0;
    let lastPreviewUpdate = 0;
    const previewInterval = Math.max(15, Math.floor(maxThreads / 150));

    // Candidate generation settings
    const edgeGuidedCandidates = qualityPreset === "high" ? 35 : 25;
    const randomCandidates = qualityPreset === "high" ? 15 : 10;

    for (const stage of stages) {
      if (this.cancelled) break;
      onProgress(globalThreadNum, maxThreads, `${stage.name} pass...`);

      for (let t = 0; t < stage.threads && !this.cancelled; t++, globalThreadNum++) {
        // Generate candidate pins: edge-guided + random
        const candidates = this.generateColorCandidates(
          this.state.currentPin, 
          stage.minSkip, 
          edgeGuidedCandidates, 
          randomCandidates
        );

        let bestPin = -1;
        let bestScore = -Infinity;
        let bestColor = this.THREAD_COLOR_PALETTE[0]; // Default to black

        // For each candidate pin, test each color
        for (const candidatePin of candidates) {
          for (const colorOption of this.THREAD_COLOR_PALETTE) {
            const score = this.evaluateColoredLine(
              this.state.currentPin, 
              candidatePin, 
              colorOption, 
              stage.opacity,
              targetLab
            );

            if (score > bestScore) {
              bestScore = score;
              bestPin = candidatePin;
              bestColor = colorOption;
            }
          }
        }

        // Apply the best colored thread
        if (bestPin !== -1) {
          this.applyColoredLine(this.state.currentPin, bestPin, bestColor, stage.opacity);
          
          // Record connection
          this.state.connections.push({
            fromPin: this.state.currentPin,
            toPin: bestPin,
            color: bestColor.hex,
            colorName: bestColor.name
          });

          this.state.pinUsageCount[bestPin]++;
          this.state.currentPin = bestPin;
        }

        // Progress update with preview
        if ((globalThreadNum - lastPreviewUpdate) >= previewInterval) {
          const previewDataUrl = this.generateColorPreviewDataUrl();
          onProgress(globalThreadNum, maxThreads, `${stage.name}: Thread ${globalThreadNum + 1}`, previewDataUrl);
          lastPreviewUpdate = globalThreadNum;
        }

        await new Promise(resolve => setTimeout(resolve, delayPerThread));
      }
    }

    // Update grayscale progress for final metrics
    this.updateProgressFromColorImage();
  }

  // Generate candidate pins: mix of edge-guided and random with face-aware adaptive skip
  private generateColorCandidates(currentPin: number, minSkip: number, edgeGuided: number, random: number): number[] {
    if (!this.state) return [];
    
    const { pins, edgeGradientX, edgeGradientY, targetImage, faceRegionMask } = this.state;
    const { width, height } = targetImage;
    const pinCount = pins.length;
    const candidates: number[] = [];
    const candidateSet = new Set<number>();
    
    // Get adaptive min skip based on current pin's region
    // Face=2 (more detail), body=4, background=6 (less detail)
    const currentPinCoord = pins[currentPin];
    let currentRegionSkip = minSkip;
    if (faceRegionMask && currentPinCoord) {
      const currentRegion = getRegionForPixel(Math.floor(currentPinCoord.x), Math.floor(currentPinCoord.y), faceRegionMask);
      currentRegionSkip = getMinPinSkipForRegion(currentRegion);
    }

    // Edge-guided candidates
    const edgeCandidates = this.getEdgeGuidedCandidates(currentPin, edgeGuided * 2);
    for (const pin of edgeCandidates) {
      if (candidateSet.size >= edgeGuided) break;
      const dist = Math.abs(pin - currentPin);
      const wrapDist = pinCount - dist;
      
      // Use adaptive skip based on the candidate pin's region too
      // Face allows smaller skip, body/background use larger skips
      const candidatePinCoord = pins[pin];
      let effectiveMinSkip = currentRegionSkip;
      if (faceRegionMask && candidatePinCoord && currentPinCoord) {
        const currentRegion = getRegionForPixel(Math.floor(currentPinCoord.x), Math.floor(currentPinCoord.y), faceRegionMask);
        const candidateRegion = getRegionForPixel(Math.floor(candidatePinCoord.x), Math.floor(candidatePinCoord.y), faceRegionMask);
        effectiveMinSkip = getEffectiveMinSkip(currentRegion, candidateRegion, this.params.qualityPreset);
      }
      
      if (Math.min(dist, wrapDist) >= effectiveMinSkip && !candidateSet.has(pin)) {
        candidateSet.add(pin);
        candidates.push(pin);
      }
    }

    // Random candidates (Fisher-Yates sampling)
    const allPins = Array.from({ length: pinCount }, (_, i) => i);
    for (let i = allPins.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allPins[i], allPins[j]] = [allPins[j], allPins[i]];
    }
    
    for (const pin of allPins) {
      if (candidateSet.size >= edgeGuided + random) break;
      const dist = Math.abs(pin - currentPin);
      const wrapDist = pinCount - dist;
      
      // Use adaptive skip for random candidates too
      // Face allows smaller skip, body/background use larger skips
      const candidatePinCoord = pins[pin];
      let effectiveMinSkip = currentRegionSkip;
      if (faceRegionMask && candidatePinCoord && currentPinCoord) {
        const currentRegion = getRegionForPixel(Math.floor(currentPinCoord.x), Math.floor(currentPinCoord.y), faceRegionMask);
        const candidateRegion = getRegionForPixel(Math.floor(candidatePinCoord.x), Math.floor(candidatePinCoord.y), faceRegionMask);
        effectiveMinSkip = getEffectiveMinSkip(currentRegion, candidateRegion, this.params.qualityPreset);
      }
      
      if (pin !== currentPin && Math.min(dist, wrapDist) >= effectiveMinSkip && !candidateSet.has(pin)) {
        candidateSet.add(pin);
        candidates.push(pin);
      }
    }

    return candidates;
  }

  // Track recent color usage for balance
  private recentColorCounts: Map<string, number> = new Map();

  // Evaluate a colored line: score = 0.65*ColorAccuracy + 0.20*EdgePreservation + 0.10*OverdrawPenalty + 0.05*ColorBalance
  private evaluateColoredLine(
    fromPin: number, 
    toPin: number, 
    color: { hex: string; name: string; rgb: { r: number; g: number; b: number } },
    opacity: number,
    targetLab: { L: number; a: number; b: number }[]
  ): number {
    if (!this.state || !this.state.colorProgressImage) return -Infinity;

    const { colorProgressImage, edgeMap, overdrawMap, pins, targetImage } = this.state;
    const { width, height } = targetImage;
    const linePixels = this.getLinePixels(fromPin, toPin);
    
    if (linePixels.length === 0) return -Infinity;

    let colorAccuracyScore = 0;
    let edgeScore = 0;
    let overdrawPenalty = 0;

    for (const idx of linePixels) {
      const current = colorProgressImage[idx];
      
      // Convert to linear space for gamma-correct blending
      const currentRLinear = Math.pow(current.r / 255, 2.2);
      const currentGLinear = Math.pow(current.g / 255, 2.2);
      const currentBLinear = Math.pow(current.b / 255, 2.2);
      
      const colorRLinear = Math.pow(color.rgb.r / 255, 2.2);
      const colorGLinear = Math.pow(color.rgb.g / 255, 2.2);
      const colorBLinear = Math.pow(color.rgb.b / 255, 2.2);
      
      // Subtractive blending in linear space: thread absorbs light
      // New value = current * (1 - absorption), where absorption = (1 - threadColor) * opacity
      const absorbR = (1 - colorRLinear) * opacity;
      const absorbG = (1 - colorGLinear) * opacity;
      const absorbB = (1 - colorBLinear) * opacity;
      
      const newRLinear = currentRLinear * (1 - absorbR);
      const newGLinear = currentGLinear * (1 - absorbG);
      const newBLinear = currentBLinear * (1 - absorbB);
      
      // Convert back to sRGB for LAB comparison
      const newR = Math.round(Math.pow(newRLinear, 1/2.2) * 255);
      const newG = Math.round(Math.pow(newGLinear, 1/2.2) * 255);
      const newB = Math.round(Math.pow(newBLinear, 1/2.2) * 255);
      
      // Calculate color accuracy improvement (Delta E reduction)
      const currentLab = this.rgbToLAB(current.r, current.g, current.b);
      const newLab = this.rgbToLAB(newR, newG, newB);
      const target = targetLab[idx];
      
      const currentDeltaE = this.deltaE(currentLab, target);
      const newDeltaE = this.deltaE(newLab, target);
      
      // Improvement = reduction in Delta E (positive = better)
      colorAccuracyScore += (currentDeltaE - newDeltaE);

      // Edge preservation score
      if (edgeMap && edgeMap[idx] > 0) {
        edgeScore += edgeMap[idx] * 0.01;
      }

      // Overdraw penalty (penalize already-dark areas)
      const overdrawCount = overdrawMap[idx] || 0;
      if (overdrawCount > 3) {
        overdrawPenalty += (overdrawCount - 3) * 0.1;
      }
    }

    // Normalize by line length
    const lineLen = linePixels.length;
    colorAccuracyScore /= lineLen;
    edgeScore /= lineLen;
    overdrawPenalty /= lineLen;

    // Pin usage penalty (gentle fatigue)
    const pinUsage = this.state.pinUsageCount[toPin] || 0;
    const pinFatigue = Math.pow(0.997, pinUsage);

    // Color balance regularization: discourage over-using any single color
    const colorUsage = this.recentColorCounts.get(color.hex) || 0;
    const totalRecentThreads = Array.from(this.recentColorCounts.values()).reduce((a, b) => a + b, 0) + 1;
    const expectedUsage = totalRecentThreads / this.THREAD_COLOR_PALETTE.length;
    const colorImbalance = Math.max(0, (colorUsage - expectedUsage) / expectedUsage) * 0.1;

    // Final score: weighted combination
    let score = (0.65 * colorAccuracyScore + 0.20 * edgeScore - 0.10 * overdrawPenalty - 0.05 * colorImbalance) * pinFatigue;
    
    // Face region priority boost (2x edge weight for lines through face)
    if (this.state.faceRegionMask) {
      const faceOverlap = getLineFaceOverlap(linePixels, this.state.faceRegionMask);
      if (faceOverlap > 0.3) {
        // Line passes through face - boost score
        score += edgeScore * faceOverlap * 2.0;
        
        // Check overdraw in face region specifically (stricter: 0.85 density limit)
        // Use densityImage for consistent metric with monochrome mode
        let faceDensitySum = 0;
        let facePixelCount = 0;
        for (const idx of linePixels) {
          if (this.state.faceRegionMask.faceMask[idx]) {
            // Use densityImage (0-1 range) for consistent overdraw metric
            const density = this.state.densityImage ? this.state.densityImage[idx] || 0 : 0;
            faceDensitySum += density;
            facePixelCount++;
          }
        }
        if (facePixelCount > 0) {
          const avgFaceDensity = faceDensitySum / facePixelCount;
          if (avgFaceDensity > 0.85) { // Same 0.85 threshold as monochrome
            score *= 0.3; // Heavily penalize overdraw in face
          }
        }
      }
    }
    
    return score;
  }

  // Apply a colored line to the shared RGB canvas
  private applyColoredLine(
    fromPin: number, 
    toPin: number, 
    color: { hex: string; name: string; rgb: { r: number; g: number; b: number } },
    opacity: number
  ): void {
    if (!this.state || !this.state.colorProgressImage) return;

    const { colorProgressImage, overdrawMap } = this.state;
    const linePixels = this.getLinePixels(fromPin, toPin);

    // Pre-compute thread color in linear space
    const colorRLinear = Math.pow(color.rgb.r / 255, 2.2);
    const colorGLinear = Math.pow(color.rgb.g / 255, 2.2);
    const colorBLinear = Math.pow(color.rgb.b / 255, 2.2);

    for (const idx of linePixels) {
      const current = colorProgressImage[idx];
      
      // Convert to linear space for gamma-correct blending
      const currentRLinear = Math.pow(current.r / 255, 2.2);
      const currentGLinear = Math.pow(current.g / 255, 2.2);
      const currentBLinear = Math.pow(current.b / 255, 2.2);
      
      // Subtractive blending in linear space: thread absorbs light
      const absorbR = (1 - colorRLinear) * opacity;
      const absorbG = (1 - colorGLinear) * opacity;
      const absorbB = (1 - colorBLinear) * opacity;
      
      const newRLinear = currentRLinear * (1 - absorbR);
      const newGLinear = currentGLinear * (1 - absorbG);
      const newBLinear = currentBLinear * (1 - absorbB);
      
      // Convert back to sRGB
      current.r = Math.max(0, Math.min(255, Math.round(Math.pow(newRLinear, 1/2.2) * 255)));
      current.g = Math.max(0, Math.min(255, Math.round(Math.pow(newGLinear, 1/2.2) * 255)));
      current.b = Math.max(0, Math.min(255, Math.round(Math.pow(newBLinear, 1/2.2) * 255)));

      // Track overdraw
      overdrawMap[idx]++;
      
      // Update densityImage for consistent face overdraw control (0-1 range)
      if (this.state.densityImage) {
        const oldDensity = this.state.densityImage[idx];
        // Use maximum absorption as density metric
        const maxAbsorb = Math.max(absorbR, absorbG, absorbB);
        this.state.densityImage[idx] = oldDensity + maxAbsorb * (1 - oldDensity);
      }
    }

    // Update color usage count for balance tracking
    const currentCount = this.recentColorCounts.get(color.hex) || 0;
    this.recentColorCounts.set(color.hex, currentCount + 1);
  }

  // Helper to convert hex to RGB
  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  }

  // Update grayscale progress image from color progress image
  private updateProgressFromColorImage(): void {
    if (!this.state || !this.state.colorProgressImage) return;
    
    for (let i = 0; i < this.state.colorProgressImage.length; i++) {
      const { r, g, b } = this.state.colorProgressImage[i];
      // Convert to grayscale using luminance
      this.state.progressImage[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
  }

  // ============================================================
  // V4.0: EDGE-GUIDED CANDIDATE PROPOSALS
  // ============================================================

  private getEdgeGuidedCandidates(currentPin: number, maxCandidates: number = 50): number[] {
    if (!this.state) return [];
    
    const { pins, edgeGradientX, edgeGradientY, targetImage } = this.state;
    const { width, height } = targetImage;
    const { minPinSkip } = this.params;
    const actualPinCount = pins.length;
    
    // For each potential candidate pin, calculate edge alignment score
    const candidates: { pin: number; alignment: number }[] = [];
    const currentPinPos = pins[currentPin];
    if (!currentPinPos) return [];
    
    for (let i = 0; i < actualPinCount; i++) {
      const dist = Math.abs(i - currentPin);
      const wrapDist = actualPinCount - dist;
      if (Math.min(dist, wrapDist) < minPinSkip) continue;
      
      const candidatePos = pins[i];
      if (!candidatePos) continue;
      
      // Calculate line direction
      const dx = candidatePos.x - currentPinPos.x;
      const dy = candidatePos.y - currentPinPos.y;
      const lineLen = Math.sqrt(dx * dx + dy * dy);
      if (lineLen < 1) continue;
      
      const lineDirX = dx / lineLen;
      const lineDirY = dy / lineLen;
      
      // Sample edge gradients along the line (3-5 points)
      let totalAlignment = 0;
      const numSamples = 5;
      for (let s = 0; s < numSamples; s++) {
        const t = (s + 1) / (numSamples + 1);
        const sampleX = Math.floor(currentPinPos.x + t * dx);
        const sampleY = Math.floor(currentPinPos.y + t * dy);
        
        if (sampleX >= 0 && sampleX < width && sampleY >= 0 && sampleY < height) {
          const idx = sampleY * width + sampleX;
          const gradX = edgeGradientX[idx] || 0;
          const gradY = edgeGradientY[idx] || 0;
          const gradMag = Math.sqrt(gradX * gradX + gradY * gradY);
          
          if (gradMag > 0.01) {
            // Edge direction is perpendicular to gradient (tangent to edge)
            const edgeDirX = -gradY / gradMag;
            const edgeDirY = gradX / gradMag;
            
            // Alignment = |dot product| (0 = perpendicular, 1 = aligned)
            const dot = Math.abs(lineDirX * edgeDirX + lineDirY * edgeDirY);
            totalAlignment += dot * gradMag; // Weight by edge strength
          }
        }
      }
      
      candidates.push({ pin: i, alignment: totalAlignment / numSamples });
    }
    
    // Sort by alignment (highest first) and return top candidates
    candidates.sort((a, b) => b.alignment - a.alignment);
    return candidates.slice(0, maxCandidates).map(c => c.pin);
  }

  // ============================================================
  // V4.0: MULTI-RESOLUTION ERROR EVALUATION
  // ============================================================

  private calculateMultiResLineScore(fromPin: number, toPin: number): number {
    if (!this.state) return -Infinity;
    
    // Get standard high-res score
    const highResScore = this.calculatePerceptualLineScore(fromPin, toPin);
    
    // If no multi-res buffers, return high-res only
    if (!this.state.targetLowRes || !this.state.targetMidRes || 
        !this.state.progressLowRes || !this.state.progressMidRes) {
      return highResScore;
    }
    
    // Calculate approximate scores at lower resolutions
    const { targetImage, targetLowRes, targetMidRes, progressLowRes, progressMidRes, pins } = this.state;
    const fromPinPos = pins[fromPin];
    const toPinPos = pins[toPin];
    if (!fromPinPos || !toPinPos) return highResScore;
    
    // Scale pins for low-res
    const lowScale = targetLowRes.width / targetImage.width;
    const fromLowX = Math.floor(fromPinPos.x * lowScale);
    const fromLowY = Math.floor(fromPinPos.y * lowScale);
    const toLowX = Math.floor(toPinPos.x * lowScale);
    const toLowY = Math.floor(toPinPos.y * lowScale);
    
    // Quick low-res check: if line doesn't improve low-res, reject early
    const lowResImprovement = this.estimateLineImprovement(
      fromLowX, fromLowY, toLowX, toLowY,
      targetLowRes.data, progressLowRes, targetLowRes.width, targetLowRes.height
    );
    
    if (lowResImprovement < -10) {
      // Early rejection - this line hurts low-res structure
      return -1000000;
    }
    
    // Scale pins for mid-res
    const midScale = targetMidRes.width / targetImage.width;
    const fromMidX = Math.floor(fromPinPos.x * midScale);
    const fromMidY = Math.floor(fromPinPos.y * midScale);
    const toMidX = Math.floor(toPinPos.x * midScale);
    const toMidY = Math.floor(toPinPos.y * midScale);
    
    const midResImprovement = this.estimateLineImprovement(
      fromMidX, fromMidY, toMidX, toMidY,
      targetMidRes.data, progressMidRes, targetMidRes.width, targetMidRes.height
    );
    
    // Weighted combination: 0.2 low + 0.3 mid + 0.5 high
    return lowResImprovement * 0.2 + midResImprovement * 0.3 + highResScore * 0.5;
  }

  private estimateLineImprovement(
    x0: number, y0: number, x1: number, y1: number,
    target: number[], progress: number[], width: number, height: number
  ): number {
    const threadOpacity = this.params.threadOpacity;
    let improvement = 0;
    let count = 0;
    
    // Simple Bresenham to get line pixels
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = x0, y = y0;
    
    while (true) {
      if (x >= 0 && x < width && y >= 0 && y < height) {
        const idx = y * width + x;
        const targetVal = target[idx];
        const currentVal = progress[idx];
        
        // Simulate thread application
        const currentLinear = Math.pow(currentVal / 255, 2.2);
        const newLinear = currentLinear * (1 - threadOpacity);
        const newVal = Math.pow(newLinear, 1/2.2) * 255;
        
        const oldError = Math.pow(targetVal - currentVal, 2);
        const newError = Math.pow(targetVal - newVal, 2);
        improvement += (oldError - newError);
        count++;
      }
      
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
    
    return count > 0 ? improvement / count : 0;
  }

  // ============================================================
  // ADVANCED GREEDY OPTIMIZATION (with real-time thread visualization)
  // ============================================================

  private async runAdvancedGreedyOptimization(onProgress: ProgressCallback): Promise<void> {
    if (!this.state) return;

    const { maxThreads, minPinSkip } = this.params;
    const actualPinCount = this.state.pins.length;
    
    // V4.0: Initialize multi-resolution buffers for better scoring
    this.initializeMultiResolutionBuffers();
    
    // Calculate delay between threads for real-time visualization
    // Faster generation with less delay
    const targetTimeMs = 60000; // 60 seconds target for faster feedback
    const delayPerThread = Math.max(1, Math.floor(targetTimeMs / maxThreads));
    
    let lastPreviewUpdate = 0;
    const previewInterval = Math.max(20, Math.floor(maxThreads / 100)); // Update ~100 times during generation
    let lastMultiResUpdate = 0;
    // Update multi-res more frequently for better accuracy (~100-200 times)
    const multiResUpdateInterval = Math.max(10, Math.floor(maxThreads / 150));

    // Check if using color-aware optimization
    const useColorScoring = this.params.colorMode === "color" && this.state.colorImage;
    
    // V4.0: Use edge-guided + exhaustive candidate mix
    const useEdgeGuidedProposals = this.params.qualityPreset === "high";

    for (let threadNum = 0; threadNum < maxThreads && !this.cancelled; threadNum++) {
      let bestPin = -1;
      let bestScore = -Infinity;
      let bestColor: string | undefined = undefined;

      // V4.0: Get edge-guided candidates first (70% weight) + exhaustive search (30%)
      let candidatePins: number[] = [];
      
      // Get adaptive min skip for face-aware candidate selection (monochrome)
      const currentPinCoord = this.state.pins[this.state.currentPin];
      let adaptiveMinSkip = minPinSkip;
      if (this.state.faceRegionMask && currentPinCoord) {
        const currentRegion = getRegionForPixel(Math.floor(currentPinCoord.x), Math.floor(currentPinCoord.y), this.state.faceRegionMask);
        adaptiveMinSkip = Math.min(minPinSkip, getMinPinSkipForRegion(currentRegion));
      }

      if (useEdgeGuidedProposals) {
        // Get top edge-aligned candidates (70%)
        const edgeCandidates = this.getEdgeGuidedCandidates(this.state.currentPin, 35);
        candidatePins = [...edgeCandidates];
        
        // Build pool of remaining valid pins for random sampling (30%)
        const edgeSet = new Set(edgeCandidates);
        const remainingPool: number[] = [];
        for (let i = 0; i < actualPinCount; i++) {
          if (!edgeSet.has(i)) {
            const dist = Math.abs(i - this.state.currentPin);
            const wrapDist = actualPinCount - dist;
            
            // Use adaptive skip for each candidate based on its region
            // Face allows smaller skip, body/background use larger skips
            const candidatePinCoord = this.state.pins[i];
            let effectiveMinSkip = currentRegionSkip;
            if (this.state.faceRegionMask && candidatePinCoord && currentPinCoord) {
              const candidateRegion = getRegionForPixel(Math.floor(candidatePinCoord.x), Math.floor(candidatePinCoord.y), this.state.faceRegionMask);
              effectiveMinSkip = getEffectiveMinSkip(currentRegion, candidateRegion, this.params.qualityPreset);
            }
            
            if (Math.min(dist, wrapDist) >= effectiveMinSkip) {
              remainingPool.push(i);
            }
          }
        }
        
        // Randomly sample from remaining pool (Fisher-Yates partial shuffle)
        const randomCount = Math.min(15, Math.floor(remainingPool.length * 0.3));
        for (let i = 0; i < randomCount && remainingPool.length > 0; i++) {
          const randIdx = Math.floor(Math.random() * remainingPool.length);
          candidatePins.push(remainingPool[randIdx]);
          // Swap with last and pop for O(1) removal
          remainingPool[randIdx] = remainingPool[remainingPool.length - 1];
          remainingPool.pop();
        }
      } else {
        // Standard exhaustive search for non-high quality with face-aware skip
        for (let i = 0; i < actualPinCount; i++) {
          const dist = Math.abs(i - this.state.currentPin);
          const wrapDist = actualPinCount - dist;
          
          // Use adaptive skip for each candidate based on its region
          // Face allows smaller skip, body/background use larger skips
          const candidatePinCoord = this.state.pins[i];
          let effectiveMinSkip = currentRegionSkip;
          if (this.state.faceRegionMask && candidatePinCoord && currentPinCoord) {
            const candidateRegion = getRegionForPixel(Math.floor(candidatePinCoord.x), Math.floor(candidatePinCoord.y), this.state.faceRegionMask);
            effectiveMinSkip = getEffectiveMinSkip(currentRegion, candidateRegion, this.params.qualityPreset);
          }
          
          if (Math.min(dist, wrapDist) >= effectiveMinSkip) {
            candidatePins.push(i);
          }
        }
      }

      // Find the best candidate using appropriate scoring method
      for (const i of candidatePins) {
        if (useColorScoring) {
          // Color-aware scoring: considers both position AND color matching
          const result = this.calculateColorLineScore(this.state.currentPin, i);
          if (result.score > bestScore) {
            bestScore = result.score;
            bestPin = i;
            bestColor = result.bestColor;
          }
        } else {
          // V4.0: Use multi-resolution scoring for better accuracy
          const score = useEdgeGuidedProposals 
            ? this.calculateMultiResLineScore(this.state.currentPin, i)
            : this.calculatePerceptualLineScore(this.state.currentPin, i);
          if (score > bestScore) {
            bestScore = score;
            bestPin = i;
          }
        }
      }

      // Fallback if no valid pin found
      if (bestPin === -1) {
        for (let i = 0; i < actualPinCount; i++) {
          if (i === this.state.currentPin) continue;
          if (useColorScoring) {
            const result = this.calculateColorLineScore(this.state.currentPin, i);
            if (result.score > bestScore) {
              bestScore = result.score;
              bestPin = i;
              bestColor = result.bestColor;
            }
          } else {
            const score = this.calculatePerceptualLineScore(this.state.currentPin, i);
            if (score > bestScore) {
              bestScore = score;
              bestPin = i;
            }
          }
        }
        // Random fallback as last resort
        if (bestPin === -1) {
          const candidates = [];
          for (let i = 0; i < actualPinCount; i++) {
            if (i !== this.state.currentPin) candidates.push(i);
          }
          if (candidates.length > 0) {
            bestPin = candidates[Math.floor(Math.random() * candidates.length)];
          } else {
            break;
          }
        }
      }

      // Apply the best line with the determined color
      this.applyLineWithColor(this.state.currentPin, bestPin, bestColor);

      // V4.0: Periodically update multi-resolution progress buffers
      if (useEdgeGuidedProposals && (threadNum - lastMultiResUpdate) >= multiResUpdateInterval) {
        this.updateMultiResProgressImages();
        lastMultiResUpdate = threadNum;
      }

      // REAL-TIME thread-by-thread update
      const shouldUpdatePreview = (threadNum - lastPreviewUpdate) >= previewInterval || threadNum === 0;
      
      if (shouldUpdatePreview) {
        const mse = this.calculateCurrentMSE();
        const ssim = this.calculateSSIM();
        const similarity = Math.max(0, Math.min(100, (1 - mse / 65025) * 100 * 0.6 + ssim * 100 * 0.4));
        
        // Use color preview if in color mode
        const previewData = this.params.colorMode === "color" 
          ? this.generateColorPreviewDataUrl()
          : this.generatePreviewDataUrl();
        onProgress(
          threadNum + 1,
          maxThreads,
          `Thread ${threadNum + 1} of ${maxThreads} (${Math.round(similarity)}% match)`,
          previewData,
          { mse, ssim, similarity }
        );
        lastPreviewUpdate = threadNum;
      }

      // Delay for real-time visualization (allows seeing threads being placed)
      await new Promise((resolve) => setTimeout(resolve, delayPerThread));
    }

    // Final update
    const mse = this.calculateCurrentMSE();
    const ssim = this.calculateSSIM();
    const similarity = Math.max(0, Math.min(100, (1 - mse / 65025) * 100 * 0.6 + ssim * 100 * 0.4));
    
    // Use color preview if in color mode
    const finalPreview = this.params.colorMode === "color"
      ? this.generateColorPreviewDataUrl()
      : this.generatePreviewDataUrl();
    
    onProgress(
      this.state.connections.length,
      maxThreads,
      `Greedy complete: ${this.state.connections.length} threads (${Math.round(similarity)}% match)`,
      finalPreview,
      { mse, ssim, similarity }
    );
  }

  // ============================================================
  // V4.0: MULTI-SCALE OPTIMIZATION PIPELINE (Coarse-to-Fine)
  // Stage 1: Structure threads (20%) with high min skip - captures major features
  // Stage 2: Medium threads (40%) with medium skip - fills mid-level detail
  // Stage 3: Detail threads (40%) with low skip - adds fine detail
  // ============================================================

  private async runMultiScaleOptimization(onProgress: ProgressCallback): Promise<void> {
    if (!this.state) return;

    // V4.0: Initialize multi-resolution buffers for better scoring
    this.initializeMultiResolutionBuffers();

    const { maxThreads, minPinSkip, threadOpacity } = this.params;
    const actualPinCount = this.state.pins.length;

    // Stage allocations (two-layer rendering: structure + detail)
    const stage1Threads = Math.floor(maxThreads * 0.25); // Structure layer: 25%
    const stage2Threads = Math.floor(maxThreads * 0.35); // Medium layer: 35%
    const stage3Threads = maxThreads - stage1Threads - stage2Threads; // Detail layer: 40%

    // Pin skip for each stage (decreasing for more detail)
    const stage1Skip = Math.max(minPinSkip, Math.floor(actualPinCount / 6)); // Coarse: ~1/6 of pins
    const stage2Skip = Math.max(minPinSkip, Math.floor(actualPinCount / 15)); // Medium: ~1/15
    const stage3Skip = minPinSkip; // Fine: original min skip

    // Two-layer rendering: Structure layer uses higher opacity for bold strokes
    // Use multipliers of base opacity (capped at 0.5 to avoid oversaturation)
    const stage1Opacity = Math.min(0.5, threadOpacity * 1.5); // Structure: 150% of base (max 0.5)
    const stage2Opacity = Math.min(0.5, threadOpacity * 1.1); // Medium: 110% of base (max 0.5)
    const stage3Opacity = threadOpacity * 0.8; // Detail: 80% of base (fine lines)

    const useColorScoring = this.params.colorMode === "color" && this.state.colorImage;
    const targetTimeMs = 60000;
    const delayPerThread = Math.max(1, Math.floor(targetTimeMs / maxThreads));
    
    let lastPreviewUpdate = 0;
    const previewInterval = Math.max(20, Math.floor(maxThreads / 100));
    let lastMultiResUpdate = 0;
    const multiResUpdateInterval = Math.max(10, Math.floor(maxThreads / 150)); // ~150 updates
    let threadNum = 0;
    const originalOpacity = this.params.threadOpacity;

    // Helper to run one stage with layer-specific opacity and edge-guided candidates
    const runStage = async (stageThreads: number, stageSkip: number, stageOpacity: number, stageName: string) => {
      // Use stage-specific opacity directly (already clamped in stage definitions)
      const effectiveOpacity = stageOpacity;
      
      for (let t = 0; t < stageThreads && !this.cancelled; t++, threadNum++) {
        let bestPin = -1;
        let bestScore = -Infinity;
        let bestColor: string | undefined = undefined;

        // V4.0: Use edge-guided candidates (70%) + random diversity (30%)
        let candidatePins: number[] = [];
        const edgeCandidates = this.getEdgeGuidedCandidates(this.state!.currentPin, 35);
        
        // Filter edge candidates by stage-specific skip
        for (const pin of edgeCandidates) {
          const dist = Math.abs(pin - this.state!.currentPin);
          const wrapDist = actualPinCount - dist;
          if (Math.min(dist, wrapDist) >= stageSkip) {
            candidatePins.push(pin);
          }
        }
        
        // Add random diversity pins
        const edgeSet = new Set(candidatePins);
        const remainingPool: number[] = [];
        for (let i = 0; i < actualPinCount; i++) {
          if (!edgeSet.has(i)) {
            const dist = Math.abs(i - this.state!.currentPin);
            const wrapDist = actualPinCount - dist;
            if (Math.min(dist, wrapDist) >= stageSkip) {
              remainingPool.push(i);
            }
          }
        }
        const randomCount = Math.min(15, Math.floor(remainingPool.length * 0.3));
        for (let i = 0; i < randomCount && remainingPool.length > 0; i++) {
          const randIdx = Math.floor(Math.random() * remainingPool.length);
          candidatePins.push(remainingPool[randIdx]);
          remainingPool[randIdx] = remainingPool[remainingPool.length - 1];
          remainingPool.pop();
        }

        // Temporarily set opacity for scoring to match this stage's opacity
        const savedOpacity = this.params.threadOpacity;
        this.params.threadOpacity = effectiveOpacity;
        
        // Find best candidate using v4.0 multi-res scoring (for both color and monochrome)
        for (const i of candidatePins) {
          if (useColorScoring) {
            // Get color score
            const result = this.calculateColorLineScore(this.state!.currentPin, i);
            // Combine with multi-res score for better accuracy (70% color + 30% structure)
            const multiResScore = this.calculateMultiResLineScore(this.state!.currentPin, i);
            const combinedScore = result.score * 0.7 + multiResScore * 0.3;
            if (combinedScore > bestScore) {
              bestScore = combinedScore;
              bestPin = i;
              bestColor = result.bestColor;
            }
          } else {
            // Use multi-resolution scoring for better accuracy
            const score = this.calculateMultiResLineScore(this.state!.currentPin, i);
            if (score > bestScore) {
              bestScore = score;
              bestPin = i;
            }
          }
        }
        
        // Restore opacity immediately after scoring
        this.params.threadOpacity = savedOpacity;

        // Fallback if no valid pin found
        if (bestPin === -1) {
          for (let i = 0; i < actualPinCount; i++) {
            if (i !== this.state!.currentPin) {
              const dist = Math.abs(i - this.state!.currentPin);
              const wrapDist = actualPinCount - dist;
              if (Math.min(dist, wrapDist) >= stageSkip) {
                bestPin = i;
                break;
              }
            }
          }
        }
        if (bestPin === -1) break;

        // Apply line with stage-specific opacity
        this.applyLineWithOpacity(this.state!.currentPin, bestPin, effectiveOpacity, bestColor);

        // V4.0: Periodically update multi-resolution progress buffers
        if ((threadNum - lastMultiResUpdate) >= multiResUpdateInterval) {
          this.updateMultiResProgressImages();
          lastMultiResUpdate = threadNum;
        }

        // Progress update
        if ((threadNum - lastPreviewUpdate) >= previewInterval || threadNum === 0) {
          const mse = this.calculateCurrentMSE();
          const ssim = this.calculateSSIM();
          const similarity = Math.max(0, Math.min(100, (1 - mse / 65025) * 100 * 0.6 + ssim * 100 * 0.4));
          
          const previewData = this.params.colorMode === "color"
            ? this.generateColorPreviewDataUrl()
            : this.generatePreviewDataUrl();
          onProgress(
            threadNum + 1,
            maxThreads,
            `${stageName}: Thread ${threadNum + 1}/${maxThreads} (${Math.round(similarity)}% match)`,
            previewData,
            { mse, ssim, similarity }
          );
          lastPreviewUpdate = threadNum;
        }

        await new Promise((resolve) => setTimeout(resolve, delayPerThread));
      }
    };

    // Run three stages with two-layer rendering (different opacities)
    await runStage(stage1Threads, stage1Skip, stage1Opacity, "Structure Layer");
    await runStage(stage2Threads, stage2Skip, stage2Opacity, "Medium Layer");
    await runStage(stage3Threads, stage3Skip, stage3Opacity, "Detail Layer");

    // Restore original opacity
    this.params.threadOpacity = originalOpacity;

    // Final update
    if (this.state) {
      const mse = this.calculateCurrentMSE();
      const ssim = this.calculateSSIM();
      const similarity = Math.max(0, Math.min(100, (1 - mse / 65025) * 100 * 0.6 + ssim * 100 * 0.4));
      
      const finalPreview = this.params.colorMode === "color"
        ? this.generateColorPreviewDataUrl()
        : this.generatePreviewDataUrl();
      
      onProgress(
        this.state.connections.length,
        maxThreads,
        `Multi-scale complete: ${this.state.connections.length} threads (${Math.round(similarity)}% match)`,
        finalPreview,
        { mse, ssim, similarity }
      );
    }
  }

  // ============================================================
  // ENHANCED PERCEPTUAL LINE SCORING 
  // Weights: 0.40 SSIM + 0.25 MSE + 0.20 Edge + 0.10 Smoothness + 0.05 Overdraw
  // ============================================================

  private calculatePerceptualLineScore(fromPin: number, toPin: number): number {
    if (!this.state) return -Infinity;

    const pixels = this.getLinePixels(fromPin, toPin);
    if (pixels.length === 0) return -1000000;

    const { targetImage, progressImage, edgeMap, pinUsageCount, overdrawMap } = this.state;
    const threadOpacity = this.params.threadOpacity;
    const n = pixels.length;

    let mseImprovement = 0;
    let edgeBonus = 0;
    let overdrawPenalty = 0;
    let smoothnessPenalty = 0;
    
    // Local statistics for SSIM-like structure scoring
    let targetMean = 0, currentMean = 0, newMean = 0;
    let targetVar = 0, currentVar = 0, newVar = 0;
    let targetCurrentCov = 0, targetNewCov = 0;

    // Pre-calculate new values for all pixels
    const newValues: number[] = [];

    // First pass: calculate means and new values
    for (const idx of pixels) {
      targetMean += targetImage.data[idx];
      currentMean += progressImage[idx];
      
      // Gamma-corrected blending simulation (black thread)
      const currentVal = progressImage[idx];
      const currentLinear = Math.pow(currentVal / 255, 2.2);
      const blendedLinear = currentLinear * (1 - threadOpacity);
      const newVal = Math.pow(blendedLinear, 1/2.2) * 255;
      newValues.push(newVal);
      newMean += newVal;
    }
    targetMean /= n;
    currentMean /= n;
    newMean /= n;

    // Second pass: calculate variances, covariances, and component scores
    for (let i = 0; i < n; i++) {
      const idx = pixels[i];
      const targetVal = targetImage.data[idx];
      const currentVal = progressImage[idx];
      const newVal = newValues[i];

      // MSE improvement
      const oldErrorSq = Math.pow(targetVal - currentVal, 2);
      const newErrorSq = Math.pow(targetVal - newVal, 2);
      mseImprovement += (oldErrorSq - newErrorSq);

      // Local variance/covariance for SSIM
      const tDiff = targetVal - targetMean;
      const cDiff = currentVal - currentMean;
      const nDiff = newVal - newMean;
      
      targetVar += tDiff * tDiff;
      currentVar += cDiff * cDiff;
      newVar += nDiff * nDiff;
      targetCurrentCov += tDiff * cDiff;
      targetNewCov += tDiff * nDiff;

      // Edge preservation bonus - stronger weight for edge-aligned selection
      if (this.params.useEdgeDetection && edgeMap[idx]) {
        edgeBonus += (edgeMap[idx] / 255);
      }

      // Overdraw penalty - penalize drawing over already dark areas
      const currentDarkness = (255 - currentVal) / 255;
      if (currentDarkness > 0.5) {
        overdrawPenalty += (currentDarkness - 0.5) * 2;
      }
      overdrawPenalty += overdrawMap[idx] * 0.1; // Track explicit overdraw

      // Smoothness - penalize if new value creates abrupt changes
      if (i > 0 && i < n - 1) {
        const prevNew = newValues[i - 1];
        const nextNew = i + 1 < newValues.length ? newValues[i + 1] : newVal;
        const localVariance = Math.abs(newVal - prevNew) + Math.abs(newVal - nextNew);
        smoothnessPenalty += localVariance / 255;
      }
    }

    // Calculate local SSIM-like structure improvement
    targetVar /= n;
    currentVar /= n;
    newVar /= n;
    targetCurrentCov /= n;
    targetNewCov /= n;

    const C1 = 6.5025; // (0.01 * 255)^2
    const C2 = 58.5225; // (0.03 * 255)^2
    
    // Full SSIM calculation
    const oldLuminance = (2 * targetMean * currentMean + C1) / (targetMean * targetMean + currentMean * currentMean + C1);
    const newLuminance = (2 * targetMean * newMean + C1) / (targetMean * targetMean + newMean * newMean + C1);
    const oldContrast = (2 * Math.sqrt(targetVar * currentVar) + C2) / (targetVar + currentVar + C2);
    const newContrast = (2 * Math.sqrt(targetVar * newVar) + C2) / (targetVar + newVar + C2);
    const oldStructure = (targetCurrentCov + C2 / 2) / (Math.sqrt(targetVar * currentVar) + C2 / 2);
    const newStructure = (targetNewCov + C2 / 2) / (Math.sqrt(targetVar * newVar) + C2 / 2);
    
    const oldSSIM = oldLuminance * oldContrast * oldStructure;
    const newSSIM = newLuminance * newContrast * newStructure;
    const ssimImprovement = (newSSIM - oldSSIM) * 1000; // Scale up

    // Edge alignment score
    const edgeAlignment = this.calculateEdgeAlignment(fromPin, toPin);

    // Normalize all component scores
    const mseScore = mseImprovement / n;
    const ssimScore = ssimImprovement;
    const edgeScore = (edgeBonus / n) * 10 + edgeAlignment * 5;
    const smoothScore = -smoothnessPenalty / n;
    const overdrawScore = -overdrawPenalty / n;

    // Combined score with new weights:
    // 0.40 SSIM + 0.25 MSE + 0.20 Edge + 0.10 Smoothness + 0.05 Overdraw
    let score = ssimScore * 0.40 + mseScore * 0.25 + edgeScore * 0.20 + smoothScore * 0.10 + overdrawScore * 0.05;

    // Face region priority boost (2x edge weight for lines through face)
    if (this.state.faceRegionMask) {
      const faceOverlap = getLineFaceOverlap(pixels, this.state.faceRegionMask);
      if (faceOverlap > 0.3) {
        // Line passes through face - boost edge score 2x and add face priority
        score += edgeScore * faceOverlap * 2.0;
        
        // Check overdraw in face region specifically (stricter: 0.85 density limit)
        let faceDensity = 0;
        let facePixelCount = 0;
        for (const idx of pixels) {
          if (this.state.faceRegionMask.faceMask[idx]) {
            faceDensity += this.state.densityImage[idx];
            facePixelCount++;
          }
        }
        if (facePixelCount > 0) {
          const avgFaceDensity = faceDensity / facePixelCount;
          if (avgFaceDensity > 0.85) {
            score *= 0.3; // Heavily penalize overdraw in face
          }
        }
      }
    }

    // Pin fatigue penalty (very gentle)
    if (this.params.usePinFatigue) {
      const fromUsage = pinUsageCount[fromPin];
      const toUsage = pinUsageCount[toPin];
      const fatigueMultiplier = 1 / Math.pow(1.005, Math.max(0, fromUsage + toUsage - 50));
      score *= fatigueMultiplier;
    }

    // Length preference - favor shorter lines for better detail coverage
    const optimalLength = Math.min(this.state.targetImage.width, this.state.targetImage.height) * 0.3;
    const lengthRatio = n / optimalLength;
    if (lengthRatio > 0.2 && lengthRatio < 1.2) {
      score *= 1.15;
    } else if (lengthRatio > 1.5) {
      score *= 0.85;
    }

    return score;
  }

  // ============================================================
  // COLOR-AWARE LINE SCORING (for color mode - considers thread color matching)
  // ============================================================

  private calculateColorLineScore(fromPin: number, toPin: number): { score: number; bestColor: string } {
    if (!this.state || !this.state.colorImage || !this.state.colorProgressImage) {
      return { score: -1000000, bestColor: "#000000" };
    }

    const pixels = this.getLinePixels(fromPin, toPin);
    if (pixels.length === 0) return { score: -1000000, bestColor: "#000000" };

    const { colorImage, colorProgressImage, edgeMap, pinUsageCount } = this.state;
    const threadOpacity = this.params.threadOpacity;

    // Sample colors along the line to find what color would best improve the result
    // Sample more points for better color accuracy
    const sampleCount = Math.min(20, pixels.length);
    const step = Math.max(1, Math.floor(pixels.length / sampleCount));
    
    // Calculate what color we need to move toward target
    let neededR = 0, neededG = 0, neededB = 0;
    let samplesTaken = 0;
    
    for (let i = 0; i < pixels.length; i += step) {
      const idx = pixels[i];
      if (idx < colorImage.data.length && idx < colorProgressImage.length) {
        const target = colorImage.data[idx];
        const current = colorProgressImage[idx];
        // Weight by how much improvement is needed (darker targets need more attention)
        const weight = 1 + (255 - (target.r + target.g + target.b) / 3) / 255;
        neededR += target.r * weight;
        neededG += target.g * weight;
        neededB += target.b * weight;
        samplesTaken += weight;
      }
    }
    
    if (samplesTaken === 0) return { score: -1000000, bestColor: "#000000" };
    
    neededR = Math.round(neededR / samplesTaken);
    neededG = Math.round(neededG / samplesTaken);
    neededB = Math.round(neededB / samplesTaken);

    // Find best matching thread color from palette based on target color
    const { hex: bestColor } = this.findClosestPaletteColorLAB(neededR, neededG, neededB);
    
    // Parse the best color
    const colorR = parseInt(bestColor.slice(1, 3), 16);
    const colorG = parseInt(bestColor.slice(3, 5), 16);
    const colorB = parseInt(bestColor.slice(5, 7), 16);
    
    // Convert thread color to linear space for gamma-correct blending
    const colorRLinear = Math.pow(colorR / 255, 2.2);
    const colorGLinear = Math.pow(colorG / 255, 2.2);
    const colorBLinear = Math.pow(colorB / 255, 2.2);

    // Calculate score using LAB perceptual error + structure preservation
    let mseImprovement = 0;
    let deltaEImprovement = 0;
    let edgeBonus = 0;
    
    // Pre-compute target LAB for this line
    const threadLAB = this.rgbToLAB(colorR, colorG, colorB);
    
    for (const idx of pixels) {
      if (idx >= colorImage.data.length || idx >= colorProgressImage.length) continue;
      
      const target = colorImage.data[idx];
      const current = colorProgressImage[idx];
      
      // Convert to linear space for gamma-correct blending
      const currentRLinear = Math.pow(current.r / 255, 2.2);
      const currentGLinear = Math.pow(current.g / 255, 2.2);
      const currentBLinear = Math.pow(current.b / 255, 2.2);
      
      // Blend in linear space
      const blendedRLinear = currentRLinear * (1 - threadOpacity) + colorRLinear * threadOpacity;
      const blendedGLinear = currentGLinear * (1 - threadOpacity) + colorGLinear * threadOpacity;
      const blendedBLinear = currentBLinear * (1 - threadOpacity) + colorBLinear * threadOpacity;
      
      // Convert back to sRGB
      const blendedR = Math.pow(blendedRLinear, 1/2.2) * 255;
      const blendedG = Math.pow(blendedGLinear, 1/2.2) * 255;
      const blendedB = Math.pow(blendedBLinear, 1/2.2) * 255;
      
      // MSE improvement (luminance-weighted)
      const oldErrorSq = Math.pow(target.r - current.r, 2) * 0.299 +
                        Math.pow(target.g - current.g, 2) * 0.587 +
                        Math.pow(target.b - current.b, 2) * 0.114;
      const newErrorSq = Math.pow(target.r - blendedR, 2) * 0.299 +
                        Math.pow(target.g - blendedG, 2) * 0.587 +
                        Math.pow(target.b - blendedB, 2) * 0.114;
      mseImprovement += (oldErrorSq - newErrorSq);

      // LAB perceptual color difference improvement (deltaE)
      const targetLAB = this.rgbToLAB(target.r, target.g, target.b);
      const currentLAB = this.rgbToLAB(current.r, current.g, current.b);
      const blendedLAB = this.rgbToLAB(blendedR, blendedG, blendedB);
      
      const oldDeltaE = this.deltaE(targetLAB, currentLAB);
      const newDeltaE = this.deltaE(targetLAB, blendedLAB);
      deltaEImprovement += (oldDeltaE - newDeltaE) * 10; // Scale for impact

      // Edge bonus for structure preservation
      if (this.params.useEdgeDetection && edgeMap[idx]) {
        edgeBonus += (edgeMap[idx] / 255) * 5.0;
      }
    }

    // Combined score: MSE + perceptual deltaE + edges
    const n = pixels.length;
    let score = (mseImprovement * 0.5 + deltaEImprovement * 0.4 + edgeBonus * 0.1) / n;
    
    // Favor shorter lines for better detail
    const optimalLength = Math.min(this.state.targetImage.width, this.state.targetImage.height) * 0.3;
    const lengthRatio = n / optimalLength;
    if (lengthRatio > 0.2 && lengthRatio < 1.2) {
      score *= 1.15;
    } else if (lengthRatio > 1.5) {
      score *= 0.85;
    }

    // Gentle pin fatigue
    if (this.params.usePinFatigue) {
      const fromUsage = pinUsageCount[fromPin];
      const toUsage = pinUsageCount[toPin];
      const fatigueMultiplier = 1 / Math.pow(1.005, Math.max(0, fromUsage + toUsage - 50));
      score *= fatigueMultiplier;
    }

    return { score, bestColor };
  }

  // ============================================================
  // GAMMA-CORRECTED LINE BLENDING (more realistic thread accumulation)
  // ============================================================

  private applyLineWithColor(fromPin: number, toPin: number, color?: string): void {
    if (!this.state) return;

    const pixels = this.getLinePixels(fromPin, toPin);
    const threadOpacity = this.params.threadOpacity;

    // Use provided color or determine from image
    let threadColor = color;
    if (!threadColor && this.params.colorMode === "color" && this.state.colorImage) {
      const fromPinPos = this.state.pins[fromPin];
      const toPinPos = this.state.pins[toPin];
      if (fromPinPos && toPinPos) {
        const samples = this.sampleLineColors(fromPinPos, toPinPos, this.state.colorImage, 3);
        if (samples.length > 0) {
          let avgR = 0, avgG = 0, avgB = 0;
          for (const s of samples) {
            avgR += s.r;
            avgG += s.g;
            avgB += s.b;
          }
          avgR = Math.round(avgR / samples.length);
          avgG = Math.round(avgG / samples.length);
          avgB = Math.round(avgB / samples.length);
          const { hex } = this.findClosestPaletteColorLAB(avgR, avgG, avgB);
          threadColor = hex;
        }
      }
    }

    // Parse thread color for color progress update
    let colorR = 0, colorG = 0, colorB = 0;
    let colorRLinear = 0, colorGLinear = 0, colorBLinear = 0;
    if (threadColor) {
      colorR = parseInt(threadColor.slice(1, 3), 16);
      colorG = parseInt(threadColor.slice(3, 5), 16);
      colorB = parseInt(threadColor.slice(5, 7), 16);
      // Pre-compute linear values for gamma-correct blending
      colorRLinear = Math.pow(colorR / 255, 2.2);
      colorGLinear = Math.pow(colorG / 255, 2.2);
      colorBLinear = Math.pow(colorB / 255, 2.2);
    }

    for (const idx of pixels) {
      const currentVal = this.state.progressImage[idx];
      
      // Gamma-corrected blending for monochrome progress
      const currentLinear = Math.pow(currentVal / 255, 2.2);
      const threadLinear = 1 - threadOpacity;
      const blendedLinear = currentLinear * threadLinear;
      const newVal = Math.pow(blendedLinear, 1/2.2) * 255;
      
      this.state.progressImage[idx] = Math.max(0, Math.round(newVal));
      
      // Track overdraw for scoring
      this.state.overdrawMap[idx]++;
      
      // Update density image (proper compositing: new = old + opacity * (1 - old))
      const oldDensity = this.state.densityImage[idx];
      this.state.densityImage[idx] = oldDensity + threadOpacity * (1 - oldDensity);
      
      // Update color progress image if in color mode (gamma-correct blending)
      if (this.state.colorProgressImage && threadColor) {
        const current = this.state.colorProgressImage[idx];
        // Convert current to linear space
        const currentRLinear = Math.pow(current.r / 255, 2.2);
        const currentGLinear = Math.pow(current.g / 255, 2.2);
        const currentBLinear = Math.pow(current.b / 255, 2.2);
        // Blend in linear space
        const blendedRLinear = currentRLinear * (1 - threadOpacity) + colorRLinear * threadOpacity;
        const blendedGLinear = currentGLinear * (1 - threadOpacity) + colorGLinear * threadOpacity;
        const blendedBLinear = currentBLinear * (1 - threadOpacity) + colorBLinear * threadOpacity;
        // Convert back to sRGB
        this.state.colorProgressImage[idx] = {
          r: Math.round(Math.pow(blendedRLinear, 1/2.2) * 255),
          g: Math.round(Math.pow(blendedGLinear, 1/2.2) * 255),
          b: Math.round(Math.pow(blendedBLinear, 1/2.2) * 255),
        };
      }
    }

    this.state.pinUsageCount[fromPin]++;
    this.state.pinUsageCount[toPin]++;
    
    this.state.connections.push({ fromPin, toPin, color: threadColor });
    this.state.currentPin = toPin;
  }

  // Backward compatibility alias
  private applyLineGammaCorrected(fromPin: number, toPin: number): void {
    this.applyLineWithColor(fromPin, toPin);
  }

  // V4.0: Apply line with custom opacity (for two-layer rendering)
  private applyLineWithOpacity(fromPin: number, toPin: number, customOpacity: number, color?: string): void {
    if (!this.state) return;

    const pixels = this.getLinePixels(fromPin, toPin);
    const threadOpacity = customOpacity; // Use custom opacity instead of params

    // Use provided color or determine from image
    let threadColor = color;
    if (!threadColor && this.params.colorMode === "color" && this.state.colorImage) {
      const fromPinPos = this.state.pins[fromPin];
      const toPinPos = this.state.pins[toPin];
      if (fromPinPos && toPinPos) {
        const samples = this.sampleLineColors(fromPinPos, toPinPos, this.state.colorImage, 3);
        if (samples.length > 0) {
          let avgR = 0, avgG = 0, avgB = 0;
          for (const s of samples) {
            avgR += s.r;
            avgG += s.g;
            avgB += s.b;
          }
          avgR = Math.round(avgR / samples.length);
          avgG = Math.round(avgG / samples.length);
          avgB = Math.round(avgB / samples.length);
          const { hex } = this.findClosestPaletteColorLAB(avgR, avgG, avgB);
          threadColor = hex;
        }
      }
    }

    // Parse thread color for color progress update
    let colorR = 0, colorG = 0, colorB = 0;
    let colorRLinear = 0, colorGLinear = 0, colorBLinear = 0;
    if (threadColor) {
      colorR = parseInt(threadColor.slice(1, 3), 16);
      colorG = parseInt(threadColor.slice(3, 5), 16);
      colorB = parseInt(threadColor.slice(5, 7), 16);
      colorRLinear = Math.pow(colorR / 255, 2.2);
      colorGLinear = Math.pow(colorG / 255, 2.2);
      colorBLinear = Math.pow(colorB / 255, 2.2);
    }

    for (const idx of pixels) {
      const currentVal = this.state.progressImage[idx];
      
      // Gamma-corrected blending for monochrome progress
      const currentLinear = Math.pow(currentVal / 255, 2.2);
      const threadLinear = 1 - threadOpacity;
      const blendedLinear = currentLinear * threadLinear;
      const newVal = Math.pow(blendedLinear, 1/2.2) * 255;
      
      this.state.progressImage[idx] = Math.max(0, Math.round(newVal));
      
      // Track overdraw for scoring
      this.state.overdrawMap[idx]++;
      
      // Update density image
      const oldDensity = this.state.densityImage[idx];
      this.state.densityImage[idx] = oldDensity + threadOpacity * (1 - oldDensity);
      
      // Update color progress image if in color mode
      if (this.state.colorProgressImage && threadColor) {
        const current = this.state.colorProgressImage[idx];
        const currentRLinear = Math.pow(current.r / 255, 2.2);
        const currentGLinear = Math.pow(current.g / 255, 2.2);
        const currentBLinear = Math.pow(current.b / 255, 2.2);
        const blendedRLinear = currentRLinear * (1 - threadOpacity) + colorRLinear * threadOpacity;
        const blendedGLinear = currentGLinear * (1 - threadOpacity) + colorGLinear * threadOpacity;
        const blendedBLinear = currentBLinear * (1 - threadOpacity) + colorBLinear * threadOpacity;
        this.state.colorProgressImage[idx] = {
          r: Math.round(Math.pow(blendedRLinear, 1/2.2) * 255),
          g: Math.round(Math.pow(blendedGLinear, 1/2.2) * 255),
          b: Math.round(Math.pow(blendedBLinear, 1/2.2) * 255),
        };
      }
    }

    this.state.pinUsageCount[fromPin]++;
    this.state.pinUsageCount[toPin]++;
    
    this.state.connections.push({ fromPin, toPin, color: threadColor });
    this.state.currentPin = toPin;
  }

  // ============================================================
  // ENHANCED SIMULATED ANNEALING (with SSIM-based acceptance)
  // ============================================================

  private async runEnhancedSimulatedAnnealing(onProgress: ProgressCallback): Promise<void> {
    if (!this.state) return;

    const actualPinCount = this.state.pins.length;
    const iterations = Math.min(this.state.connections.length * 0.2, 1000);
    let temperature = 150;
    const coolingRate = 0.97;
    let improvements = 0;

    for (let i = 0; i < iterations && !this.cancelled; i++) {
      temperature *= coolingRate;

      // Randomly select a connection to potentially modify
      const connIdx = Math.floor(Math.random() * this.state.connections.length);
      const conn = this.state.connections[connIdx];

      // Try a random alternative using actual pin count
      const altToPin = Math.floor(Math.random() * actualPinCount);
      if (altToPin === conn.fromPin) continue;
      
      // Skip if too close
      const dist = Math.abs(altToPin - conn.fromPin);
      const wrapDist = actualPinCount - dist;
      if (Math.min(dist, wrapDist) < this.params.minPinSkip) continue;

      const currentScore = this.calculatePerceptualLineScore(conn.fromPin, conn.toPin);
      const newScore = this.calculatePerceptualLineScore(conn.fromPin, altToPin);

      const delta = newScore - currentScore;
      const acceptProbability = delta > 0 ? 1 : Math.exp(delta / temperature);

      if (Math.random() < acceptProbability) {
        // Remove old line effect and apply new (pass color for proper color state revert)
        this.revertLine(conn.fromPin, conn.toPin, conn.color);
        this.applyLineWithColor(conn.fromPin, altToPin);
        // Get the new connection with color (just pushed by applyLine)
        const newConn = this.state.connections.pop();
        if (newConn) {
          this.state.connections[connIdx] = newConn;
        }
        if (delta > 0) improvements++;
      }

      if (i % 100 === 0) {
        const mse = this.calculateCurrentMSE();
        const ssim = this.calculateSSIM();
        const similarity = Math.max(0, Math.min(100, (1 - mse / 65025) * 100 * 0.6 + ssim * 100 * 0.4));
        
        onProgress(
          this.state.connections.length,
          this.params.maxThreads,
          `Annealing ${Math.round((i / iterations) * 100)}% (${improvements} improvements)`,
          undefined,
          { mse, ssim, similarity }
        );
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
  }

  private revertLine(fromPin: number, toPin: number, threadColor?: string): void {
    if (!this.state) return;

    const pixels = this.getLinePixels(fromPin, toPin);
    const threadOpacity = this.params.threadOpacity;

    // Parse thread color for color progress revert
    let colorRLinear = 0, colorGLinear = 0, colorBLinear = 0;
    if (threadColor && this.state.colorProgressImage) {
      const colorR = parseInt(threadColor.slice(1, 3), 16);
      const colorG = parseInt(threadColor.slice(3, 5), 16);
      const colorB = parseInt(threadColor.slice(5, 7), 16);
      colorRLinear = Math.pow(colorR / 255, 2.2);
      colorGLinear = Math.pow(colorG / 255, 2.2);
      colorBLinear = Math.pow(colorB / 255, 2.2);
    }

    for (const idx of pixels) {
      const currentVal = this.state.progressImage[idx];
      
      // Reverse gamma-corrected blending for monochrome
      const currentLinear = Math.pow(currentVal / 255, 2.2);
      const threadLinear = 1 - threadOpacity;
      const revertedLinear = Math.min(1, currentLinear / threadLinear);
      const newVal = Math.pow(revertedLinear, 1/2.2) * 255;
      
      this.state.progressImage[idx] = Math.min(255, Math.round(newVal));
      
      // Revert overdraw tracking
      this.state.overdrawMap[idx] = Math.max(0, this.state.overdrawMap[idx] - 1);
      
      // Revert density (approximate - exact revert is complex for compositing)
      const oldDensity = this.state.densityImage[idx];
      this.state.densityImage[idx] = Math.max(0, (oldDensity - threadOpacity) / (1 - threadOpacity));
      
      // Revert color progress image if in color mode
      if (this.state.colorProgressImage && threadColor) {
        const current = this.state.colorProgressImage[idx];
        // Convert current to linear space
        const currentRLinear = Math.pow(current.r / 255, 2.2);
        const currentGLinear = Math.pow(current.g / 255, 2.2);
        const currentBLinear = Math.pow(current.b / 255, 2.2);
        // Reverse the blend: original = (current - thread * opacity) / (1 - opacity)
        const revertedRLinear = Math.max(0, Math.min(1, (currentRLinear - colorRLinear * threadOpacity) / (1 - threadOpacity)));
        const revertedGLinear = Math.max(0, Math.min(1, (currentGLinear - colorGLinear * threadOpacity) / (1 - threadOpacity)));
        const revertedBLinear = Math.max(0, Math.min(1, (currentBLinear - colorBLinear * threadOpacity) / (1 - threadOpacity)));
        // Convert back to sRGB
        this.state.colorProgressImage[idx] = {
          r: Math.round(Math.pow(revertedRLinear, 1/2.2) * 255),
          g: Math.round(Math.pow(revertedGLinear, 1/2.2) * 255),
          b: Math.round(Math.pow(revertedBLinear, 1/2.2) * 255),
        };
      }
    }

    this.state.pinUsageCount[fromPin] = Math.max(0, this.state.pinUsageCount[fromPin] - 1);
    this.state.pinUsageCount[toPin] = Math.max(0, this.state.pinUsageCount[toPin] - 1);
  }

  // ============================================================
  // FACE REFINEMENT PASS - Extra threads focused on face region
  // ============================================================

  private async runFaceRefinementPass(onProgress: ProgressCallback): Promise<void> {
    if (!this.state || !this.state.faceRegionMask || !this.state.faceBox) return;

    const faceBox = this.state.faceBox;
    const faceRegionMask = this.state.faceRegionMask;
    const pins = this.state.pins;
    const pinCount = pins.length;
    
    // Add 1500-2000 extra threads focused on face
    const extraFaceThreads = Math.min(2000, Math.floor(this.params.maxThreads * 0.2));
    const faceThreadOpacity = this.params.threadOpacity * 0.9; // Slightly thinner for face detail
    const faceMinPinSkip = Math.max(1, Math.floor(this.params.minPinSkip / 2)); // Smaller skip for face
    
    console.log(`Running face refinement: ${extraFaceThreads} extra threads for face region`);
    
    // Find pins that are near the face region
    const facePins: number[] = [];
    const faceCenterX = faceBox.x + faceBox.width / 2;
    const faceCenterY = faceBox.y + faceBox.height / 2;
    const faceRadius = Math.max(faceBox.width, faceBox.height) * 0.75;
    
    for (let i = 0; i < pinCount; i++) {
      const pin = pins[i];
      const dx = pin.x - faceCenterX;
      const dy = pin.y - faceCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < faceRadius * 1.5) {
        facePins.push(i);
      }
    }
    
    if (facePins.length < 10) {
      console.log('Not enough pins near face for refinement');
      return;
    }
    
    const useColorMode = this.params.colorMode === "color" && this.state.colorProgressImage;
    const previewInterval = Math.max(1, Math.floor(extraFaceThreads / 20));
    
    // Pre-compute target LAB for color mode (outside loop for efficiency)
    let targetLab: { L: number; a: number; b: number }[] | undefined;
    if (useColorMode && this.state.colorImage) {
      const pixelCount = this.state.targetImage.width * this.state.targetImage.height;
      targetLab = new Array(pixelCount);
      for (let i = 0; i < pixelCount; i++) {
        const c = this.state.colorImage.data[i];
        targetLab[i] = this.rgbToLAB(c.r, c.g, c.b);
      }
    }
    
    for (let t = 0; t < extraFaceThreads && !this.cancelled; t++) {
      let bestPin = -1;
      let bestScore = -Infinity;
      let bestColor = this.THREAD_COLOR_PALETTE[0];
      
      // Use current pin or pick a random face-adjacent pin
      const startPin: number = this.state.currentPin;
      
      // Generate candidates from face-adjacent pins
      for (const candidatePin of facePins) {
        if (candidatePin === startPin) continue;
        
        const dist = Math.abs(candidatePin - startPin);
        const wrapDist = pinCount - dist;
        if (Math.min(dist, wrapDist) < faceMinPinSkip) continue;
        
        // Check if line passes through face
        const startPinCoord = pins[startPin];
        const endPinCoord = pins[candidatePin];
        if (!startPinCoord || !endPinCoord) continue;
        
        const midX: number = (startPinCoord.x + endPinCoord.x) / 2;
        const midY: number = (startPinCoord.y + endPinCoord.y) / 2;
        const midIdx = Math.floor(midY) * faceRegionMask.width + Math.floor(midX);
        
        // Prefer lines that pass through face
        if (!faceRegionMask.faceMask[midIdx]) continue;
        
        if (useColorMode && targetLab) {
          // For color mode, use proper v4.2 interleaved scoring with LAB Delta E
          for (const colorOption of this.THREAD_COLOR_PALETTE) {
            // Use the proper color scoring with Delta E
            let colorScore = this.evaluateColoredLine(startPin, candidatePin, colorOption, faceThreadOpacity, targetLab);
            
            // Additional boost for face lines (1.5x)
            colorScore *= 1.5;
            
            if (colorScore > bestScore) {
              bestScore = colorScore;
              bestPin = candidatePin;
              bestColor = colorOption;
            }
          }
        } else {
          // Monochrome mode - use perceptual scoring with face boost
          let score = this.calculatePerceptualLineScore(startPin, candidatePin);
          score *= 1.5; // Face boost
          if (score > bestScore) {
            bestScore = score;
            bestPin = candidatePin;
          }
        }
      }
      
      // Apply the best face line
      if (bestPin !== -1) {
        if (useColorMode) {
          this.applyColoredLine(startPin, bestPin, bestColor, faceThreadOpacity);
          this.state.connections.push({
            fromPin: startPin,
            toPin: bestPin,
            color: bestColor.hex,
            colorName: bestColor.name
          });
        } else {
          this.applyLineWithOpacity(startPin, bestPin, faceThreadOpacity);
          this.state.connections.push({
            fromPin: startPin,
            toPin: bestPin,
            color: "#000000"
          });
        }
        this.state.pinUsageCount[bestPin]++;
        this.state.currentPin = bestPin;
      }
      
      // Progress update
      if (t % previewInterval === 0) {
        const previewData = useColorMode 
          ? this.generateColorPreviewDataUrl()
          : this.generatePreviewDataUrl();
        
        onProgress(
          this.state.connections.length,
          this.params.maxThreads + extraFaceThreads,
          `Face detail: ${t + 1}/${extraFaceThreads}`,
          previewData
        );
      }
      
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    console.log(`Face refinement complete: added ${extraFaceThreads} face threads`);
  }

  // ============================================================
  // LOCAL REFINEMENT PASS - Replace low-value threads with MULTIPLE CANDIDATES
  // ============================================================

  private async runLocalRefinement(onProgress: ProgressCallback): Promise<void> {
    if (!this.state) return;

    const connections = this.state.connections;
    if (connections.length < 100) return;

    const useColorScoring = this.params.colorMode === "color" && this.state.colorImage;
    const actualPinCount = this.state.pins.length;
    const { minPinSkip } = this.params;
    
    // Fast contribution scoring using current scoring function (avoids O(n²) MSE calculations)
    const scores: { idx: number; contribution: number }[] = [];
    
    for (let i = 0; i < connections.length; i++) {
      const conn = connections[i];
      // Use existing scoring as proxy for contribution (faster than full MSE calculation)
      const score = useColorScoring
        ? this.calculateColorLineScore(conn.fromPin, conn.toPin).score
        : this.calculatePerceptualLineScore(conn.fromPin, conn.toPin);
      scores.push({ idx: i, contribution: score });
    }

    // Sort to find lowest scorers (lines that contribute least)
    scores.sort((a, b) => a.contribution - b.contribution);
    const worstCount = Math.min(Math.floor(connections.length * 0.1), 300);
    const toReplace = scores.slice(0, worstCount);

    let improvements = 0;
    
    for (let i = 0; i < toReplace.length && !this.cancelled; i++) {
      const { idx } = toReplace[i];
      const conn = connections[idx];
      
      // Revert the old line (with color for proper state)
      this.revertLine(conn.fromPin, conn.toPin, conn.color);
      
      // TEST MULTIPLE CANDIDATES: Gather top N candidates from both same starting pin and alternative pins
      const candidates: { fromPin: number; toPin: number; score: number; color?: string }[] = [];
      const numCandidates = 10; // Test top 10 candidates
      
      // Option 1: Same starting pin, different end pins
      for (let p = 0; p < actualPinCount; p++) {
        if (p === conn.fromPin) continue;
        const dist = Math.abs(p - conn.fromPin);
        const wrapDist = actualPinCount - dist;
        if (Math.min(dist, wrapDist) < minPinSkip) continue;
        
        if (useColorScoring) {
          const result = this.calculateColorLineScore(conn.fromPin, p);
          candidates.push({ fromPin: conn.fromPin, toPin: p, score: result.score, color: result.bestColor });
        } else {
          const score = this.calculatePerceptualLineScore(conn.fromPin, p);
          candidates.push({ fromPin: conn.fromPin, toPin: p, score });
        }
      }
      
      // Option 2: Same ending pin, different start pins (adds flexibility)
      for (let p = 0; p < Math.min(actualPinCount, 50); p++) { // Limit to 50 alternatives for speed
        if (p === conn.toPin) continue;
        const dist = Math.abs(p - conn.toPin);
        const wrapDist = actualPinCount - dist;
        if (Math.min(dist, wrapDist) < minPinSkip) continue;
        
        if (useColorScoring) {
          const result = this.calculateColorLineScore(p, conn.toPin);
          candidates.push({ fromPin: p, toPin: conn.toPin, score: result.score, color: result.bestColor });
        } else {
          const score = this.calculatePerceptualLineScore(p, conn.toPin);
          candidates.push({ fromPin: p, toPin: conn.toPin, score });
        }
      }
      
      // Sort candidates by score and pick the best
      candidates.sort((a, b) => b.score - a.score);
      const bestCandidate = candidates[0];
      
      if (bestCandidate) {
        // Apply the new line
        this.applyLineWithColor(bestCandidate.fromPin, bestCandidate.toPin, bestCandidate.color);
        
        // Update the connection (pop the newly added one and update the original slot)
        const newConn = this.state.connections.pop();
        if (newConn) {
          this.state.connections[idx] = newConn;
          if (bestCandidate.toPin !== conn.toPin || bestCandidate.fromPin !== conn.fromPin) {
            improvements++;
          }
        }
      } else {
        // No better candidate found, re-apply original
        this.applyLineWithColor(conn.fromPin, conn.toPin, conn.color);
        this.state.connections.pop();
      }
      
      // Progress update
      if (i % 30 === 0) {
        const mse = this.calculateCurrentMSE();
        const ssim = this.calculateSSIM();
        const similarity = Math.max(0, Math.min(100, (1 - mse / 65025) * 100 * 0.6 + ssim * 100 * 0.4));
        onProgress(
          this.state.connections.length,
          this.params.maxThreads,
          `Refinement ${Math.round((i / worstCount) * 100)}% (${improvements} improved, ${Math.round(similarity)}% accuracy)`,
          undefined,
          { mse, ssim, similarity }
        );
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }
  }

  // ============================================================
  // GENETIC ALGORITHM REFINEMENT (for high quality preset)
  // ============================================================

  private async runGeneticRefinement(onProgress: ProgressCallback): Promise<void> {
    if (!this.state || this.state.connections.length < 50) return;

    const populationSize = 10;
    const generations = 30;
    const mutationRate = 0.15;
    const actualPinCount = this.state.pins.length;

    // Create initial population (variations of current solution)
    let population: ThreadConnection[][] = [];
    for (let p = 0; p < populationSize; p++) {
      const individual = this.state.connections.map(c => ({ ...c }));
      // Apply random mutations
      for (let i = 0; i < individual.length * mutationRate; i++) {
        const idx = Math.floor(Math.random() * individual.length);
        const newToPin = Math.floor(Math.random() * actualPinCount);
        if (newToPin !== individual[idx].fromPin) {
          individual[idx].toPin = newToPin;
        }
      }
      population.push(individual);
    }

    for (let gen = 0; gen < generations && !this.cancelled; gen++) {
      // Evaluate fitness of each individual
      const fitness: number[] = [];
      for (const individual of population) {
        fitness.push(this.evaluateSolution(individual));
      }

      // Sort by fitness (higher is better)
      const sorted = population
        .map((ind, i) => ({ ind, fit: fitness[i] }))
        .sort((a, b) => b.fit - a.fit);

      // Keep top performers
      const survivors = sorted.slice(0, Math.floor(populationSize / 2)).map(s => s.ind);

      // Create next generation through crossover and mutation
      population = [...survivors];
      while (population.length < populationSize) {
        const parent1 = survivors[Math.floor(Math.random() * survivors.length)];
        const parent2 = survivors[Math.floor(Math.random() * survivors.length)];
        
        // Crossover
        const child: ThreadConnection[] = [];
        const crossPoint = Math.floor(Math.random() * parent1.length);
        for (let i = 0; i < parent1.length; i++) {
          child.push(i < crossPoint ? { ...parent1[i] } : { ...parent2[i] });
        }
        
        // Mutation
        for (let i = 0; i < child.length; i++) {
          if (Math.random() < mutationRate) {
            const newToPin = Math.floor(Math.random() * actualPinCount);
            if (newToPin !== child[i].fromPin) {
              child[i].toPin = newToPin;
            }
          }
        }
        
        population.push(child);
      }

      if (gen % 5 === 0) {
        onProgress(
          this.state.connections.length,
          this.params.maxThreads,
          `Genetic optimization generation ${gen + 1}/${generations}...`
        );
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    // Apply best solution
    const finalFitness = population.map(ind => this.evaluateSolution(ind));
    const bestIdx = finalFitness.indexOf(Math.max(...finalFitness));
    this.state.connections = population[bestIdx];
    
    // Rebuild progress image from connections
    this.rebuildProgressImage();
  }

  private evaluateSolution(connections: ThreadConnection[]): number {
    if (!this.state) return 0;
    
    // Temporarily apply solution and calculate fitness
    const tempProgress = new Array(this.state.targetImage.width * this.state.targetImage.height).fill(255);
    const threadOpacity = this.params.threadOpacity;
    
    for (const conn of connections) {
      const pixels = this.getLinePixels(conn.fromPin, conn.toPin);
      for (const idx of pixels) {
        const currentVal = tempProgress[idx];
        const currentLinear = Math.pow(currentVal / 255, 2.2);
        const threadLinear = 1 - threadOpacity;
        const blendedLinear = currentLinear * threadLinear;
        tempProgress[idx] = Math.pow(blendedLinear, 1/2.2) * 255;
      }
    }
    
    // Calculate MSE-based fitness (lower MSE = higher fitness)
    const mse = this.calculateMSE(this.state.targetImage.data, tempProgress);
    return 1000000 / (mse + 1); // Inverse MSE for fitness
  }

  private rebuildProgressImage(): void {
    if (!this.state) return;
    
    // Reset progress image
    this.state.progressImage = new Array(this.state.targetImage.width * this.state.targetImage.height).fill(255);
    this.state.pinUsageCount = new Array(this.state.pins.length).fill(0);
    
    // Reapply all connections
    for (const conn of this.state.connections) {
      const pixels = this.getLinePixels(conn.fromPin, conn.toPin);
      const threadOpacity = this.params.threadOpacity;
      
      for (const idx of pixels) {
        const currentVal = this.state.progressImage[idx];
        const currentLinear = Math.pow(currentVal / 255, 2.2);
        const threadLinear = 1 - threadOpacity;
        const blendedLinear = currentLinear * threadLinear;
        this.state.progressImage[idx] = Math.max(0, Math.round(Math.pow(blendedLinear, 1/2.2) * 255));
      }
      
      this.state.pinUsageCount[conn.fromPin]++;
      this.state.pinUsageCount[conn.toPin]++;
    }
  }

  // ============================================================
  // PERCEPTUAL BACKTRACKING (removes threads that hurt SSIM)
  // ============================================================

  private async runPerceptualBacktracking(): Promise<void> {
    if (!this.state) return;

    const toRemove: number[] = [];
    const baseSSIM = this.calculateSSIM();

    // Check last N connections for negative contribution
    const checkCount = Math.min(100, this.state.connections.length);
    
    for (let i = this.state.connections.length - 1; i >= this.state.connections.length - checkCount && i >= 0; i--) {
      const conn = this.state.connections[i];
      
      // Temporarily remove and check SSIM
      this.revertLine(conn.fromPin, conn.toPin);
      const newSSIM = this.calculateSSIM();
      
      if (newSSIM > baseSSIM + 0.001) {
        // Removing this line improves quality - keep it removed
        toRemove.push(i);
      } else {
        // Restore the line (keep original color)
        this.applyLineGammaCorrected(conn.fromPin, conn.toPin);
        const restoredConn = this.state.connections.pop(); // Remove duplicate from applyLine
        // Preserve original color
        if (restoredConn && conn.color) {
          this.state.connections[i] = { ...restoredConn, color: conn.color };
        }
      }
    }

    // Remove marked connections
    for (const idx of toRemove.sort((a, b) => b - a)) {
      this.state.connections.splice(idx, 1);
    }
  }

  // ============================================================
  // IMAGE PREPROCESSING
  // ============================================================

  private async preprocessImage(dataUrl: string): Promise<PixelData> {
    const base64Data = dataUrl.split(",")[1];
    const inputBuffer = Buffer.from(base64Data, "base64");
    const targetSize = Math.min(this.params.frameSize, 512);
    
    // Get crop parameters
    const crop = this.params.imageCrop || { scale: 1, offsetX: 0, offsetY: 0 };

    try {
      // First get image metadata
      const metadata = await sharp(inputBuffer).metadata();
      const imgWidth = metadata.width || targetSize;
      const imgHeight = metadata.height || targetSize;
      
      // Calculate crop region based on scale and offset
      const cropSize = Math.min(imgWidth, imgHeight) / crop.scale;
      const maxOffsetX = (imgWidth - cropSize) / 2;
      const maxOffsetY = (imgHeight - cropSize) / 2;
      const left = Math.round(maxOffsetX + crop.offsetX * maxOffsetX);
      const top = Math.round(maxOffsetY + crop.offsetY * maxOffsetY);
      
      let pipeline = sharp(inputBuffer);
      
      // Apply crop if scale > 1
      if (crop.scale > 1) {
        pipeline = pipeline.extract({
          left: Math.max(0, left),
          top: Math.max(0, top),
          width: Math.round(Math.min(cropSize, imgWidth)),
          height: Math.round(Math.min(cropSize, imgHeight)),
        });
      }
      
      const { data: rawPixels, info } = await pipeline
        .resize(targetSize, targetSize, {
          fit: "cover",
          position: "center",
        })
        .grayscale()
        .normalize() // Auto contrast
        .linear(1.3, -30) // Increase contrast further: multiply by 1.3, offset -30
        .modulate({ brightness: 1.0, saturation: 1.0 }) // Ensure proper brightness
        .raw()
        .toBuffer({ resolveWithObject: true });

      const { width, height } = info;
      const data: number[] = [];

      for (let i = 0; i < rawPixels.length; i++) {
        data.push(rawPixels[i]);
      }

      return { width, height, data };
    } catch (error) {
      console.error("Image processing failed, using fallback:", error);
      const size = targetSize;
      const data: number[] = [];
      const pixelCount = size * size;

      for (let i = 0; i < pixelCount; i++) {
        const x = i % size;
        const y = Math.floor(i / size);
        const centerX = size / 2;
        const centerY = size / 2;
        const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
        const maxDist = Math.sqrt(2) * size / 2;
        const value = Math.round((dist / maxDist) * 255);
        data.push(value);
      }

      return { width: size, height: size, data };
    }
  }

  private async preprocessColorImage(dataUrl: string, targetWidth: number, targetHeight: number): Promise<ColorPixelData> {
    const base64Data = dataUrl.split(",")[1];
    const inputBuffer = Buffer.from(base64Data, "base64");
    
    // Get crop parameters
    const crop = this.params.imageCrop || { scale: 1, offsetX: 0, offsetY: 0 };

    try {
      // First get image metadata
      const metadata = await sharp(inputBuffer).metadata();
      const imgWidth = metadata.width || targetWidth;
      const imgHeight = metadata.height || targetHeight;
      
      // Calculate crop region
      const cropSize = Math.min(imgWidth, imgHeight) / crop.scale;
      const maxOffsetX = (imgWidth - cropSize) / 2;
      const maxOffsetY = (imgHeight - cropSize) / 2;
      const left = Math.round(maxOffsetX + crop.offsetX * maxOffsetX);
      const top = Math.round(maxOffsetY + crop.offsetY * maxOffsetY);
      
      let pipeline = sharp(inputBuffer);
      
      // Apply crop if scale > 1
      if (crop.scale > 1) {
        pipeline = pipeline.extract({
          left: Math.max(0, left),
          top: Math.max(0, top),
          width: Math.round(Math.min(cropSize, imgWidth)),
          height: Math.round(Math.min(cropSize, imgHeight)),
        });
      }
      
      const { data: rawPixels, info } = await pipeline
        .resize(targetWidth, targetHeight, {
          fit: "cover",
          position: "center",
        })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const { width, height, channels } = info;
      const data: { r: number; g: number; b: number }[] = [];

      for (let i = 0; i < rawPixels.length; i += channels) {
        data.push({
          r: rawPixels[i],
          g: rawPixels[i + 1],
          b: rawPixels[i + 2],
        });
      }

      return { width, height, data };
    } catch (error) {
      console.error("Color image processing failed:", error);
      const data: { r: number; g: number; b: number }[] = [];
      const pixelCount = targetWidth * targetHeight;

      for (let i = 0; i < pixelCount; i++) {
        const val = Math.floor(Math.random() * 128);
        data.push({ r: val, g: val, b: val });
      }

      return { width: targetWidth, height: targetHeight, data };
    }
  }

  // ============================================================
  // PIN GENERATION
  // ============================================================

  private generatePinsWithFaceAwareness(width: number, height: number, faceBox: FaceBox | null): Pin[] {
    const pins: Pin[] = [];
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 5;

    if (this.params.frameType === "circular") {
      // For circular frame with face-aware distribution
      // Pack 1.4x more pins in the quadrant containing the face
      const baseCount = this.params.pinCount;
      
      if (faceBox) {
        // Calculate which angular region contains the face
        const faceCenterX = faceBox.x + faceBox.width / 2;
        const faceCenterY = faceBox.y + faceBox.height / 2;
        const faceAngle = Math.atan2(faceCenterY - centerY, faceCenterX - centerX);
        
        // Define face angular range (expand by face size)
        const faceAngularWidth = Math.atan2(faceBox.width / 2, radius) * 2;
        const faceStartAngle = faceAngle - faceAngularWidth;
        const faceEndAngle = faceAngle + faceAngularWidth;
        
        // Calculate pins with higher density in face region
        const totalAngle = 2 * Math.PI;
        const faceAngleRange = faceEndAngle - faceStartAngle;
        const nonFaceAngleRange = totalAngle - faceAngleRange;
        
        // Face region gets 1.4x density
        const faceDensityMultiplier = 1.4;
        const facePins = Math.floor(baseCount * (faceAngleRange / totalAngle) * faceDensityMultiplier);
        const nonFacePins = baseCount - facePins;
        
        let pinIndex = 0;
        
        // Generate non-face pins first (before face start angle)
        let normalizedStart = (faceStartAngle + totalAngle) % totalAngle;
        let normalizedEnd = (faceEndAngle + totalAngle) % totalAngle;
        
        // Simple approach: generate all pins with variable spacing
        for (let i = 0; i < baseCount; i++) {
          const baseAngle = (2 * Math.PI * i) / baseCount;
          
          // Check if this angle is in face region
          let inFaceRegion = false;
          if (normalizedEnd > normalizedStart) {
            inFaceRegion = baseAngle >= normalizedStart && baseAngle <= normalizedEnd;
          } else {
            inFaceRegion = baseAngle >= normalizedStart || baseAngle <= normalizedEnd;
          }
          
          // For face region, add extra pins
          if (inFaceRegion && i % 3 === 0 && pinIndex < baseCount + Math.floor(baseCount * 0.15)) {
            // Add extra pin slightly offset
            const extraAngle = baseAngle + (Math.PI / baseCount / 2);
            pins.push({
              index: pinIndex++,
              x: Math.round(centerX + radius * Math.cos(extraAngle)),
              y: Math.round(centerY + radius * Math.sin(extraAngle)),
            });
          }
          
          pins.push({
            index: pinIndex++,
            x: Math.round(centerX + radius * Math.cos(baseAngle)),
            y: Math.round(centerY + radius * Math.sin(baseAngle)),
          });
        }
        
        // Reassign indices
        for (let i = 0; i < pins.length; i++) {
          pins[i].index = i;
        }
      } else {
        // No face detected - uniform distribution
        for (let i = 0; i < baseCount; i++) {
          const angle = (2 * Math.PI * i) / baseCount;
          pins.push({
            index: i,
            x: Math.round(centerX + radius * Math.cos(angle)),
            y: Math.round(centerY + radius * Math.sin(angle)),
          });
        }
      }
    } else {
      // Square frame - use existing logic
      return this.generatePins(width, height);
    }

    return pins;
  }

  private generatePins(width: number, height: number): Pin[] {
    const pins: Pin[] = [];
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 5;

    if (this.params.frameType === "circular") {
      for (let i = 0; i < this.params.pinCount; i++) {
        const angle = (2 * Math.PI * i) / this.params.pinCount;
        pins.push({
          index: i,
          x: Math.round(centerX + radius * Math.cos(angle)),
          y: Math.round(centerY + radius * Math.sin(angle)),
        });
      }
    } else {
      const perSide = Math.floor(this.params.pinCount / 4);
      const margin = 5;
      let index = 0;

      for (let i = 0; i < perSide; i++) {
        pins.push({
          index: index++,
          x: Math.round(margin + ((width - 2 * margin) * i) / (perSide - 1)),
          y: margin,
        });
      }

      for (let i = 0; i < perSide; i++) {
        pins.push({
          index: index++,
          x: width - margin,
          y: Math.round(margin + ((height - 2 * margin) * i) / (perSide - 1)),
        });
      }

      for (let i = 0; i < perSide; i++) {
        pins.push({
          index: index++,
          x: Math.round(width - margin - ((width - 2 * margin) * i) / (perSide - 1)),
          y: height - margin,
        });
      }

      for (let i = 0; i < perSide; i++) {
        pins.push({
          index: index++,
          x: margin,
          y: Math.round(height - margin - ((height - 2 * margin) * i) / (perSide - 1)),
        });
      }
    }

    return pins;
  }

  // ============================================================
  // EDGE DETECTION (Sobel)
  // ============================================================

  private generateEdgeMap(imageData: PixelData): number[] {
    const { width, height, data } = imageData;
    const edgeMap: number[] = new Array(width * height).fill(0);

    // Sobel kernels for edge detection
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    let maxEdge = 0;
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0;
        let gy = 0;

        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = (y + ky) * width + (x + kx);
            const kernelIdx = (ky + 1) * 3 + (kx + 1);
            gx += data[idx] * sobelX[kernelIdx];
            gy += data[idx] * sobelY[kernelIdx];
          }
        }

        const magnitude = Math.sqrt(gx * gx + gy * gy);
        edgeMap[y * width + x] = magnitude;
        maxEdge = Math.max(maxEdge, magnitude);
      }
    }

    // Normalize and enhance edge map (stronger edges = more importance)
    if (maxEdge > 0) {
      for (let i = 0; i < edgeMap.length; i++) {
        // Normalize to 0-255 and apply power curve for stronger edges
        const normalized = edgeMap[i] / maxEdge;
        edgeMap[i] = Math.min(255, Math.pow(normalized, 0.7) * 255);
      }
    }

    return edgeMap;
  }

  // ============================================================
  // EDGE GRADIENT CALCULATION (for edge-aligned line selection)
  // ============================================================

  private generateEdgeGradients(imageData: PixelData): { gradientX: number[]; gradientY: number[] } {
    const { width, height, data } = imageData;
    const gradientX: number[] = new Array(width * height).fill(0);
    const gradientY: number[] = new Array(width * height).fill(0);

    // Sobel kernels
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0;
        let gy = 0;

        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = (y + ky) * width + (x + kx);
            const kernelIdx = (ky + 1) * 3 + (kx + 1);
            gx += data[idx] * sobelX[kernelIdx];
            gy += data[idx] * sobelY[kernelIdx];
          }
        }

        const idx = y * width + x;
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        if (magnitude > 0) {
          // Store normalized gradient direction (perpendicular to edge = edge direction)
          gradientX[idx] = -gy / magnitude; // Perpendicular to gradient = edge direction
          gradientY[idx] = gx / magnitude;
        }
      }
    }

    return { gradientX, gradientY };
  }

  // ============================================================
  // SOFT-EDGE LINE PIXELS (Gaussian falloff for realistic thread rendering)
  // ============================================================

  private getSoftLinePixels(fromPin: number, toPin: number): { idx: number; weight: number }[] {
    if (!this.state) return [];

    const threadWidthPx = Math.max(1, Math.round(this.params.threadWidth * 2));
    const sigma = threadWidthPx / 2.5; // Gaussian sigma based on thread width
    const cacheKey = `soft-${fromPin}-${toPin}-${threadWidthPx}`;
    
    if (this.state.lineSoftCache.has(cacheKey)) {
      return this.state.lineSoftCache.get(cacheKey)!;
    }

    const { pins, targetImage } = this.state;
    const { width, height } = targetImage;
    const from = pins[fromPin];
    const to = pins[toPin];

    if (!from || !to) return [];

    const result: { idx: number; weight: number }[] = [];
    const processedPixels = new Set<number>();

    // Line direction
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lineLen = Math.sqrt(dx * dx + dy * dy);
    if (lineLen === 0) return [];

    // Unit direction along the line
    const ux = dx / lineLen;
    const uy = dy / lineLen;

    // Perpendicular direction
    const perpX = -uy;
    const perpY = ux;

    // Sample along line length
    const steps = Math.ceil(lineLen);
    const searchRadius = Math.ceil(threadWidthPx * 1.5);

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const centerX = from.x + dx * t;
      const centerY = from.y + dy * t;

      // Check pixels within radius perpendicular to line
      for (let r = -searchRadius; r <= searchRadius; r++) {
        const px = Math.round(centerX + perpX * r);
        const py = Math.round(centerY + perpY * r);

        if (px >= 0 && px < width && py >= 0 && py < height) {
          const idx = py * width + px;
          if (processedPixels.has(idx)) continue;
          processedPixels.add(idx);

          // Calculate distance from line center
          const distFromCenter = Math.abs(r);
          
          // Gaussian falloff: weight = exp(-d² / (2σ²))
          const weight = Math.exp(-(distFromCenter * distFromCenter) / (2 * sigma * sigma));
          
          if (weight > 0.01) { // Only include pixels with meaningful weight
            result.push({ idx, weight });
          }
        }
      }
    }

    this.state.lineSoftCache.set(cacheKey, result);
    return result;
  }

  // ============================================================
  // CALCULATE EDGE ALIGNMENT SCORE (how well a line aligns with local edges)
  // ============================================================

  private calculateEdgeAlignment(fromPin: number, toPin: number): number {
    if (!this.state) return 0;

    const { pins, edgeMap, edgeGradientX, edgeGradientY, targetImage } = this.state;
    const { width } = targetImage;
    const from = pins[fromPin];
    const to = pins[toPin];

    if (!from || !to) return 0;

    // Line direction (normalized)
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lineLen = Math.sqrt(dx * dx + dy * dy);
    if (lineLen === 0) return 0;
    const lineDirX = dx / lineLen;
    const lineDirY = dy / lineLen;

    // Sample along line and calculate alignment with local edge direction
    let totalAlignment = 0;
    let totalEdgeWeight = 0;
    const samples = Math.min(10, Math.ceil(lineLen / 5));

    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const x = Math.round(from.x + dx * t);
      const y = Math.round(from.y + dy * t);
      
      if (x >= 0 && x < width && y >= 0 && y < this.state.targetImage.height) {
        const idx = y * width + x;
        const edgeStrength = edgeMap[idx] / 255;
        const edgeDirX = edgeGradientX[idx];
        const edgeDirY = edgeGradientY[idx];

        if (edgeStrength > 0.1) {
          // Dot product: how aligned is line direction with edge direction
          const alignment = Math.abs(lineDirX * edgeDirX + lineDirY * edgeDirY);
          totalAlignment += alignment * edgeStrength;
          totalEdgeWeight += edgeStrength;
        }
      }
    }

    return totalEdgeWeight > 0 ? totalAlignment / totalEdgeWeight : 0;
  }

  // ============================================================
  // LINE PIXEL CALCULATION (Bresenham)
  // ============================================================

  private getLinePixels(fromPin: number, toPin: number): number[] {
    if (!this.state) return [];

    // Include threadWidth in cache key since it affects pixel output
    const threadWidthPx = Math.max(1, Math.round(this.params.threadWidth * 2));
    const cacheKey = `${fromPin}-${toPin}-${threadWidthPx}`;
    if (this.state.lineCache.has(cacheKey)) {
      return this.state.lineCache.get(cacheKey)!;
    }

    const { pins, targetImage } = this.state;
    const { width, height } = targetImage;
    const from = pins[fromPin];
    const to = pins[toPin];

    if (!from || !to) {
      console.warn(`Invalid pins: fromPin=${fromPin}, toPin=${toPin}, pins.length=${pins.length}`);
      return [];
    }

    const pixelSet = new Set<number>();
    const corePixels: number[] = []; // Always keep core Bresenham pixels as fallback
    let x0 = from.x;
    let y0 = from.y;
    const x1 = to.x;
    const y1 = to.y;

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    // Calculate perpendicular offset for line thickness
    const lineLen = Math.sqrt(dx * dx + dy * dy);
    const perpX = lineLen > 0 ? -(y1 - from.y) / lineLen : 0;
    const perpY = lineLen > 0 ? (x1 - from.x) / lineLen : 0;
    const halfWidth = (threadWidthPx - 1) / 2;

    while (true) {
      // Always add core pixel to fallback list
      if (x0 >= 0 && x0 < width && y0 >= 0 && y0 < height) {
        const coreIdx = y0 * width + x0;
        corePixels.push(coreIdx);
        pixelSet.add(coreIdx);
      }

      // Draw additional pixels perpendicular to line for thickness
      if (halfWidth > 0) {
        for (let w = -halfWidth; w <= halfWidth; w++) {
          if (w === 0) continue; // Already added core pixel
          const px = Math.round(x0 + perpX * w);
          const py = Math.round(y0 + perpY * w);
          if (px >= 0 && px < width && py >= 0 && py < height) {
            pixelSet.add(py * width + px);
          }
        }
      }

      if (x0 === x1 && y0 === y1) break;

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }

    // Use expanded pixels if available, otherwise fall back to core Bresenham line
    const pixels = pixelSet.size > 0 ? Array.from(pixelSet) : corePixels;
    this.state.lineCache.set(cacheKey, pixels);

    return pixels;
  }

  // ============================================================
  // PREVIEW GENERATION
  // ============================================================

  private generatePreviewDataUrl(): string {
    if (!this.state) return "";

    const { progressImage, targetImage } = this.state;
    const { width, height } = targetImage;

    const rgbData = Buffer.alloc(width * height * 3);

    for (let i = 0; i < progressImage.length; i++) {
      const val = Math.max(0, Math.min(255, Math.round(progressImage[i])));
      rgbData[i * 3] = val;
      rgbData[i * 3 + 1] = val;
      rgbData[i * 3 + 2] = val;
    }

    return this.generateSyncPreview(rgbData, width, height);
  }

  // Generate a COLOR preview by rendering actual colored threads on white canvas
  private generateColorPreviewDataUrl(): string {
    if (!this.state) return "";

    const { targetImage, pins, connections } = this.state;
    const { width, height } = targetImage;
    
    // Start with white canvas (RGB)
    const rgbData = Buffer.alloc(width * height * 3);
    rgbData.fill(255);

    const opacity = this.params.threadOpacity;

    // Draw each thread with its assigned color
    for (const conn of connections) {
      const fromPin = pins[conn.fromPin];
      const toPin = pins[conn.toPin];
      if (!fromPin || !toPin) continue;

      // Parse hex color
      const color = conn.color || "#000000";
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);

      // Get pixels along the line
      const pixels = this.getLinePixels(conn.fromPin, conn.toPin);
      
      // Apply thread color with opacity blending
      for (const idx of pixels) {
        const pixelIdx = idx * 3;
        if (pixelIdx + 2 < rgbData.length) {
          // Gamma-corrected blending
          const currR = rgbData[pixelIdx];
          const currG = rgbData[pixelIdx + 1];
          const currB = rgbData[pixelIdx + 2];

          // Convert to linear space
          const currLinearR = Math.pow(currR / 255, 2.2);
          const currLinearG = Math.pow(currG / 255, 2.2);
          const currLinearB = Math.pow(currB / 255, 2.2);
          const threadLinearR = Math.pow(r / 255, 2.2);
          const threadLinearG = Math.pow(g / 255, 2.2);
          const threadLinearB = Math.pow(b / 255, 2.2);

          // Blend in linear space (multiplicative for thread overlay)
          const blendedR = currLinearR * (1 - opacity) + threadLinearR * opacity * currLinearR;
          const blendedG = currLinearG * (1 - opacity) + threadLinearG * opacity * currLinearG;
          const blendedB = currLinearB * (1 - opacity) + threadLinearB * opacity * currLinearB;

          // Convert back to gamma space
          rgbData[pixelIdx] = Math.max(0, Math.min(255, Math.round(Math.pow(blendedR, 1/2.2) * 255)));
          rgbData[pixelIdx + 1] = Math.max(0, Math.min(255, Math.round(Math.pow(blendedG, 1/2.2) * 255)));
          rgbData[pixelIdx + 2] = Math.max(0, Math.min(255, Math.round(Math.pow(blendedB, 1/2.2) * 255)));
        }
      }
    }

    return this.generateSyncPreview(rgbData, width, height);
  }

  private generateSyncPreview(rgbData: Buffer, width: number, height: number): string {
    const headerSize = 54;
    const rowSize = Math.ceil((width * 3) / 4) * 4;
    const imageSize = rowSize * height;
    const fileSize = headerSize + imageSize;

    const bmp = Buffer.alloc(fileSize);
    
    bmp.write("BM", 0);
    bmp.writeUInt32LE(fileSize, 2);
    bmp.writeUInt32LE(0, 6);
    bmp.writeUInt32LE(headerSize, 10);
    bmp.writeUInt32LE(40, 14);
    bmp.writeInt32LE(width, 18);
    bmp.writeInt32LE(-height, 22);
    bmp.writeUInt16LE(1, 26);
    bmp.writeUInt16LE(24, 28);
    bmp.writeUInt32LE(0, 30);
    bmp.writeUInt32LE(imageSize, 34);
    bmp.writeInt32LE(2835, 38);
    bmp.writeInt32LE(2835, 42);
    bmp.writeUInt32LE(0, 46);
    bmp.writeUInt32LE(0, 50);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcIdx = (y * width + x) * 3;
        const dstIdx = headerSize + y * rowSize + x * 3;
        bmp[dstIdx] = rgbData[srcIdx + 2];
        bmp[dstIdx + 1] = rgbData[srcIdx + 1];
        bmp[dstIdx + 2] = rgbData[srcIdx];
      }
    }

    return "data:image/bmp;base64," + bmp.toString("base64");
  }
}
