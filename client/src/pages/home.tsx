import { useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { ImageUploadZone } from "@/components/string-art/image-upload-zone";
import { ParameterControls } from "@/components/string-art/parameter-controls";
import { GenerationProgress } from "@/components/string-art/generation-progress";
import { CanvasPreview } from "@/components/string-art/canvas-preview";
import { GuidancePlayer } from "@/components/string-art/guidance-player";
import { ExportPanel } from "@/components/string-art/export-panel";
import { ThreadColors } from "@/components/string-art/thread-colors";
import { AccuracyScore } from "@/components/string-art/accuracy-score";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import { type GenerationParams, type StringArtResult, type GenerationProgress as ProgressType, generationParamsSchema } from "@shared/schema";
import { Sparkles, Loader2, Plus, Eye } from "lucide-react";

type AppState = "upload" | "configure" | "generating" | "result";

export default function Home() {
  const { toast } = useToast();
  const [appState, setAppState] = useState<AppState>("upload");
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [params, setParams] = useState<GenerationParams>(generationParamsSchema.parse({}));
  const [progress, setProgress] = useState<ProgressType | null>(null);
  const [result, setResult] = useState<StringArtResult | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  // Use a single source of truth - no more dual state
  const [previewThreadCount, setPreviewThreadCount] = useState<number | null>(null);
  const [isContinuing, setIsContinuing] = useState(false);

  // Compute actual preview count - null means show full result
  const actualPreviewCount = previewThreadCount !== null && result 
    ? Math.min(previewThreadCount, result.totalThreads) 
    : null;

  const handleImageUpload = useCallback((dataUrl: string) => {
    setUploadedImage(dataUrl);
    setAppState("configure");
    setResult(null);
    setPreviewDataUrl(null);
  }, []);

  const handleParamsChange = useCallback((newParams: Partial<GenerationParams>) => {
    setParams(prev => ({ ...prev, ...newParams }));
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!uploadedImage) return;
    
    setIsGenerating(true);
    setAppState("generating");
    setProgress({
      status: "preprocessing",
      stage: "Preprocessing image...",
      currentThread: 0,
      totalThreads: params.maxThreads,
      percentage: 0,
      estimatedTimeRemaining: 0,
    });

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: uploadedImage,
          params,
        }),
      });

      if (!response.ok) {
        throw new Error("Generation failed");
      }

      const { jobId } = await response.json();
      setCurrentJobId(jobId);

      // Poll for progress
      const pollProgress = async () => {
        const progressRes = await fetch(`/api/progress/${jobId}`);
        const progressData = await progressRes.json();
        
        setProgress(progressData.progress);
        if (progressData.previewDataUrl) {
          setPreviewDataUrl(progressData.previewDataUrl);
        }

        if (progressData.progress.status === "complete") {
          const resultRes = await fetch(`/api/result/${jobId}`);
          const resultData = await resultRes.json();
          setResult(resultData.result);
          setPreviewThreadCount(null);
          setAppState("result");
          setIsGenerating(false);
          toast({
            title: "Generation Complete",
            description: `Created ${resultData.result.totalThreads} thread connections`,
          });
        } else if (progressData.progress.status === "error") {
          throw new Error("Generation failed");
        } else {
          setTimeout(pollProgress, 200);
        }
      };

      pollProgress();
    } catch (error) {
      setIsGenerating(false);
      setAppState("configure");
      toast({
        title: "Generation Failed",
        description: "Please try again with different settings",
        variant: "destructive",
      });
    }
  }, [uploadedImage, params, toast]);

  const handleCancel = useCallback(() => {
    setIsGenerating(false);
    setAppState("configure");
    setProgress(null);
  }, []);

  const handleReset = useCallback(() => {
    setAppState("upload");
    setUploadedImage(null);
    setResult(null);
    setPreviewDataUrl(null);
    setProgress(null);
    setParams(generationParamsSchema.parse({}));
    setPreviewThreadCount(null);
    setCurrentJobId(null);
  }, []);

  const handleContinueGeneration = useCallback(async (additionalThreads: number = 1000) => {
    if (!result || !currentJobId) return;
    
    setIsContinuing(true);
    setAppState("generating");
    // Clear stale preview data and reset preview count
    setPreviewDataUrl(null);
    setPreviewThreadCount(null);
    setProgress({
      status: "generating",
      stage: "Continuing generation...",
      currentThread: result.totalThreads,
      totalThreads: result.totalThreads + additionalThreads,
      percentage: 0,
      estimatedTimeRemaining: 0,
    });

    try {
      const response = await fetch(`/api/continue/${currentJobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ additionalThreads }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Continue failed");
      }

      const { jobId } = await response.json();
      setCurrentJobId(jobId);

      // Poll for progress
      const pollProgress = async () => {
        const progressRes = await fetch(`/api/progress/${jobId}`);
        const progressData = await progressRes.json();
        
        setProgress(progressData.progress);
        if (progressData.previewDataUrl) {
          setPreviewDataUrl(progressData.previewDataUrl);
        }

        if (progressData.progress.status === "complete") {
          const resultRes = await fetch(`/api/result/${jobId}`);
          const resultData = await resultRes.json();
          setResult(resultData.result);
          setPreviewThreadCount(null);
          setAppState("result");
          setIsContinuing(false);
          toast({
            title: "Extended Generation Complete",
            description: `Now has ${resultData.result.totalThreads} thread connections`,
          });
        } else if (progressData.progress.status === "error") {
          throw new Error("Continue failed");
        } else {
          setTimeout(pollProgress, 200);
        }
      };

      pollProgress();
    } catch (error) {
      setIsContinuing(false);
      setAppState("result");
      const errorMessage = error instanceof Error ? error.message : "Could not add more threads";
      toast({
        title: "Continue Failed",
        description: errorMessage === "Original image not found" 
          ? "The original image is no longer available. Please start a new generation."
          : errorMessage,
        variant: "destructive",
      });
    }
  }, [result, currentJobId, toast]);

  const handleAutoOptimize = useCallback(() => {
    if (!uploadedImage) return;
    
    // Analyze image and set optimal parameters
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      const aspectRatio = width / height;
      const resolution = width * height;
      
      // Create a canvas to analyze the image
      const canvas = document.createElement('canvas');
      const size = Math.min(width, height, 256);
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      // Draw and analyze
      const scale = size / Math.min(width, height);
      ctx.drawImage(img, 
        (size - width * scale) / 2,
        (size - height * scale) / 2,
        width * scale,
        height * scale
      );
      
      const imageData = ctx.getImageData(0, 0, size, size);
      const pixels = imageData.data;
      
      // Calculate edge density (simple gradient detection)
      let edgeSum = 0;
      let contrastSum = 0;
      let minVal = 255, maxVal = 0;
      
      for (let y = 1; y < size - 1; y++) {
        for (let x = 1; x < size - 1; x++) {
          const idx = (y * size + x) * 4;
          const gray = (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3;
          
          // Simple edge detection
          const leftIdx = (y * size + x - 1) * 4;
          const rightIdx = (y * size + x + 1) * 4;
          const topIdx = ((y - 1) * size + x) * 4;
          const bottomIdx = ((y + 1) * size + x) * 4;
          
          const grayLeft = (pixels[leftIdx] + pixels[leftIdx + 1] + pixels[leftIdx + 2]) / 3;
          const grayRight = (pixels[rightIdx] + pixels[rightIdx + 1] + pixels[rightIdx + 2]) / 3;
          const grayTop = (pixels[topIdx] + pixels[topIdx + 1] + pixels[topIdx + 2]) / 3;
          const grayBottom = (pixels[bottomIdx] + pixels[bottomIdx + 1] + pixels[bottomIdx + 2]) / 3;
          
          const gradient = Math.abs(grayRight - grayLeft) + Math.abs(grayBottom - grayTop);
          edgeSum += gradient;
          
          minVal = Math.min(minVal, gray);
          maxVal = Math.max(maxVal, gray);
        }
      }
      
      const totalPixels = (size - 2) * (size - 2);
      const avgEdge = edgeSum / totalPixels;
      const contrast = maxVal - minVal;
      
      // Determine optimal parameters based on image analysis
      let pinCount = 200;
      let maxThreads = 3000;
      let threadOpacity = 0.15;
      
      // Higher edge density = more detail = more pins and threads
      if (avgEdge > 50) {
        pinCount = 300;
        maxThreads = 5000;
      } else if (avgEdge > 30) {
        pinCount = 250;
        maxThreads = 4000;
      } else if (avgEdge < 15) {
        pinCount = 150;
        maxThreads = 2000;
      }
      
      // Higher contrast = can use lower opacity
      if (contrast > 200) {
        threadOpacity = 0.12;
      } else if (contrast < 100) {
        threadOpacity = 0.20;
      }
      
      // Higher resolution = can use more pins
      if (resolution > 2000000) {
        pinCount = Math.min(pinCount + 50, 400);
      }
      
      // Determine frame type based on aspect ratio
      let frameType: "circular" | "square" | "rectangular" = "circular";
      if (Math.abs(aspectRatio - 1) < 0.1) {
        frameType = "square";
      } else if (aspectRatio < 0.8 || aspectRatio > 1.2) {
        frameType = "rectangular";
      }
      
      // Apply optimized parameters
      setParams(prev => ({
        ...prev,
        pinCount,
        maxThreads,
        threadOpacity,
        frameType,
        qualityPreset: "balanced",
        useEdgeDetection: true,
        useSimulatedAnnealing: true,
      }));
      
      toast({
        title: "Settings Optimized",
        description: `Recommended: ${pinCount} pins, ${maxThreads.toLocaleString()} threads, ${Math.round(threadOpacity * 100)}% opacity`,
      });
    };
    img.src = uploadedImage;
  }, [uploadedImage, toast]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">StringArt Pro</h1>
              <p className="text-xs text-muted-foreground">Professional String Art Generator</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {appState !== "upload" && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleReset}
                data-testid="button-reset"
              >
                New Project
              </Button>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-6">
        {appState === "upload" && (
          <div className="flex flex-col items-center justify-center min-h-[70vh] gap-8">
            <div className="text-center max-w-lg">
              <h2 className="text-3xl font-bold text-foreground mb-3">
                Transform Photos into Thread Art
              </h2>
              <p className="text-muted-foreground">
                Upload an image to generate precise pin-to-pin instructions for creating stunning physical string art.
              </p>
            </div>
            <ImageUploadZone onImageUpload={handleImageUpload} />
          </div>
        )}

        {appState === "configure" && uploadedImage && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Panel - Parameters */}
            <div className="lg:col-span-4 space-y-4">
              <Card className="p-4 backdrop-blur-lg bg-card/80 border-card-border">
                <h3 className="text-lg font-semibold mb-4 text-foreground">Configuration</h3>
                <ParameterControls 
                  params={params} 
                  onChange={handleParamsChange}
                  onAutoOptimize={handleAutoOptimize}
                />
                <div className="mt-6 pt-4 border-t border-border">
                  <Button 
                    className="w-full" 
                    size="lg"
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    data-testid="button-generate"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate String Art
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            </div>

            {/* Center Panel - Preview */}
            <div className="lg:col-span-8">
              <Card className="p-4 backdrop-blur-lg bg-card/80 border-card-border aspect-square flex items-center justify-center">
                <CanvasPreview 
                  imageUrl={uploadedImage}
                  params={params}
                  mode="source"
                />
              </Card>
            </div>
          </div>
        )}

        {appState === "generating" && progress && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Panel - Progress */}
            <div className="lg:col-span-4">
              <GenerationProgress 
                progress={progress} 
                previewDataUrl={previewDataUrl || undefined}
                onCancel={handleCancel}
              />
            </div>

            {/* Center Panel - Live Preview */}
            <div className="lg:col-span-8">
              <Card className="p-4 backdrop-blur-lg bg-card/80 border-card-border aspect-square flex items-center justify-center">
                <CanvasPreview 
                  imageUrl={previewDataUrl || uploadedImage}
                  params={params}
                  mode={previewDataUrl ? "result" : "source"}
                  progress={progress}
                  serverPreviewReady={!!previewDataUrl}
                />
              </Card>
            </div>
          </div>
        )}

        {appState === "result" && result && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Panel - Accuracy, Player, Thread Colors & Export */}
            <div className="lg:col-span-4 space-y-4">
              <AccuracyScore result={result} />
              
              {/* Continue Generation */}
              <Card className="p-4 backdrop-blur-lg bg-card/80 border-card-border">
                <h3 className="text-sm font-semibold mb-3 text-foreground flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Continue Generation
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Add more threads to improve detail and coverage
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleContinueGeneration(500)}
                    disabled={isContinuing}
                    data-testid="button-continue-500"
                  >
                    +500
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleContinueGeneration(1000)}
                    disabled={isContinuing}
                    data-testid="button-continue-1000"
                  >
                    +1000
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleContinueGeneration(2000)}
                    disabled={isContinuing}
                    data-testid="button-continue-2000"
                  >
                    +2000
                  </Button>
                </div>
              </Card>

              {/* Thread Preview Slider */}
              <Card className="p-4 backdrop-blur-lg bg-card/80 border-card-border">
                <h3 className="text-sm font-semibold mb-3 text-foreground flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Thread Preview
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Preview how the art looks at different thread counts
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>1</span>
                    <span className="font-medium text-foreground">
                      {previewThreadCount ?? result.totalThreads} threads
                    </span>
                    <span>{result.totalThreads}</span>
                  </div>
                  <Slider
                    value={[previewThreadCount ?? result.totalThreads]}
                    min={1}
                    max={result.totalThreads}
                    step={Math.max(1, Math.floor(result.totalThreads / 100))}
                    onValueChange={([value]) => setPreviewThreadCount(value)}
                    data-testid="slider-preview-threads"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full mt-2"
                    onClick={() => setPreviewThreadCount(null)}
                    data-testid="button-reset-preview"
                  >
                    Reset to Full
                  </Button>
                </div>
              </Card>
              
              <GuidancePlayer result={result} />
              {result.threadColors && (
                <ThreadColors 
                  colors={result.threadColors} 
                  totalThreads={result.totalThreads}
                />
              )}
              <ExportPanel result={result} />
            </div>

            {/* Center Panel - Result Preview */}
            <div className="lg:col-span-8">
              <Card className="p-4 backdrop-blur-lg bg-card/80 border-card-border aspect-square flex items-center justify-center overflow-hidden">
                <CanvasPreview 
                  imageUrl={result.previewDataUrl || previewDataUrl}
                  params={params}
                  mode="result"
                  result={result}
                  previewThreadCount={actualPreviewCount}
                  serverPreviewReady={!!(result.previewDataUrl || previewDataUrl)}
                />
              </Card>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-auto">
        <div className="mx-auto max-w-7xl px-4 py-4 text-center text-sm text-muted-foreground">
          Professional string art generation with hybrid optimization algorithms
        </div>
      </footer>
    </div>
  );
}
