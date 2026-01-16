import { z } from "zod";

// Frame types
export const frameTypes = ["circular", "square", "rectangular"] as const;
export type FrameType = typeof frameTypes[number];

// Color modes
export const colorModes = ["monochrome", "color"] as const;
export type ColorMode = typeof colorModes[number];

// Quality presets
export const qualityPresets = ["fast", "balanced", "high"] as const;
export type QualityPreset = typeof qualityPresets[number];

// Generation status
export const generationStatuses = ["idle", "preprocessing", "generating", "optimizing", "complete", "error"] as const;
export type GenerationStatus = typeof generationStatuses[number];

// Pin coordinates
export interface Pin {
  index: number;
  x: number;
  y: number;
}

// Thread connection between two pins
export interface ThreadConnection {
  fromPin: number;
  toPin: number;
  color?: string;
  colorName?: string; // Human-readable color name (e.g., "Cyan", "Magenta")
}

// Image crop/position parameters
export interface ImageCropParams {
  scale: number;     // Zoom level: 1.0 = fit, >1 = zoom in
  offsetX: number;   // Horizontal offset (-1 to 1, 0 = center)
  offsetY: number;   // Vertical offset (-1 to 1, 0 = center)
}

// String art generation parameters
export const generationParamsSchema = z.object({
  frameType: z.enum(frameTypes).default("circular"),
  pinCount: z.number().min(100).max(800).default(400),
  frameSize: z.number().min(200).max(1000).default(500),
  threadWidth: z.number().min(0.2).max(1.5).default(0.4),
  threadOpacity: z.number().min(0.03).max(0.35).default(0.12),
  colorMode: z.enum(colorModes).default("monochrome"),
  threadColors: z.array(z.string()).default(["#000000"]),
  maxThreads: z.number().min(500).max(50000).default(10000),
  qualityPreset: z.enum(qualityPresets).default("balanced"),
  useEdgeDetection: z.boolean().default(true),
  useSimulatedAnnealing: z.boolean().default(false),
  usePinFatigue: z.boolean().default(false),
  minPinSkip: z.number().min(1).max(50).default(2),
  // Image crop/position
  imageCrop: z.object({
    scale: z.number().min(1.0).max(3.0).default(1.0),
    offsetX: z.number().min(-1).max(1).default(0),
    offsetY: z.number().min(-1).max(1).default(0),
  }).default({ scale: 1.0, offsetX: 0, offsetY: 0 }),
});

export type GenerationParams = z.infer<typeof generationParamsSchema>;

// Accuracy metrics
export interface AccuracyMetrics {
  mse: number;        // Mean Squared Error (lower is better)
  ssim: number;       // Structural Similarity Index (0-1, higher is better)
  similarity: number; // Combined similarity percentage (0-100)
}

// Generation progress info
export interface GenerationProgress {
  status: GenerationStatus;
  stage: string;
  currentThread: number;
  totalThreads: number;
  percentage: number;
  estimatedTimeRemaining: number;
  currentError?: number;
  accuracy?: AccuracyMetrics; // Real-time accuracy metrics
}

// Thread color summary for shopping list
export interface ThreadColorSummary {
  color: string;
  colorName: string;
  count: number;
  percentage: number;
}

// Complete string art result
export interface StringArtResult {
  id: string;
  imageWidth: number;
  imageHeight: number;
  frameType: FrameType;
  pins: Pin[];
  connections: ThreadConnection[];
  totalThreads: number;
  params: GenerationParams;
  createdAt: string;
  previewDataUrl?: string;
  threadColors?: ThreadColorSummary[]; // Colors needed for this artwork
  // Accuracy metrics
  accuracyScore?: number; // Combined similarity percentage (0-100)
  mse?: number;           // Mean Squared Error
  ssim?: number;          // Structural Similarity Index (0-1)
}

// Player state for guidance
export interface PlayerState {
  isPlaying: boolean;
  currentStep: number;
  totalSteps: number;
  autoAdvanceSpeed: number;
  voiceEnabled: boolean;
  voiceVolume: number;
}

// Export format options
export const exportFormats = ["json", "svg", "pdf"] as const;
export type ExportFormat = typeof exportFormats[number];

// API request/response types
export interface GenerateRequest {
  imageDataUrl: string;
  params: GenerationParams;
}

export interface GenerateResponse {
  jobId: string;
  status: GenerationStatus;
}

export interface ProgressResponse {
  progress: GenerationProgress;
  previewDataUrl?: string;
}

export interface ResultResponse {
  result: StringArtResult;
}
