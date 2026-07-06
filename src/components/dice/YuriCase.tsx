import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyProfile, useWallet } from "@/hooks/use-profile";
import { isVipActive } from "@/lib/limits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DiceBadge } from "@/components/dice/DiceBadge";
import { EmptyState } from "@/components/dice/EmptyState";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { fmt } from "@/lib/format";
import { toast } from "sonner";
import { Heart, Sparkles, PackageOpen, X, Users2, Coins, Crown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const RARITY_STYLE: Record<string, string> = {
  common:    "from-zinc-500/20 to-zinc-700/10 border-zinc-400/30 text-zinc-200",
  uncommon:  "from-emerald-500/20 to-emerald-700/10 border-emerald-400/40 text-emerald-200",
  rare:      "from-sky-500/20 to-sky-700/10 border-sky-400/40 text-sky-200",
  epic:      "from-fuchsia-500/20 to-fuchsia-700/10 border-fuchsia-400/40 text-fuchsia-200",
  legendary: "from-amber-400/30 to-rose-500/10 border-amber-300/60 text-amber-200",
};
const CASE_COST = 1200;
const DUO_CAP = 240000;

type Yuri = {
  id: string;
  user_id: string;
  template_id: string;
  case_slot: number | null;
  acquired_at: string;
  last_collected_at: string;
  template?: { id: string; name: string; rarity: string; income_per_hour: number; image_url: string | null };
};

export function YuriCase() {
  const { user } = useAuth();
  const walletQ = useWallet(user?.id);
  const prof = useMyProfile(user?.id);
  const qc = useQueryClient();
  const [rolling, setRolling] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const [placeTarget, setPlaceTarget] = useState<{ slot: number } | null>(null);
  const [unpairConfirm, setUnpairConfirm] = useState<{ group: number } | null>(null);
  const [sellTarget, setSellTarget] = useState<any>(null);

  const isVip = isVipActive((prof.data as any)?.vip_until);
  const autosellList: string[] = (prof.data as any)?.yuri_autosell_rarities ?? [];

  const yuriQ = useQuery({
    queryKey: ["my-yuri", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_yuri" as any)
        .select("*, template:yuri_templates(*)")
        .eq("user_id", user!.id)
        .order("acquired_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Yuri[];
    },
  });

  const templatesQ = useQuery({
    queryKey: ["yuri-templates"],
    queryFn: async () => {
      const { data } = await supabase.from("yuri_templates" as any).select("*");
      return (data ?? []) as any[];
    },
  });

  const list = yuriQ.data ?? [];
  const bySlot = useMemo(() => {
    const m: Record<number, Yuri | null> = {};
    for (let i = 1; i <= 8; i++) m[i] = null;
    for (const y of list) if (y.case_slot) m[y.case_slot] = y;
    return m;
  }, [list]);
  const inventory = useMemo(() => list.filter((y) => !y.case_slot), [list]);
  const balance = Number((walletQ.data as any)?.balance ?? 0);

  async function openCase(count: number) {
    if (!user || rolling) return;
    if (balance < CASE_COST * count) return toast.error(`Need ${fmt(CASE_COST * count)} DICE`);
    setRolling(true);
    setResults(null);
    try {
      const { data, error } = await supabase.rpc("open_yuri_case" as any, { _count: count });
      if (error) throw error;
      const rows = (Array.isArray(data) ? data : []) as any[];
      const t = templatesQ.data ?? [];
      const hydrated = rows.map((r: any) => ({
        ...r,
        template: t.find((x: any) => x.id === r.template_id),
      }));

      // VIP autosell — sell rolls whose rarity is in the user's list
      let autosold = 0; let autoDice = 0;
      if (isVip && autosellList.length && hydrated.length) {
        const toSell = hydrated.filter((r: any) => autosellList.includes(r.template?.rarity));
        for (const r of toSell) {
          try {
            const { data: sd } = await supabase.rpc("sell_yuri_tx" as any, { _yuri_id: r.id });
            const row: any = Array.isArray(sd) ? sd[0] : sd;
            autoDice += Number(row?.price ?? 0);
            autosold++;
            r.autosold = true;
            r.sell_price = row?.price ?? 0;
          } catch {}
        }
      }

      setResults(hydrated);
      if (autosold) toast.success(`Autosold ${autosold} for +${fmt(autoDice)} DICE`);
      qc.invalidateQueries({ queryKey: ["my-yuri"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setRolling(false);
    }
  }

  async function toggleAutosell(rarity: string, on: boolean) {
    const next = on ? Array.from(new Set([...autosellList, rarity])) : autosellList.filter((r) => r !== rarity);
    try {
      const { error } = await supabase.rpc("set_yuri_autosell_rarities" as any, { _rarities: next });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (e: any) { toast.error(e.message ?? "Failed to update autosell"); }
  }

  async function sellYuri(yuriId: string) {
    try {
      const { data, error } = await supabase.rpc("sell_yuri_tx" as any, { _yuri_id: yuriId });
      if (error) throw error;
      const row: any = Array.isArray(data) ? data[0] : data;
      toast.success(`Sold for +${fmt(row?.price ?? 0)} DICE`);
      setSellTarget(null);
      qc.invalidateQueries({ queryKey: ["my-yuri"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e: any) { toast.error(e.message ?? "Failed to sell"); }
  }

  async function place(yuriId: string, slot: number) {
    try {
      const { error } = await supabase.rpc("yuri_place" as any, { _yuri_id: yuriId, _slot: slot });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["my-yuri"] });
      setPlaceTarget(null);
    } catch (e: any) { toast.error(e.message); }
  }
  async function unplace(yuriId: string) {
    try {
      const { error } = await supabase.rpc("yuri_unplace" as any, { _yuri_id: yuriId });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["my-yuri"] });
    } catch (e: any) { toast.error(e.message); }
  }
  async function unpairDuo(group: number) {
    const s1 = group * 2 - 1;
    const s2 = group * 2;
    const a = bySlot[s1]; const b = bySlot[s2];
    try {
      if (a) await supabase.rpc("yuri_unplace" as any, { _yuri_id: a.id });
      if (b) await supabase.rpc("yuri_unplace" as any, { _yuri_id: b.id });
      qc.invalidateQueries({ queryKey: ["my-yuri"] });
      setUnpairConfirm(null);
      toast.success("Duo separated");
    } catch (e: any) { toast.error(e.message); }
  }
  async function collectDuo(group: number) {
    try {
      const { data, error } = await supabase.rpc("yuri_collect_duo" as any, { _group: group });
      if (error) throw error;
      const row: any = Array.isArray(data) ? data[0] : data;
      toast.success(`+${fmt(row?.amount ?? 0)} DICE`);
      qc.invalidateQueries({ queryKey: ["my-yuri"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e: any) { toast.error(e.message); }
  }

  const now = Date.now();

  return (
    <div className="space-y-5">
      <Card className="glass p-6">
        <div className="flex flex-col md:flex-row md:items-center gap-4 md:justify-between">
          <div>
            <h2 className="font-display text-xl font-bold flex items-center gap-2">
              <Heart className="size-5 text-pink-300" />Yuri Case
            </h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-lg">
              Roll for Yuri girls and pair them into duos. 8 case slots · 4 duos · a duo only earns DICE when both slots are filled — mixed rarities are allowed.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <DiceBadge size="lg" amount={CASE_COST} />
            {[1, 5, 10].map((n) => (
              <Button key={n} disabled={rolling || balance < CASE_COST * n} onClick={() => openCase(n)} className={n === 1 ? "glow-red" : ""} variant={n === 1 ? "default" : "outline"}>
                {rolling ? "Rolling…" : `Open x${n}`}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      {/* Reveal */}
      <AnimatePresence>
        {results && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card className="glass p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-lg font-bold">You pulled {results.length} Yuri girl{results.length > 1 ? "s" : ""}</h3>
                <Button variant="ghost" size="sm" onClick={() => setResults(null)}>Close</Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {results.map((r: any, i: number) => (
                  <motion.div
                    key={i}
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: i * 0.08 }}
                    className={`rounded-xl border bg-gradient-to-br p-3 ${RARITY_STYLE[r.template?.rarity] ?? RARITY_STYLE.common}`}
                  >
                    <div className="aspect-square rounded-md overflow-hidden mb-2 bg-black/30 grid place-items-center ring-1 ring-white/10">
                      {r.template?.image_url
                        ? <img src={r.template.image_url} alt={r.template.name} className="w-full h-full object-cover" />
                        : <Heart className="size-8 text-pink-300/80" />}
                    </div>
                    <div className="font-semibold truncate">{r.template?.name}</div>
                    <div className="text-[11px] capitalize opacity-80">{r.template?.rarity} · {r.template?.income_per_hour}/h</div>
                  </motion.div>
                ))}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Case slots — 4 duo pairs */}
      <Card className="glass p-5">
        <h3 className="font-display font-semibold mb-3 flex items-center gap-2"><Users2 className="size-4" />Duos</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {[1, 2, 3, 4].map((g) => {
            const s1 = g * 2 - 1; const s2 = g * 2;
            const a = bySlot[s1]; const b = bySlot[s2];
            const complete = !!(a && b);
            const rateA = a?.template?.income_per_hour ?? 0;
            const rateB = b?.template?.income_per_hour ?? 0;
            const combined = rateA + rateB;
            const secs = complete
              ? Math.min(30 * 24 * 3600, Math.floor((now - Math.max(new Date(a!.last_collected_at).getTime(), new Date(b!.last_collected_at).getTime())) / 1000))
              : 0;
            const pending = complete ? Math.min(Math.floor((combined * secs) / 3600), DUO_CAP) : 0;
            return (
              <div key={g} className={`rounded-xl border p-3 ${complete ? "border-pink-300/50 bg-gradient-to-br from-pink-500/10 to-fuchsia-500/5" : "border-border/60 bg-white/5"}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Duo {g}</div>
                  <div className={`text-[10px] px-1.5 py-0.5 rounded ${complete ? "bg-emerald-500/20 text-emerald-300" : "bg-white/5 text-muted-foreground"}`}>
                    {complete ? "Active" : (a || b) ? "Incomplete" : "Empty"}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[s1, s2].map((slot) => {
                    const y = bySlot[slot];
                    return (
                      <div key={slot}>
                        {y ? (
                          <div className={`relative rounded-lg border bg-gradient-to-br p-2 ${RARITY_STYLE[y.template?.rarity ?? "common"]}`}>
                            <button onClick={() => unplace(y.id)} className="absolute top-1 right-1 rounded-full bg-black/50 p-0.5 hover:bg-black/80" aria-label="Return to inventory">
                              <X className="size-3" />
                            </button>
                            <div className="aspect-square rounded overflow-hidden mb-1 bg-black/30 grid place-items-center">
                              {y.template?.image_url
                                ? <img src={y.template.image_url} alt={y.template.name} className="w-full h-full object-cover" />
                                : <Heart className="size-6 text-pink-300/80" />}
                            </div>
                            <div className="text-xs font-semibold truncate">{y.template?.name}</div>
                            <div className="text-[10px] opacity-80">{y.template?.income_per_hour}/h</div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setPlaceTarget({ slot })}
                            disabled={inventory.length === 0}
                            className="w-full aspect-[3/4] rounded-lg border border-dashed border-border/60 grid place-items-center text-xs text-muted-foreground hover:border-pink-300/60 hover:text-pink-200 transition disabled:opacity-40"
                          >
                            <div className="text-center">
                              <PackageOpen className="size-5 mx-auto mb-1 opacity-60" />
                              {inventory.length ? "Place girl" : "Empty"}
                            </div>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                  <div>
                    <div>Combined: <b>{fmt(combined)}/h</b></div>
                    {complete && <div className="text-muted-foreground">Pending {fmt(pending)} / {fmt(DUO_CAP)}</div>}
                  </div>
                  <div className="flex gap-1.5">
                    {complete && (
                      <>
                        <Button size="sm" disabled={pending <= 0} onClick={() => collectDuo(g)}>Collect</Button>
                        <Button size="sm" variant="outline" onClick={() => setUnpairConfirm({ group: g })}>Unpair</Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Inventory */}
      <Card className="glass p-5">
        <h3 className="font-display font-semibold mb-3">Yuri Inventory ({inventory.length})</h3>
        {inventory.length === 0 ? (
          <EmptyState icon={Sparkles} title="No Yuri girls yet" description="Open a Yuri Case to start building your duos." />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {inventory.map((y) => (
              <div key={y.id} className={`rounded-lg border bg-gradient-to-br p-2 ${RARITY_STYLE[y.template?.rarity ?? "common"]}`}>
                <div className="aspect-square rounded overflow-hidden mb-1 bg-black/30 grid place-items-center">
                  {y.template?.image_url
                    ? <img src={y.template.image_url} alt={y.template.name} className="w-full h-full object-cover" />
                    : <Heart className="size-6 text-pink-300/80" />}
                </div>
                <div className="text-xs font-semibold truncate">{y.template?.name}</div>
                <div className="text-[10px] opacity-80 capitalize">{y.template?.rarity} · {y.template?.income_per_hour}/h</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Place picker */}
      <Dialog open={!!placeTarget} onOpenChange={(o) => !o && setPlaceTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Place a Yuri girl in slot {placeTarget?.slot}</DialogTitle>
            <DialogDescription>Choose one from your inventory. She'll form or complete a duo with slot {placeTarget ? (placeTarget.slot % 2 === 1 ? placeTarget.slot + 1 : placeTarget.slot - 1) : ""}.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[50vh] overflow-y-auto">
            {inventory.map((y) => (
              <button
                key={y.id}
                onClick={() => placeTarget && place(y.id, placeTarget.slot)}
                className={`rounded-lg border bg-gradient-to-br p-2 hover:ring-2 hover:ring-pink-300 transition ${RARITY_STYLE[y.template?.rarity ?? "common"]}`}
              >
                <div className="aspect-square rounded overflow-hidden mb-1 bg-black/30 grid place-items-center">
                  {y.template?.image_url
                    ? <img src={y.template.image_url} alt={y.template.name} className="w-full h-full object-cover" />
                    : <Heart className="size-6 text-pink-300/80" />}
                </div>
                <div className="text-xs font-semibold truncate">{y.template?.name}</div>
                <div className="text-[10px] opacity-80">{y.template?.income_per_hour}/h</div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Unpair confirm */}
      <Dialog open={!!unpairConfirm} onOpenChange={(o) => !o && setUnpairConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Unpair duo {unpairConfirm?.group}?</DialogTitle>
            <DialogDescription>Both girls return to your inventory. Any uncollected pending DICE will be lost.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnpairConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => unpairConfirm && unpairDuo(unpairConfirm.group)}>Unpair</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
