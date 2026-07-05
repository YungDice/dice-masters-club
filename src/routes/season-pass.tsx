import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useMemo, useEffect, useState } from "react";
import { Crown, Gift, Package, Sparkles, Lock, Check, Clock, Star, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyProfile } from "@/hooks/use-profile";
import { fmt } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/season-pass")({
  head: () => ({
    meta: [
      { title: "Season Pass — DICE" },
      { name: "description", content: "Earn XP, unlock tiers and claim Cases, DICE and VIP days every season. Free and VIP tracks." },
    ],
  }),
  component: () => <AppShell><SeasonPassPage /></AppShell>,
});

type Reward = { kind?: "dice" | "case_token" | "vip_days"; amount?: number };
type Tier = { tier: number; free_reward: Reward; vip_reward: Reward };
type Season = { id: string; name: string; starts_at: string; ends_at: string; xp_per_tier: number; tier_count: number };

function rewardLabel(r: Reward) {
  if (!r?.kind) return "—";
  if (r.kind === "dice") return `${fmt(r.amount ?? 0)} DICE`;
  if (r.kind === "case_token") return `${r.amount ?? 1}× Case`;
  if (r.kind === "vip_days") return `${r.amount ?? 1}d VIP`;
  return "—";
}
function RewardIcon({ r, className }: { r: Reward; className?: string }) {
  const cls = cn("h-5 w-5", className);
  if (r?.kind === "case_token") return <Package className={cls} />;
  if (r?.kind === "vip_days") return <Crown className={cls} />;
  if (r?.kind === "dice") return <Zap className={cls} />;
  return <Sparkles className={cls} />;
}

