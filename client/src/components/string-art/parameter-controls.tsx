import { useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Circle, Square, RectangleHorizontal, ChevronDown, Settings2, Palette, Zap, Gauge, Move, ZoomIn, RotateCcw, Wand2, Grid3X3, Ruler } from "lucide-react";
import { type GenerationParams, type FrameType, type ColorMode, type QualityPreset } from "@shared/schema";

interface ParameterControlsProps {
  params: GenerationParams;
  onChange: (params: Partial<GenerationParams>) => void;
  onAutoOptimize?: () => void;
}

export function ParameterControls({ params, onChange, onAutoOptimize }: ParameterControlsProps) {
  const handleFrameTypeChange = useCallback((value: FrameType) => {
    onChange({ frameType: value });
  }, [onChange]);

  const handleCropChange = useCallback((key: 'scale' | 'offsetX' | 'offsetY', value: number) => {
    const currentCrop = params.imageCrop || { scale: 1, offsetX: 0, offsetY: 0 };
    onChange({ imageCrop: { ...currentCrop, [key]: value } });
  }, [onChange, params.imageCrop]);

  const handleResetCrop = useCallback(() => {
    onChange({ imageCrop: { scale: 1, offsetX: 0, offsetY: 0 } });
  }, [onChange]);

  const handleColorModeChange = useCallback((value: ColorMode) => {
    onChange({ colorMode: value });
  }, [onChange]);

  const handleQualityChange = useCallback((value: QualityPreset) => {
    const presets: Record<QualityPreset, Partial<GenerationParams>> = {
      fast: { maxThreads: 3000, useSimulatedAnnealing: false, minPinSkip: 8, pinCount: 200, threadOpacity: 0.18 },
      balanced: { maxThreads: 6000, useSimulatedAnnealing: false, minPinSkip: 5, pinCount: 300, threadOpacity: 0.15 },
      high: { maxThreads: 12000, useSimulatedAnnealing: true, minPinSkip: 3, pinCount: 400, threadOpacity: 0.12 },
    };
    onChange({ qualityPreset: value, ...presets[value] });
  }, [onChange]);

  return (
    <div className="space-y-6">
      {/* Frame Configuration */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
            <Circle className="w-4 h-4 text-muted-foreground" />
          </div>
          <Label className="text-sm font-medium">Frame Shape</Label>
        </div>
        <RadioGroup
          value={params.frameType}
          onValueChange={handleFrameTypeChange}
          className="grid grid-cols-3 gap-2"
        >
          <Label
            htmlFor="frame-circular"
            className={`flex flex-col items-center gap-2 p-3 rounded-md border cursor-pointer transition-colors hover-elevate ${
              params.frameType === "circular" ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            <RadioGroupItem value="circular" id="frame-circular" className="sr-only" />
            <Circle className="w-6 h-6" />
            <span className="text-xs">Circle</span>
          </Label>
          <Label
            htmlFor="frame-square"
            className={`flex flex-col items-center gap-2 p-3 rounded-md border cursor-pointer transition-colors hover-elevate ${
              params.frameType === "square" ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            <RadioGroupItem value="square" id="frame-square" className="sr-only" />
            <Square className="w-6 h-6" />
            <span className="text-xs">Square</span>
          </Label>
          <Label
            htmlFor="frame-rectangular"
            className={`flex flex-col items-center gap-2 p-3 rounded-md border cursor-pointer transition-colors hover-elevate ${
              params.frameType === "rectangular" ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            <RadioGroupItem value="rectangular" id="frame-rectangular" className="sr-only" />
            <RectangleHorizontal className="w-6 h-6" />
            <span className="text-xs">Rect</span>
          </Label>
        </RadioGroup>
      </div>

      {/* Canvas Size & Pin Gap Info */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
            <Grid3X3 className="w-4 h-4 text-muted-foreground" />
          </div>
          <Label className="text-sm font-medium">Generation Info</Label>
        </div>
        <div className="grid grid-cols-2 gap-3 pl-2">
          <div className="p-3 rounded-md border bg-muted/30">
            <div className="flex items-center gap-1.5 mb-1">
              <Ruler className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Canvas Size</span>
            </div>
            <span className="font-mono text-sm font-medium" data-testid="text-canvas-size">512 × 512 px</span>
          </div>
          <div className="p-3 rounded-md border bg-muted/30">
            <div className="flex items-center gap-1.5 mb-1">
              <Circle className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Pin Gap</span>
            </div>
            <span className="font-mono text-sm font-medium" data-testid="text-pin-gap">{params.minPinSkip} pins</span>
          </div>
        </div>
      </div>

      {/* Image Position & Zoom */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
              <Move className="w-4 h-4 text-muted-foreground" />
            </div>
            <Label className="text-sm font-medium">Image Position</Label>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleResetCrop}
            className="h-7 text-xs"
            data-testid="button-reset-crop"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Reset
          </Button>
        </div>
        
        <div className="space-y-3 pl-2">
          {/* Zoom */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <ZoomIn className="w-3 h-3" />
                Zoom
              </Label>
              <span className="font-mono text-xs text-muted-foreground">
                {Math.round((params.imageCrop?.scale || 1) * 100)}%
              </span>
            </div>
            <Slider
              value={[params.imageCrop?.scale || 1]}
              onValueChange={([value]) => handleCropChange('scale', value)}
              min={1}
              max={3}
              step={0.05}
              data-testid="slider-crop-zoom"
            />
          </div>
          
          {/* Horizontal Position */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Horizontal</Label>
              <span className="font-mono text-xs text-muted-foreground">
                {params.imageCrop?.offsetX === 0 ? "Center" : 
                 params.imageCrop?.offsetX && params.imageCrop.offsetX > 0 ? "Right" : "Left"}
              </span>
            </div>
            <Slider
              value={[params.imageCrop?.offsetX || 0]}
              onValueChange={([value]) => handleCropChange('offsetX', value)}
              min={-1}
              max={1}
              step={0.05}
              disabled={(params.imageCrop?.scale || 1) <= 1}
              data-testid="slider-crop-x"
            />
          </div>
          
          {/* Vertical Position */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Vertical</Label>
              <span className="font-mono text-xs text-muted-foreground">
                {params.imageCrop?.offsetY === 0 ? "Center" : 
                 params.imageCrop?.offsetY && params.imageCrop.offsetY > 0 ? "Down" : "Up"}
              </span>
            </div>
            <Slider
              value={[params.imageCrop?.offsetY || 0]}
              onValueChange={([value]) => handleCropChange('offsetY', value)}
              min={-1}
              max={1}
              step={0.05}
              disabled={(params.imageCrop?.scale || 1) <= 1}
              data-testid="slider-crop-y"
            />
          </div>
        </div>
      </div>

      {/* Auto-Optimize Button */}
      {onAutoOptimize && (
        <Button 
          variant="outline" 
          className="w-full" 
          onClick={onAutoOptimize}
          data-testid="button-auto-optimize"
        >
          <Wand2 className="w-4 h-4 mr-2" />
          Auto-Optimize Settings
        </Button>
      )}

      {/* Pin Count */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Pin Count</Label>
          <Badge variant="secondary" className="font-mono text-xs">
            {params.pinCount}
          </Badge>
        </div>
        <Slider
          value={[params.pinCount]}
          onValueChange={([value]) => onChange({ pinCount: value })}
          min={100}
          max={600}
          step={20}
          data-testid="slider-pin-count"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>100</span>
          <span>600</span>
        </div>
      </div>

      {/* Thread Settings */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
            <Palette className="w-4 h-4 text-muted-foreground" />
          </div>
          <Label className="text-sm font-medium">Thread Settings</Label>
        </div>

        <div className="space-y-4 pl-2">
          {/* Thread Width */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Thread Width</Label>
              <span className="font-mono text-xs text-muted-foreground">
                {params.threadWidth.toFixed(1)}mm
              </span>
            </div>
            <Slider
              value={[params.threadWidth]}
              onValueChange={([value]) => onChange({ threadWidth: value })}
              min={0.2}
              max={1.5}
              step={0.1}
              data-testid="slider-thread-width"
            />
          </div>

          {/* Thread Opacity */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Thread Opacity</Label>
              <span className="font-mono text-xs text-muted-foreground">
                {Math.round(params.threadOpacity * 100)}%
              </span>
            </div>
            <Slider
              value={[params.threadOpacity]}
              onValueChange={([value]) => onChange({ threadOpacity: value })}
              min={0.03}
              max={0.35}
              step={0.01}
              data-testid="slider-thread-opacity"
            />
          </div>

          {/* Color Mode */}
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Color Mode</Label>
            <div className="flex items-center gap-2">
              <span className={`text-xs ${params.colorMode === "monochrome" ? "text-foreground" : "text-muted-foreground"}`}>
                Mono
              </span>
              <Switch
                checked={params.colorMode === "color"}
                onCheckedChange={(checked) => handleColorModeChange(checked ? "color" : "monochrome")}
                data-testid="switch-color-mode"
              />
              <span className={`text-xs ${params.colorMode === "color" ? "text-foreground" : "text-muted-foreground"}`}>
                Color
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Quality Preset */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
            <Gauge className="w-4 h-4 text-muted-foreground" />
          </div>
          <Label className="text-sm font-medium">Quality</Label>
        </div>
        <Select value={params.qualityPreset} onValueChange={handleQualityChange}>
          <SelectTrigger data-testid="select-quality">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fast">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                <div>
                  <div className="font-medium">Fast</div>
                  <div className="text-xs text-muted-foreground">~30 seconds</div>
                </div>
              </div>
            </SelectItem>
            <SelectItem value="balanced">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-blue-500" />
                <div>
                  <div className="font-medium">Balanced</div>
                  <div className="text-xs text-muted-foreground">~2 minutes</div>
                </div>
              </div>
            </SelectItem>
            <SelectItem value="high">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-green-500" />
                <div>
                  <div className="font-medium">High Quality</div>
                  <div className="text-xs text-muted-foreground">~5 minutes</div>
                </div>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Advanced Options */}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between" data-testid="button-advanced">
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4" />
              <span>Advanced Options</span>
            </div>
            <ChevronDown className="w-4 h-4" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-4">
          {/* Max Threads */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Max Threads</Label>
              <span className="font-mono text-xs text-muted-foreground">
                {params.maxThreads.toLocaleString()}
              </span>
            </div>
            <Slider
              value={[params.maxThreads]}
              onValueChange={([value]) => onChange({ maxThreads: value })}
              min={1000}
              max={30000}
              step={1000}
              data-testid="slider-max-threads"
            />
          </div>

          {/* Min Pin Skip */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Min Pin Skip</Label>
              <span className="font-mono text-xs text-muted-foreground">
                {params.minPinSkip}
              </span>
            </div>
            <Slider
              value={[params.minPinSkip]}
              onValueChange={([value]) => onChange({ minPinSkip: value })}
              min={2}
              max={30}
              step={1}
              data-testid="slider-min-skip"
            />
          </div>

          {/* Optimization Toggles */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Edge Detection</Label>
              <Switch
                checked={params.useEdgeDetection}
                onCheckedChange={(checked) => onChange({ useEdgeDetection: checked })}
                data-testid="switch-edge-detection"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Simulated Annealing</Label>
              <Switch
                checked={params.useSimulatedAnnealing}
                onCheckedChange={(checked) => onChange({ useSimulatedAnnealing: checked })}
                data-testid="switch-simulated-annealing"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Pin Fatigue Penalty</Label>
              <Switch
                checked={params.usePinFatigue}
                onCheckedChange={(checked) => onChange({ usePinFatigue: checked })}
                data-testid="switch-pin-fatigue"
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
