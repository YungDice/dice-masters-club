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

      {/* Progression track */}
      {tiers.isLoading ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">Loading tiers…</Card>
      ) : (tiers.data ?? []).length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">No tiers configured for this season yet.</Card>
      ) : (
        <div className="space-y-2">
          {(tiers.data ?? []).map((t) => {
            const unlocked = currentTier >= t.tier;
            const upcoming = !unlocked && t.tier <= currentTier + 2;
            const freeClaimed = claimedSet.has(`${t.tier}:free`);
            const vipClaimed = claimedSet.has(`${t.tier}:vip`);
            return (
              <TierRow
                key={t.tier}
                tier={t}
                unlocked={unlocked}
                upcoming={upcoming}
                isVip={isVip}
                freeClaimed={freeClaimed}
                vipClaimed={vipClaimed}
                onClaim={(track) => claim.mutate({ tier: t.tier, track })}
                pending={claim.isPending}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function TierRow({
  tier: t, unlocked, upcoming, isVip, freeClaimed, vipClaimed, onClaim, pending,
}: {
  tier: Tier; unlocked: boolean; upcoming: boolean; isVip: boolean;
  freeClaimed: boolean; vipClaimed: boolean;
  onClaim: (track: "free" | "vip") => void; pending: boolean;
}) {
  return (
    <Card className={cn(
      "grid grid-cols-[64px_1fr_1fr] items-stretch overflow-hidden transition",
      unlocked && "border-[color:var(--gold)]/40",
      !unlocked && !upcoming && "opacity-70",
    )}>
      {/* Tier badge */}
      <div className={cn(
        "flex flex-col items-center justify-center gap-1 py-3 border-r",
        unlocked ? "bg-[color:var(--gold)]/15 border-[color:var(--gold)]/30" : "bg-white/[0.02] border-white/5",
      )}>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Tier</div>
        <div className={cn("font-display text-2xl font-black leading-none", unlocked ? "text-[color:var(--gold)]" : "text-muted-foreground")}>
          {t.tier}
        </div>
        {!unlocked && <Lock className="h-3 w-3 text-muted-foreground" />}
      </div>

      <RewardCell
        track="free"
        reward={t.free_reward}
        unlocked={unlocked}
        claimed={freeClaimed}
        onClaim={() => onClaim("free")}
        pending={pending}
      />
      <RewardCell
        track="vip"
        reward={t.vip_reward}
        unlocked={unlocked}
        vipUnlocked={isVip}
        claimed={vipClaimed}
        onClaim={() => onClaim("vip")}
        pending={pending}
      />
    </Card>
  );
}

function RewardCell({
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
      "flex items-center gap-3 px-4 py-3 border-l first:border-l-0",
      isVip ? "bg-[color:var(--gold)]/[0.06] border-[color:var(--gold)]/20" : "border-white/5",
    )}>
      <div className={cn(
        "grid h-11 w-11 shrink-0 place-items-center rounded-lg",
        claimed ? "bg-emerald-500/15 text-emerald-300"
          : canClaim ? "bg-[color:var(--gold)]/20 text-[color:var(--gold)]"
          : "bg-white/5 text-muted-foreground",
      )}>
        {claimed ? <Check className="h-5 w-5" /> : <RewardIcon r={reward} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          {isVip ? <><Crown className="h-3 w-3 text-[color:var(--gold)]" /> VIP</> : <><Gift className="h-3 w-3" /> Free</>}
        </div>
        <div className="font-semibold truncate">{rewardLabel(reward)}</div>
      </div>
      <div className="shrink-0">
        {claimed ? (
          <Badge variant="outline" className="gap-1 border-emerald-400/40 text-emerald-300"><Check className="h-3 w-3" /> Claimed</Badge>
        ) : canClaim ? (
          <Button size="sm" onClick={onClaim} disabled={pending} className={isVip ? "bg-[color:var(--gold)] text-black hover:bg-[color:var(--gold)]/90" : ""}>
            Claim
          </Button>
        ) : (
          <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> {blockedReason}</Badge>
        )}
      </div>
    </div>
  );
}
