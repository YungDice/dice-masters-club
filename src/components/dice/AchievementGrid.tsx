import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Lock, Trophy, Flame, Star, Award, ShoppingBag, Users, Crown, Medal, Coins, Swords, Sparkles, TrendingUp, Package, Gem, Spade, Dumbbell, BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";

const ICONS: Record<string, any> = {
  trophy: Trophy, flame: Flame, star: Star, award: Award, store: ShoppingBag,
  users: Users, crown: Crown, medal: Medal, coins: Coins, swords: Swords,
  sparkles: Sparkles, "trending-up": TrendingUp, package: Package, gem: Gem,
  spade: Spade, dumbbell: Dumbbell, "badge-check": BadgeCheck,
};

function iconFor(name: string) {
  return ICONS[name] ?? Trophy;
}

export function AchievementGrid({ userId, showLocked = true }: { userId: string; showLocked?: boolean }) {
  const q = useQuery({
    queryKey: ["achievements-full", userId, showLocked],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      const [all, mine] = await Promise.all([
        supabase.from("achievements").select("*").order("id"),
        supabase.from("user_achievements").select("achievement_id, unlocked_at").eq("user_id", userId),
      ]);
      const unlocked = new Map((mine.data ?? []).map((r: any) => [r.achievement_id, r.unlocked_at]));
      return (all.data ?? []).map((a: any) => ({ ...a, unlocked_at: unlocked.get(a.id) ?? null }));
    },
  });

  const list = q.data ?? [];
  const shown = showLocked ? list : list.filter((a) => a.unlocked_at);
  const earnedCount = list.filter((a) => a.unlocked_at).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Progress</span>
        <span className="font-semibold text-foreground">{earnedCount} / {list.length} unlocked</span>
      </div>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {shown.map((a) => {
          const Icon = iconFor(a.icon);
          const earned = !!a.unlocked_at;
          return (
            <div
              key={a.id}
              title={`${a.name} — ${a.description}${earned ? "" : "  •  Locked"}`}
              className={cn(
                "relative rounded-md border p-3 text-center transition",
                earned
                  ? "border-gold/60 bg-gradient-to-b from-gold/10 to-transparent shadow-[0_0_18px_-6px_hsl(var(--gold)/0.5)]"
                  : "border-border/50 bg-muted/20 opacity-60 hover:opacity-90"
              )}
            >
              {earned ? (
                <span className="absolute top-1 right-1 text-[9px] font-bold uppercase tracking-wider text-gold">Earned</span>
              ) : (
                <Lock className="absolute top-1 right-1 size-3 text-muted-foreground" />
              )}
              <Icon className={cn("mx-auto size-6", earned ? "text-gold" : "text-muted-foreground")} />
              <div className="text-xs mt-1 font-semibold line-clamp-1">{a.name}</div>
              <div className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{a.description}</div>
              {earned && (a.dice_reward > 0 || a.xp_reward > 0) && (
                <div className="text-[10px] mt-1 text-gold/90">
                  {a.dice_reward > 0 ? `+${fmt(a.dice_reward)} DICE` : ""}
                  {a.dice_reward > 0 && a.xp_reward > 0 ? " · " : ""}
                  {a.xp_reward > 0 ? `+${a.xp_reward} XP` : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
