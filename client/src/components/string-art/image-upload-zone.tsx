import { useCallback, useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, ImagePlus, X, CheckCircle } from "lucide-react";

interface ImageUploadZoneProps {
  onImageUpload: (dataUrl: string) => void;
}

export function ImageUploadZone({ onImageUpload }: ImageUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      return;
    }

    setIsProcessing(true);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setPreview(dataUrl);
      setIsProcessing(false);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleConfirm = useCallback(() => {
    if (preview) {
      onImageUpload(preview);
    }
  }, [preview, onImageUpload]);

  const handleClear = useCallback(() => {
    setPreview(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, []);

  return (
    <div className="w-full max-w-lg">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
        data-testid="input-file"
      />

      {!preview ? (
        <Card
          className={`relative overflow-visible p-8 cursor-pointer transition-all duration-200 hover-elevate ${
            isDragging
              ? "border-primary border-2 bg-primary/5"
              : "border-dashed border-2 border-muted-foreground/30"
          }`}
          onClick={() => inputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          data-testid="dropzone"
        >
          <div className="flex flex-col items-center gap-4 py-8">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${
              isDragging ? "bg-primary/20" : "bg-muted"
            }`}>
              {isProcessing ? (
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              ) : (
                <Upload className={`w-8 h-8 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
              )}
            </div>
            <div className="text-center">
              <p className="text-foreground font-medium mb-1">
                {isDragging ? "Drop your image here" : "Drop an image or click to upload"}
              </p>
              <p className="text-sm text-muted-foreground">
                Supports JPG, PNG, WebP up to 10MB
              </p>
            </div>
            <Button variant="outline" size="sm" className="mt-2" data-testid="button-browse">
              <ImagePlus className="w-4 h-4 mr-2" />
              Browse Files
            </Button>
          </div>

          {/* Example thumbnails */}
          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-xs text-muted-foreground text-center mb-3">
              Best results with high-contrast portraits
            </p>
            <div className="flex gap-2 justify-center">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-12 h-12 rounded-md bg-gradient-to-br from-muted to-muted-foreground/10 border border-border"
                />
              ))}
            </div>
          </div>
        </Card>
      ) : (
        <Card className="relative overflow-hidden border-card-border">
          <div className="aspect-square relative">
            <img
              src={preview}
              alt="Preview"
              className="w-full h-full object-contain bg-black/5 dark:bg-white/5"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                className="flex-1 bg-background/80 backdrop-blur-sm"
                data-testid="button-clear"
              >
                <X className="w-4 h-4 mr-2" />
                Change
              </Button>
              <Button
                size="sm"
                onClick={handleConfirm}
                className="flex-1"
                data-testid="button-confirm"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Use Image
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
