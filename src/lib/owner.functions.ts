import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const grantOwnerRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; role: "user" | "moderator" | "admin" | "owner" }) =>
    z.object({ userId: z.string().uuid(), role: z.enum(["user", "moderator", "admin", "owner"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("owner_grant_role_tx", {
      _actor: context.userId,
      _target: data.userId,
      _role: data.role,
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean };
  });

export const grantAchievement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; achievementId: string; reason?: string }) =>
    z.object({ userId: z.string().uuid(), achievementId: z.string().uuid(), reason: z.string().max(500).optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("owner_grant_achievement_tx", {
      _actor: context.userId,
      _target: data.userId,
      _achievement: data.achievementId,
      _reason: data.reason ?? null,
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; name: string };
  });

export const removeMarketplaceListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { listingId: string; reason?: string }) => z.object({ listingId: z.string().uuid(), reason: z.string().max(500).optional() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("moderate_listing_tx", { _actor: context.userId, _listing_id: data.listingId, _reason: data.reason ?? null });
    if (error) throw new Error(error.message);
    return result as { ok: boolean };
  });

export const removeChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { challengeId: string; reason?: string }) => z.object({ challengeId: z.string().uuid(), reason: z.string().max(500).optional() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("moderate_challenge_tx", { _actor: context.userId, _challenge_id: data.challengeId, _reason: data.reason ?? null });
    if (error) throw new Error(error.message);
    return result as { ok: boolean };
  });
