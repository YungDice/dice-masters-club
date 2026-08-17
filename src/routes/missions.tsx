import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { Flame, Gift, CheckCircle2, Sparkles, Target } from "lucide-react";
import { AppShell } from "@/components/dice/TopNav";
import { PageHeader } from "@/components/dice/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getTodayMissions, claimWeeklyStreak } from "@/lib/missions.functions";
import { fmt } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/missions")({
  head: () => ({
    meta: [
      { title: "Daily Missions — DICE" },
      { name: "description", content: "Complete 3 daily missions, keep your streak, and claim the bonus case on day 7." },
    ],
  }),
  component: () => <AppShell><MissionsPage /></AppShell>,
});

const LABELS: Record<string, { title: string; desc: string; unit: string }> = {
  win_dice_games: { title: "Dice Winner", desc: "Win dice games", unit: "wins" },
  open_case: { title: "Case Opener", desc: "Open a Baddie case", unit: "case" },
  earn_dice: { title: "Earn DICE", desc: "Earn DICE from games or rewards", unit: "DICE" },
  play_games: { title: "Active Player", desc: "Play any games", unit: "games" },
  win_any_game: { title: "Serial Winner", desc: "Win any games", unit: "wins" },
  collect_baddie: { title: "Collector", desc: "Collect Baddie income", unit: "×" },
  donate_crew: { title: "Team Player", desc: "Donate to your crew treasury", unit: "DICE" },
  chat_message: { title: "Community", desc: "Send messages in global chat", unit: "msgs" },
};

function MissionsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fetchMissions = useServerFn(getTodayMissions);
  const claim = useServerFn(claimWeeklyStreak);

  const missions = useQuery({
    queryKey: ["today-missions", user?.id],
    enabled: !!user?.id,
    queryFn: () => fetchMissions(),
    refetchInterval: 30_000,
  });

  const streak = useQuery({
    queryKey: ["user-streak", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_streaks" as any).select("*").eq("user_id", user!.id).maybeSingle();
      return data as any;
    },
  });

  const tokens = useQuery({
    queryKey: ["case-tokens", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_baddie_case_tokens" as any).select("tokens").eq("user_id", user!.id).maybeSingle();
      return (data as any)?.tokens ?? 0;
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase.channel(`missions:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_missions", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["today-missions", user.id] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "user_streaks", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["user-streak", user.id] }))
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user?.id, qc]);

  const s = streak.data;
  const current = s?.current_streak ?? 0;
  const canClaim = current >= 7 && (!s?.last_weekly_claim_date ||
    new Date(s.last_weekly_claim_date).getTime() < Date.now() - 6.5 * 24 * 3600 * 1000);

  async function onClaim() {
    try {
      const r = await claim();
      toast.success(`+${fmt(r.dice)} DICE & +1 free Baddie Case Token`);
      qc.invalidateQueries({ queryKey: ["user-streak"] });
      qc.invalidateQueries({ queryKey: ["case-tokens"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Target}
        title="Daily Missions"
        subtitle="Three daily tasks. Complete at least one to keep your streak alive."
        actions={tokens.data ? (
          <Button asChild variant="outline"><Link to="/baddies"><Sparkles className="size-4 mr-1.5" /> {tokens.data} free case token{tokens.data > 1 ? "s" : ""}</Link></Button>
        ) : undefined}
      />

      {/* Streak card */}
      <Card className="p-5"
        style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.10), rgba(0,0,0,0.4))", borderColor: "rgba(239,68,68,0.35)" }}>
        <div className="flex items-center gap-4">
          <div className="grid size-14 place-items-center rounded-full bg-red-500/15 text-red-300 ring-1 ring-red-400/40">
            <Flame className="size-7" />
          </div>
          <div className="flex-1">
            <div className="text-sm text-muted-foreground">Current streak</div>
            <div className="text-3xl font-bold">
              {current} <span className="text-lg font-normal text-muted-foreground">day{current === 1 ? "" : "s"}</span>
            </div>
            <div className="text-xs text-muted-foreground">Best: {s?.best_streak ?? 0} · Bonus at day 7</div>
          </div>
          <Button onClick={onClaim} disabled={!canClaim} size="lg" className={canClaim ? "" : "opacity-60"}>
            <Gift className="size-4 mr-1.5" />
            {canClaim ? "Claim +2,500 DICE + Free Case" : `${Math.max(0, 7 - current)} days until bonus`}
          </Button>
        </div>
        {/* 7-day dots */}
        <div className="mt-4 flex gap-1.5">
          {Array.from({ length: 7 }).map((_, i) => {
            const filled = i < Math.min(current, 7);
            return (
              <div key={i}
                className={`h-2 flex-1 rounded-full transition ${
                  filled ? "bg-gradient-to-r from-red-400 to-white/10" : "bg-white/10"
                }`}
              />
            );
          })}
        </div>
      </Card>

      {/* Missions */}
      <div className="grid gap-4 md:grid-cols-3">
        {(missions.data ?? []).map((m) => {
          const meta = LABELS[m.mission_key] ?? { title: m.mission_key, desc: "", unit: "" };
          const pct = Math.min(100, (m.progress / m.target) * 100);
          const done = !!m.completed_at;
          return (
            <Card key={m.id} className={`p-4 relative ${done ? "opacity-70" : ""}`}
              style={done ? { borderColor: "rgba(52,211,153,0.5)" } : undefined}>
              {done && (
                <div className="absolute top-3 right-3 text-emerald-300">
                  <CheckCircle2 className="size-5" />
                </div>
              )}
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Mission {m.slot}</div>
              <div className="text-base font-semibold mt-1">{meta.title}</div>
              <div className="text-xs text-muted-foreground">{meta.desc}</div>
              <div className="mt-3 space-y-1.5">
                <Progress value={pct} />
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{fmt(m.progress)} / {fmt(m.target)} {meta.unit}</span>
                  <span className="text-foreground">+{fmt(m.reward_dice)} DICE · +{m.reward_xp} XP</span>
                </div>
              </div>
            </Card>
          );
        })}
        {(missions.data ?? []).length === 0 && (
          <Card className="p-6 text-center text-muted-foreground md:col-span-3">
            Your missions are being generated… open any page or play a game.
          </Card>
        )}
      </div>

      <div className="text-xs text-muted-foreground">
        Missions reset daily at 00:00 UTC · Progress is tracked automatically.
      </div>
    </div>
  );
}
