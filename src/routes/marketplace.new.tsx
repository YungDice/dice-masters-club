import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export const Route = createFileRoute("/marketplace/new")({
  head: () => ({ meta: [{ title: "List item — DICE" }] }),
  component: () => <AppShell><CreateListing /></AppShell>,
});

function CreateListing() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", category: "art", price: 100,
    tags: "", license_notes: "", ownership: false,
    sale_type: "fixed" as "fixed" | "auction",
    duration_hours: 24,
  });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<File | null>(null);

  async function uploadOne(f: File) {
    const path = `${user!.id}/${Date.now()}-${f.name}`;
    const { error } = await supabase.storage.from("marketplace").upload(path, f);
    if (error) throw error;
    const { data } = await supabase.storage.from("marketplace").createSignedUrl(path, 60 * 60 * 24 * 365);
    return data?.signedUrl ?? null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!form.ownership) return toast.error("Confirm you own the rights.");
    setBusy(true);
    try {
      let previewUrl: string | null = null, fileUrl: string | null = null;
      if (preview) previewUrl = await uploadOne(preview);
      if (file) fileUrl = await uploadOne(file);
      const { error } = await supabase.from("marketplace_listings").insert({
        seller_id: user.id, title: form.title, description: form.description,
        category: form.category, price: Number(form.price),
        preview_url: previewUrl, file_url: fileUrl,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        license_notes: form.license_notes || null,
        ownership_confirmed: true, status: "pending_review",
      });
      if (error) throw error;
      toast.success("Listing submitted for review");
      nav({ to: "/marketplace" });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <Card className="glass p-6 max-w-2xl mx-auto">
      <h1 className="font-display text-2xl font-bold">List a digital item</h1>
      <p className="text-sm text-muted-foreground mt-1">Digital only. No physical goods, weapons, substances, personal data, or sexual content. No copyrighted material without rights.</p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <div><Label>Title</Label><Input required maxLength={120} value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} /></div>
        <div><Label>Description</Label><Textarea required maxLength={1500} value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Category</Label>
            <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.category} onChange={(e) => setForm({...form, category: e.target.value})}>
              {["art","photo","gif","sticker","emote","banner","avatar","template","cosmetic","other"].map((c) => <option key={c}>{c}</option>)}
            </select></div>
          <div><Label>Price (DICE)</Label><Input type="number" min={1} max={50000} value={form.price} onChange={(e) => setForm({...form, price: +e.target.value})} /></div>
        </div>
        <div><Label>Tags (comma-separated)</Label><Input value={form.tags} onChange={(e) => setForm({...form, tags: e.target.value})} /></div>
        <div><Label>License / usage notes</Label><Textarea value={form.license_notes} onChange={(e) => setForm({...form, license_notes: e.target.value})} maxLength={500} /></div>
        <div><Label>Preview image</Label><Input type="file" accept="image/*,video/*" onChange={(e) => setPreview(e.target.files?.[0] ?? null)} /></div>
        <div><Label>File for buyers (optional)</Label><Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
        <label className="flex items-start gap-2 text-sm"><Checkbox checked={form.ownership} onCheckedChange={(v) => setForm({...form, ownership: !!v})} /><span>I confirm I own the rights to this content.</span></label>
        <Button disabled={busy} className="w-full glow-red">{busy ? "Submitting..." : "Submit for review"}</Button>
      </form>
    </Card>
  );
}
