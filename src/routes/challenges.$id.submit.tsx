import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Camera, Upload, Trash2, Send, Repeat, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/dice/TopNav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/challenges/$id/submit")({
  head: () => ({ meta: [{ title: "Submit proof — DICE" }] }),
  component: () => <AppShell><Submit /></AppShell>,
});

function Submit() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [preview, setPreview] = useState<{ url: string; blob: Blob; kind: string } | null>(null);
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => () => { stream?.getTracks().forEach((t) => t.stop()); }, [stream]);

  async function openCamera(facing: "user" | "environment" = "environment") {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: true });
      setStream(s);
      if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play(); }
    } catch (e: any) { toast.error("Camera access denied"); }
  }
  function takePhoto() {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob((b) => { if (b) setPreview({ url: URL.createObjectURL(b), blob: b, kind: "image/jpeg" }); }, "image/jpeg", 0.85);
  }
  function startRec() {
    if (!stream) return;
    const chunks: Blob[] = [];
    const r = new MediaRecorder(stream, { mimeType: "video/webm" });
    r.ondataavailable = (e) => chunks.push(e.data);
    r.onstop = () => { const b = new Blob(chunks, { type: "video/webm" }); setPreview({ url: URL.createObjectURL(b), blob: b, kind: "video/webm" }); };
    r.start(); setRecorder(r); setRecording(true);
  }
  function stopRec() { recorder?.stop(); setRecording(false); }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setPreview({ url: URL.createObjectURL(f), blob: f, kind: f.type });
  }

  async function submit() {
    if (!user || !preview) return;
    if (preview.blob.size > 25 * 1024 * 1024) {
      toast.error("File too large (max 25MB)");
      return;
    }
    setUploading(true);
    try {
      const ext = preview.kind.startsWith("image") ? "jpg" : "webm";
      const path = `${user.id}/${id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("proof-media").upload(path, preview.blob, { contentType: preview.kind, upsert: false });
      if (error) throw error;
      setProgress(100);
      const { submitProof } = await import("@/lib/dice.functions");
      await submitProof({ data: { challengeId: id, mediaPath: path, mediaKind: preview.kind, caption } });
      toast.success("Proof submitted! A moderator will review it.");
      nav({ to: "/challenges/$id", params: { id } });
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Link to="/challenges/$id" params={{ id }} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4 mr-1" />Back</Link>
      <Card className="glass p-5">
        <h1 className="font-display text-2xl font-medium flex items-center gap-2"><Camera className="size-5 text-primary" /> Record proof</h1>
        <p className="text-sm text-muted-foreground mt-1">Submissions are consent-based. You can delete your media at any time. No unsafe content.</p>
        <div className="mt-4 aspect-video rounded-lg overflow-hidden bg-black grid place-items-center">
          {preview ? (
            preview.kind.startsWith("image")
              ? <img src={preview.url} alt="Challenge submission preview" className="w-full h-full object-contain" />
              : <video src={preview.url} controls className="w-full h-full" />
          ) : <video ref={videoRef} className="w-full h-full" muted playsInline />}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {!stream && !preview && <>
            <Button onClick={() => openCamera("environment")}><Camera className="size-4 mr-1" />Open camera</Button>
            <Button variant="outline" onClick={() => fileInput.current?.click()}><Upload className="size-4 mr-1" />Upload file</Button>
            <input ref={fileInput} type="file" accept="image/*,video/*" hidden onChange={onFile} />
          </>}
          {stream && !preview && <>
            <Button onClick={takePhoto}>📸 Photo</Button>
            {!recording ? <Button onClick={startRec} variant="outline">🔴 Record</Button> : <Button onClick={stopRec} variant="destructive">⏹ Stop</Button>}
            <Button variant="outline" onClick={() => { stream.getTracks().forEach(t => t.stop()); setStream(null); }}>Close</Button>
          </>}
          {preview && <>
            <Button variant="outline" onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null); }}><Repeat className="size-4 mr-1" />Retake</Button>
            <Button variant="ghost" onClick={() => setPreview(null)}><Trash2 className="size-4 mr-1" />Discard</Button>
          </>}
        </div>
        <Textarea className="mt-3" placeholder="Add a caption (optional)" maxLength={300} value={caption} onChange={(e) => setCaption(e.target.value)} />
        {preview && <Button onClick={submit} disabled={uploading} className="mt-3 w-full glow-red"><Send className="size-4 mr-1" />{uploading ? `Uploading ${progress}%...` : "Submit proof"}</Button>}
      </Card>
    </div>
  );
}
