import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  imageSrc: string;
  aspect: number;                // e.g. 1 for avatar, 3 for banner, 16/9 for bg
  cropShape?: "rect" | "round";
  title?: string;
  outputWidth?: number;          // width of exported image in px (height inferred by aspect)
  onCropped: (blob: Blob) => Promise<void> | void;
};

function isGifDataUrl(imageSrc: string) {
  return /^data:image\/gif(?:;|,)/i.test(imageSrc);
}

async function gifDataUrlToBlob(imageSrc: string): Promise<Blob> {
  const response = await fetch(imageSrc);
  const blob = await response.blob();
  return blob.type ? blob : new Blob([blob], { type: "image/gif" });
}

async function cropToBlob(imageSrc: string, area: Area, outW: number, aspect: number): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = imageSrc;
  });
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = Math.round(outW / aspect);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.92)!,
  );
}

export function ImageCropper({ open, onOpenChange, imageSrc, aspect, cropShape = "rect", title = "Adjust image", outputWidth = 1200, onCropped }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const animatedGif = isGifDataUrl(imageSrc);

  const onCropComplete = useCallback((_c: Area, pixels: Area) => setArea(pixels), []);

  async function save() {
    if (!animatedGif && !area) return;
    setBusy(true);
    try {
      // Canvas export flattens GIFs to one frame. Keep the original bytes instead.
      const blob = animatedGif
        ? await gifDataUrlToBlob(imageSrc)
        : await cropToBlob(imageSrc, area!, outputWidth, aspect);
      await onCropped(blob);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {animatedGif
              ? "Animated GIFs are uploaded unchanged so their animation stays intact."
              : "Drag to reposition, pinch or use the slider to zoom."}
          </DialogDescription>
        </DialogHeader>
        <div className="relative w-full h-72 sm:h-80 bg-black rounded-lg overflow-hidden">
          {animatedGif ? (
            <img src={imageSrc} alt="Animated GIF preview" className="w-full h-full object-contain" />
          ) : (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              cropShape={cropShape}
              showGrid
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </div>
        {!animatedGif && (
          <div className="space-y-1 pt-2">
            <Label className="text-xs">Zoom</Label>
            <input type="range" min={1} max={4} step={0.02} value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))} className="w-full" />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy} className="glow-red">
            {busy ? "Saving..." : animatedGif ? "Upload GIF" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Small helper: pick a file, read as data URL, return it as a promise. */
export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
