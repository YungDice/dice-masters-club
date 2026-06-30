import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmt } from "@/lib/format";
import { toast } from "sonner";

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
};

function useTickingNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(t); }, [intervalMs]);
  return now;
}

function Page() {
  const { user } = useAuth();
  const prof = useMyProfile(user?.id);
  const qc = useQueryClient();
  const isVip = isVipActive((prof.data as any)?.vip_until);
  const cap = isVip ? 4 : 2;
  const [baseOpen, setBaseOpen] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [reveal, setReveal] = useState<any>(null);
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
      const { data } = await supabase.from("baddie_templates" as any).select("*").order("income_per_hour");
      return data ?? [];
    },
  });

  const count = (baddies.data ?? []).length;

  async function openCase() {
    if (!user) return;
    if (count >= cap) { toast.error(`Baddie Base full (${count}/${cap})`); return; }
    setRolling(true);
    try {
      const { data, error } = await supabase.rpc("open_baddie_case_tx" as any);
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setReveal(row);
      qc.invalidateQueries({ queryKey: ["my-baddies"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e: any) { toast.error(e.message); } finally { setRolling(false); }
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

  async function release(id: string) {
    if (!window.confirm("Release this Baddie? This is permanent.")) return;
    const { error } = await supabase.from("user_baddies" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Baddie released");
    qc.invalidateQueries({ queryKey: ["my-baddies"] });
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
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
              {(templates.data ?? []).map((t: any) => (
                <div key={t.id} className={`rounded-lg border bg-gradient-to-br p-2 text-xs ${RARITY_STYLE[t.rarity]}`}>
                  <div className="font-semibold truncate">{t.name}</div>
                  <div className="opacity-80 capitalize">{t.rarity}</div>
                  <div className="opacity-80">{t.income_per_hour}/h</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <DiceBadge size="lg" amount={CASE_COST} />
              <Button onClick={openCase} disabled={rolling || count >= cap} className="glow-red">
                {rolling ? "Opening…" : count >= cap ? <><Lock className="size-4 mr-1" />Base full</> : "Open case"}
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
                return (
                  <div key={b.id} className={`rounded-xl border bg-gradient-to-br p-3 ${RARITY_STYLE[t.rarity]}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="font-display font-semibold">{b.name ?? t.name}</div>
                        <div className="text-xs capitalize opacity-80">{t.rarity} · {t.income_per_hour}/h</div>
                      </div>
                      <Coins className="size-5 opacity-80" />
                    </div>
                    <div className="text-sm mb-2">Pending: <b>{fmt(pending)} DICE</b></div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => collect(b.id)} disabled={pending <= 0}>Collect</Button>
                      <Button size="sm" variant="outline" onClick={() => release(b.id)}>Release</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reveal modal */}
      <Dialog open={!!reveal} onOpenChange={(o) => !o && setReveal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Baddie!</DialogTitle></DialogHeader>
          {reveal && (
            <div className={`rounded-xl border bg-gradient-to-br p-6 text-center ${RARITY_STYLE[reveal.rarity]}`}>
              <Sparkles className="size-12 mx-auto mb-2" />
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
