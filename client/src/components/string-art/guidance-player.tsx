import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  ChevronFirst,
  ChevronLast,
  Volume2,
  VolumeX,
  Timer,
  Palette
} from "lucide-react";
import { type StringArtResult } from "@shared/schema";

interface GuidancePlayerProps {
  result: StringArtResult;
}

export function GuidancePlayer({ result }: GuidancePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [autoAdvanceSpeed, setAutoAdvanceSpeed] = useState(3);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceVolume, setVoiceVolume] = useState(0.8);
  const [pauseOnColorChange, setPauseOnColorChange] = useState(true);
  const [colorChangeAlert, setColorChangeAlert] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const totalSteps = result.connections.length;
  const currentConnection = result.connections[currentStep];
  const nextConnection = result.connections[currentStep + 1];
  const prevConnection = currentStep > 0 ? result.connections[currentStep - 1] : null;

  // Detect color change between previous and current connection
  const isColorChange = prevConnection && currentConnection && 
    prevConnection.color !== currentConnection.color;

  // Handle color change - pause and show alert
  useEffect(() => {
    if (isColorChange && pauseOnColorChange && isPlaying) {
      setIsPlaying(false);
      const colorName = currentConnection?.colorName || currentConnection?.color || "Unknown";
      setColorChangeAlert(`Change thread to: ${colorName}`);
    }
  }, [currentStep, isColorChange, pauseOnColorChange, isPlaying, currentConnection]);

  // Clear color change alert when user continues
  const handleContinueAfterColorChange = useCallback(() => {
    setColorChangeAlert(null);
    setIsPlaying(true);
  }, []);

  // Auto-advance logic
  useEffect(() => {
    if (isPlaying && currentStep < totalSteps - 1) {
      intervalRef.current = setTimeout(() => {
        setCurrentStep(prev => prev + 1);
      }, autoAdvanceSpeed * 1000);
    } else if (currentStep >= totalSteps - 1) {
      setIsPlaying(false);
    }

    return () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
    };
  }, [isPlaying, currentStep, totalSteps, autoAdvanceSpeed]);

  // Voice announcement
  useEffect(() => {
    if (voiceEnabled && currentConnection && "speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(
        `Pin ${currentConnection.fromPin} to Pin ${currentConnection.toPin}`
      );
      utterance.volume = voiceVolume;
      utterance.rate = 1.2;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }
  }, [currentStep, voiceEnabled, voiceVolume, currentConnection]);

  const handlePlayPause = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const handlePrevious = useCallback(() => {
    setCurrentStep(prev => Math.max(0, prev - 1));
  }, []);

  const handleNext = useCallback(() => {
    setCurrentStep(prev => Math.min(totalSteps - 1, prev + 1));
  }, [totalSteps]);

  const handleFirst = useCallback(() => {
    setCurrentStep(0);
    setIsPlaying(false);
  }, []);

  const handleLast = useCallback(() => {
    setCurrentStep(totalSteps - 1);
    setIsPlaying(false);
  }, [totalSteps]);

  const handleSliderChange = useCallback(([value]: number[]) => {
    setCurrentStep(value);
    setIsPlaying(false);
  }, []);

  return (
    <Card className="p-6 backdrop-blur-lg bg-card/80 border-card-border">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Step-by-Step Guide</h3>
          <Badge variant="secondary" className="font-mono">
            {currentStep + 1} / {totalSteps.toLocaleString()}
          </Badge>
        </div>

        {/* Color Change Alert */}
        {colorChangeAlert && (
          <div className="p-4 rounded-lg bg-amber-500/20 border border-amber-500/50 space-y-3">
            <div className="text-center">
              <p className="text-lg font-bold text-amber-600 dark:text-amber-400" data-testid="text-color-change-alert">
                {colorChangeAlert}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Switch your thread color before continuing
              </p>
            </div>
            <div className="flex justify-center">
              <Button 
                onClick={handleContinueAfterColorChange}
                data-testid="button-continue-color-change"
              >
                Continue with New Color
              </Button>
            </div>
          </div>
        )}

        {/* Current Thread Display */}
        <div className="p-4 rounded-lg bg-muted/50 space-y-3">
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Current Thread</p>
            <p className="text-2xl font-bold font-mono text-foreground" data-testid="text-current-thread">
              Thread {(currentStep + 1).toLocaleString()}
            </p>
            {/* Thread Color Indicator */}
            {currentConnection?.color && (
              <div className="flex items-center justify-center gap-2 mt-2">
                <div 
                  className="w-6 h-6 rounded-full border-2 border-border shadow-sm"
                  style={{ backgroundColor: currentConnection.color }}
                  data-testid="indicator-thread-color"
                />
                <span className="text-sm font-medium" data-testid="text-thread-color-name">
                  {currentConnection.colorName || currentConnection.color}
                </span>
              </div>
            )}
          </div>

          {currentConnection && (
            <div className="flex items-center justify-center gap-4">
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">From</p>
                <div 
                  className="w-16 h-16 rounded-full border-2 flex items-center justify-center"
                  style={{ 
                    backgroundColor: currentConnection.color ? `${currentConnection.color}20` : 'hsl(var(--primary) / 0.1)',
                    borderColor: currentConnection.color || 'hsl(var(--primary))'
                  }}
                >
                  <span 
                    className="text-xl font-bold font-mono"
                    style={{ color: currentConnection.color || 'hsl(var(--primary))' }}
                    data-testid="text-from-pin"
                  >
                    {currentConnection.fromPin}
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-center">
                <div 
                  className="w-12 h-0.5"
                  style={{ backgroundColor: currentConnection.color || 'hsl(var(--primary))' }}
                />
                <span className="text-xs text-muted-foreground mt-1">to</span>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">To</p>
                <div 
                  className="w-16 h-16 rounded-full border-2 flex items-center justify-center"
                  style={{ 
                    backgroundColor: currentConnection.color ? `${currentConnection.color}20` : 'hsl(var(--primary) / 0.1)',
                    borderColor: currentConnection.color || 'hsl(var(--primary))'
                  }}
                >
                  <span 
                    className="text-xl font-bold font-mono"
                    style={{ color: currentConnection.color || 'hsl(var(--primary))' }}
                    data-testid="text-to-pin"
                  >
                    {currentConnection.toPin}
                  </span>
                </div>
              </div>
            </div>
          )}

          {nextConnection && (
            <div className="text-center pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Next: Pin {nextConnection.fromPin} → Pin {nextConnection.toPin}
                {nextConnection.color && nextConnection.color !== currentConnection?.color && (
                  <span className="ml-2 text-amber-500 font-medium">(Color change!)</span>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Progress Slider */}
        <div className="space-y-2">
          <Slider
            value={[currentStep]}
            onValueChange={handleSliderChange}
            min={0}
            max={totalSteps - 1}
            step={1}
            data-testid="slider-step"
          />
          <div className="flex justify-between text-xs text-muted-foreground font-mono">
            <span>1</span>
            <span>{totalSteps.toLocaleString()}</span>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center justify-center gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleFirst}
            disabled={currentStep === 0}
            data-testid="button-first"
          >
            <ChevronFirst className="w-5 h-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handlePrevious}
            disabled={currentStep === 0}
            data-testid="button-previous"
          >
            <SkipBack className="w-5 h-5" />
          </Button>
          <Button 
            size="icon"
            onClick={handlePlayPause}
            data-testid="button-play-pause"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5 ml-0.5" />
            )}
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleNext}
            disabled={currentStep === totalSteps - 1}
            data-testid="button-next"
          >
            <SkipForward className="w-5 h-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleLast}
            disabled={currentStep === totalSteps - 1}
            data-testid="button-last"
          >
            <ChevronLast className="w-5 h-5" />
          </Button>
        </div>

        {/* Speed & Voice Controls */}
        <div className="space-y-4 pt-4 border-t border-border">
          {/* Auto-advance Speed */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Timer className="w-4 h-4 text-muted-foreground" />
              <Label className="text-sm">Auto-advance</Label>
            </div>
            <Select 
              value={String(autoAdvanceSpeed)} 
              onValueChange={(v) => setAutoAdvanceSpeed(Number(v))}
            >
              <SelectTrigger className="w-24" data-testid="select-speed">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2 sec</SelectItem>
                <SelectItem value="3">3 sec</SelectItem>
                <SelectItem value="4">4 sec</SelectItem>
                <SelectItem value="5">5 sec</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Pause on Color Change */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-muted-foreground" />
              <Label className="text-sm">Pause on color change</Label>
            </div>
            <Switch
              checked={pauseOnColorChange}
              onCheckedChange={setPauseOnColorChange}
              data-testid="switch-pause-color-change"
            />
          </div>

          {/* Voice Guidance */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {voiceEnabled ? (
                <Volume2 className="w-4 h-4 text-muted-foreground" />
              ) : (
                <VolumeX className="w-4 h-4 text-muted-foreground" />
              )}
              <Label className="text-sm">Voice Guidance</Label>
            </div>
            <Switch
              checked={voiceEnabled}
              onCheckedChange={setVoiceEnabled}
              data-testid="switch-voice"
            />
          </div>

          {voiceEnabled && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Volume</Label>
                <span className="text-xs text-muted-foreground font-mono">
                  {Math.round(voiceVolume * 100)}%
                </span>
              </div>
              <Slider
                value={[voiceVolume]}
                onValueChange={([v]) => setVoiceVolume(v)}
                min={0}
                max={1}
                step={0.1}
                data-testid="slider-volume"
              />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