function useCountdown(iso?: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  if (!iso) return "";
  const diff = Math.max(0, new Date(iso).getTime() - now);
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function SeasonPassPage() {
  const { user } = useAuth();
  const { data: profile } = useMyProfile(user?.id);
  const qc = useQueryClient();
  const isVip = !!profile?.vip_until && new Date(profile.vip_until as any) > new Date();

  const season = useQuery({
    queryKey: ["season-current"],
    queryFn: async () => {
      const { data } = await supabase.from("seasons" as any).select("*").eq("active", true)
        .lte("starts_at", new Date().toISOString()).gte("ends_at", new Date().toISOString())
        .order("starts_at", { ascending: false }).limit(1).maybeSingle();
      return data as Season | null;
    },
  });

  const tiers = useQuery({
    queryKey: ["season-tiers", season.data?.id],
    enabled: !!season.data?.id,
    queryFn: async () => {
      const { data } = await supabase.from("season_tiers" as any).select("tier,free_reward,vip_reward")
        .eq("season_id", season.data!.id).order("tier");
      return (data ?? []) as unknown as Tier[];
    },
  });

  const progress = useQuery({
    queryKey: ["season-progress", season.data?.id, user?.id],
    enabled: !!season.data?.id && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("season_progress" as any).select("*")
        .eq("season_id", season.data!.id).eq("user_id", user!.id).maybeSingle();
      return data as { baseline_xp: number; bonus_xp: number } | null;
    },
  });

  const claims = useQuery({
    queryKey: ["season-claims", season.data?.id, user?.id],
    enabled: !!season.data?.id && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("season_claims" as any).select("tier,track")
        .eq("season_id", season.data!.id).eq("user_id", user!.id);
      return (data ?? []) as unknown as { tier: number; track: "free" | "vip" }[];
    },
  });

  const claimedSet = useMemo(() => {
    const s = new Set<string>();
    (claims.data ?? []).forEach((c) => s.add(`${c.tier}:${c.track}`));
    return s;
  }, [claims.data]);

  const seasonXp = useMemo(() => {
    if (!profile || !progress.data) return 0;
    const base = progress.data.baseline_xp ?? 0;
    const bonus = progress.data.bonus_xp ?? 0;
    return Math.max(0, ((profile as any).xp ?? 0) - base) + bonus;
  }, [profile, progress.data]);

  const currentTier = season.data ? Math.min(season.data.tier_count, Math.floor(seasonXp / season.data.xp_per_tier)) : 0;
  const nextTierXp = season.data ? (currentTier + 1) * season.data.xp_per_tier : 0;
  const xpIntoTier = season.data ? seasonXp - currentTier * season.data.xp_per_tier : 0;
  const pctToNext = season.data ? (xpIntoTier / season.data.xp_per_tier) * 100 : 0;

  const claim = useMutation({
    mutationFn: async ({ tier, track }: { tier: number; track: "free" | "vip" }) => {
      const { data, error } = await (supabase.rpc as any)("claim_season_reward_tx", { _tier: tier, _track: track });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Reward claimed: ${rewardLabel({ kind: data.kind, amount: data.amount })}`);
      qc.invalidateQueries({ queryKey: ["season-claims"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Claim failed"),
  });

  useEffect(() => {
    if (user && season.data && !progress.data && progress.isFetched) {
      (supabase.rpc as any)("ensure_season_progress").then(() => {
        qc.invalidateQueries({ queryKey: ["season-progress"] });
      });
    }
  }, [user, season.data?.id, progress.data, progress.isFetched, qc]);

  const endsIn = useCountdown(season.data?.ends_at);

  if (season.isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <Card className="p-10 text-center">
          <Sparkles className="mx-auto h-8 w-8 animate-pulse text-[color:var(--gold)]" />
          <div className="mt-3 text-sm text-muted-foreground">Loading current season…</div>
        </Card>
      </div>
    );
  }

  if (!season.data) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <Card className="p-10 text-center border-[color:var(--gold)]/25">
          <Crown className="mx-auto h-10 w-10 text-[color:var(--gold)]" />
          <h1 className="mt-3 font-display text-2xl font-bold">Season Pass</h1>
          <p className="mt-2 text-sm text-muted-foreground">No season is running right now. Check back soon!</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      {/* HERO */}
      <Card className="relative overflow-hidden border-[color:var(--gold)]/30">
        <div className="absolute inset-0 opacity-40" style={{
          background: "radial-gradient(80% 60% at 50% 0%, color-mix(in oklab, var(--gold) 35%, transparent), transparent 60%), linear-gradient(135deg, #180d20 0%, #0b0714 100%)",
        }} />
        <div className="absolute inset-0 opacity-30 mix-blend-overlay" style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)",
          backgroundSize: "8px 8px",
        }} />
        <div className="relative p-6 md:p-8 grid gap-6 md:grid-cols-[1fr_auto] items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[color:var(--gold)] font-semibold">
              <Crown className="h-4 w-4" /> Season Pass
              {isVip ? (
                <Badge className="ml-2 bg-[color:var(--gold)] text-black font-bold">VIP</Badge>
              ) : (
                <Badge variant="outline" className="ml-2">Free track</Badge>
              )}
            </div>
            <h1 className="mt-1 font-display text-3xl md:text-4xl font-black truncate">{season.data.name}</h1>
            <div className="mt-2 text-sm text-muted-foreground flex items-center gap-4 flex-wrap">
              <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" /> Ends in <b className="text-foreground">{endsIn}</b></span>
              <span className="inline-flex items-center gap-1"><Star className="h-4 w-4" /> {fmt(seasonXp)} season XP</span>
            </div>

            <div className="mt-5">
              <div className="flex items-end justify-between mb-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">Tier</span>
                  <span className="font-display text-3xl font-black text-[color:var(--gold)]">{currentTier}</span>
                  <span className="text-sm text-muted-foreground">/ {season.data.tier_count}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {currentTier >= season.data.tier_count
                    ? <span className="text-emerald-400 font-semibold">Max tier reached</span>
                    : <>Next: <b className="text-foreground">{fmt(nextTierXp - seasonXp)} XP</b></>}
                </div>
              </div>
              <div className="relative h-3 rounded-full bg-black/40 overflow-hidden border border-white/5">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, pctToNext)}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="h-full rounded-full"
                  style={{ background: "linear-gradient(90deg, color-mix(in oklab, var(--gold) 80%, white), var(--gold))", boxShadow: "0 0 12px color-mix(in oklab, var(--gold) 60%, transparent)" }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                <span>Tier {currentTier}</span>
                <span>Tier {Math.min(season.data.tier_count, currentTier + 1)}</span>
              </div>
            </div>
          </div>

          <div className="hidden md:flex flex-col items-center gap-2 shrink-0 min-w-[160px]">
            <div className="relative">
              <div className="absolute inset-0 rounded-full blur-2xl opacity-60" style={{ background: "radial-gradient(circle, color-mix(in oklab, var(--gold) 55%, transparent), transparent 65%)" }} />
              <div className="relative grid h-32 w-32 place-items-center rounded-full border-4 border-[color:var(--gold)]/50 bg-black/60">
                <div className="text-center">
                  <div className="text-[10px] uppercase tracking-widest text-[color:var(--gold)]/80">Tier</div>
                  <div className="font-display text-5xl font-black text-[color:var(--gold)] leading-none">{currentTier}</div>
                </div>
              </div>
            </div>
            {!isVip && (
              <p className="text-[11px] text-center text-muted-foreground max-w-[160px]">Get VIP to unlock the premium track & exclusive rewards.</p>
            )}
          </div>
        </div>
      </Card>

      {/* Legend */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-400" /> Claimed</span>
        <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-[color:var(--gold)]" /> Ready to claim</span>
        <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-white/20" /> Locked</span>
        <span className="ml-auto inline-flex items-center gap-1"><Crown className="h-3 w-3 text-[color:var(--gold)]" /> VIP reward</span>
      </div>

      {/* Progression track — horizontal scroll of tier columns */}
      {tiers.isLoading ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">Loading tiers…</Card>
      ) : (tiers.data ?? []).length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">No tiers configured for this season yet.</Card>
      ) : (
        <Card className="p-4 overflow-hidden">
          <div className="overflow-x-auto pb-2">
            {/* Row labels + tier columns as a single grid */}
            <div className="min-w-max">
              {/* Tier headers */}
              <div className="grid grid-flow-col auto-cols-[minmax(120px,1fr)] gap-3 items-end pl-24 mb-3">
                {(tiers.data ?? []).map((t) => {
                  const unlocked = currentTier >= t.tier;
                  return (
                    <div key={`h-${t.tier}`} className="text-center">
                      <div className={cn(
                        "mx-auto grid h-10 w-10 place-items-center rounded-full border-2 font-display font-black",
                        unlocked
                          ? "border-[color:var(--gold)] bg-[color:var(--gold)]/20 text-[color:var(--gold)]"
                          : "border-white/15 bg-white/[0.03] text-muted-foreground",
                      )}>{t.tier}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">Tier</div>
                    </div>
                  );
                })}
              </div>

              {/* Free row */}
              <div className="grid grid-flow-col auto-cols-[minmax(120px,1fr)] gap-3 items-stretch mb-2">
                <div className="sticky left-0 z-10 w-24 -ml-0 pr-3 flex items-center justify-end text-[11px] uppercase tracking-widest font-bold text-muted-foreground bg-background/80 backdrop-blur">
                  <Gift className="h-3.5 w-3.5 mr-1" /> Free
                </div>
                {(tiers.data ?? []).map((t) => (
                  <RewardTile
                    key={`f-${t.tier}`}
                    track="free"
                    reward={t.free_reward}
                    unlocked={currentTier >= t.tier}
                    claimed={claimedSet.has(`${t.tier}:free`)}
                    onClaim={() => claim.mutate({ tier: t.tier, track: "free" })}
                    pending={claim.isPending}
                  />
                ))}
              </div>

              {/* VIP row */}
              <div className="grid grid-flow-col auto-cols-[minmax(120px,1fr)] gap-3 items-stretch">
                <div className="sticky left-0 z-10 w-24 pr-3 flex items-center justify-end text-[11px] uppercase tracking-widest font-bold text-[color:var(--gold)] bg-background/80 backdrop-blur">
                  <Crown className="h-3.5 w-3.5 mr-1" /> VIP
                </div>
                {(tiers.data ?? []).map((t) => (
                  <RewardTile
                    key={`v-${t.tier}`}
                    track="vip"
                    reward={t.vip_reward}
                    unlocked={currentTier >= t.tier}
                    vipUnlocked={isVip}
                    claimed={claimedSet.has(`${t.tier}:vip`)}
                    onClaim={() => claim.mutate({ tier: t.tier, track: "vip" })}
                    pending={claim.isPending}
                  />
                ))}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3 text-center">Scroll horizontally to see all tiers →</p>
        </Card>
      )}
    </div>
  );
}

function RewardTile({
  track, reward, unlocked, claimed, onClaim, pending, vipUnlocked,
}: {
  track: "free" | "vip"; reward: Reward; unlocked: boolean;
  claimed: boolean; onClaim: () => void; pending: boolean; vipUnlocked?: boolean;
}) {
  const isVip = track === "vip";
  const canClaim = unlocked && (!isVip || vipUnlocked) && !claimed;
  const blockedReason = !unlocked ? "Locked" : (isVip && !vipUnlocked) ? "VIP only" : null;

  return (
    <div className={cn(
      "relative flex flex-col items-center gap-2 rounded-lg border p-3 transition min-h-[160px]",
      claimed
        ? "border-emerald-400/40 bg-emerald-500/10"
        : canClaim
          ? isVip
            ? "border-[color:var(--gold)]/60 bg-[color:var(--gold)]/10 shadow-[0_0_20px_-8px_var(--gold)]"
            : "border-[color:var(--gold)]/40 bg-[color:var(--gold)]/5"
          : isVip
            ? "border-[color:var(--gold)]/20 bg-[color:var(--gold)]/[0.04] opacity-70"
            : "border-white/10 bg-white/[0.03] opacity-70",
    )}>
      <div className={cn(
        "grid h-14 w-14 place-items-center rounded-md",
        claimed ? "bg-emerald-500/20 text-emerald-300"
          : canClaim ? "bg-[color:var(--gold)]/25 text-[color:var(--gold)]"
          : "bg-white/5 text-muted-foreground",
      )}>
        {claimed ? <Check className="h-6 w-6" /> : <RewardIcon r={reward} className="h-7 w-7" />}
      </div>
      <div className="text-xs font-semibold text-center leading-tight">{rewardLabel(reward)}</div>
      <div className="mt-auto w-full">
        {claimed ? (
          <Badge variant="outline" className="w-full justify-center gap-1 border-emerald-400/40 text-emerald-300"><Check className="h-3 w-3" /> Claimed</Badge>
        ) : canClaim ? (
          <Button size="sm" onClick={onClaim} disabled={pending}
            className={cn("w-full", isVip && "bg-[color:var(--gold)] text-black hover:bg-[color:var(--gold)]/90")}>
            Claim
          </Button>
        ) : (
          <Badge variant="outline" className="w-full justify-center gap-1"><Lock className="h-3 w-3" /> {blockedReason}</Badge>
        )}
      </div>
    </div>
  );
}
