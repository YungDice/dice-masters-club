import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Crown, PackageOpen, Sparkles, X, Coins } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DiceBadge } from "@/components/dice/DiceBadge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyProfile } from "@/hooks/use-profile";
import { collectBaddieIncome, openBaddieCase } from "@/lib/baddie.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/cases")({
  head: () => ({ meta: [{ title: "Cases — DICE" }] }),
  component: () => <AppShell><CasesPage /></AppShell>,
});

type Baddie = {
  id: string;
  name: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  income_per_hour: number;
  last_collected_at: string;
  created_at: string;
};

const rarityStyle: Record<Baddie["rarity"], string> = {
  common: "border-slate-400/30 text-slate-200",
  rare: "border-sky-400/40 text-sky-200",
  epic: "border-violet-400/40 text-violet-200",
  legendary: "border-amber-400/60 text-amber-200",
};

function readyIncome(baddie: Baddie) {
  const seconds = Math.min(48 * 3600, Math.max(0, (Date.now() - new Date(baddie.last_collected_at).getTime()) / 1000));
  return Math.floor((baddie.income_per_hour * seconds) / 3600);
}

function CasesPage() {
  const { user } = useAuth();
  const { data: profile } = useMyProfile(user?.id);
  const qc = useQueryClient();
  const openCase = useServerFn(openBaddieCase);
  const collect = useServerFn(collectBaddieIncome);
  const [baseOpen, setBaseOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [collecting, setCollecting] = useState<string | null>(null);

  const baddies = useQuery({
    queryKey: ["baddies", user?.id],
    enabled: !!user?.id,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("baddies")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Baddie[];
    },
  });

  const vip = !!(profile?.vip_until && new Date(profile.vip_until) > new Date());
  const cap = vip ? 4 : 2;
  const items = baddies.data ?? [];

  async function handleOpen() {
    setOpening(true);
    try {
      const result = await openCase({ data: undefined as never });
      toast.success(`${result.name} joined your Baddie Base!`);
      qc.invalidateQueries({ queryKey: ["baddies", user?.id] });
      setBaseOpen(true);
    } catch (error: any) {
      toast.error(error.message ?? "Could not open the case");
    } finally {
      setOpening(false);
    }
  }

  async function handleCollect(baddie: Baddie) {
    setCollecting(baddie.id);
    try {
      const result = await collect({ data: { baddieId: baddie.id } });
      if (result.amount > 0) {
        toast.success(`+${result.amount} DICE collected from ${baddie.name}`);
        qc.invalidateQueries({ queryKey: ["wallet"] });
      } else {
        toast("Not enough income has built up yet.");
      }
      qc.invalidateQueries({ queryKey: ["baddies", user?.id] });
    } catch (error: any) {
      toast.error(error.message ?? "Could not collect income");
    } finally {
      setCollecting(null);
    }
  }

  return (
    <div className="relative space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-primary">DICE Cases</div>
          <h1 className="font-display text-3xl font-bold mt-1">Meet your Baddies</h1>
          <p className="text-sm text-muted-foreground mt-1">Open cases, build a squad, then tap each Baddie to collect its passive DICE.</p>
        </div>
        <Button variant="outline" onClick={() => setBaseOpen(true)} className="border-primary/40">
          <PackageOpen className="mr-2 size-4" /> Baddie Base ({items.length}/{cap})
        </Button>
      </div>

      <Card className="glass overflow-hidden border-primary/30 p-6 md:p-8">
        <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/35">
              <Sparkles className="size-6 text-primary" />
            </div>
            <h2 className="font-display text-2xl font-bold mt-4">Baddie Case</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-xl">Every case rolls one random Baddie. Higher rarities earn more DICE per hour. Your collection stays capped at {cap} slots{vip ? " while VIP is active" : ""}.</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {["Common · 25/h", "Rare · 60/h", "Epic · 150/h", "Legendary · 400/h"].map((label) => (
                <span key={label} className="rounded-full border border-white/10 bg-black/20 px-3 py-1">{label}</span>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 items-stretch min-w-52">
            <Button onClick={handleOpen} disabled={opening || items.length >= cap} className="glow-red">
              <PackageOpen className="mr-2 size-4" /> {opening ? "Opening…" : "Open Baddie Case"}
            </Button>
            {items.length >= cap && <p className="text-xs text-center text-amber-300">Your Baddie Base is full.</p>}
            {!vip && <p className="text-xs text-center text-muted-foreground"><Crown className="inline size-3 text-amber-400 mr-1" />VIP unlocks 4 slots.</p>}
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((baddie) => <BaddieCard key={baddie.id} baddie={baddie} busy={collecting === baddie.id} onCollect={() => handleCollect(baddie)} />)}
        {Array.from({ length: Math.max(0, cap - items.length) }).map((_, index) => (
          <Card key={`empty-${index}`} className="glass min-h-52 border-dashed border-white/15 grid place-items-center p-5 text-center text-sm text-muted-foreground">
            <div><PackageOpen className="size-7 mx-auto mb-2 opacity-50" />Empty Baddie slot</div>
          </Card>
        ))}
      </div>

      {baseOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <Card className="glass w-full max-w-3xl max-h-[85vh] overflow-auto p-5 md:p-6 border-primary/30">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div><h2 className="font-display text-2xl font-bold">Baddie Base</h2><p className="text-sm text-muted-foreground">Collect from every Baddie yourself. Income banks for up to 48 hours.</p></div>
              <Button variant="ghost" size="icon" onClick={() => setBaseOpen(false)} aria-label="Close Baddie Base"><X className="size-5" /></Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((baddie) => <BaddieCard key={baddie.id} baddie={baddie} busy={collecting === baddie.id} onCollect={() => handleCollect(baddie)} />)}
              {items.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center sm:col-span-2">No Baddies yet. Open a case to start your base.</p>}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function BaddieCard({ baddie, onCollect, busy }: { baddie: Baddie; onCollect: () => void; busy: boolean }) {
  const income = readyIncome(baddie);
  return (
    <Card className={`glass p-4 border ${rarityStyle[baddie.rarity]} relative overflow-hidden`}>
      <div className="absolute -right-6 -top-6 size-24 rounded-full bg-primary/10 blur-2xl" />
      <div className="relative">
        <div className="flex items-center justify-between gap-2"><div className="font-display font-bold">{baddie.name}</div><span className="text-[10px] uppercase tracking-widest">{baddie.rarity}</span></div>
        <div className="mt-5 grid place-items-center rounded-xl border border-white/10 bg-black/20 h-20"><Sparkles className="size-8 text-primary" /></div>
        <div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>Passive income</span><span>{baddie.income_per_hour}/hour</span></div>
        <div className="mt-2 flex items-center justify-between"><DiceBadge size="sm" amount={income} /><span className="text-[11px] text-muted-foreground">ready</span></div>
        <Button size="sm" className="w-full mt-3" onClick={onCollect} disabled={busy || income <= 0}><Coins className="mr-1 size-3.5" />{busy ? "Collecting…" : "Collect income"}</Button>
      </div>
    </Card>
  );
}
