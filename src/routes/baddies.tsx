import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, useMemo, useRef } from "react";
import { Sparkles, PackageOpen, Coins, Crown, Tag as TagIcon, Lock, Flame, Star, Zap } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyProfile, useWallet } from "@/hooks/use-profile";
import { isVipActive } from "@/lib/limits";
import { AppShell } from "@/components/dice/TopNav";
import { PageHeader } from "@/components/dice/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DiceBadge } from "@/components/dice/DiceBadge";
import { EmptyState } from "@/components/dice/EmptyState";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { fmt } from "@/lib/format";
import { toast } from "sonner";
import eliasAsset from "@/assets/baddies/elias.png.asset.json";
import { openBaddieCases, listBaddieForSale } from "@/lib/dice.functions";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/baddies")({
  head: () => ({ meta: [{ title: "Baddie Cases — DICE" }] }),
  component: () => <AppShell><Page /></AppShell>,
});

const CASE_COST = 1000;
const MULTIS = [1, 2, 3, 5, 10];

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
const TIER_MULT: Record<string, number> = { base: 1, shiny: 1.1, elite: 1.25, prestige: 1.5 };
const TIER_ORDER = ["base","shiny","elite","prestige"] as const;
const TIER_NEXT: Record<string, string | null> = { base:"shiny", shiny:"elite", elite:"prestige", prestige:null };
const TIER_META: Record<string, { label: string; icon: any; className: string }> = {
  base:     { label: "Base",     icon: Sparkles, className: "" },
  shiny:    { label: "Shiny",    icon: Star,     className: "ring-1 ring-cyan-300/60 shadow-[0_0_18px_-6px_rgba(103,232,249,0.6)]" },
  elite:    { label: "Elite",    icon: Zap,      className: "ring-2 ring-fuchsia-300/70 shadow-[0_0_22px_-4px_rgba(232,121,249,0.7)]" },
  prestige: { label: "Prestige", icon: Crown,    className: "ring-2 ring-amber-300 shadow-[0_0_28px_-4px_rgba(252,211,77,0.85)]" },
};
// DICE storage cap per baddie by tier — enforced server-side in collect_baddie_tx
const TIER_STORAGE_CAP: Record<string, number> = { base: 120000, shiny: 240000, elite: 360000, prestige: 480000 };
const effectiveRate = (rate: number, tier: string) => Math.floor((rate * (TIER_MULT[tier] ?? 1)));
const sellPriceFor = (rate: number, tier = "base") => Math.max(Math.floor(effectiveRate(rate, tier) / 2), 1);


