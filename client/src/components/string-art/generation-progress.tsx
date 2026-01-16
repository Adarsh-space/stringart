import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { XCircle, Loader2, Sparkles, Cpu, Zap, Target } from "lucide-react";
import { type GenerationProgress as ProgressType } from "@shared/schema";

interface GenerationProgressProps {
  progress: ProgressType;
  previewDataUrl?: string;
  onCancel: () => void;
}

export function GenerationProgress({ progress, previewDataUrl, onCancel }: GenerationProgressProps) {
  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const getStageIcon = () => {
    switch (progress.status) {
      case "preprocessing":
        return <Loader2 className="w-5 h-5 animate-spin text-blue-500" />;
      case "generating":
        return <Sparkles className="w-5 h-5 text-amber-500" />;
      case "optimizing":
        return <Cpu className="w-5 h-5 text-purple-500" />;
      case "complete":
        return <Zap className="w-5 h-5 text-green-500" />;
      default:
        return <Loader2 className="w-5 h-5 animate-spin" />;
    }
  };

  const getStageLabel = () => {
    switch (progress.status) {
      case "preprocessing":
        return "Preprocessing";
      case "generating":
        return "Generating Threads";
      case "optimizing":
        return "Optimizing";
      case "complete":
        return "Complete";
      case "error":
        return "Error";
      default:
        return "Processing";
    }
  };

  return (
    <Card className="p-6 backdrop-blur-lg bg-card/80 border-card-border">
      <div className="space-y-6">
        {/* Circular Progress */}
        <div className="flex justify-center">
          <div className="relative w-32 h-32">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="64"
                cy="64"
                r="56"
                strokeWidth="8"
                stroke="currentColor"
                fill="none"
                className="text-muted"
              />
              <circle
                cx="64"
                cy="64"
                r="56"
                strokeWidth="8"
                stroke="currentColor"
                fill="none"
                className="text-primary"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 56}
                strokeDashoffset={2 * Math.PI * 56 * (1 - progress.percentage / 100)}
                style={{ transition: "stroke-dashoffset 0.3s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold font-mono text-foreground">
                {Math.round(progress.percentage)}%
              </span>
            </div>
          </div>
        </div>

        {/* Stage Info */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            {getStageIcon()}
            <span className="font-medium text-foreground">{getStageLabel()}</span>
          </div>
          <p className="text-sm text-muted-foreground">{progress.stage}</p>
        </div>

        {/* Linear Progress */}
        <Progress value={progress.percentage} className="h-2" data-testid="progress-bar" />

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-3 rounded-md bg-muted/50">
            <p className="text-xs text-muted-foreground mb-1">Threads</p>
            <p className="font-mono text-sm font-medium text-foreground" data-testid="text-thread-count">
              {progress.currentThread.toLocaleString()} / {progress.totalThreads.toLocaleString()}
            </p>
          </div>
          <div className="text-center p-3 rounded-md bg-muted/50">
            <p className="text-xs text-muted-foreground mb-1">Est. Time</p>
            <p className="font-mono text-sm font-medium text-foreground" data-testid="text-est-time">
              {formatTime(progress.estimatedTimeRemaining)}
            </p>
          </div>
        </div>

        {/* Accuracy Display */}
        {progress.accuracy && (
          <div className="p-3 rounded-md bg-muted/50 space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Accuracy Metrics</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Similarity</p>
                <p className="font-mono text-sm font-bold text-green-600 dark:text-green-400" data-testid="text-similarity">
                  {Math.round(progress.accuracy.similarity)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">SSIM</p>
                <p className="font-mono text-sm font-medium text-foreground" data-testid="text-ssim">
                  {progress.accuracy.ssim.toFixed(3)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">MSE</p>
                <p className="font-mono text-sm font-medium text-foreground" data-testid="text-mse">
                  {Math.round(progress.accuracy.mse)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Legacy Error Display */}
        {progress.currentError !== undefined && !progress.accuracy && (
          <div className="p-3 rounded-md bg-muted/50">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Current Error</span>
              <Badge variant="secondary" className="font-mono text-xs">
                {progress.currentError.toFixed(4)}
              </Badge>
            </div>
          </div>
        )}

        {/* Cancel Button */}
        <Button
          variant="outline"
          className="w-full"
          onClick={onCancel}
          data-testid="button-cancel"
        >
          <XCircle className="w-4 h-4 mr-2" />
          Cancel Generation
        </Button>
      </div>
    </Card>
  );
}
