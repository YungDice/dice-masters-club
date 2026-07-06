import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PodiumCategory = "XP" | "DICE" | "Wins" | "Level";
export type PodiumEntry = { rank: 1 | 2 | 3; category: PodiumCategory };

/**
 * Top-3 podium across categories. Returns a map: user_id -> PodiumEntry[]
 * A single user may hold multiple podium ranks (e.g. #1 XP + #2 DICE).
 */
export function usePodium() {
  return useQuery<Record<string, PodiumEntry[]>>({
    queryKey: ["podium-top3"],
    staleTime: 60_000,
    queryFn: async () => {
      const map: Record<string, PodiumEntry[]> = {};
      const push = (uid: string | null | undefined, rank: 1 | 2 | 3, category: PodiumCategory) => {
        if (!uid) return;
        (map[uid] ??= []).push({ rank, category });
      };

      const [xp, lvl, dice, wins] = await Promise.all([
        supabase.from("profiles").select("id").order("xp", { ascending: false }).limit(3),
        supabase.from("profiles").select("id").order("level", { ascending: false }).limit(3),
        supabase.from("dice_wallets").select("user_id").order("balance", { ascending: false }).limit(3),
        (supabase.rpc as any)("leaderboard_wins", { _limit: 3 }),
      ]);

      (xp.data ?? []).forEach((r: any, i: number) => push(r.id, (i + 1) as 1 | 2 | 3, "XP"));
      (lvl.data ?? []).forEach((r: any, i: number) => push(r.id, (i + 1) as 1 | 2 | 3, "Level"));
      (dice.data ?? []).forEach((r: any, i: number) => push(r.user_id, (i + 1) as 1 | 2 | 3, "DICE"));
      ((wins.data as any[]) ?? [])
        .filter((r) => Number(r.wins) > 0)
        .slice(0, 3)
        .forEach((r: any, i: number) => push(r.user_id, (i + 1) as 1 | 2 | 3, "Wins"));

      return map;
    },
  });
}

export const podiumEmoji = (rank: 1 | 2 | 3) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉");
