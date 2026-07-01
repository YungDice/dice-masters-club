import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function missingRpc(error: any, name: string) {
  const message = String(error?.message ?? "");
  return error?.code === "PGRST202" || (message.includes(`public.${name}`) && message.includes("schema cache"));
}

async function rpc(context: any, name: string, args?: Record<string, unknown>) {
  const { data, error } = await (context.supabase as any).rpc(name, args);
  if (missingRpc(error, name)) throw new Error("Club database setup is not deployed yet. Apply the Club Supabase migrations, then retry.");
  if (error) throw new Error(error.message);
  return data;
}

export const prepareClubDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try { return { ...((await rpc(context, "ensure_club_progress_tx")) ?? {}), schemaReady: true }; }
    catch (error: any) {
      if (String(error?.message).includes("Club database setup is not deployed")) return { ok: false, schemaReady: false, reason: "club_schema_pending" };
      throw error;
    }
  });

export const claimDailyMission = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { missionId: string }) => z.object({ missionId: z.string().min(1).max(64) }).parse(d))
  .handler(({ context, data }) => rpc(context, "claim_daily_mission_tx", { _mission_id: data.missionId }));
export const claimSeasonReward = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { level: number }) => z.object({ level: z.number().int().min(1).max(100) }).parse(d))
  .handler(({ context, data }) => rpc(context, "claim_season_reward_tx", { _level: data.level }));
export const claimAchievement = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { achievementId: string }) => z.object({ achievementId: z.string().min(1).max(64) }).parse(d))
  .handler(({ context, data }) => rpc(context, "claim_achievement_tx", { _achievement_id: data.achievementId }));
export const equipCosmetic = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { cosmeticId: string }) => z.object({ cosmeticId: z.string().min(1).max(100) }).parse(d))
  .handler(({ context, data }) => rpc(context, "equip_cosmetic_tx", { _cosmetic_id: data.cosmeticId }));
export const setBaddieProtection = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { baddieId: string; protected: boolean }) => z.object({ baddieId: z.string().uuid(), protected: z.boolean() }).parse(d))
  .handler(({ context, data }) => rpc(context, "set_baddie_protection_tx", { _baddie_id: data.baddieId, _protected: data.protected }));
export const setBaddieBaseSlot = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { baddieId: string; slot: number | null }) => z.object({ baddieId: z.string().uuid(), slot: z.number().int().min(1).max(10).nullable() }).parse(d))
  .handler(({ context, data }) => rpc(context, "set_baddie_base_slot_tx", { _baddie_id: data.baddieId, _slot: data.slot }));
export const prestigeBaddies = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { primaryId: string; materialId: string }) => z.object({ primaryId: z.string().uuid(), materialId: z.string().uuid() }).parse(d))
  .handler(({ context, data }) => rpc(context, "prestige_baddies_tx", { _primary_id: data.primaryId, _material_id: data.materialId }));
export const createCrew = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; tag: string }) => z.object({ name: z.string().trim().min(3).max(24), tag: z.string().trim().regex(/^[A-Za-z0-9]{2,5}$/) }).parse(d))
  .handler(({ context, data }) => rpc(context, "create_crew_tx", { _name: data.name, _tag: data.tag.toUpperCase() }));
export const joinCrew = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { inviteCode: string }) => z.object({ inviteCode: z.string().trim().min(4).max(16) }).parse(d))
  .handler(({ context, data }) => rpc(context, "join_crew_tx", { _invite_code: data.inviteCode }));
export const contributeToCrew = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { amount: number }) => z.object({ amount: z.number().int().min(100).max(1_000_000) }).parse(d))
  .handler(({ context, data }) => rpc(context, "contribute_to_crew_tx", { _amount: data.amount }));
export const joinTournament = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { tournamentId: string }) => z.object({ tournamentId: z.string().uuid() }).parse(d))
  .handler(({ context, data }) => rpc(context, "join_tournament_tx", { _tournament_id: data.tournamentId }));
export const playRiskRoom = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { stake: number }) => z.object({ stake: z.number().int().min(100).max(100_000) }).parse(d))
  .handler(({ context, data }) => rpc(context, "play_risk_room_tx", { _stake: data.stake }));
export const createBaddieTradeOffer = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { targetUserId: string; offeredBaddieId: string; requestedBaddieId: string }) => z.object({ targetUserId: z.string().uuid(), offeredBaddieId: z.string().uuid(), requestedBaddieId: z.string().uuid() }).parse(d))
  .handler(({ context, data }) => rpc(context, "create_baddie_trade_offer_tx", { _target_user: data.targetUserId, _offered_baddie: data.offeredBaddieId, _requested_baddie: data.requestedBaddieId }));
export const acceptBaddieTradeOffer = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { offerId: string }) => z.object({ offerId: z.string().uuid() }).parse(d))
  .handler(({ context, data }) => rpc(context, "accept_baddie_trade_offer_tx", { _offer_id: data.offerId }));
export const cancelBaddieTradeOffer = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { offerId: string }) => z.object({ offerId: z.string().uuid() }).parse(d))
  .handler(({ context, data }) => rpc(context, "cancel_baddie_trade_offer_tx", { _offer_id: data.offerId }));
