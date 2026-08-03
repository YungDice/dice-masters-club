import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyProfile } from "@/hooks/use-profile";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ImagePlus, Gavel, Tag as TagIcon, ArrowLeft, X, Hash, AtSign, Package, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { listTagForSale, listUsernameForSale, listBaddieForSale } from "@/lib/dice.functions";
import { useQuery } from "@tanstack/react-query";
import eliasAsset from "@/assets/baddies/elias.png.asset.json";

export const Route = createFileRoute("/marketplace/new")({
  head: () => ({
    meta: [
      { title: "List item — DICE" },
      { name: "description", content: "List an item, tag, username, or Baddie for sale on the DICE marketplace. Set your price in DICE coins and upload previews." },
      { property: "og:title", content: "List item — DICE" },
      { property: "og:description", content: "Sell items, tags, usernames, and Baddies for DICE coins on the marketplace." },
      { property: "og:url", content: "https://yungdice.com/marketplace/new" },
    ],
    links: [{ rel: "canonical", href: "https://yungdice.com/marketplace/new" }],
  }),
  component: () => <AppShell><CreateListing /></AppShell>,
});

const ITEM_CATEGORIES = [
  { value: "art", label: "🎨 Art" },
  { value: "photo", label: "📷 Photo" },
  { value: "gif", label: "🎞️ GIF" },
  { value: "sticker", label: "✨ Sticker" },
  { value: "emote", label: "😄 Emote" },
  { value: "banner", label: "🖼️ Banner" },
  { value: "template", label: "📋 Template" },
  { value: "cosmetic", label: "💎 Cosmetic" },
  { value: "avatar", label: "👤 Avatar" },
  { value: "other", label: "📦 Other" },
];

type Mode = "item" | "tag" | "username" | "baddie";

function CreateListing() {
  const { user } = useAuth();
  const { data: profile } = useMyProfile(user?.id);
  const nav = useNavigate();
  const [mode, setMode] = useState<Mode>("item");

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Link to="/marketplace" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to Marketplace
      </Link>

      <Card className="glass p-6 md:p-8">
        <div className="space-y-1 mb-5">
          <h1 className="font-display text-3xl font-bold">Create a listing</h1>
          <p className="text-sm text-muted-foreground">Pick what you want to sell — an item, a Baddie, your tag, or your username.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
          <ModeCard active={mode === "item"} onClick={() => setMode("item")} icon={<Package className="size-4" />} title="Item" sub="Art, GIF, avatar…" />
          <ModeCard active={mode === "baddie"} onClick={() => setMode("baddie")} icon={<Sparkles className="size-4" />} title="Baddie" sub="Sell one of yours" />
          <ModeCard active={mode === "tag"} onClick={() => setMode("tag")} icon={<Hash className="size-4" />} title="Tag" sub={profile?.tag ? `#${profile.tag}` : "Need a tag"} />
          <ModeCard active={mode === "username"} onClick={() => setMode("username")} icon={<AtSign className="size-4" />} title="Username" sub={profile?.username ? `@${profile.username}` : "—"} />
        </div>

        {mode === "item" && <ItemForm user={user} onDone={() => nav({ to: "/marketplace" })} />}
        {mode === "baddie" && <BaddieForm user={user} onDone={() => nav({ to: "/marketplace" })} />}
        {mode === "tag" && <TagForm profile={profile} onDone={() => nav({ to: "/marketplace" })} />}
        {mode === "username" && <UsernameForm profile={profile} onDone={() => nav({ to: "/marketplace" })} />}
      </Card>
    </div>
  );
}


function ModeCard({ active, onClick, icon, title, sub }: any) {
  return (
    <button type="button" onClick={onClick}
      className={`p-3 rounded-lg border text-left transition ${active ? "border-primary bg-primary/10" : "border-border/60 hover:border-border"}`}>
      <div className="flex items-center gap-2 font-semibold">{icon}{title}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</div>
    </button>
  );
}

function SaleControls({ form, setForm }: any) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setForm({ ...form, sale_type: "fixed" })}
          className={`p-3 rounded-lg border text-left transition ${form.sale_type === "fixed" ? "border-primary bg-primary/10" : "border-border/60 hover:border-border"}`}>
          <div className="flex items-center gap-2 font-semibold"><TagIcon className="size-4" /> Fixed price</div>
          <div className="text-xs text-muted-foreground mt-1">First buyer wins.</div>
        </button>
        <button type="button" onClick={() => setForm({ ...form, sale_type: "auction" })}
          className={`p-3 rounded-lg border text-left transition ${form.sale_type === "auction" ? "border-primary bg-primary/10" : "border-border/60 hover:border-border"}`}>
          <div className="flex items-center gap-2 font-semibold"><Gavel className="size-4" /> Auction</div>
          <div className="text-xs text-muted-foreground mt-1">Highest bid after timer.</div>
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{form.sale_type === "auction" ? "Starting bid" : "Price"} (DICE)</Label>
          <Input type="number" min={1} max={1000000} value={form.price} onChange={(e) => setForm({ ...form, price: +e.target.value })} />
        </div>
        {form.sale_type === "auction" && (
          <div>
            <Label>Duration: <b>{form.duration_hours}h</b> <span className="text-muted-foreground text-xs">(1h–7d)</span></Label>
            <input type="range" min={1} max={168} value={form.duration_hours}
              onChange={(e) => setForm({ ...form, duration_hours: +e.target.value })} className="w-full mt-3" />
          </div>
        )}
      </div>
    </>
  );
}

