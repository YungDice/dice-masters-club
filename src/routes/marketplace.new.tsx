import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyRoles } from "@/hooks/use-profile";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ImagePlus, Gavel, Tag, ArrowLeft, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/marketplace/new")({
  head: () => ({ meta: [{ title: "List item — DICE" }] }),
  component: () => <AppShell><CreateListing /></AppShell>,
});

const CATEGORIES = [
  { value: "art", label: "🎨 Art" },
  { value: "photo", label: "📷 Photo" },
  { value: "gif", label: "🎞️ GIF" },
  { value: "sticker", label: "✨ Sticker" },
  { value: "emote", label: "😄 Emote" },
  { value: "banner", label: "🖼️ Banner" },
  { value: "template", label: "📋 Template" },
  { value: "cosmetic", label: "💎 Cosmetic" },
  { value: "other", label: "📦 Other" },
];

function CreateListing() {
  const { user } = useAuth();
  const { data: roles } = useMyRoles(user?.id);
  const isStaff = roles?.some((r) => r === "owner" || r === "admin");
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", category: "art", price: 100,
    tags: "", license_notes: "", ownership: false,
    sale_type: "fixed" as "fixed" | "auction",
    duration_hours: 24,
  });
  const [preview, setPreview] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");

  function onPick(f: File | null) {
    setPreview(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f ? URL.createObjectURL(f) : "");
  }

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
    if (!form.title.trim()) return toast.error("Add a title");
    if (!preview) return toast.error("Add a preview image so buyers can see your item");
    if (!form.ownership) return toast.error("Confirm you own the rights to this content");
    if (form.category === "avatar" && !isStaff) return toast.error("Only staff can create profile-picture listings");
    setBusy(true);
    try {
      const previewSigned = await uploadOne(preview);
      const { error } = await supabase.from("marketplace_listings").insert({
        seller_id: user.id, title: form.title.trim(), description: form.description.trim(),
        category: form.category, price: Number(form.price),
        preview_url: previewSigned, file_url: null,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        license_notes: form.license_notes || null,
        ownership_confirmed: true, status: "pending_review",
        sale_type: form.sale_type,
        auction_ends_at: form.sale_type === "auction"
          ? new Date(Date.now() + form.duration_hours * 3600_000).toISOString() : null,
        min_bid: form.sale_type === "auction" ? Number(form.price) : null,
      } as any);
      if (error) throw error;
      toast.success("Listing submitted for review!");
      nav({ to: "/marketplace" });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Link to="/marketplace" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to Marketplace
      </Link>

      <Card className="glass p-6 md:p-8">
        <div className="space-y-1 mb-6">
          <h1 className="font-display text-3xl font-bold">Create a listing</h1>
          <p className="text-sm text-muted-foreground">Digital items only. No physical goods, weapons, substances, personal data, or sexual content. No copyrighted material without rights.</p>
        </div>

        <form onSubmit={submit} className="space-y-6">
          {/* Step 1: Image */}
          <section className="space-y-2">
            <div className="flex items-center gap-2"><span className="inline-flex size-6 rounded-full bg-primary/20 text-primary text-xs items-center justify-center font-bold">1</span><h2 className="font-semibold">Preview image</h2></div>
            <p className="text-xs text-muted-foreground">This is what buyers see first. Use a clear, square image (PNG, JPG, GIF, or MP4).</p>
            {previewUrl ? (
              <div className="relative w-48 h-48 rounded-lg overflow-hidden border border-border/60">
                {preview?.type.startsWith("video") ? (
                  <video src={previewUrl} className="w-full h-full object-cover" muted autoPlay loop />
                ) : (
                  <img src={previewUrl} className="w-full h-full object-cover" alt="preview" />
                )}
                <button type="button" onClick={() => onPick(null)} className="absolute top-1 right-1 size-7 grid place-items-center rounded-full bg-black/70 text-white hover:bg-black">
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-48 h-48 rounded-lg border-2 border-dashed border-border hover:border-primary/60 cursor-pointer transition">
                <ImagePlus className="size-8 text-muted-foreground mb-1" />
                <span className="text-xs text-muted-foreground">Click to upload</span>
                <input type="file" accept="image/*,video/*" className="hidden" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
              </label>
            )}
          </section>

          {/* Step 2: Details */}
          <section className="space-y-3">
            <div className="flex items-center gap-2"><span className="inline-flex size-6 rounded-full bg-primary/20 text-primary text-xs items-center justify-center font-bold">2</span><h2 className="font-semibold">Item details</h2></div>
            <div>
              <Label>Title <span className="text-muted-foreground text-xs">({form.title.length}/120)</span></Label>
              <Input required maxLength={120} placeholder="e.g. Neon Skull Avatar" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea maxLength={1500} placeholder="Tell buyers what makes your item special…" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <Label>Category</Label>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2 mt-1">
                {[...CATEGORIES, ...(isStaff ? [{ value: "avatar", label: "👤 Avatar" }] : [])].map((c) => (
                  <button type="button" key={c.value} onClick={() => setForm({ ...form, category: c.value })}
                    className={`px-2 py-2 text-xs rounded-md border transition ${form.category === c.value ? "border-primary bg-primary/15 text-primary" : "border-border/60 hover:border-border"}`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Tags <span className="text-muted-foreground text-xs">(comma-separated, optional)</span></Label>
              <Input placeholder="dark, neon, retro" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            </div>
          </section>

          {/* Step 3: Sale type */}
          <section className="space-y-3">
            <div className="flex items-center gap-2"><span className="inline-flex size-6 rounded-full bg-primary/20 text-primary text-xs items-center justify-center font-bold">3</span><h2 className="font-semibold">How do you want to sell it?</h2></div>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setForm({ ...form, sale_type: "fixed" })}
                className={`p-4 rounded-lg border text-left transition ${form.sale_type === "fixed" ? "border-primary bg-primary/10" : "border-border/60 hover:border-border"}`}>
                <div className="flex items-center gap-2 font-semibold"><Tag className="size-4" /> Fixed price</div>
                <div className="text-xs text-muted-foreground mt-1">First buyer wins. Instant sale.</div>
              </button>
              <button type="button" onClick={() => setForm({ ...form, sale_type: "auction" })}
                className={`p-4 rounded-lg border text-left transition ${form.sale_type === "auction" ? "border-primary bg-primary/10" : "border-border/60 hover:border-border"}`}>
                <div className="flex items-center gap-2 font-semibold"><Gavel className="size-4" /> Auction</div>
                <div className="text-xs text-muted-foreground mt-1">Highest bid wins after the timer.</div>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{form.sale_type === "auction" ? "Starting bid" : "Price"} (DICE)</Label>
                <Input type="number" min={1} max={1000000} value={form.price} onChange={(e) => setForm({ ...form, price: +e.target.value })} />
              </div>
              {form.sale_type === "auction" && (
                <div>
                  <Label>Duration: <b>{form.duration_hours}h</b> (1–48)</Label>
                  <input type="range" min={1} max={48} value={form.duration_hours} onChange={(e) => setForm({ ...form, duration_hours: +e.target.value })} className="w-full mt-3" />
                </div>
              )}
            </div>
          </section>

          {/* Step 4: Confirm */}
          <section className="space-y-3 pt-2 border-t border-border/40">
            <div>
              <Label>License / usage notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea rows={2} placeholder="e.g. Personal use only, no resale" value={form.license_notes} onChange={(e) => setForm({ ...form, license_notes: e.target.value })} maxLength={500} />
            </div>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox checked={form.ownership} onCheckedChange={(v) => setForm({ ...form, ownership: !!v })} />
              <span>I confirm I own the rights to this content and it complies with DICE rules.</span>
            </label>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => nav({ to: "/marketplace" })}>Cancel</Button>
              <Button disabled={busy} className="glow-red flex-1">{busy ? "Submitting..." : "Submit for review"}</Button>
            </div>
            <p className="text-xs text-muted-foreground">Listings are reviewed by staff before going live.</p>
          </section>
        </form>
      </Card>
    </div>
  );
}
