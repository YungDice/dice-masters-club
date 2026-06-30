import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo, useRef } from "react";
import { Sparkles, PackageOpen, Coins, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyProfile } from "@/hooks/use-profile";
import { isVipActive } from "@/lib/limits";
import { AppShell } from "@/components/dice/TopNav";
import { PageHeader } from "@/components/dice/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DiceBadge } from "@/components/dice/DiceBadge";
import { EmptyState } from "@/components/dice/EmptyState";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { fmt } from "@/lib/format";
import { toast } from "sonner";
import eliasAsset from "@/assets/baddies/elias.png.asset.json";

export const Route = createFileRoute("/baddies")({
  head: () => ({ meta: [{ title: "Baddie Cases — DICE" }] }),
  component: () => <AppShell><Page /></AppShell>,
});

const CASE_COST = 1000;

const RARITY_STYLE: Record<string, string> = {
  common:    "from-zinc-500/20 to-zinc-700/10 border-zinc-400/30 text-zinc-200",
  uncommon:  "from-emerald-500/20 to-emerald-700/10 border-emerald-400/40 text-emerald-200",
  rare:      "from-sky-500/20 to-sky-700/10 border-sky-400/40 text-sky-200",
  epic:      "from-fuchsia-500/20 to-fuchsia-700/10 border-fuchsia-400/40 text-fuchsia-200",
  legendary: "from-amber-400/30 to-rose-500/10 border-amber-300/60 text-amber-200",
  unreal:    "from-violet-500/30 via-cyan-400/20 to-fuchsia-500/20 border-cyan-300/60 text-cyan-100 shadow-[0_0_24px_-6px_rgba(34,211,238,0.55)]",
  elias:     "from-amber-300/40 via-black/40 to-amber-500/30 border-amber-200 text-amber-50 ring-2 ring-amber-300/70 shadow-[0_0_28px_-4px_rgba(252,211,77,0.75)]",
};

const RARITY_ORDER = ["common","uncommon","rare","epic","legendary","unreal","elias"];

function useTickingNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(t); }, [intervalMs]);
  return now;
}

function templateImage(t: { id?: string; image_url?: string | null }) {
  if (t.image_url) return t.image_url;
  if (t.id === "elias") return eliasAsset.url;
  return null;
}

function sellPriceFor(rate: number) {
  return Math.max(Math.floor(rate / 2), 1);
}

// Build a long reel ending with the winning template at a known index.
function buildReel(templates: any[], winning: any) {
  const weighted: any[] = [];
  for (const t of templates) {
    const w = Math.max(1, Math.round((t.weight ?? 1) / 20));
    for (let i = 0; i < w; i++) weighted.push(t);
  }
  if (weighted.length === 0) weighted.push(...templates);
  const REEL = 80;
  const out: any[] = [];
  for (let i = 0; i < REEL; i++) out.push(weighted[Math.floor(Math.random() * weighted.length)]);
  // Place the winning card well before the end so there's still reel to the right of the marker
  const winIndex = REEL - 12;
  out[winIndex] = winning;
  (out as any).__winIndex = winIndex;
  return out;
}

const CARD_W = 128; // px
const CARD_GAP = 12;
const CARD_TOTAL = CARD_W + CARD_GAP;

