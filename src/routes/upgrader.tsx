import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/dice/TopNav";
import { PageHeader } from "@/components/dice/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sparkles, ArrowLeftRight, AlertTriangle, Check, X } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { upgradeBaddies } from "@/lib/dice.functions";
import eliasAsset from "@/assets/baddies/elias.png.asset.json";

export const Route = createFileRoute("/upgrader")({
  head: () => ({ meta: [{ title: "Baddie Upgrader — DICE" }] }),
  component: () => <AppShell><Page /></AppShell>,
});

const RARITY_ORDER = ["common","uncommon","rare","epic","legendary","unreal","elias"];
const RARITY_STYLE: Record<string, string> = {
  common: "border-zinc-400/40 text-zinc-200",
  uncommon: "border-emerald-400/50 text-emerald-200",
  rare: "border-sky-400/50 text-sky-200",
  epic: "border-fuchsia-400/50 text-fuchsia-200",
  legendary: "border-amber-300/60 text-amber-200",
  unreal: "border-cyan-300/70 text-cyan-100",
  elias: "border-amber-200 text-amber-50 ring-2 ring-amber-300/70",
};
function imgOf(t: any) {
  if (!t) return null;
  return t.image_url ?? (t.id === "elias" ? eliasAsset.url : null);
}

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const upgrade = useServerFn(upgradeBaddies);
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ success: boolean; awarded?: any } | null>(null);

  const templates = useQuery({
    queryKey: ["baddie-templates"],
    queryFn: async () => {
      const { data } = await supabase.from("baddie_templates" as any).select("*");
      return ((data ?? []) as any[]).sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
    },
  });

  const baddies = useQuery({
    queryKey: ["my-baddies", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_baddies" as any)
        .select("*, template:baddie_templates(*)")
        .eq("user_id", user!.id)
        .is("listing_id", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const owned = (baddies.data ?? []) as any[];
  const tmpls = (templates.data ?? []) as any[];
  const targetTpl = tmpls.find((t) => t.id === target);

  const materialSum = useMemo(() => {
    const sel = owned.filter((b) => selected.includes(b.id));
    return sel.reduce((s, b) => s + (b.template?.income_per_hour ?? 0) * 2, 0);
  }, [owned, selected]);

  const chance = useMemo(() => {
    if (!targetTpl || materialSum === 0) return 0;
    const targetVal = (targetTpl.income_per_hour ?? 0) * 2;
    const cap = targetTpl.rarity === "elias" ? 0.10 : targetTpl.rarity === "unreal" ? 0.35 : 0.95;
    const p = materialSum / (materialSum + targetVal * 2);
    return Math.max(0, Math.min(p, cap));
  }, [targetTpl, materialSum]);

  const chancePct = Math.round(chance * 1000) / 10;

  function toggleSel(id: string) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function runUpgrade() {
    if (!target || selected.length === 0) return;
    setConfirmOpen(false);
    setBusy(true);
    setResult(null);
    try {
      const res: any = await upgrade({ data: { targetTemplateId: target, materialBaddieIds: selected } });
      const row = Array.isArray(res) ? res[0] : res;
      const ok = !!row?.success;
      setResult({ success: ok, awarded: row?.awarded ?? null });
      if (ok) toast.success("Upgrade succeeded!");
      else toast.error("Upgrade failed — materials consumed.");
      setSelected([]);
      qc.invalidateQueries({ queryKey: ["my-baddies"] });
    } catch (e: any) { toast.error(e.message ?? "Upgrade error"); }
    finally { setBusy(false); }
  }

  const circ = 2 * Math.PI * 90;
  const dash = circ * chance;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ArrowLeftRight}
        title="Baddie Upgrader"
        subtitle="Feed owned Baddies as materials to try for a higher-tier target. Higher material value = higher chance. Failed attempts consume everything."
      />

      <Card className="glass p-5">
        <div className="grid md:grid-cols-[1fr_320px_1fr] gap-5 items-center">
          {/* Materials */}
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Materials · {selected.length} selected</div>
            {owned.length === 0 ? (
              <div className="rounded-md border border-border/60 p-4 text-sm text-muted-foreground">
                No Baddies available. Open a case first.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 max-h-80 overflow-y-auto pr-1">
                {owned.map((b) => {
                  const t = b.template; const active = selected.includes(b.id);
                  const img = imgOf(t);
                  return (
                    <button key={b.id} type="button" onClick={() => toggleSel(b.id)}
                      className={`rounded-lg border p-1.5 text-left transition ${active ? "border-primary bg-primary/10 ring-2 ring-primary/50" : `border-border/60 hover:border-border ${RARITY_STYLE[t.rarity] ?? ""}`}`}>
                      <div className="aspect-square rounded overflow-hidden bg-black/30 grid place-items-center mb-1">
                        {img ? <img src={img} className="w-full h-full object-cover" /> : <Sparkles className="size-5 opacity-70" />}
                      </div>
                      <div className="text-[10px] font-semibold truncate">{t.name}</div>
                      <div className="text-[9px] capitalize opacity-70">{t.rarity}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Chance dial */}
          <div className="flex flex-col items-center justify-center">
            <div className="relative w-56 h-56">
              <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
                <circle cx="100" cy="100" r="90" stroke="rgba(255,255,255,0.08)" strokeWidth="14" fill="none" />
                <motion.circle
                  cx="100" cy="100" r="90"
                  stroke="url(#grad)"
                  strokeWidth="14" fill="none" strokeLinecap="round"
                  strokeDasharray={circ}
                  animate={{ strokeDashoffset: circ - dash }}
                  transition={{ type: "spring", stiffness: 60, damping: 15 }}
                />
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#f97316" />
                    <stop offset="60%" stopColor="#eab308" />
                    <stop offset="100%" stopColor="#22c55e" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 grid place-items-center text-center">
                <div>
                  <div className="text-4xl font-display font-black bg-gradient-to-br from-amber-200 to-emerald-300 bg-clip-text text-transparent">{chancePct}%</div>
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground">success chance</div>
                </div>
              </div>
            </div>
            <Button
              className="mt-4 glow-red w-full"
              disabled={busy || !target || selected.length === 0}
              onClick={() => setConfirmOpen(true)}
            >
              {busy ? "Upgrading…" : "Upgrade"}
            </Button>
            <div className="text-[11px] text-amber-300/90 mt-2 inline-flex items-center gap-1">
              <AlertTriangle className="size-3" />Materials are consumed on both success and failure.
            </div>
          </div>

          {/* Target */}
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Target</div>
            <div className="grid grid-cols-3 gap-2 max-h-80 overflow-y-auto pr-1">
              {tmpls.map((t) => {
                const active = target === t.id;
                const img = imgOf(t);
                return (
                  <button key={t.id} type="button" onClick={() => setTarget(t.id)}
                    className={`rounded-lg border p-1.5 text-left transition ${active ? "border-primary bg-primary/10 ring-2 ring-primary/50" : `border-border/60 hover:border-border ${RARITY_STYLE[t.rarity] ?? ""}`}`}>
                    <div className="aspect-square rounded overflow-hidden bg-black/30 grid place-items-center mb-1">
                      {img ? <img src={img} className="w-full h-full object-cover" /> : <Sparkles className="size-5 opacity-70" />}
                    </div>
                    <div className="text-[10px] font-semibold truncate">{t.name}</div>
                    <div className="text-[9px] capitalize opacity-70">{t.rarity} · {t.income_per_hour}/h</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      {/* Result overlay */}
      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
            onClick={() => setResult(null)}
          >
            <motion.div
              initial={{ scale: 0.6, rotateY: 90 }} animate={{ scale: 1, rotateY: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 18 }}
              onClick={(e) => e.stopPropagation()}
              className={`rounded-2xl border-2 p-6 max-w-xs w-full text-center bg-background/95 ${result.success ? "border-emerald-400 shadow-[0_0_40px_-6px_rgba(52,211,153,0.6)]" : "border-rose-500 shadow-[0_0_40px_-6px_rgba(244,63,94,0.6)]"}`}
            >
              {result.success ? (
                <>
                  <Check className="size-14 mx-auto text-emerald-400 mb-2" />
                  <div className="font-display text-2xl font-bold mb-2">Upgrade Success!</div>
                  {result.awarded?.name && (
                    <>
                      {imgOf(result.awarded) && (
                        <img src={imgOf(result.awarded)!} className="size-32 rounded-lg mx-auto object-cover mb-2" />
                      )}
                      <div className="font-semibold">{result.awarded.name}</div>
                      <div className="text-xs capitalize text-muted-foreground">{result.awarded.rarity}</div>
                    </>
                  )}
                </>
              ) : (
                <>
                  <X className="size-14 mx-auto text-rose-500 mb-2" />
                  <div className="font-display text-2xl font-bold mb-2">Upgrade Failed</div>
                  <div className="text-sm text-muted-foreground">Your materials are gone. Better luck next time.</div>
                </>
              )}
              <Button className="mt-4 w-full" onClick={() => setResult(null)}>Close</Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm upgrade</DialogTitle>
            <DialogDescription>
              You will permanently consume <b>{selected.length}</b> Baddie{selected.length === 1 ? "" : "s"} for a <b>{chancePct}%</b> chance at
              <b> {targetTpl?.name}</b>. Materials are lost on both success and failure.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={runUpgrade} className="glow-red">Upgrade ({chancePct}%)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
