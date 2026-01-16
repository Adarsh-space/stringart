import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Palette } from "lucide-react";
import { type ThreadColorSummary } from "@shared/schema";

interface ThreadColorsProps {
  colors: ThreadColorSummary[];
  totalThreads: number;
}

export function ThreadColors({ colors, totalThreads }: ThreadColorsProps) {
  if (!colors || colors.length === 0) return null;

  return (
    <Card className="p-4 backdrop-blur-lg bg-card/80 border-card-border">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
          <Palette className="w-4 h-4 text-muted-foreground" />
        </div>
        <div>
          <h4 className="font-semibold text-foreground">Thread Colors Needed</h4>
          <p className="text-xs text-muted-foreground">
            Shopping list for {totalThreads.toLocaleString()} threads
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {colors.map((colorInfo, index) => (
          <div
            key={colorInfo.color}
            className="flex items-center gap-3 p-2 rounded-md bg-muted/50"
            data-testid={`thread-color-${index}`}
          >
            <div
              className="w-6 h-6 rounded-md border border-border flex-shrink-0"
              style={{ backgroundColor: colorInfo.color }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground truncate">
                  {colorInfo.colorName}
                </span>
                <Badge variant="secondary" className="text-xs font-mono flex-shrink-0">
                  {colorInfo.count.toLocaleString()}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${colorInfo.percentage}%`,
                      backgroundColor: colorInfo.color,
                    }}
                  />
                </div>
                <span className="text-xs text-muted-foreground font-mono">
                  {colorInfo.percentage}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {colors.length > 1 && (
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">
            You will need {colors.length} different thread colors
          </p>
        </div>
      )}
    </Card>
  );
}
