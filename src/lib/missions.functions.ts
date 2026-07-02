import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getTodayMissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_today_missions" as any);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      mission_date: string;
      mission_key: string;
      target: number;
      progress: number;
      reward_dice: number;
      reward_xp: number;
      slot: number;
      completed_at: string | null;
      claimed_at: string | null;
    }>;
  });

export const claimWeeklyStreak = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("claim_weekly_streak_tx" as any);
    if (error) throw new Error(error.message);
    return data as { ok: boolean; dice: number; case_tokens_added: number };
  });
