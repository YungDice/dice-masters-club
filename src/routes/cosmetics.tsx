import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Palette, Coins, Check, Sparkles, Crown, Plus, Clock, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyProfile, useWallet } from "@/hooks/use-profile";
import {
  useCatalog, useMyCosmetics, RARITY_COLOR, TitleBadge, frameClasses,
  type Cosmetic,
} from "@/lib/cosmetics";
import { fmt } from "@/lib/format";

const SUBMISSION_FEE = 25000;

export const Route = createFileRoute("/cosmetics")({
  head: () => ({
    meta: [
      { title: "Cosmetics — DICE" },
      { name: "description", content: "Unlock titles, avatar frames, profile banners, chat emotes and dice skins." },
    ],
  }),
  component: () => <AppShell><CosmeticsPage /></AppShell>,
});

const KIND_LABEL: Record<Cosmetic["kind"], string> = {
  title: "Titles", frame: "Avatar Frames", emote: "Chat Emotes", dice_skin: "Dice Skins",
};
const KIND_ORDER: Cosmetic["kind"][] = ["title", "frame", "emote", "dice_skin"];

function CosmeticsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: profile } = useMyProfile(user?.id);
  const { data: wallet } = useWallet(user?.id);
  const catalog = useCatalog();
  const owned = useMyCosmetics(user?.id);
  const [tab, setTab] = useState<Cosmetic["kind"]>("title");

  const balance = Number((wallet as any)?.balance ?? 0);
  const vipActive = profile?.vip_until && new Date(profile.vip_until as any) > new Date();

  const equippedIds: Record<Cosmetic["kind"], string | null> = {
    title:  (profile as any)?.equipped_title_id ?? null,
    frame:  (profile as any)?.equipped_frame_id ?? null,
    emote:  null,
    dice_skin: (profile as any)?.equipped_dice_skin_id ?? null,
  };

  const grouped = useMemo(() => {
    const m: Record<string, Cosmetic[]> = { title: [], frame: [], emote: [], dice_skin: [] };
    for (const c of catalog.data ?? []) m[c.kind]?.push(c);
    return m;
  }, [catalog.data]);

  async function buy(c: Cosmetic) {
    try {
      const { error } = await supabase.rpc("buy_cosmetic_tx" as any, { _cosmetic_id: c.id });
      if (error) throw error;
      toast.success(`Unlocked ${c.name}`);
      qc.invalidateQueries({ queryKey: ["my-cosmetics"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e: any) {
      const msg = String(e.message ?? "");
      if (/insufficient/i.test(msg)) toast.error("Not enough DICE for this cosmetic.");
      else if (/vip only/i.test(msg)) toast.error("This item is VIP-only.");
      else if (/already owned/i.test(msg)) toast.error("You already own this item.");
      else toast.error(msg || "Purchase failed");
    }
  }

  async function equip(c: Cosmetic) {
    try {
      const { error } = await supabase.rpc("equip_cosmetic_tx" as any, { _cosmetic_id: c.id });
      if (error) throw error;
      toast.success(`Equipped ${c.name}`);
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["equipped-cosmetics"] });
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
  }

  async function unequip(kind: Cosmetic["kind"]) {
    try {
      const { error } = await supabase.rpc("unequip_cosmetic_tx" as any, { _kind: kind });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["equipped-cosmetics"] });
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
  }

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <Card className="glass p-5">
        <div className="flex items-center gap-3 flex-wrap">
          <Palette className="size-8 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-3xl font-bold">Cosmetics</h1>
            <p className="text-sm text-muted-foreground">
              Titles, avatar frames, banners, chat emotes and dice skins. Purely visual — no gameplay advantage.
              {" "}Submit your own for <b className="text-foreground">{fmt(SUBMISSION_FEE)} DICE</b> (refunded if rejected).
            </p>
          </div>
          <SubmitCosmeticButton balance={balance} />
        </div>
      </Card>

      {user?.id && <MySubmissions userId={user.id} />}

      <Tabs value={tab} onValueChange={(v) => setTab(v as Cosmetic["kind"])}>
        <TabsList className="w-full flex-wrap h-auto">
          {KIND_ORDER.map((k) => (
            <TabsTrigger key={k} value={k} className="flex-1 min-w-[110px]">{KIND_LABEL[k]}</TabsTrigger>
          ))}
        </TabsList>

        {KIND_ORDER.map((k) => (
          <TabsContent key={k} value={k} className="mt-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(grouped[k] ?? []).map((c) => {
                const isOwned = owned.data?.has(c.id) ?? false;
                const isEquipped = equippedIds[k] === c.id;
                const canAfford = balance >= c.price_dice;
                const vipBlocked = c.vip_only && !vipActive;
                return (
                  <Card key={c.id} className={`glass p-4 flex flex-col gap-3 border ${RARITY_COLOR[c.rarity]}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-display font-semibold flex items-center gap-1.5">
                          {c.name}
                          {c.vip_only && <Crown className="size-3.5 text-amber-300" />}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider opacity-70">{c.rarity}</div>
                      </div>
                      {isEquipped && <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/20 text-primary"><Check className="size-3" />Equipped</span>}
                    </div>

                    <CosmeticPreview c={c} />

                    <div className="flex items-center justify-between mt-auto pt-2">
                      <div className="text-sm inline-flex items-center gap-1">
                        <Coins className="size-3.5 text-primary" />
                        {c.price_dice > 0 ? fmt(c.price_dice) : (c.vip_only ? "VIP reward" : "Free")}
                      </div>
                      {isOwned ? (
                        c.kind === "emote" ? (
                          <span className="text-xs text-muted-foreground">Owned · use <code>{c.meta?.code}</code></span>
                        ) : isEquipped ? (
                          <Button size="sm" variant="outline" onClick={() => unequip(k)}>Unequip</Button>
                        ) : (
                          <Button size="sm" onClick={() => equip(c)}>Equip</Button>
                        )
                      ) : (
                        <Button size="sm" onClick={() => buy(c)} disabled={vipBlocked || !canAfford}>
                          {vipBlocked ? "VIP only" : !canAfford ? "Not enough" : "Unlock"}
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
              {catalog.isLoading && <div className="col-span-full text-sm text-muted-foreground py-6 text-center">Loading catalog…</div>}
              {!catalog.isLoading && !(grouped[k] ?? []).length && <div className="col-span-full text-sm text-muted-foreground py-6 text-center">No items yet.</div>}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <p className="text-xs text-muted-foreground">Cosmetics are purely visual and do not affect wagering, odds or payouts.</p>
    </div>
  );
}

function CosmeticPreview({ c }: { c: Cosmetic }) {
  const img = (c.meta as any)?.image_url as string | undefined;
  if (c.kind === "title") return <div className="flex items-center gap-2"><TitleBadge title={c} /><span className="text-xs text-muted-foreground">appears next to your name</span></div>;
  if (c.kind === "frame") return (
    <div className={`size-16 rounded-full bg-gradient-to-br from-primary/40 to-fuchsia-500/30 grid place-items-center overflow-hidden ${frameClasses(c)}`}>
      {img ? <img src={img} alt={c.name} className="w-full h-full object-cover" /> : <Sparkles className="size-6 opacity-80" />}
    </div>
  );
  if (c.kind === "emote") return (
    <div className="flex items-center gap-2">
      {img ? <img src={img} alt={c.name} className="size-8 object-contain" /> : <span className="text-3xl">{c.meta?.emoji}</span>}
      <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded">{c.meta?.code}</code>
    </div>
  );
  if (c.kind === "dice_skin") {
    const color = String(c.meta?.color ?? "#ef4444");
    const pip = String(c.meta?.pip ?? "#fff");
    if (img) return <div className="size-16 rounded-lg overflow-hidden border border-white/10"><img src={img} alt={c.name} className="w-full h-full object-cover" /></div>;
    return (
      <div className="size-16 rounded-lg grid place-items-center shadow-inner" style={{ background: color }}>
        <span className="size-3 rounded-full" style={{ background: pip }} />
      </div>
    );
  }
  return null;
}

// ============================================================
// User-submitted cosmetics
// ============================================================
function SubmitCosmeticButton({ balance }: { balance: number }) {
  const [open, setOpen] = useState(false);
  const canAfford = balance >= SUBMISSION_FEE;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={!canAfford} title={canAfford ? "" : `Requires ${fmt(SUBMISSION_FEE)} DICE`}>
        <Plus className="size-4 mr-1" /> Submit cosmetic
      </Button>
      <SubmitCosmeticDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function SubmitCosmeticDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [kind, setKind] = useState<Cosmetic["kind"]>("title");
  const [name, setName] = useState("");
  const [rarity, setRarity] = useState<Cosmetic["rarity"]>("rare");
  const [price, setPrice] = useState<number>(0);
  const [text, setText] = useState("");
  const [color, setColor] = useState("#f472b6");
  const [gradient, setGradient] = useState("linear-gradient(135deg,#f472b6,#8b5cf6)");
  const [emoji, setEmoji] = useState("🎲");
  const [code, setCode] = useState(":dice:");
  const [imageUrl, setImageUrl] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setKind("title"); setName(""); setRarity("rare"); setPrice(0);
    setText(""); setColor("#f472b6"); setGradient("linear-gradient(135deg,#f472b6,#8b5cf6)");
    setEmoji("🎲"); setCode(":dice:"); setImageUrl("");
  }

  async function uploadImage(file: File) {
    if (!user?.id) return toast.error("Sign in first");
    if (file.size > 3 * 1024 * 1024) return toast.error("Max 3 MB");
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${user.id}/cosmetic-${Date.now()}.${ext}`;
      const up = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
      if (up.error) throw up.error;
      const signed = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
      setImageUrl(signed.data?.signedUrl ?? "");
      toast.success("Image uploaded");
    } catch (e: any) { toast.error(e.message ?? "Upload failed"); }
    finally { setUploading(false); }
  }

  async function submit() {
    if (name.trim().length < 2) return toast.error("Name is too short");
    let meta: any = {};
    if (kind === "title") meta = { text: text || name, color };
    else if (kind === "banner") meta = imageUrl ? { image_url: imageUrl } : { gradient };
    else if (kind === "frame") meta = {
      ring: "ring-2 ring-primary/50",
      glow: "shadow-[0_0_20px_-5px_rgba(244,114,182,0.6)]",
      ...(imageUrl ? { image_url: imageUrl } : {}),
    };
    else if (kind === "emote") meta = {
      emoji, code: code.startsWith(":") ? code : `:${code}:`,
      ...(imageUrl ? { image_url: imageUrl } : {}),
    };
    else if (kind === "dice_skin") meta = {
      color, pip: "#ffffff",
      ...(imageUrl ? { image_url: imageUrl } : {}),
    };

    setSubmitting(true);
    try {
      const { error } = await (supabase.rpc as any)("submit_cosmetic", {
        _kind: kind, _name: name.trim(), _rarity: rarity, _meta: meta, _price_dice: price,
      });
      if (error) throw error;
      toast.success("Submitted! An admin will review your cosmetic.");
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["my-submissions"] });
      onOpenChange(false);
      reset();
    } catch (e: any) {
      toast.error(e.message ?? "Submission failed");
    } finally { setSubmitting(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submit your cosmetic</DialogTitle>
          <DialogDescription>
            Costs {fmt(SUBMISSION_FEE)} DICE. If rejected, the fee is refunded. If approved, the item goes live in the catalog and is granted to you for free.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="title">Title</SelectItem>
                  <SelectItem value="frame">Avatar Frame</SelectItem>
                  <SelectItem value="banner">Profile Banner</SelectItem>
                  <SelectItem value="emote">Chat Emote</SelectItem>
                  <SelectItem value="dice_skin">Dice Skin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Rarity</Label>
              <Select value={rarity} onValueChange={(v) => setRarity(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["common","uncommon","rare","epic","legendary","unreal"] as const).map((r) =>
                    <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder="e.g. Neon Vanguard" />
          </div>

          <div>
            <Label>Catalog price (DICE)</Label>
            <Input type="number" min={0} value={price} onChange={(e) => setPrice(Math.max(0, +e.target.value || 0))} />
            <p className="text-[11px] text-muted-foreground mt-1">Set to 0 for free items. Admins may adjust before approval.</p>
          </div>

          {kind === "title" && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Text</Label><Input value={text} onChange={(e) => setText(e.target.value.slice(0, 20))} placeholder={name || "TITLE"} /></div>
              <div><Label>Color</Label><Input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></div>
            </div>
          )}
          {kind === "banner" && (
            <div>
              <Label>CSS gradient</Label>
              <Input value={gradient} onChange={(e) => setGradient(e.target.value)} placeholder="linear-gradient(135deg,#f472b6,#8b5cf6)" />
              <div className="mt-2 h-14 rounded-md border border-white/10" style={{ background: gradient }} />
            </div>
          )}
          {kind === "emote" && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Emoji</Label><Input value={emoji} onChange={(e) => setEmoji(e.target.value.slice(0, 4))} /></div>
              <div><Label>Code</Label><Input value={code} onChange={(e) => setCode(e.target.value.toLowerCase().slice(0, 20))} /></div>
            </div>
          )}
          {kind === "dice_skin" && (
            <div><Label>Base color</Label><Input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></div>
          )}

          {(kind === "frame" || kind === "emote" || kind === "dice_skin" || kind === "banner") && (
            <div className="rounded-lg border border-dashed border-white/15 p-3 space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Upload image {kind === "frame" ? "(avatar frame)" : kind === "emote" ? "(chat emote)" : kind === "dice_skin" ? "(dice skin face)" : "(banner)"}
              </Label>
              <Input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                disabled={uploading}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadImage(f); }}
              />
              {uploading && <p className="text-xs text-muted-foreground">Uploading…</p>}
              {imageUrl && (
                <div className="flex items-center gap-3">
                  <img src={imageUrl} alt="preview" className="size-16 object-cover rounded border border-white/10" />
                  <Button size="sm" variant="ghost" onClick={() => setImageUrl("")}>Remove</Button>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">PNG/JPG/WebP/GIF · max 3 MB. Optional but recommended.</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="glow-red">
            {submitting ? "Submitting…" : `Submit for ${fmt(SUBMISSION_FEE)} DICE`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MySubmissions({ userId }: { userId: string }) {
  const q = useQuery({
    queryKey: ["my-submissions", userId],
    queryFn: async () => {
      const { data } = await supabase.from("cosmetic_submissions" as any).select("*").eq("submitter_id", userId).order("created_at", { ascending: false }).limit(10);
      return (data ?? []) as any[];
    },
  });
  if (!q.data?.length) return null;
  return (
    <Card className="glass p-4">
      <div className="text-sm font-semibold mb-2">Your submissions</div>
      <div className="space-y-2">
        {q.data.map((s) => (
          <div key={s.id} className="flex items-center gap-3 text-sm rounded border border-border/50 px-3 py-2">
            <span className="font-semibold truncate">{s.name}</span>
            <span className="text-xs text-muted-foreground capitalize">{s.kind} · {s.rarity}</span>
            <span className="ml-auto text-xs inline-flex items-center gap-1">
              {s.status === "pending" && <><Clock className="size-3 text-amber-400" /><span className="text-amber-300">Pending</span></>}
              {s.status === "approved" && <><Check className="size-3 text-emerald-400" /><span className="text-emerald-300">Approved</span></>}
              {s.status === "rejected" && <><X className="size-3 text-rose-400" /><span className="text-rose-300">Rejected · refunded</span></>}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

