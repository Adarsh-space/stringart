import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, TrendingUp, BarChart3 } from "lucide-react";
import { type StringArtResult } from "@shared/schema";

interface AccuracyScoreProps {
  result: StringArtResult;
}

export function AccuracyScore({ result }: AccuracyScoreProps) {
  const { accuracyScore, mse, ssim } = result;
  
  if (accuracyScore === undefined) return null;

  const getScoreColor = (score: number): string => {
    if (score >= 80) return "text-green-600 dark:text-green-400";
    if (score >= 60) return "text-yellow-600 dark:text-yellow-400";
    if (score >= 40) return "text-orange-600 dark:text-orange-400";
    return "text-red-600 dark:text-red-400";
  };

  const getScoreLabel = (score: number): string => {
    if (score >= 90) return "Excellent";
    if (score >= 80) return "Very Good";
    if (score >= 70) return "Good";
    if (score >= 60) return "Fair";
    if (score >= 50) return "Moderate";
    return "Low";
  };

  const getScoreBadgeVariant = (score: number): "default" | "secondary" | "destructive" | "outline" => {
    if (score >= 70) return "default";
    if (score >= 50) return "secondary";
    return "destructive";
  };

  return (
    <Card className="p-4 backdrop-blur-lg bg-card/80 border-card-border">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-foreground">Accuracy Score</h3>
      </div>

      <div className="flex items-center justify-center mb-4">
        <div className="relative w-24 h-24">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="48"
              cy="48"
              r="40"
              strokeWidth="8"
              stroke="currentColor"
              fill="none"
              className="text-muted"
            />
            <circle
              cx="48"
              cy="48"
              r="40"
              strokeWidth="8"
              stroke="currentColor"
              fill="none"
              className={getScoreColor(accuracyScore)}
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 40}
              strokeDashoffset={2 * Math.PI * 40 * (1 - accuracyScore / 100)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-2xl font-bold font-mono ${getScoreColor(accuracyScore)}`} data-testid="text-final-score">
              {Math.round(accuracyScore)}%
            </span>
          </div>
        </div>
      </div>

      <div className="text-center mb-4">
        <Badge variant={getScoreBadgeVariant(accuracyScore)} data-testid="badge-score-label">
          {getScoreLabel(accuracyScore)}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">SSIM</p>
            <p className="font-mono font-medium text-foreground" data-testid="text-final-ssim">
              {ssim !== undefined ? ssim.toFixed(3) : "N/A"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
          <BarChart3 className="w-4 h-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">MSE</p>
            <p className="font-mono font-medium text-foreground" data-testid="text-final-mse">
              {mse !== undefined ? Math.round(mse) : "N/A"}
            </p>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-3 text-center">
        Higher similarity = better match to original image
      </p>
    </Card>
  );
}