function Page() {
  const { user } = useAuth();
  const prof = useMyProfile(user?.id);
  const qc = useQueryClient();
  const isVip = isVipActive((prof.data as any)?.vip_until);
  const slotsBought = (prof.data as any)?.baddie_slots_bought ?? 0;
  const cap = Math.min(10, (isVip ? 4 : 2) + slotsBought);
  const [baseOpen, setBaseOpen] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [reveal, setReveal] = useState<any>(null);
  const [sellTarget, setSellTarget] = useState<any>(null);
  const now = useTickingNow(1000);

  // Reel state
  const [reel, setReel] = useState<any[] | null>(null);
  const [offset, setOffset] = useState(0);
  const [transition, setTransition] = useState("none");
  const reelViewportRef = useRef<HTMLDivElement>(null);

  const baddies = useQuery({
    queryKey: ["my-baddies", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_baddies" as any)
        .select("*, template:baddie_templates(*)")
        .eq("user_id", user!.id)
        .order("acquired_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const templates = useQuery({
    queryKey: ["baddie-templates"],
    queryFn: async () => {
      const { data } = await supabase.from("baddie_templates" as any).select("*");
      const list = (data ?? []) as any[];
      return list.sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
    },
  });

  const totalWeight = useMemo(
    () => (templates.data ?? []).reduce((s: number, t: any) => s + (t.weight ?? 0), 0) || 1,
    [templates.data]
  );
  const count = (baddies.data ?? []).length;

  async function openCase() {
    if (!user || rolling) return;
    if (count >= cap) { toast.error(`Baddie Base full (${count}/${cap})`); return; }
    setRolling(true);
    setReveal(null);
    try {
      // Decide result on the server FIRST.
      const { data, error } = await supabase.rpc("open_baddie_case_tx" as any);
      if (error) throw error;
      const row: any = Array.isArray(data) ? data[0] : data;

      // Find the full template for the winning result (for weight/etc.)
      const winningTpl = (templates.data ?? []).find((t: any) => t.id === row.template_id) ?? {
        id: row.template_id, name: row.name, rarity: row.rarity,
        income_per_hour: row.income_per_hour, image_url: row.image_url, weight: 1,
      };
      const newReel = buildReel(templates.data ?? [], winningTpl);
      setReel(newReel);
      setTransition("none");
      setOffset(0);

      // Trigger animation on next frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const viewport = reelViewportRef.current;
          const vpW = viewport?.clientWidth ?? 600;
          const centerOffset = vpW / 2 - CARD_W / 2;
          const winIndex = (newReel as any).__winIndex ?? (newReel.length - 12);
          const target = winIndex * CARD_TOTAL - centerOffset
            + (Math.random() * 40 - 20); // tiny jitter
          setTransition("transform 5.2s cubic-bezier(0.08, 0.82, 0.17, 1)");
          setOffset(-target);
        });
      });

      // Settle after the CSS transition completes
      setTimeout(() => {
        setReveal(row);
        qc.invalidateQueries({ queryKey: ["my-baddies"] });
        qc.invalidateQueries({ queryKey: ["wallet"] });
        setRolling(false);
      }, 5400);
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (/insufficient/i.test(msg)) toast.error("Not enough DICE — case costs 1,000 DICE.");
      else toast.error(msg || "Failed to open case");
      setRolling(false);
      setReel(null);
    }
  }

  async function collect(id: string) {
    try {
      const { data, error } = await supabase.rpc("collect_baddie_tx" as any, { _baddie_id: id });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      toast.success(`Collected +${fmt(row.amount)} DICE`);
      qc.invalidateQueries({ queryKey: ["my-baddies"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e: any) { toast.error(e.message); }
  }

  async function confirmSell() {
    if (!sellTarget) return;
    const id = sellTarget.id;
    setSellTarget(null);
    try {
      const { data, error } = await supabase.rpc("sell_baddie_tx" as any, { _baddie_id: id });
      if (error) throw error;
      const row: any = Array.isArray(data) ? data[0] : data;
      toast.success(`Sold for +${fmt(row?.price ?? 0)} DICE`);
      qc.invalidateQueries({ queryKey: ["my-baddies"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e: any) { toast.error(e.message ?? "Failed to sell"); }
  }

  async function buySlot() {
    try {
      const { error } = await supabase.rpc("buy_baddie_slot_tx" as any);
      if (error) throw error;
      toast.success("Slot purchased! +1 Baddie capacity");
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (/insufficient/i.test(msg)) toast.error("Not enough DICE — slot costs 25,000 DICE.");
      else if (/max baddie slots/i.test(msg)) toast.error("Maximum 10 baddie slots reached.");
      else toast.error(msg || "Failed to buy slot");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Sparkles}
        title="Baddie Cases"
        subtitle="Unbox a Baddie to earn passive DICE income. Collect manually whenever you like."
        actions={
          <Button variant="outline" onClick={() => setBaseOpen(true)}>
            <PackageOpen className="size-4 mr-1" />Baddie Base ({count}/{cap})
          </Button>
        }
      />

      {/* The Case */}
      <Card className="glass p-6">
        <div className="grid md:grid-cols-[1fr_320px] gap-6 items-center">
          <div>
            <h2 className="font-display text-xl font-bold mb-2">Mystery Baddie Case</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Open a case to unbox a Baddie of random rarity. Higher rarities pay more DICE per hour.
              Unclaimed income caps at 24 hours per Baddie to keep things fair.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-4">
              {(templates.data ?? []).map((t: any) => {
                const pct = (t.weight / totalWeight) * 100;
                const pctText = pct >= 1 ? `${pct.toFixed(0)}%` : `${pct.toFixed(1)}%`;
                const img = templateImage(t);
                return (
                  <div key={t.id} className={`rounded-lg border bg-gradient-to-br p-2 text-xs ${RARITY_STYLE[t.rarity] ?? RARITY_STYLE.common}`}>
                    {img ? (
                      <div className="aspect-square w-full rounded-md overflow-hidden mb-1 ring-1 ring-white/10">
                        <img src={img} alt={t.name} className="w-full h-full object-cover" loading="lazy" />
                      </div>
                    ) : null}
                    <div className="font-semibold truncate">{t.name}</div>
                    <div className="opacity-80 capitalize">{t.rarity}</div>
                    <div className="opacity-80">{t.income_per_hour}/h</div>
                    <div className="font-bold mt-0.5">{pctText}</div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-3">
              <DiceBadge size="lg" amount={CASE_COST} />
              <Button onClick={openCase} disabled={rolling || count >= cap} className="glow-red">
                {rolling ? "Rolling…" : count >= cap ? <><Lock className="size-4 mr-1" />Base full</> : "Open case"}
              </Button>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Base capacity: <b>{cap}</b> {isVip ? "(VIP)" : "(upgrade to VIP for 4 slots)"}
            </div>
          </div>
          <div className="relative aspect-square rounded-2xl bg-gradient-to-br from-primary/30 to-fuchsia-700/20 border border-primary/40 grid place-items-center overflow-hidden">
            <div className={`absolute inset-0 ${rolling ? "animate-pulse" : ""} bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.12),transparent_60%)]`} />
            <PackageOpen className={`size-28 text-primary ${rolling ? "animate-bounce" : ""}`} />
          </div>
        </div>

        {/* CS-style reel */}
        {(rolling || reel) && (
          <div className="mt-6">
            <div
              ref={reelViewportRef}
              className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-black/60 py-3"
              style={{ height: CARD_W + 28 }}
            >
              {/* center marker */}
              <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center">
                <div className="w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-amber-300" />
                <div className="flex-1 w-[2px] bg-gradient-to-b from-amber-300/80 via-amber-300/30 to-amber-300/80" />
                <div className="w-0 h-0 border-l-8 border-r-8 border-b-8 border-l-transparent border-r-transparent border-b-amber-300" />
              </div>
              {/* gradient edges */}
              <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-black to-transparent z-[5]" />
              <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-black to-transparent z-[5]" />

              <div
                className="flex h-full will-change-transform"
                style={{
                  gap: CARD_GAP,
                  transform: `translate3d(${offset}px,0,0)`,
                  transition,
                }}
              >
                {(reel ?? []).map((t: any, i: number) => {
                  const img = templateImage(t);
                  return (
                    <div
                      key={i}
                      className={`shrink-0 rounded-lg border bg-gradient-to-br p-2 ${RARITY_STYLE[t.rarity] ?? RARITY_STYLE.common}`}
                      style={{ width: CARD_W }}
                    >
                      <div className="aspect-square w-full rounded-md overflow-hidden mb-1 ring-1 ring-white/10 bg-black/30">
                        {img ? (
                          <img src={img} alt={t.name} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full grid place-items-center"><Sparkles className="size-7 opacity-80" /></div>
                        )}
                      </div>
                      <div className="text-xs font-semibold truncate">{t.name}</div>
                      <div className="text-[10px] capitalize opacity-80">{t.rarity}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Baddie Base modal */}
      <Dialog open={baseOpen} onOpenChange={setBaseOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Your Baddie Base ({count}/{cap})</DialogTitle></DialogHeader>
          {count === 0 ? (
            <EmptyState icon={PackageOpen} title="Empty base" description="Open a case to recruit your first Baddie." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {(baddies.data ?? []).map((b: any) => {
                const t = b.template;
                const secs = Math.min(Math.floor((now - new Date(b.last_collected_at).getTime()) / 1000), 24 * 3600);
                const pending = Math.floor((t.income_per_hour * secs) / 3600);
                const img = templateImage(t);
                const price = sellPriceFor(t.income_per_hour);
                return (
                  <div key={b.id} className={`rounded-xl border bg-gradient-to-br p-3 ${RARITY_STYLE[t.rarity] ?? RARITY_STYLE.common}`}>
                    <div className="flex items-center gap-3 mb-2">
                      {img ? (
                        <img src={img} alt={t.name} className="size-14 rounded-md object-cover ring-1 ring-white/10" loading="lazy" />
                      ) : (
                        <div className="size-14 rounded-md grid place-items-center bg-white/5"><Sparkles className="size-6 opacity-80" /></div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-display font-semibold truncate">{b.name ?? t.name}</div>
                        <div className="text-xs capitalize opacity-80">{t.rarity} · {t.income_per_hour}/h</div>
                      </div>
                      <Coins className="size-5 opacity-80" />
                    </div>
                    <div className="text-sm mb-2">Pending: <b>{fmt(pending)} DICE</b></div>
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" onClick={() => collect(b.id)} disabled={pending <= 0}>Collect</Button>
                      <Button size="sm" variant="outline" onClick={() => setSellTarget({ ...b, template: t, price })}>
                        Sell · {fmt(price)} DICE
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Sell confirm modal */}
      <Dialog open={!!sellTarget} onOpenChange={(o) => !o && setSellTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Sell this Baddie?</DialogTitle>
            <DialogDescription>
              This permanently removes <b>{sellTarget?.name ?? sellTarget?.template?.name}</b> from your Baddie Base.
              Any uncollected income will be lost. You will receive <b>{fmt(sellTarget?.price ?? 0)} DICE</b>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSellTarget(null)}>Cancel</Button>
            <Button onClick={confirmSell}>Sell for {fmt(sellTarget?.price ?? 0)} DICE</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reveal modal */}
      <Dialog open={!!reveal} onOpenChange={(o) => !o && setReveal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Baddie!</DialogTitle></DialogHeader>
          {reveal && (
            <div className={`rounded-xl border bg-gradient-to-br p-6 text-center ${RARITY_STYLE[reveal.rarity] ?? RARITY_STYLE.common}`}>
              {templateImage({ id: reveal.template_id, image_url: reveal.image_url }) ? (
                <img
                  src={templateImage({ id: reveal.template_id, image_url: reveal.image_url })!}
                  alt={reveal.name}
                  className="mx-auto mb-3 size-40 rounded-xl object-cover ring-2 ring-white/20"
                />
              ) : (
                <Sparkles className="size-12 mx-auto mb-2" />
              )}
              <div className="font-display text-2xl font-bold">{reveal.name}</div>
              <div className="capitalize opacity-80 mb-2">{reveal.rarity}</div>
              <div className="text-sm">{reveal.income_per_hour} DICE / hour</div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