function ItemForm({ user, onDone }: any) {
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
    if (!preview) return toast.error("Add a preview image");
    if (!form.ownership) return toast.error("Confirm rights ownership");
    setBusy(true);
    try {
      const previewSigned = await uploadOne(preview);
      const { error } = await supabase.from("marketplace_listings").insert({
        seller_id: user.id, title: form.title.trim(), description: form.description.trim(),
        category: form.category, price: Number(form.price),
        preview_url: previewSigned, file_url: null,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        license_notes: form.license_notes || null,
        ownership_confirmed: true, status: "active",
        sale_type: form.sale_type,
        auction_ends_at: form.sale_type === "auction"
          ? new Date(Date.now() + form.duration_hours * 3600_000).toISOString() : null,
        min_bid: form.sale_type === "auction" ? Number(form.price) : null,
      } as any);
      if (error) throw error;
      toast.success("Listing published!");
      onDone();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <section className="space-y-2">
        <h2 className="font-semibold">Preview image</h2>
        {previewUrl ? (
          <div className="relative w-48 h-48 rounded-lg overflow-hidden border border-border/60">
            {preview?.type.startsWith("video") ? (
              <video src={previewUrl} className="w-full h-full object-cover" muted autoPlay loop />
            ) : (
              <img src={previewUrl} className="w-full h-full object-cover" alt="New listing preview" />
            )}
            <button type="button" onClick={() => onPick(null)} className="absolute top-1 right-1 size-7 grid place-items-center rounded-full bg-black/70 text-white hover:bg-black"><X className="size-4" /></button>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center w-48 h-48 rounded-lg border-2 border-dashed border-border hover:border-primary/60 cursor-pointer transition">
            <ImagePlus className="size-8 text-muted-foreground mb-1" />
            <span className="text-xs text-muted-foreground">Click to upload</span>
            <input type="file" accept="image/*,video/*" className="hidden" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
          </label>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Details</h2>
        <div>
          <Label>Title <span className="text-muted-foreground text-xs">({form.title.length}/120)</span></Label>
          <Input required maxLength={120} placeholder="e.g. Neon Skull Avatar" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea maxLength={1500} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div>
          <Label>Category</Label>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2 mt-1">
            {ITEM_CATEGORIES.map((c) => (
              <button type="button" key={c.value} onClick={() => setForm({ ...form, category: c.value })}
                className={`px-2 py-2 text-xs rounded-md border transition ${form.category === c.value ? "border-primary bg-primary/15 text-primary" : "border-border/60 hover:border-border"}`}>{c.label}</button>
            ))}
          </div>
        </div>
        <div>
          <Label>Tags <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
          <Input placeholder="dark, neon, retro" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">How do you want to sell it?</h2>
        <SaleControls form={form} setForm={setForm} />
      </section>

      <section className="space-y-3 pt-2 border-t border-border/40">
        <div>
          <Label>License / usage notes (optional)</Label>
          <Textarea rows={2} value={form.license_notes} onChange={(e) => setForm({ ...form, license_notes: e.target.value })} maxLength={500} />
        </div>
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <Checkbox checked={form.ownership} onCheckedChange={(v) => setForm({ ...form, ownership: !!v })} />
          <span>I confirm I own the rights to this content and it complies with DICE rules.</span>
        </label>
        <Button disabled={busy} className="glow-red w-full">{busy ? "Publishing…" : "Publish listing"}</Button>
      </section>
    </form>
  );
}

function TagForm({ profile, onDone }: { profile: any; onDone: () => void }) {
  const [form, setForm] = useState({ sale_type: "fixed" as "fixed" | "auction", price: 1000, duration_hours: 24 });
  const [busy, setBusy] = useState(false);
  const list = useServerFn(listTagForSale);
  const hasTag = !!profile?.tag;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await list({ data: { price: form.price, sale_type: form.sale_type, duration_hours: form.duration_hours } });
      toast.success("Tag listed!");
      onDone();
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
    finally { setBusy(false); }
  }

  if (!hasTag) {
    return (
      <div className="rounded-md border border-border/60 p-5 text-sm space-y-2">
        <p className="text-muted-foreground">You don't own a tag yet. Claim one in <Link to="/settings" className="text-primary underline">Settings</Link> for 5,000 DICE before listing it.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-md bg-primary/5 border border-primary/30 p-4">
        <div className="text-xs text-muted-foreground">Listing your tag</div>
        <div className="text-3xl font-mono font-bold text-primary mt-1">#{profile.tag}</div>
        <p className="text-xs text-muted-foreground mt-2">While listed, the tag is removed from your profile and held in escrow.</p>
      </div>
      <SaleControls form={form} setForm={setForm} />
      <Button disabled={busy} className="glow-red w-full">{busy ? "Listing…" : "List tag"}</Button>
    </form>
  );
}

function UsernameForm({ profile, onDone }: { profile: any; onDone: () => void }) {
  const [form, setForm] = useState({ sale_type: "fixed" as "fixed" | "auction", price: 2500, duration_hours: 24 });
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const list = useServerFn(listUsernameForSale);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirm) return toast.error("Please confirm you understand");
    setBusy(true);
    try {
      await list({ data: { price: form.price, sale_type: form.sale_type, duration_hours: form.duration_hours } });
      toast.success("Username listed!");
      onDone();
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-md bg-primary/5 border border-primary/30 p-4">
        <div className="text-xs text-muted-foreground">Listing your username</div>
        <div className="text-3xl font-mono font-bold text-primary mt-1">@{profile?.username ?? "you"}</div>
        <p className="text-xs text-amber-300 mt-2">
          ⚠️ When sold, the buyer takes over <b>@{profile?.username}</b>. You'll be assigned an automatic placeholder username and can change it later (90-day cooldown applies).
        </p>
      </div>
      <SaleControls form={form} setForm={setForm} />
      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <Checkbox checked={confirm} onCheckedChange={(v) => setConfirm(!!v)} />
        <span>I understand I will lose this username permanently when it sells.</span>
      </label>
      <Button disabled={busy || !confirm} className="glow-red w-full">{busy ? "Listing…" : "List username"}</Button>
    </form>
  );
}

function BaddieForm({ user, onDone }: { user: any; onDone: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [price, setPrice] = useState<number>(2000);
  const [busy, setBusy] = useState(false);
  const list = useServerFn(listBaddieForSale);

  const q = useQuery({
    queryKey: ["my-baddies-listable", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_baddies" as any)
        .select("*, template:baddie_templates(*)")
        .eq("user_id", user!.id)
        .is("listing_id", null)
        .order("acquired_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const owned = (q.data ?? []) as any[];
  const chosen = owned.find((b) => b.id === selected);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return toast.error("Pick a Baddie");
    if (!Number.isFinite(price) || price < 100) return toast.error("Price must be ≥ 100 DICE");
    setBusy(true);
    try {
      await list({ data: { baddieId: selected, price: Math.round(price) } });
      toast.success("Baddie listed!");
      onDone();
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
    finally { setBusy(false); }
  }

  if (owned.length === 0) {
    return (
      <div className="rounded-md border border-border/60 p-5 text-sm text-muted-foreground">
        You don't own any unlisted Baddies. Open a case in <Link to="/baddies" className="text-primary underline">Baddies</Link>.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label>Choose a Baddie to sell</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1 max-h-72 overflow-y-auto pr-1">
          {owned.map((b) => {
            const t = b.template;
            const img = t.image_url ?? (t.id === "elias" ? eliasAsset.url : null);
            const active = selected === b.id;
            return (
              <button key={b.id} type="button" onClick={() => setSelected(b.id)}
                className={`text-left rounded-lg border p-2 transition ${active ? "border-primary bg-primary/10" : "border-border/60 hover:border-border"}`}>
                <div className="aspect-square rounded-md overflow-hidden bg-black/30 mb-1.5 grid place-items-center">
                  {img ? <img src={img} alt={`${b.name ?? t.name} baddie artwork`} className="w-full h-full object-cover" /> : <Sparkles className="size-6 opacity-70" />}
                </div>
                <div className="text-xs font-semibold truncate">{b.name ?? t.name}</div>
                <div className="text-[10px] capitalize text-muted-foreground">{t.rarity} · {t.income_per_hour}/h</div>
              </button>
            );
          })}
        </div>
      </div>

      {chosen && (
        <div className="rounded-md bg-primary/5 border border-primary/30 p-3 text-xs text-muted-foreground">
          While listed, this Baddie stays visible in your inventory but can't be collected from, sold, upgraded, or listed twice.
        </div>
      )}

      <div>
        <Label>Price (DICE)</Label>
        <Input type="number" min={100} value={price} onChange={(e) => setPrice(+e.target.value)} />
      </div>

      <Button disabled={busy || !selected} className="glow-red w-full">
        {busy ? "Listing…" : `List for ${price.toLocaleString()} DICE`}
      </Button>
    </form>
  );
}

