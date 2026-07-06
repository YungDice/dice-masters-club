import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const finalizeMyStaleGames = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { olderThanSeconds?: number }) =>
    z.object({ olderThanSeconds: z.number().int().min(5).max(300).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await (supabaseAdmin.rpc as any)("finalize_stale_user_games", {
      _uid: context.userId,
      _older_than_seconds: data.olderThanSeconds ?? 30,
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; finalized: number };
  });