import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Heartbeat: awards +25 XP per elapsed minute since the user's last tick.
 * Server-authoritative — clients cannot self-grant XP. The DB function
 * `award_idle_xp` caps per-call gain and awards +500 DICE per level gained.
 */
export const heartbeatXp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("award_idle_xp" as any, {
      _uid: context.userId,
    });
    if (error) throw new Error(error.message);
    return data as {
      xp: number;
      level: number;
      leveled_up: boolean;
      levels_gained?: number;
      dice_awarded: number;
      gained_xp: number;
    };
  });
