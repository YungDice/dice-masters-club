import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useMemo } from "react";
import { Crown, Gift, Package, Sparkles, Lock, Check } from "lucide-react";
import { AppShell } from "@/components/dice/TopNav";
import { PageHeader } from "@/components/dice/PageHeader";
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
      { name: "description", content: "Free und VIP Belohnungen jede Season. Verdiene XP, schalte Tiers frei und claime Cases, DICE und VIP-Tage." },
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
function RewardIcon({ r }: { r: Reward }) {
  if (r?.kind === "case_token") return <Package className="h-4 w-4" />;
  if (r?.kind === "vip_days") return <Crown className="h-4 w-4" />;
  return <Sparkles className="h-4 w-4" />;
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
  const pctToNext = season.data ? ((seasonXp - currentTier * season.data.xp_per_tier) / season.data.xp_per_tier) * 100 : 0;

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

  // ensure progress row exists (first visit)
  useMemo(() => {
    if (user && season.data && !progress.data && progress.isFetched) {
      (supabase.rpc as any)("ensure_season_progress").then(() => {
        qc.invalidateQueries({ queryKey: ["season-progress"] });
      });
    }
  }, [user, season.data?.id, progress.data, progress.isFetched, qc]);

  if (!season.data) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <PageHeader title="Season Pass" subtitle="Momentan läuft keine Season." />
      </div>
    );
  }

  const endsIn = Math.max(0, Math.floor((new Date(season.data.ends_at).getTime() - Date.now()) / 86_400_000));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      <PageHeader
        title={season.data.name}
        subtitle={`XP verdienen · Tier hochleveln · Free & VIP Belohnungen claimen`}
        icon={<Crown className="h-6 w-6 text-[color:var(--gold)]" />}
      />

      <Card className="p-5 space-y-4 border-[color:var(--gold)]/25">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-sm text-muted-foreground">Aktuelles Tier</div>
            <div className="text-3xl font-black">
              Tier {currentTier} <span className="text-muted-foreground text-lg">/ {season.data.tier_count}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Season endet in</div>
            <div className="text-2xl font-bold">{endsIn}d</div>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">VIP Track</div>
            <Badge variant={isVip ? "default" : "outline"} className={isVip ? "bg-[color:var(--gold)] text-black" : ""}>
              {isVip ? "Freigeschaltet" : "Nur mit VIP"}
            </Badge>
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>{fmt(seasonXp)} XP</span>
            <span>{fmt(nextTierXp)} XP → Tier {currentTier + 1}</span>
          </div>
          <Progress value={Math.min(100, pctToNext)} />
        </div>
      </Card>

      <div className="grid gap-3">
        {(tiers.data ?? []).map((t) => {
          const unlocked = currentTier >= t.tier;
          const freeClaimed = claimedSet.has(`${t.tier}:free`);
          const vipClaimed = claimedSet.has(`${t.tier}:vip`);
          return (
            <Card key={t.tier} className={cn("p-4 grid grid-cols-[auto_1fr_1fr] items-center gap-4", unlocked && "border-[color:var(--gold)]/40")}>
              <div className={cn(
                "flex h-14 w-14 items-center justify-center rounded-lg text-xl font-black shrink-0",
                unlocked ? "bg-[color:var(--gold)]/20 text-[color:var(--gold)]" : "bg-muted text-muted-foreground"
              )}>
                {unlocked ? t.tier : <Lock className="h-5 w-5" />}
                {unlocked && <span className="sr-only">{t.tier}</span>}
              </div>

              <RewardRow
                label="Free"
                reward={t.free_reward}
                unlocked={unlocked}
                claimed={freeClaimed}
                onClaim={() => claim.mutate({ tier: t.tier, track: "free" })}
                pending={claim.isPending}
              />
              <RewardRow
                label="VIP"
                reward={t.vip_reward}
                unlocked={unlocked && isVip}
                claimed={vipClaimed}
                vip
                lockedReason={!isVip ? "VIP" : undefined}
                onClaim={() => claim.mutate({ tier: t.tier, track: "vip" })}
                pending={claim.isPending}
              />
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function RewardRow({
  label, reward, unlocked, claimed, onClaim, pending, vip, lockedReason,
}: {
  label: string; reward: Reward; unlocked: boolean; claimed: boolean;
  onClaim: () => void; pending: boolean; vip?: boolean; lockedReason?: string;
}) {
  return (
    <div className={cn(
      "flex items-center justify-between gap-3 rounded-lg border px-3 py-2",
      vip ? "border-[color:var(--gold)]/30 bg-[color:var(--gold)]/5" : "border-border"
    )}>
      <div className="flex items-center gap-2 min-w-0">
        {vip ? <Crown className="h-4 w-4 text-[color:var(--gold)]" /> : <Gift className="h-4 w-4 text-muted-foreground" />}
        <span className="text-xs text-muted-foreground shrink-0">{label}</span>
        <span className="flex items-center gap-1 font-semibold truncate">
          <RewardIcon r={reward} />
          {rewardLabel(reward)}
        </span>
      </div>
      {claimed ? (
        <Badge variant="outline" className="gap-1"><Check className="h-3 w-3" /> Claimed</Badge>
      ) : unlocked ? (
        <Button size="sm" onClick={onClaim} disabled={pending}>Claim</Button>
      ) : (
        <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> {lockedReason ?? "Locked"}</Badge>
      )}
    </div>
  );
}
