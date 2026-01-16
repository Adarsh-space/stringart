import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ZoomIn, ZoomOut, Maximize2, Eye, EyeOff, Layers } from "lucide-react";
import { type GenerationParams, type StringArtResult, type GenerationProgress } from "@shared/schema";

interface CanvasPreviewProps {
  imageUrl: string | null | undefined;
  params: GenerationParams;
  mode: "source" | "result";
  result?: StringArtResult;
  progress?: GenerationProgress;
  previewThreadCount?: number | null;
  serverPreviewReady?: boolean; // Explicit flag indicating server preview is available in imageUrl
}

export function CanvasPreview({ imageUrl, params, mode, result, progress, previewThreadCount, serverPreviewReady = false }: CanvasPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [showOverlay, setShowOverlay] = useState(false);
  const [showPins, setShowPins] = useState(true);
  const renderTokenRef = useRef(0); // Token to prevent stale async renders

  // Draw the source image or result
  // Runs when: source mode, OR result mode with serverPreviewReady and (null or max threadCount)
  useEffect(() => {
    const totalConnections = result?.connections?.length || 0;
    
    // In result mode, determine if we should use base image (server preview) or client render
    if (mode === "result") {
      // Partial preview (< total) - skip base, let preview effect handle it
      if (previewThreadCount !== null && 
          previewThreadCount !== undefined && 
          previewThreadCount < totalConnections) {
        return;
      }
      
      // At max or null - only use base image if server preview is confirmed ready
      if (!serverPreviewReady || !imageUrl) {
        // No server preview - let preview effect handle it (client render)
        return;
      }
    }
    
    const canvas = canvasRef.current;
    if (!canvas || !imageUrl) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Increment token to invalidate any pending async renders
    const currentToken = ++renderTokenRef.current;

    const img = new Image();
    img.onload = () => {
      // Check if this render is still valid (not superseded by a newer render)
      if (renderTokenRef.current !== currentToken) return;
      
      const size = Math.min(img.width, img.height, 512);
      canvas.width = size;
      canvas.height = size;

      // Clear canvas
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);

      // Get crop parameters (with defaults)
      const crop = params.imageCrop || { scale: 1, offsetX: 0, offsetY: 0 };
      
      // Apply crop scale and offset
      const baseScale = size / Math.min(img.width, img.height);
      const finalScale = baseScale * crop.scale;
      const scaledWidth = img.width * finalScale;
      const scaledHeight = img.height * finalScale;
      
      // Calculate offset with pan adjustments
      const baseOffsetX = (size - scaledWidth) / 2;
      const baseOffsetY = (size - scaledHeight) / 2;
      const maxPanX = (scaledWidth - size) / 2;
      const maxPanY = (scaledHeight - size) / 2;
      const offsetX = baseOffsetX - crop.offsetX * maxPanX;
      const offsetY = baseOffsetY - crop.offsetY * maxPanY;

      ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);

      // Draw frame overlay if in source mode
      if (mode === "source") {
        ctx.strokeStyle = "rgba(59, 130, 246, 0.5)";
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);

        const frameRadius = Math.max(1, size / 2 - 10);
        const frameMargin = Math.min(10, size * 0.1);
        
        if (params.frameType === "circular") {
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, frameRadius, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.strokeRect(frameMargin, frameMargin, size - frameMargin * 2, size - frameMargin * 2);
        }

        // Draw sample pins
        if (showPins && frameRadius > 5) {
          const pinCount = Math.min(params.pinCount, 100);
          ctx.fillStyle = "rgba(59, 130, 246, 0.8)";
          
          for (let i = 0; i < pinCount; i++) {
            const angle = (2 * Math.PI * i) / pinCount;
            const x = size / 2 + frameRadius * Math.cos(angle);
            const y = size / 2 + frameRadius * Math.sin(angle);
            
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    };
    img.src = imageUrl;
  }, [imageUrl, params.frameType, params.pinCount, params.imageCrop, mode, showPins, previewThreadCount, result, serverPreviewReady]);

  // Draw threads client-side when:
  // - previewThreadCount is partial (< total)
  // - OR previewThreadCount is max but no server preview
  // - OR previewThreadCount is null but no server preview (full fallback)
  useEffect(() => {
    if (!result || !result.pins || result.pins.length === 0) return;
    if (!result.connections || result.connections.length === 0) return;
    
    const totalConnections = result.connections.length;
    const isPartial = previewThreadCount !== null && 
                      previewThreadCount !== undefined && 
                      previewThreadCount < totalConnections;
    const isMaxOrNull = previewThreadCount === null || 
                        previewThreadCount === undefined || 
                        previewThreadCount >= totalConnections;
    
    // If server preview is ready and we're at max/null, let base effect handle it
    if (isMaxOrNull && serverPreviewReady && imageUrl) return;
    
    // If we're at max/null without server preview, render all threads
    // If we're partial, render that many threads
    const threadCountToRender = isPartial ? previewThreadCount : totalConnections;
    
    // Render preview client-side (synchronous, no race)
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Re-render the threads at the specified count
    const size = canvas.width;
    
    // Clear and draw white background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);

    // Calculate scale from result dimensions to canvas
    const scaleX = size / result.imageWidth;
    const scaleY = size / result.imageHeight;

    // Draw threads up to threadCountToRender with proper gamma-corrected blending
    const threadsToDraw = threadCountToRender;
    const opacity = result.params?.threadOpacity || 0.15;
    
    // Use ImageData for gamma-correct pixel blending
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    const lineWidth = Math.max(1, (result.params?.threadWidth || 0.5) * scaleX);
    const halfWidth = Math.floor(lineWidth / 2);
    
    // Helper to blend a pixel with gamma correction
    const blendPixel = (px: number, py: number, colorR: number, colorG: number, colorB: number) => {
      if (px < 0 || px >= size || py < 0 || py >= size) return;
      const idx = (py * size + px) * 4;
      
      // Convert to linear space (gamma 2.2)
      const curRLinear = Math.pow(data[idx] / 255, 2.2);
      const curGLinear = Math.pow(data[idx + 1] / 255, 2.2);
      const curBLinear = Math.pow(data[idx + 2] / 255, 2.2);
      
      const threadRLinear = Math.pow(colorR / 255, 2.2);
      const threadGLinear = Math.pow(colorG / 255, 2.2);
      const threadBLinear = Math.pow(colorB / 255, 2.2);
      
      // Blend in linear space
      const newRLinear = curRLinear * (1 - opacity) + threadRLinear * opacity;
      const newGLinear = curGLinear * (1 - opacity) + threadGLinear * opacity;
      const newBLinear = curBLinear * (1 - opacity) + threadBLinear * opacity;
      
      // Convert back to sRGB
      data[idx] = Math.round(Math.pow(newRLinear, 1/2.2) * 255);
      data[idx + 1] = Math.round(Math.pow(newGLinear, 1/2.2) * 255);
      data[idx + 2] = Math.round(Math.pow(newBLinear, 1/2.2) * 255);
    };
    
    for (let i = 0; i < threadsToDraw; i++) {
      const conn = result.connections[i];
      const fromPin = result.pins[conn.fromPin];
      const toPin = result.pins[conn.toPin];
      
      if (!fromPin || !toPin) continue;
      
      const color = conn.color || "#000000";
      // Parse color
      const colorR = parseInt(color.slice(1, 3), 16);
      const colorG = parseInt(color.slice(3, 5), 16);
      const colorB = parseInt(color.slice(5, 7), 16);
      
      // Get line pixels using simple line algorithm
      const x0 = Math.round(fromPin.x * scaleX);
      const y0 = Math.round(fromPin.y * scaleY);
      const x1 = Math.round(toPin.x * scaleX);
      const y1 = Math.round(toPin.y * scaleY);
      
      const dx = Math.abs(x1 - x0);
      const dy = Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx - dy;
      let x = x0, y = y0;
      
      while (true) {
        // Draw a thick line by blending pixels in a small radius around the center
        if (halfWidth <= 0) {
          blendPixel(x, y, colorR, colorG, colorB);
        } else {
          for (let ox = -halfWidth; ox <= halfWidth; ox++) {
            for (let oy = -halfWidth; oy <= halfWidth; oy++) {
              // Only blend within circular radius for smooth lines
              if (ox * ox + oy * oy <= halfWidth * halfWidth) {
                blendPixel(x + ox, y + oy, colorR, colorG, colorB);
              }
            }
          }
        }
        
        if (x === x1 && y === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x += sx; }
        if (e2 < dx) { err += dx; y += sy; }
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
  }, [result, previewThreadCount, imageUrl, serverPreviewReady]);

  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev * 1.25, 4));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev / 1.25, 0.5));
  }, []);

  const handleFit = useCallback(() => {
    setZoom(1);
  }, []);

  // Only show "No image loaded" if we have no image AND no result data to render
  if (!imageUrl && (!result || !result.connections || result.connections.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
        <Layers className="w-12 h-12 mb-4 opacity-30" />
        <p>No image loaded</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col">
      {/* Controls */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-1 p-1 rounded-md bg-background/80 backdrop-blur-sm border border-border">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={handleZoomOut}
          disabled={zoom <= 0.5}
          data-testid="button-zoom-out"
        >
          <ZoomOut className="w-4 h-4" />
        </Button>
        <Badge variant="secondary" className="font-mono text-xs min-w-[3rem] text-center">
          {Math.round(zoom * 100)}%
        </Badge>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={handleZoomIn}
          disabled={zoom >= 4}
          data-testid="button-zoom-in"
        >
          <ZoomIn className="w-4 h-4" />
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={handleFit}
          data-testid="button-fit"
        >
          <Maximize2 className="w-4 h-4" />
        </Button>
        {mode === "source" && (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setShowPins(!showPins)}
            data-testid="button-toggle-pins"
          >
            {showPins ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </Button>
        )}
      </div>

      {/* Progress Overlay */}
      {progress && progress.status !== "complete" && (
        <div className="absolute top-4 left-4 z-10 p-2 rounded-md bg-background/80 backdrop-blur-sm border border-border">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-xs font-mono text-muted-foreground">
              {progress.currentThread.toLocaleString()} threads
            </span>
          </div>
        </div>
      )}

      {/* Canvas Container */}
      <div 
        className="flex-1 flex items-center justify-center overflow-auto"
        style={{
          background: mode === "result" 
            ? "linear-gradient(45deg, #f0f0f0 25%, transparent 25%), linear-gradient(-45deg, #f0f0f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f0f0f0 75%), linear-gradient(-45deg, transparent 75%, #f0f0f0 75%)"
            : undefined,
          backgroundSize: "20px 20px",
          backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px"
        }}
      >
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full rounded-md shadow-lg"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "center",
            transition: "transform 0.2s ease",
          }}
          data-testid="canvas-preview"
        />
      </div>

      {/* Info Bar */}
      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between px-3 py-2 rounded-md bg-background/80 backdrop-blur-sm border border-border">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="font-mono">
            {params.frameType === "circular" ? "Circle" : params.frameType === "square" ? "Square" : "Rectangle"}
          </span>
          <span className="font-mono">{params.pinCount} pins</span>
        </div>
        {result && (
          <Badge variant="secondary" className="text-xs">
            {previewThreadCount !== null && previewThreadCount !== undefined && previewThreadCount !== result.totalThreads
              ? `${previewThreadCount.toLocaleString()} / ${result.totalThreads.toLocaleString()} threads`
              : `${result.totalThreads.toLocaleString()} threads`
            }
          </Badge>
        )}
      </div>
    </div>
  );
}
