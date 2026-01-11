import { useRef, useEffect, useState } from "react";
import SignaturePad from "signature_pad";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { X, Check } from "lucide-react";

interface SignatureCanvasProps {
  onSignatureChange: (signatureData: string | null) => void;
  disabled?: boolean;
}

export function SignatureCanvas({ onSignatureChange, disabled = false }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [signaturePad, setSignaturePad] = useState<SignaturePad | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const container = canvas.parentElement;

    if (!container) return;

    const resizeCanvas = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const width = container.offsetWidth;
      const height = Math.min(200, window.innerHeight * 0.3);

      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const context = canvas.getContext("2d");
      if (context) {
        context.scale(ratio, ratio);
      }

      if (signaturePad) {
        signaturePad.clear();
      }
    };

    const pad = new SignaturePad(canvas, {
      backgroundColor: "rgb(255, 255, 255)",
      penColor: "rgb(0, 0, 0)",
      minWidth: 1,
      maxWidth: 3,
      throttle: 16,
      velocityFilterWeight: 0.7,
    });

    pad.addEventListener("endStroke", () => {
      const dataUrl = pad.toDataURL("image/png");
      onSignatureChange(dataUrl);
      setIsEmpty(pad.isEmpty());
    });

    setSignaturePad(pad);
    resizeCanvas();

    window.addEventListener("resize", resizeCanvas);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
    };
  }, []);

  const handleClear = () => {
    if (signaturePad) {
      signaturePad.clear();
      onSignatureChange(null);
      setIsEmpty(true);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          Sign with your finger or mouse
        </p>
        <p className="text-xs text-muted-foreground">
          Your signature will be included in the adoption contract
        </p>
      </div>

      <Card className="relative overflow-hidden border-2 border-input" data-testid="card-signature-canvas">
        <canvas
          ref={canvasRef}
          className={`w-full touch-none ${disabled ? "opacity-50 pointer-events-none" : "cursor-crosshair"}`}
          data-testid="canvas-signature"
        />
        
        {isEmpty && !disabled && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-muted-foreground text-sm">
              Sign here
            </p>
          </div>
        )}
      </Card>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="default"
          onClick={handleClear}
          disabled={disabled || isEmpty}
          className="flex-1"
          data-testid="button-clear-signature"
        >
          <X className="h-4 w-4 mr-2" />
          Clear
        </Button>
        
        {!isEmpty && (
          <div className="flex items-center text-sm text-green-600 dark:text-green-400">
            <Check className="h-4 w-4 mr-1" />
            <span>Ready</span>
          </div>
        )}
      </div>

      <div className="rounded-md bg-muted/50 p-3">
        <p className="text-xs text-muted-foreground">
          <strong>Tips for mobile users:</strong> Use your finger to draw your signature on the canvas above. 
          Press "Clear" to start over if needed.
        </p>
      </div>
    </div>
  );
}
