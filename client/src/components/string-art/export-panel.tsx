import { useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Download, 
  FileJson, 
  FileImage, 
  FileText,
  Copy,
  Check,
  Clock,
  Ruler,
  Hash
} from "lucide-react";
import { type StringArtResult } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface ExportPanelProps {
  result: StringArtResult;
}

export function ExportPanel({ result }: ExportPanelProps) {
  const { toast } = useToast();
  const [copiedLink, setCopiedLink] = useState(false);
  const [isExporting, setIsExporting] = useState<string | null>(null);

  const estimatedTime = Math.round(result.totalThreads * 0.5); // 0.5 min per thread
  const hours = Math.floor(estimatedTime / 60);
  const minutes = estimatedTime % 60;

  const handleExportJSON = useCallback(async () => {
    setIsExporting("json");
    try {
      const data = {
        version: "1.0",
        createdAt: result.createdAt,
        params: result.params,
        pins: result.pins,
        connections: result.connections,
        totalThreads: result.totalThreads,
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `string-art-${result.id}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: "Export Complete",
        description: "JSON file downloaded successfully",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export JSON file",
        variant: "destructive",
      });
    }
    setIsExporting(null);
  }, [result, toast]);

  const handleExportSVG = useCallback(async () => {
    setIsExporting("svg");
    try {
      const response = await fetch(`/api/export/${result.id}/svg`);
      if (!response.ok) throw new Error("Export failed");
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `string-art-${result.id}.svg`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: "Export Complete",
        description: "SVG file downloaded successfully",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export SVG file",
        variant: "destructive",
      });
    }
    setIsExporting(null);
  }, [result.id, toast]);

  const handleExportPDF = useCallback(async () => {
    setIsExporting("pdf");
    try {
      const response = await fetch(`/api/export/${result.id}/pdf`);
      if (!response.ok) throw new Error("Export failed");
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `string-art-${result.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: "Export Complete",
        description: "PDF guide downloaded successfully",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export PDF guide",
        variant: "destructive",
      });
    }
    setIsExporting(null);
  }, [result.id, toast]);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
    toast({
      title: "Link Copied",
      description: "Share link copied to clipboard",
    });
  }, [toast]);

  return (
    <Card className="p-6 backdrop-blur-lg bg-card/80 border-card-border">
      <div className="space-y-6">
        {/* Header */}
        <h3 className="text-lg font-semibold text-foreground">Export & Share</h3>

        {/* Export Buttons */}
        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={handleExportJSON}
            disabled={isExporting === "json"}
            data-testid="button-export-json"
          >
            <FileJson className="w-4 h-4 mr-3 text-blue-500" />
            <div className="flex-1 text-left">
              <div className="font-medium">JSON Instructions</div>
              <div className="text-xs text-muted-foreground">Pin-to-pin data for automation</div>
            </div>
            {isExporting === "json" ? (
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download className="w-4 h-4 text-muted-foreground" />
            )}
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={handleExportSVG}
            disabled={isExporting === "svg"}
            data-testid="button-export-svg"
          >
            <FileImage className="w-4 h-4 mr-3 text-green-500" />
            <div className="flex-1 text-left">
              <div className="font-medium">SVG Preview</div>
              <div className="text-xs text-muted-foreground">Vector template for printing</div>
            </div>
            {isExporting === "svg" ? (
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download className="w-4 h-4 text-muted-foreground" />
            )}
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={handleExportPDF}
            disabled={isExporting === "pdf"}
            data-testid="button-export-pdf"
          >
            <FileText className="w-4 h-4 mr-3 text-red-500" />
            <div className="flex-1 text-left">
              <div className="font-medium">PDF Guide</div>
              <div className="text-xs text-muted-foreground">Printable step-by-step guide</div>
            </div>
            {isExporting === "pdf" ? (
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download className="w-4 h-4 text-muted-foreground" />
            )}
          </Button>

          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={handleCopyLink}
            data-testid="button-copy-link"
          >
            {copiedLink ? (
              <Check className="w-4 h-4 mr-3 text-green-500" />
            ) : (
              <Copy className="w-4 h-4 mr-3 text-muted-foreground" />
            )}
            <span className="flex-1 text-left font-medium">
              {copiedLink ? "Link Copied!" : "Copy Share Link"}
            </span>
          </Button>
        </div>

        {/* Project Stats */}
        <div className="pt-4 border-t border-border space-y-3">
          <h4 className="text-sm font-medium text-foreground">Project Summary</h4>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-md bg-muted/50">
              <div className="flex items-center gap-2 mb-1">
                <Hash className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Total Threads</span>
              </div>
              <p className="font-mono font-medium text-foreground" data-testid="text-total-threads">
                {result.totalThreads.toLocaleString()}
              </p>
            </div>

            <div className="p-3 rounded-md bg-muted/50">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Est. Time</span>
              </div>
              <p className="font-mono font-medium text-foreground" data-testid="text-est-completion">
                {hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`}
              </p>
            </div>

            <div className="p-3 rounded-md bg-muted/50">
              <div className="flex items-center gap-2 mb-1">
                <Ruler className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Frame Size</span>
              </div>
              <p className="font-mono font-medium text-foreground">
                {result.params.frameSize}mm
              </p>
            </div>

            <div className="p-3 rounded-md bg-muted/50">
              <div className="flex items-center gap-2 mb-1">
                <Hash className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Pins</span>
              </div>
              <p className="font-mono font-medium text-foreground">
                {result.params.pinCount}
              </p>
            </div>
          </div>

          {/* Materials Needed */}
          <div className="pt-3 space-y-2">
            <h5 className="text-xs text-muted-foreground font-medium">Materials Needed</h5>
            <div className="flex flex-wrap gap-1">
              <Badge variant="secondary" className="text-xs">
                {result.params.pinCount} nails/pins
              </Badge>
              <Badge variant="secondary" className="text-xs">
                ~{Math.round(result.totalThreads * 0.3)}m thread
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {result.params.frameSize}mm frame
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
