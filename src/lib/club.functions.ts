import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function callRpc(context: any, name: string, args?: Record<string, unknown>) {
  return (context.supabase as any).rpc(name, args);
}

function isMissingRpc(error: any, rpcName: string) {
  const message = String(error?.message ?? "");
  return error?.code === "PGRST202" || message.includes(`public.${rpcName}`) && message.includes("schema cache");
}

export const prepareClubDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await callRpc(context, "ensure_club_progress_tx");
    // A preview can receive the application bundle before PostgREST has reloaded
    // the new database function. Avoid turning that brief deploy window into a
    // server-function crash / blank screen; the page can retry normally.
    if (isMissingRpc(error, "ensure_club_progress_tx")) {
      return { ok: false, schemaReady: false, reason: "club_schema_pending" };
    }
    if (error) throw new Error(error.message);
    return { ...(data ?? {}), schemaReady: true };
  });

export const claimDailyMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { missionId: string }) => z.object({ missionId: z.string().min(1).max(64) }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: result, error } = await callRpc(context, "claim_daily_mission_tx", { _mission_id: data.missionId });
    if (error) throw new Error(error.message);
    return result;
  });

export const claimSeasonReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { level: number }) => z.object({ level: z.number().int().min(1).max(100) }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: result, error } = await callRpc(context, "claim_season_reward_tx", { _level: data.level });
    if (error) throw new Error(error.message);
    return result;
  });

export const claimAchievement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { achievementId: string }) => z.object({ achievementId: z.string().min(1).max(64) }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: result, error } = await callRpc(context, "claim_achievement_tx", { _achievement_id: data.achievementId });
    if (error) throw new Error(error.message);
    return result;
  });

export const equipCosmetic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { cosmeticId: string }) => z.object({ cosmeticId: z.string().min(1).max(100) }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: result, error } = await callRpc(context, "equip_cosmetic_tx", { _cosmetic_id: data.cosmeticId });
    if (error) throw new Error(error.message);
    return result;
  });

export const setBaddieProtection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { baddieId: string; protected: boolean }) =>
    z.object({ baddieId: z.string().uuid(), protected: z.boolean() }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: result, error } = await callRpc(context, "set_baddie_protection_tx", {
      _baddie_id: data.baddieId,
      _protected: data.protected,
    });
    if (error) throw new Error(error.message);
    return result;
  });

export const setBaddieBaseSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { baddieId: string; slot: number | null }) =>
    z.object({ baddieId: z.string().uuid(), slot: z.number().int().min(1).max(10).nullable() }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: result, error } = await callRpc(context, "set_baddie_base_slot_tx", {
      _baddie_id: data.baddieId,
      _slot: data.slot,
    });
    if (error) throw new Error(error.message);
    return result;
  });

export const prestigeBaddies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { primaryId: string; materialId: string }) =>
    z.object({ primaryId: z.string().uuid(), materialId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: result, error } = await callRpc(context, "prestige_baddies_tx", {
      _primary_id: data.primaryId,
      _material_id: data.materialId,
    });
    if (error) throw new Error(error.message);
    return result;
  });

export const createCrew = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { name: string; tag: string }) =>
    z.object({ name: z.string().trim().min(3).max(24), tag: z.string().trim().regex(/^[A-Za-z0-9]{2,5}$/) }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: result, error } = await callRpc(context, "create_crew_tx", {
      _name: data.name,
      _tag: data.tag.toUpperCase(),
    });
    if (error) throw new Error(error.message);
    return result;
  });

export const joinCrew = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { inviteCode: string }) => z.object({ inviteCode: z.string().trim().min(4).max(16) }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: result, error } = await callRpc(context, "join_crew_tx", { _invite_code: data.inviteCode });
    if (error) throw new Error(error.message);
    return result;
  });

export const contributeToCrew = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { amount: number }) => z.object({ amount: z.number().int().min(100).max(1_000_000) }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: result, error } = await callRpc(context, "contribute_to_crew_tx", { _amount: data.amount });
    if (error) throw new Error(error.message);
    return result;
  });

export const joinTournament = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tournamentId: string }) => z.object({ tournamentId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: result, error } = await callRpc(context, "join_tournament_tx", { _tournament_id: data.tournamentId });
    if (error) throw new Error(error.message);
    return result;
  });

export const playRiskRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { stake: number }) => z.object({ stake: z.number().int().min(100).max(100_000) }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: result, error } = await callRpc(context, "play_risk_room_tx", { _stake: data.stake });
    if (error) throw new Error(error.message);
    return result;
  });

export const createBaddieTradeOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { targetUserId: string; offeredBaddieId: string; requestedBaddieId: string }) =>
    z.object({ targetUserId: z.string().uuid(), offeredBaddieId: z.string().uuid(), requestedBaddieId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: result, error } = await callRpc(context, "create_baddie_trade_offer_tx", {
      _target_user: data.targetUserId,
      _offered_baddie: data.offeredBaddieId,
      _requested_baddie: data.requestedBaddieId,
    });
    if (error) throw new Error(error.message);
    return result;
  });

export const acceptBaddieTradeOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { offerId: string }) => z.object({ offerId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: result, error } = await callRpc(context, "accept_baddie_trade_offer_tx", { _offer_id: data.offerId });
    if (error) throw new Error(error.message);
    return result;
  });

export const cancelBaddieTradeOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { offerId: string }) => z.object({ offerId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: result, error } = await callRpc(context, "cancel_baddie_trade_offer_tx", { _offer_id: data.offerId });
    if (error) throw new Error(error.message);
    return result;
  });