function Page() {
  const { user } = useAuth();
  const prof = useMyProfile(user?.id);
  const walletQ = useWallet(user?.id);
  const qc = useQueryClient();
  const nav = useNavigate();
  const openMulti = useServerFn(openBaddieCases);
  const listOnMarket = useServerFn(listBaddieForSale);

  const isVip = isVipActive((prof.data as any)?.vip_until);
  const slotsBought = (prof.data as any)?.baddie_slots_bought ?? 0;
  const cap = Math.min(10, (isVip ? 4 : 2) + slotsBought);
  const balance = Number((walletQ.data as any)?.balance ?? 0);

  const [baseOpen, setBaseOpen] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [multi, setMulti] = useState<number>(1);
  const [results, setResults] = useState<any[] | null>(null);
  const [sellTarget, setSellTarget] = useState<any>(null);
  const [listTarget, setListTarget] = useState<any>(null);
  const [listPrice, setListPrice] = useState<number>(2000);
  const [fuseTarget, setFuseTarget] = useState<{ key: string; tier: string; templateName: string; ids: string[]; nextTier: string } | null>(null);

  const now = useTickingNow(1000);

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

  const autosellList: string[] = (prof.data as any)?.autosell_rarities ?? [];
  const totalCost = CASE_COST * multi;
  const canAfford = balance >= totalCost;

  async function openCase() {
    if (!user || rolling) return;
    if (!canAfford) { toast.error(`Not enough DICE (need ${fmt(totalCost)})`); return; }
    setRolling(true);
    setResults(null);
    try {
      const res: any = await openMulti({ data: { count: multi } });
      const rows: any[] = Array.isArray(res) ? res : (res?.rows ?? []);
      setResults(rows);
      const autos = rows.filter((r) => r.autosold);
      if (autos.length) toast.success(`Autosold ${autos.length} for +${fmt(autos.reduce((s, r) => s + (r.sell_price ?? 0), 0))} DICE`);
      qc.invalidateQueries({ queryKey: ["my-baddies"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (/insufficient/i.test(msg)) toast.error("Not enough DICE.");
      else toast.error(msg || "Failed to open");
    } finally {
      setRolling(false);
    }
  }

  async function toggleAutosell(rarity: string, on: boolean) {
    const next = on ? Array.from(new Set([...autosellList, rarity])) : autosellList.filter((r) => r !== rarity);
    try {
      const { error } = await supabase.rpc("set_autosell_rarities" as any, { _rarities: next });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (e: any) { toast.error(e.message ?? "Failed to update autosell"); }
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
  async function confirmList() {
    if (!listTarget) return;
    const id = listTarget.id;
    const price = Math.round(Number(listPrice));
    if (!Number.isFinite(price) || price < 100) return toast.error("Price must be ≥ 100 DICE");
    try {
      const res: any = await listOnMarket({ data: { baddieId: id, price } });
      toast.success("Listed on Marketplace!");
      setListTarget(null);
      qc.invalidateQueries({ queryKey: ["my-baddies"] });
      qc.invalidateQueries({ queryKey: ["listings"] });
      if (res?.listing_id) nav({ to: "/marketplace/$id", params: { id: res.listing_id } });
    } catch (e: any) { toast.error(e.message ?? "Failed to list"); }
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

  async function confirmFuse() {
    if (!fuseTarget) return;
    const ids = fuseTarget.ids;
    const nextTier = fuseTarget.nextTier;
    setFuseTarget(null);
    try {
      const { data, error } = await supabase.rpc("fuse_baddies_tx" as any, { _baddie_ids: ids });
      if (error) throw error;
      toast.success(`Fusion successful → ${nextTier.toUpperCase()} Baddie forged!`);
      qc.invalidateQueries({ queryKey: ["my-baddies"] });
    } catch (e: any) { toast.error(e.message ?? "Fusion failed"); }
  }

  const activeBaddies = (baddies.data ?? []) as any[];
  const listedCount = activeBaddies.filter((b) => b.listing_id).length;
  const inventoryCount = activeBaddies.length;
  const activeSlotUsage = Math.min(inventoryCount - listedCount, cap);

  // Fusion groups: template_id + tier -> available (unlisted, no trade) baddies
  const fusionGroups = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const b of activeBaddies) {
      if (b.listing_id || b.trade_id) continue;
      if (b.tier === "prestige") continue;
      const key = `${b.template_id}:${b.tier ?? "base"}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(b);
    }
    return Array.from(groups.entries())
      .filter(([, list]) => list.length >= 3)
      .map(([key, list]) => ({ key, list }));
  }, [activeBaddies]);



  return (
    <div className="space-y-5">
      <PageHeader
        icon={Sparkles}
        title="Baddie Cases"
        subtitle="Unbox Baddies for passive DICE income. Sell them, list them on the Marketplace, or feed them into the Upgrader."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setBaseOpen(true)}>
              <PackageOpen className="size-4 mr-1" />My Baddies ({inventoryCount})
            </Button>
          </div>
        }
      />

      {/* The Case */}
      <Card className="glass p-6">
        <div className="grid md:grid-cols-[1fr_320px] gap-6 items-center">
          <div>
            <h2 className="font-display text-xl font-bold mb-2">Mystery Baddie Case</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Every unboxed Baddie goes to your <b>Inventory</b>. Move them into active Base slots to earn passive DICE,
              sell them, list them on the Marketplace, or use them in the Upgrader.
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

            {/* Multiplier pills */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-xs text-muted-foreground mr-1">Open</span>
              {MULTIS.map((m) => (
                <button
                  key={m}
                  onClick={() => !rolling && setMulti(m)}
                  disabled={rolling}
                  className={`px-3 py-1.5 rounded-lg border text-sm font-semibold transition ${
                    multi === m
                      ? "border-primary bg-primary/20 text-primary shadow-[0_0_12px_-4px_rgba(255,60,60,0.6)]"
                      : "border-border/60 bg-white/5 hover:border-primary/40"
                  }`}
                >x{m}</button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <DiceBadge size="lg" amount={totalCost} />
              <Button onClick={openCase} disabled={rolling || !canAfford} className="glow-red">
                {rolling ? "Rolling…" : !canAfford ? <><Lock className="size-4 mr-1" />Not enough DICE</> : `Open x${multi}`}
              </Button>
              <div className="text-xs text-muted-foreground">
                Balance: <b>{fmt(balance)} DICE</b>
              </div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Active Base capacity: <b>{activeSlotUsage}</b> / {cap} {isVip ? "(VIP)" : ""} · Inventory is unlimited.
            </div>
          </div>
          <div className="relative aspect-square rounded-2xl bg-gradient-to-br from-primary/30 to-fuchsia-700/20 border border-primary/40 grid place-items-center overflow-hidden">
            <div className={`absolute inset-0 ${rolling ? "animate-pulse" : ""} bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.12),transparent_60%)]`} />
            <PackageOpen className={`size-28 text-primary ${rolling ? "animate-bounce" : ""}`} />
            {rolling && <div className="absolute bottom-3 text-xs uppercase tracking-widest text-primary">Rolling x{multi}…</div>}
          </div>
        </div>
      </Card>

      {/* Multi-reveal */}
      <AnimatePresence>
        {results && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card className="glass p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-display text-lg font-bold">
                    You unboxed {results.length} Baddie{results.length > 1 ? "s" : ""}
                  </h3>
                  <div className="text-xs text-muted-foreground">
                    New items are in your Inventory. Autosold rewards are already added to your wallet.
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setResults(null)}>Close</Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {results.map((r, i) => {
                  const img = templateImage({ id: r.template_id, image_url: r.image_url });
                  return (
                    <motion.div
                      key={i}
                      initial={{ scale: 0.6, opacity: 0, rotateY: 90 }}
                      animate={{ scale: 1, opacity: 1, rotateY: 0 }}
                      transition={{ delay: i * 0.08, type: "spring", stiffness: 220, damping: 18 }}
                      className={`rounded-xl border bg-gradient-to-br p-3 ${RARITY_STYLE[r.rarity] ?? RARITY_STYLE.common}`}
                    >
                      <div className="aspect-square rounded-md overflow-hidden mb-2 bg-black/30 grid place-items-center ring-1 ring-white/10">
                        {img
                          ? <img src={img} alt={r.name} className="w-full h-full object-cover" />
                          : <Sparkles className="size-8 opacity-80" />}
                      </div>
                      <div className="font-semibold truncate">{r.name}</div>
                      <div className="text-[11px] capitalize opacity-80">{r.rarity} · {r.income_per_hour}/h</div>
                      {r.autosold ? (
                        <div className="text-[11px] text-emerald-300 font-bold mt-1">Autosold +{fmt(r.sell_price ?? 0)}</div>
                      ) : (
                        <div className="text-[11px] text-muted-foreground mt-1">Added to Inventory</div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Baddie Base modal */}
      <Dialog open={baseOpen} onOpenChange={setBaseOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Your Baddie Inventory ({inventoryCount})</DialogTitle></DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-white/5 px-3 py-2">
            <div className="text-xs text-muted-foreground">
              Active Base cap: <b>{cap}</b> · Base: <b>{isVip ? 4 : 2}</b> · Bought: <b>{slotsBought}</b> · Max <b>10</b>
              <div className="opacity-70">Only Baddies within your active cap earn income; extras stay safe in inventory.</div>
            </div>
            <Button size="sm" variant="outline" onClick={buySlot} disabled={cap >= 10}>
              {cap >= 10 ? "Max slots" : "Buy +1 slot · 25,000 DICE"}
            </Button>
          </div>

          {/* VIP Autosell */}
          <div className={`rounded-lg border px-3 py-2 ${isVip ? "border-amber-300/40 bg-amber-300/5" : "border-border/60 bg-white/5 opacity-70"}`}>
            <div className="flex items-center gap-2 mb-1.5">
              <Crown className="size-4 text-amber-300" />
              <div className="text-sm font-semibold">Auto-sell by rarity {isVip ? "" : "(VIP only)"}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {RARITY_ORDER.map((r) => {
                const checked = autosellList.includes(r);
                return (
                  <label key={r} className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs capitalize cursor-pointer ${RARITY_STYLE[r]} ${!isVip ? "pointer-events-none" : ""}`}>
                    <Checkbox checked={checked} onCheckedChange={(v) => toggleAutosell(r, !!v)} disabled={!isVip} />
                    {r}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Fusion panel */}
          {fusionGroups.length > 0 && (
            <div className="rounded-lg border border-fuchsia-400/40 bg-gradient-to-br from-fuchsia-500/10 to-cyan-500/5 px-3 py-2 space-y-2">
              <div className="flex items-center gap-2">
                <Flame className="size-4 text-fuchsia-300" />
                <div className="text-sm font-semibold">Baddie Fusion — combine 3 identical to level up their tier</div>
              </div>
              <div className="text-[11px] text-muted-foreground -mt-1">Tiers: Base → Shiny (+10%) → Elite (+25%) → Prestige (+50%). Uses the 3 oldest matching Baddies.</div>
              <div className="flex flex-wrap gap-2">
                {fusionGroups.map(({ key, list }) => {
                  const sample = list[0];
                  const t = sample.template;
                  const tier = sample.tier ?? "base";
                  const nextTier = TIER_NEXT[tier]!;
                  const meta = TIER_META[nextTier];
                  const NextIcon = meta.icon;
                  return (
                    <Button
                      key={key}
                      size="sm"
                      variant="outline"
                      className="border-fuchsia-300/50 hover:bg-fuchsia-400/10"
                      onClick={() => setFuseTarget({
                        key,
                        tier,
                        templateName: t.name,
                        ids: list.slice(0, 3).map((x: any) => x.id),
                        nextTier,
                      })}
                    >
                      <NextIcon className="size-3.5 mr-1" />
                      Fuse 3× {t.name} <span className="opacity-60 mx-1">({tier})</span> → {meta.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          {inventoryCount === 0 ? (
            <EmptyState icon={PackageOpen} title="Empty inventory" description="Open a case to recruit your first Baddie." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 max-h-[60vh] overflow-y-auto pr-1">
              {activeBaddies.map((b: any) => {
                const t = b.template;
                const listed = !!b.listing_id;
                const tier: string = b.tier ?? "base";
                const tierMeta = TIER_META[tier];
                const TierIcon = tierMeta.icon;
                const rateEff = effectiveRate(t.income_per_hour, tier);
                const secs = Math.min(Math.floor((now - new Date(b.last_collected_at).getTime()) / 1000), 30 * 24 * 3600);
                const cap = TIER_STORAGE_CAP[tier] ?? TIER_STORAGE_CAP.base;
                const pending = listed ? 0 : Math.min(Math.floor((rateEff * secs) / 3600), cap);
                const atCap = !listed && pending >= cap;
                const img = templateImage(t);
                const price = sellPriceFor(t.income_per_hour, tier);
                return (
                  <div key={b.id} className={`rounded-xl border bg-gradient-to-br p-3 ${RARITY_STYLE[t.rarity] ?? RARITY_STYLE.common} ${tierMeta.className} ${listed ? "opacity-70" : ""}`}>
                    <div className="flex items-center gap-3 mb-2">
                      {img ? (
                        <img src={img} alt={t.name} className="size-14 rounded-md object-cover ring-1 ring-white/10" loading="lazy" />
                      ) : (
                        <div className="size-14 rounded-md grid place-items-center bg-white/5"><Sparkles className="size-6 opacity-80" /></div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-display font-semibold truncate flex items-center gap-1.5">
                          {b.name ?? t.name}
                          {tier !== "base" && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/40 border border-white/20">
                              <TierIcon className="size-3" />{tierMeta.label}
                            </span>
                          )}
                        </div>
                        <div className="text-xs capitalize opacity-80">
                          {t.rarity} · {rateEff}/h
                          {tier !== "base" && <span className="opacity-60"> (base {t.income_per_hour})</span>}
                        </div>
                        {listed && <div className="text-[10px] mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/20 text-primary"><TagIcon className="size-3" />Listed on Marketplace</div>}
                      </div>
                      <Coins className="size-5 opacity-80" />
                    </div>
                    <div className="text-sm mb-1">Pending: <b>{fmt(pending)}</b> <span className="opacity-70">/ {fmt(cap)} DICE</span></div>
                    <div className="h-1.5 rounded-full bg-black/30 overflow-hidden mb-2">
                      <div className={`h-full ${atCap ? "bg-amber-400" : "bg-primary"}`} style={{ width: `${Math.min(100, (pending / cap) * 100)}%` }} />
                    </div>
                    {atCap && <div className="text-[10px] text-amber-300 mb-1.5">Storage full — collect to keep earning.</div>}
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" onClick={() => collect(b.id)} disabled={pending <= 0 || listed}>Collect</Button>
                      <Button size="sm" variant="outline" onClick={() => setSellTarget({ ...b, template: t, price })} disabled={listed}>
                        Sell · {fmt(price)}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => { setListPrice(Math.max(price * 4, 500)); setListTarget({ ...b, template: t }); }} disabled={listed}>
                        <TagIcon className="size-3 mr-1" />Sell on Market
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
              Removes <b>{sellTarget?.name ?? sellTarget?.template?.name}</b> permanently. You will receive <b>{fmt(sellTarget?.price ?? 0)} DICE</b>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSellTarget(null)}>Cancel</Button>
            <Button onClick={confirmSell}>Sell for {fmt(sellTarget?.price ?? 0)} DICE</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* List on marketplace modal */}
      <Dialog open={!!listTarget} onOpenChange={(o) => !o && setListTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>List on Marketplace</DialogTitle>
            <DialogDescription>
              Sell <b>{listTarget?.name ?? listTarget?.template?.name}</b> to other players. While listed the Baddie cannot be collected from, sold, or used in the Upgrader.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Price (DICE) · minimum 100</label>
            <Input type="number" min={100} value={listPrice} onChange={(e) => setListPrice(+e.target.value)} />
            <div className="text-[11px] text-muted-foreground">Instant-sell value: {fmt(sellPriceFor(listTarget?.template?.income_per_hour ?? 0, listTarget?.tier ?? "base"))} DICE</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setListTarget(null)}>Cancel</Button>
            <Button onClick={confirmList}>List for {fmt(Math.round(Number(listPrice) || 0))} DICE</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fusion confirm modal */}
      <Dialog open={!!fuseTarget} onOpenChange={(o) => !o && setFuseTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Fuse 3 Baddies?</DialogTitle>
            <DialogDescription>
              This will consume 3× <b>{fuseTarget?.templateName}</b> ({fuseTarget?.tier}) and forge <b className="uppercase">{fuseTarget?.nextTier}</b> {fuseTarget?.templateName}.
              Fusion is permanent — the source Baddies cannot be recovered.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFuseTarget(null)}>Cancel</Button>
            <Button onClick={confirmFuse} className="glow-red">Fuse → {fuseTarget?.nextTier?.toUpperCase()}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
