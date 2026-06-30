import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomInt, randomBytes } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Cryptographically secure helpers (must be used for any game outcome or invite code)
const cryptoRandFloat = () => randomInt(0, 2 ** 30) / 2 ** 30;
const cryptoRandInt = (n: number) => randomInt(0, n);
const cryptoInviteCode = () =>
  randomBytes(6).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase().padEnd(6, "X");

// Rate-limit helper — throws when caller exceeds budget for (key, window).
async function rateLimit(
  admin: any, userId: string, key: string, windowSeconds: number, maxHits: number, label = "rate_limited",
) {
  const { data } = await admin.rpc("rate_limit_hit", {
    _user: userId, _key: key, _window_seconds: windowSeconds, _max_hits: maxHits,
  });
  if (data === false) throw new Error(`Slow down (${label}) — try again later`);
}



// ---------- Daily reward (atomic, idempotent per (user, UTC day)) ----------
export const claimDaily = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("claim_daily_tx", { _uid: context.userId });
    if (error) throw new Error(error.message);
    return (data as any) ?? { ok: false };
  });


// ---------- Solo dice roll vs house ----------
export const playDiceSolo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { stake: number }) =>
    z.object({ stake: z.number().int().min(10).max(10000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stake = data.stake;
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: context.userId, _delta: -stake, _type: "game_stake",
      _source: "dice_solo", _ref_kind: "dice", _ref_id: null as any, _note: "Stake",
    });
    const me = (cryptoRandInt(6) + 1) + (cryptoRandInt(6) + 1);
    const house = (cryptoRandInt(6) + 1) + (cryptoRandInt(6) + 1);
    let delta = -stake;
    let outcome: "win" | "loss" | "tie" = "loss";
    if (me > house) {
      const payout = stake * 2;
      await supabaseAdmin.rpc("wallet_adjust", {
        _user: context.userId, _delta: payout, _type: "game_payout",
        _source: "dice_solo", _ref_kind: "dice", _ref_id: null as any, _note: "Win",
      });
      delta = stake; outcome = "win";
    } else if (me === house) {
      await supabaseAdmin.rpc("wallet_adjust", {
        _user: context.userId, _delta: stake, _type: "refund",
        _source: "dice_solo", _ref_kind: "dice", _ref_id: null as any, _note: "Tie refund",
      });
      delta = 0; outcome = "tie";
    }
    await supabaseAdmin.rpc("record_game_result" as any, {
      _uid: context.userId, _kind: "dice", _delta: delta, _outcome: outcome,
      _room_id: null, _details: { me, house } as any,
    });
    return { me, house, delta, outcome };

  });

// ---------- Slots ----------
const SYMBOLS = ["7", "BAR", "🍒", "🍋", "🔔", "💎"] as const;
const PAY: Record<string, number> = { "7": 25, BAR: 15, "💎": 10, "🔔": 7, "🍒": 5, "🍋": 3 };
export const playSlots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bet: number }) =>
    z.object({ bet: z.number().int().min(5).max(2500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: context.userId, _delta: -data.bet, _type: "game_stake",
      _source: "slots", _ref_kind: "slots", _ref_id: null as any, _note: "Spin",
    });
    const reels = [
      SYMBOLS[cryptoRandInt(SYMBOLS.length)],
      SYMBOLS[cryptoRandInt(SYMBOLS.length)],
      SYMBOLS[cryptoRandInt(SYMBOLS.length)],
    ];
    let payout = 0;
    if (reels[0] === reels[1] && reels[1] === reels[2]) payout = data.bet * PAY[reels[0]];
    else if (reels[0] === reels[1] || reels[1] === reels[2]) payout = Math.floor(data.bet * 1.5);
    if (payout > 0) {
      await supabaseAdmin.rpc("wallet_adjust", {
        _user: context.userId, _delta: payout, _type: "game_payout",
        _source: "slots", _ref_kind: "slots", _ref_id: null as any, _note: "Slots payout",
      });
    }
    const slotsNet = payout - data.bet;
    await supabaseAdmin.rpc("record_game_result" as any, {
      _uid: context.userId, _kind: "slots", _delta: slotsNet,
      _outcome: slotsNet > 0 ? "win" : slotsNet < 0 ? "loss" : "tie",
      _room_id: null, _details: { reels, payout } as any,
    });
    return { reels, payout, delta: slotsNet };
  });


// ---------- Coin flip PvP: create / join / resolve ----------
export const createCoinFlip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { stake: number; isPrivate: boolean }) =>
    z.object({
      stake: z.number().int().min(10).max(10000),
      isPrivate: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: context.userId, _delta: -data.stake, _type: "escrow_lock",
      _source: "coinflip", _ref_kind: "coinflip", _ref_id: null as any, _note: "Escrow",
    });
    const code = data.isPrivate ? cryptoInviteCode() : null;
    const { data: room, error } = await supabaseAdmin.from("game_rooms").insert({
      kind: "coinflip", host_id: context.userId, stake: data.stake,
      max_players: 2, is_private: data.isPrivate, invite_code: code,
      status: "waiting", state: {},
    }).select().single();
    if (error) throw error;
    await supabaseAdmin.from("game_players").insert({
      room_id: room.id, user_id: context.userId, seat: 0, staked: data.stake,
    });
    return room;
  });

export const joinCoinFlip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { roomId: string }) => z.object({ roomId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: room } = await supabaseAdmin.from("game_rooms").select("*").eq("id", data.roomId).single();
    if (!room || room.status !== "waiting") throw new Error("Room not joinable");
    if (room.host_id === context.userId) throw new Error("Can't join your own room");
    // Atomically claim the room: only one concurrent join can transition waiting -> active
    const { data: claimed } = await supabaseAdmin.from("game_rooms").update({
      status: "active",
      state: { ...(room.state as any), joiner_id: context.userId },
    }).eq("id", room.id).eq("status", "waiting").select("id");
    if (!claimed || claimed.length === 0) throw new Error("Room no longer joinable");
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: context.userId, _delta: -room.stake, _type: "escrow_lock",
      _source: "coinflip", _ref_kind: "coinflip", _ref_id: room.id, _note: "Escrow",
    });
    await supabaseAdmin.from("game_players").insert({
      room_id: room.id, user_id: context.userId, seat: 1, staked: room.stake,
    });
    return { ok: true, roomId: room.id };
  });

// Either player picks a side; the other gets the opposite. Once both sides are
// known the coin is flipped and the room resolves.
export const pickCoinFlipSide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { roomId: string; side: "heads" | "tails" }) =>
    z.object({ roomId: z.string().uuid(), side: z.enum(["heads", "tails"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: room } = await supabaseAdmin.from("game_rooms").select("*").eq("id", data.roomId).single();
    if (!room) throw new Error("Room not found");
    if (room.status !== "active") throw new Error("Room not in pick phase");
    const state: any = room.state ?? {};
    if (context.userId !== room.host_id && context.userId !== state.joiner_id) {
      throw new Error("Not a player in this room");
    }
    const isHost = context.userId === room.host_id;
    const other = data.side === "heads" ? "tails" : "heads";
    const next = {
      ...state,
      host_pick: isHost ? data.side : (state.host_pick ?? other),
      joiner_pick: isHost ? (state.joiner_pick ?? other) : data.side,
    };
    // Resolve
    const flip = cryptoRandFloat() < 0.5 ? "heads" : "tails";
    const hostWon = next.host_pick === flip;
    const pot = room.stake * 2;
    const winnerId = hostWon ? room.host_id : state.joiner_id;
    const loserId = hostWon ? state.joiner_id : room.host_id;
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: winnerId, _delta: pot, _type: "game_win",
      _source: "coinflip", _ref_kind: "coinflip", _ref_id: room.id, _note: "Coin flip win",
    });
    await supabaseAdmin.from("game_rooms").update({
      status: "finished", winner_id: winnerId,
      state: { ...next, flip },
      finished_at: new Date().toISOString(),
    }).eq("id", room.id);
    await supabaseAdmin.from("game_results").insert([
      { room_id: room.id, user_id: winnerId, kind: "coinflip", delta: room.stake, outcome: "win", details: { flip } },
      { room_id: room.id, user_id: loserId, kind: "coinflip", delta: -room.stake, outcome: "loss", details: { flip } },
    ]);
    return { flip, winnerId, pot, hostPick: next.host_pick, joinerPick: next.joiner_pick };
  });

// Change username (90-day cooldown, server-enforced)
export const changeUsername = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { username: string }) =>
    z.object({ username: z.string().regex(/^[a-zA-Z0-9_]{3,20}$/, "3-20 chars, letters/numbers/underscore") }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("change_username", { _new_username: data.username });
    if (error) throw new Error(error.message);
    return res as { ok: boolean; username: string };
  });


// ---------- Blackjack solo (simplified, server-authoritative) ----------
type Card = { r: string; s: string; v: number };
const RANKS: [string, number][] = [
  ["A", 11], ["2", 2], ["3", 3], ["4", 4], ["5", 5], ["6", 6],
  ["7", 7], ["8", 8], ["9", 9], ["10", 10], ["J", 10], ["Q", 10], ["K", 10],
];
const SUITS = ["♠", "♥", "♦", "♣"];
function newDeck(): Card[] {
  const d: Card[] = [];
  for (const s of SUITS) for (const [r, v] of RANKS) d.push({ r, s, v });
  for (let i = d.length - 1; i > 0; i--) {
    const j = cryptoRandInt(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
function score(h: Card[]) {
  let t = h.reduce((a, c) => a + c.v, 0);
  let aces = h.filter((c) => c.r === "A").length;
  while (t > 21 && aces > 0) { t -= 10; aces--; }
  return t;
}
export const playBlackjack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bet: number }) =>
    z.object({ bet: z.number().int().min(10).max(5000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: context.userId, _delta: -data.bet, _type: "game_stake",
      _source: "blackjack", _ref_kind: "blackjack", _ref_id: null as any, _note: "Bet",
    });
    const deck = newDeck();
    const player: Card[] = [deck.pop()!, deck.pop()!];
    const dealer: Card[] = [deck.pop()!, deck.pop()!];
    // Auto-play simple: stand on 17+
    while (score(player) < 17) player.push(deck.pop()!);
    while (score(dealer) < 17) dealer.push(deck.pop()!);
    const p = score(player), dl = score(dealer);
    let outcome: "win" | "loss" | "push" = "loss";
    let payout = 0;
    if (p > 21) outcome = "loss";
    else if (dl > 21 || p > dl) { outcome = "win"; payout = data.bet * 2; }
    else if (p === dl) { outcome = "push"; payout = data.bet; }
    if (payout > 0) {
      await supabaseAdmin.rpc("wallet_adjust", {
        _user: context.userId, _delta: payout, _type: outcome === "win" ? "game_payout" : "refund",
        _source: "blackjack", _ref_kind: "blackjack", _ref_id: null as any, _note: outcome,
      });
    }
    const bjDelta = payout - data.bet;
    await supabaseAdmin.rpc("record_game_result" as any, {
      _uid: context.userId, _kind: "blackjack", _delta: bjDelta,
      _outcome: outcome === "push" ? "tie" : outcome,
      _room_id: null, _details: { p, dl } as any,
    });
    return { player, dealer, outcome, delta: bjDelta, playerScore: p, dealerScore: dl };

  });

// ---------- Split-or-Steal PvP ----------
export const createSplitSteal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { stake: number; isPrivate: boolean }) =>
    z.object({ stake: z.number().int().min(10).max(10000), isPrivate: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: context.userId, _delta: -data.stake, _type: "escrow_lock",
      _source: "split_steal", _ref_kind: "split_steal", _ref_id: null as any, _note: "Escrow",
    });
    const code = data.isPrivate ? cryptoInviteCode() : null;
    const { data: room } = await supabaseAdmin.from("game_rooms").insert({
      kind: "split_steal", host_id: context.userId, stake: data.stake,
      max_players: 2, is_private: data.isPrivate, invite_code: code, status: "waiting",
    }).select().single();
    await supabaseAdmin.from("game_players").insert({
      room_id: room!.id, user_id: context.userId, seat: 0, staked: data.stake,
    });
    return room;
  });

export const joinSplitSteal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { roomId: string }) => z.object({ roomId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: room } = await supabaseAdmin.from("game_rooms").select("*").eq("id", data.roomId).single();
    if (!room || room.status !== "waiting") throw new Error("Room not joinable");
    if (room.host_id === context.userId) throw new Error("Can't join own");
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: context.userId, _delta: -room.stake, _type: "escrow_lock",
      _source: "split_steal", _ref_kind: "split_steal", _ref_id: room.id, _note: "Escrow",
    });
    await supabaseAdmin.from("game_players").insert({
      room_id: room.id, user_id: context.userId, seat: 1, staked: room.stake,
    });
    await supabaseAdmin.from("game_rooms").update({ status: "active" }).eq("id", room.id);
    return room;
  });

export const choiceSplitSteal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { roomId: string; choice: "split" | "steal" }) =>
    z.object({ roomId: z.string().uuid(), choice: z.enum(["split", "steal"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pl } = await supabaseAdmin.from("game_players").select("*")
      .eq("room_id", data.roomId).eq("user_id", context.userId).single();
    if (!pl) throw new Error("Not in room");
    await supabaseAdmin.from("game_players").update({
      state: { ...(pl.state as any), choice: data.choice },
    }).eq("id", pl.id);
    // Check if both made choice
    const { data: all } = await supabaseAdmin.from("game_players").select("*").eq("room_id", data.roomId);
    if (!all || all.length < 2) return { waiting: true };
    const choices = all.map((p) => (p.state as any)?.choice);
    if (choices.some((c) => !c)) return { waiting: true };
    const { data: room } = await supabaseAdmin.from("game_rooms").select("*").eq("id", data.roomId).single();
    const pot = (room!.stake as any) * 2;
    const [a, b] = all;
    let outcome: string; let aPay = 0; let bPay = 0;
    const ac = (a.state as any).choice, bc = (b.state as any).choice;
    if (ac === "split" && bc === "split") { outcome = "split_split"; aPay = pot / 2; bPay = pot / 2; }
    else if (ac === "steal" && bc === "split") { outcome = "a_steals"; aPay = pot; }
    else if (ac === "split" && bc === "steal") { outcome = "b_steals"; bPay = pot; }
    else { outcome = "both_steal"; }
    if (aPay > 0) await supabaseAdmin.rpc("wallet_adjust", { _user: a.user_id, _delta: aPay, _type: "game_payout", _source: "split_steal", _ref_kind: "split_steal", _ref_id: data.roomId, _note: outcome });
    if (bPay > 0) await supabaseAdmin.rpc("wallet_adjust", { _user: b.user_id, _delta: bPay, _type: "game_payout", _source: "split_steal", _ref_kind: "split_steal", _ref_id: data.roomId, _note: outcome });
    await supabaseAdmin.from("game_rooms").update({
      status: "finished", state: { ...(room!.state as any), outcome }, finished_at: new Date().toISOString(),
    }).eq("id", data.roomId);
    const stake = (room!.stake as number);
    const aDelta = aPay - stake, bDelta = bPay - stake;
    await supabaseAdmin.rpc("record_game_result" as any, {
      _uid: a.user_id, _kind: "split_steal", _delta: aDelta,
      _outcome: aDelta > 0 ? "win" : aDelta < 0 ? "loss" : "tie",
      _room_id: data.roomId, _details: { outcome, choice: ac } as any,
    });
    await supabaseAdmin.rpc("record_game_result" as any, {
      _uid: b.user_id, _kind: "split_steal", _delta: bDelta,
      _outcome: bDelta > 0 ? "win" : bDelta < 0 ? "loss" : "tie",
      _room_id: data.roomId, _details: { outcome, choice: bc } as any,
    });
    return { waiting: false, outcome, aPay, bPay };
  });


// ---------- Dice PvP room ----------
export const createDiceRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { stake: number; isPrivate: boolean }) =>
    z.object({ stake: z.number().int().min(10).max(10000), isPrivate: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: context.userId, _delta: -data.stake, _type: "escrow_lock",
      _source: "dice_pvp", _ref_kind: "dice", _ref_id: null as any, _note: "Escrow",
    });
    const code = data.isPrivate ? cryptoInviteCode() : null;
    const { data: room } = await supabaseAdmin.from("game_rooms").insert({
      kind: "dice", host_id: context.userId, stake: data.stake,
      max_players: 2, is_private: data.isPrivate, invite_code: code, status: "waiting",
    }).select().single();
    await supabaseAdmin.from("game_players").insert({
      room_id: room!.id, user_id: context.userId, seat: 0, staked: data.stake,
    });
    return room;
  });

export const joinDiceRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { roomId: string }) => z.object({ roomId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: room } = await supabaseAdmin.from("game_rooms").select("*").eq("id", data.roomId).single();
    if (!room || room.status !== "waiting") throw new Error("Not joinable");
    if (room.host_id === context.userId) throw new Error("Own room");
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: context.userId, _delta: -room.stake, _type: "escrow_lock",
      _source: "dice_pvp", _ref_kind: "dice", _ref_id: room.id, _note: "Escrow",
    });
    await supabaseAdmin.from("game_players").insert({
      room_id: room.id, user_id: context.userId, seat: 1, staked: room.stake,
    });
    const hostRoll = (cryptoRandInt(6) + 1) + (cryptoRandInt(6) + 1);
    const joinRoll = (cryptoRandInt(6) + 1) + (cryptoRandInt(6) + 1);
    const pot = room.stake * 2;
    let winnerId: string | null = null;
    if (hostRoll > joinRoll) winnerId = room.host_id;
    else if (joinRoll > hostRoll) winnerId = context.userId;
    if (winnerId) {
      await supabaseAdmin.rpc("wallet_adjust", {
        _user: winnerId, _delta: pot, _type: "game_win", _source: "dice_pvp",
        _ref_kind: "dice", _ref_id: room.id, _note: "PvP dice win",
      });
    } else {
      await supabaseAdmin.rpc("wallet_adjust", {
        _user: room.host_id, _delta: room.stake, _type: "refund",
        _source: "dice_pvp", _ref_kind: "dice", _ref_id: room.id, _note: "Tie",
      });
      await supabaseAdmin.rpc("wallet_adjust", {
        _user: context.userId, _delta: room.stake, _type: "refund",
        _source: "dice_pvp", _ref_kind: "dice", _ref_id: room.id, _note: "Tie",
      });
    }
    await supabaseAdmin.from("game_rooms").update({
      status: "finished", winner_id: winnerId,
      state: { hostRoll, joinRoll }, finished_at: new Date().toISOString(),
    }).eq("id", room.id);
    {
      const stakeAmt = room.stake as number;
      const hostDelta = winnerId === room.host_id ? stakeAmt : winnerId === null ? 0 : -stakeAmt;
      const joinDelta = winnerId === context.userId ? stakeAmt : winnerId === null ? 0 : -stakeAmt;
      await supabaseAdmin.rpc("record_game_result" as any, {
        _uid: room.host_id, _kind: "dice", _delta: hostDelta,
        _outcome: hostDelta > 0 ? "win" : hostDelta < 0 ? "loss" : "tie",
        _room_id: room.id, _details: { hostRoll, joinRoll } as any,
      });
      await supabaseAdmin.rpc("record_game_result" as any, {
        _uid: context.userId, _kind: "dice", _delta: joinDelta,
        _outcome: joinDelta > 0 ? "win" : joinDelta < 0 ? "loss" : "tie",
        _room_id: room.id, _details: { hostRoll, joinRoll } as any,
      });
    }
    return { hostRoll, joinRoll, winnerId, pot };

  });

// ---------- Marketplace buy (fixed sale only) ----------
export const buyListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { listingId: string }) => z.object({ listingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await supabaseAdmin.rpc("buy_listing_tx", {
      _buyer: context.userId, _listing_id: data.listingId,
    });
    if (error) throw error;
    const out = res as { ok: boolean; reason?: string; listing_id?: string };
    if (!out.ok) throw new Error(out.reason ?? "Purchase failed");
    // Best-effort sale notification (non-critical)
    const { data: l } = await supabaseAdmin.from("marketplace_listings")
      .select("seller_id,title,price").eq("id", data.listingId).maybeSingle();
    if (l) {
      await supabaseAdmin.from("notifications").insert({
        user_id: l.seller_id, kind: "marketplace_sale",
        title: "You made a sale!", body: `${l.title} sold for ${l.price} DICE`,
        link: `/marketplace/${data.listingId}`,
      });
    }
    return { ok: true };
  });

// ---------- User tag: claim a fresh tag (5000 DICE) ----------
export const claimTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tag: string }) =>
    z.object({ tag: z.string().regex(/^[A-Za-z0-9]{2,6}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const TAG = data.tag.toUpperCase();
    const COST = 5000;
    const { data: me } = await supabaseAdmin.from("profiles").select("tag").eq("id", context.userId).single();
    if (me?.tag) throw new Error("You already own a tag. Sell it on the marketplace first.");
    // Uniqueness check: profile OR an active marketplace listing escrowing the tag
    const { data: clash } = await supabaseAdmin.from("profiles").select("id").ilike("tag", TAG).maybeSingle();
    if (clash) throw new Error("That tag is already taken. Try to buy it on the marketplace.");
    const { data: listed } = await supabaseAdmin.from("marketplace_listings")
      .select("id").eq("category", "tag").ilike("tag_value", TAG).eq("status", "active").maybeSingle();
    if (listed) throw new Error("That tag is listed for sale — buy it on the marketplace.");
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: context.userId, _delta: -COST, _type: "fee",
      _source: "tag_claim", _ref_kind: null as any, _ref_id: null as any, _note: `Claim tag #${TAG}`,
    });
    const { error } = await supabaseAdmin.from("profiles").update({ tag: TAG }).eq("id", context.userId);
    if (error) {
      // Refund on race
      await supabaseAdmin.rpc("wallet_adjust", {
        _user: context.userId, _delta: COST, _type: "refund",
        _source: "tag_claim", _ref_kind: null as any, _ref_id: null as any, _note: "Tag race refund",
      });
      throw new Error("Tag taken just now — refunded");
    }
    return { ok: true, tag: TAG };
  });

// ---------- List my tag for sale (fixed or auction) ----------
export const listTagForSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tag?: string; price: number; sale_type: "fixed" | "auction"; duration_hours?: number }) =>
    z.object({
      tag: z.string().regex(/^[A-Za-z0-9]{2,6}$/).optional(),
      price: z.number().int().min(100).max(1_000_000),
      sale_type: z.enum(["fixed", "auction"]),
      duration_hours: z.number().int().min(1).max(168).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Pick the tag to list: explicit or the user's active tag.
    let tagToList = data.tag ?? null;
    if (!tagToList) {
      const { data: me } = await supabaseAdmin.from("profiles").select("tag").eq("id", context.userId).single();
      tagToList = me?.tag ?? null;
    }
    if (!tagToList) throw new Error("You don't own a tag");

    // Verify ownership via profile_tags
    const { data: owned } = await supabaseAdmin.from("profile_tags" as any).select("tag").eq("user_id", context.userId).eq("tag", tagToList).maybeSingle();
    if (!owned) throw new Error("You don't own that tag");

    // Block duplicate active listing for the same tag
    const { data: dupe } = await supabaseAdmin.from("marketplace_listings")
      .select("id").eq("seller_id", context.userId).eq("category", "tag")
      .eq("tag_value", tagToList).eq("status", "active").maybeSingle();
    if (dupe) throw new Error("This tag is already listed");

    const ends = data.sale_type === "auction"
      ? new Date(Date.now() + (data.duration_hours ?? 24) * 3600_000).toISOString()
      : null;

    // IMPORTANT: tag stays attached to seller. buy_listing_tx / settle_auction_tx move ownership on purchase.
    const { data: listing, error } = await supabaseAdmin.from("marketplace_listings").insert({
      seller_id: context.userId,
      title: `Tag #${tagToList}`,
      description: `Discord-style user tag #${tagToList}.`,
      category: "tag",
      price: data.price,
      tag_value: tagToList,
      sale_type: data.sale_type,
      auction_ends_at: ends,
      min_bid: data.sale_type === "auction" ? data.price : null,
      ownership_confirmed: true,
      status: "active",
    }).select().single();
    if (error) throw error;
    return { ok: true, id: listing!.id };
  });

// ---------- List my username for sale (fixed or auction) ----------
export const listUsernameForSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { price: number; sale_type: "fixed" | "auction"; duration_hours?: number }) =>
    z.object({
      price: z.number().int().min(100).max(1_000_000),
      sale_type: z.enum(["fixed", "auction"]),
      duration_hours: z.number().int().min(1).max(168).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: me } = await supabaseAdmin.from("profiles").select("username").eq("id", context.userId).single();
    if (!me?.username) throw new Error("Profile not found");
    // Prevent listing if already listed
    const { data: existing } = await supabaseAdmin.from("marketplace_listings")
      .select("id").eq("seller_id", context.userId).eq("category", "username").eq("status", "active").maybeSingle();
    if (existing) throw new Error("You already have an active username listing");
    const ends = data.sale_type === "auction"
      ? new Date(Date.now() + (data.duration_hours ?? 24) * 3600_000).toISOString()
      : null;
    const { data: listing, error } = await supabaseAdmin.from("marketplace_listings").insert({
      seller_id: context.userId,
      title: `Username @${me.username}`,
      description: `Take over the username @${me.username}.`,
      category: "username",
      price: data.price,
      username_value: me.username,
      sale_type: data.sale_type,
      auction_ends_at: ends,
      min_bid: data.sale_type === "auction" ? data.price : null,
      ownership_confirmed: true,
      status: "active",
    }).select().single();
    if (error) throw error;
    return { ok: true, id: listing!.id };
  });
// ---------- Auctions: place bid (atomic) ----------
export const placeBid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { listingId: string; amount: number }) =>
    z.object({ listingId: z.string().uuid(), amount: z.number().int().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ok = await supabaseAdmin.rpc("rate_limit_hit", {
      _user: context.userId, _key: "bid", _window_seconds: 60, _max_hits: 20,
    });
    if (ok.data === false) throw new Error("Slow down — too many bids");
    const { data: res, error } = await supabaseAdmin.rpc("place_bid_tx", {
      _bidder: context.userId, _listing_id: data.listingId, _amount: data.amount,
    });
    if (error) throw error;
    const out = res as { ok: boolean; reason?: string; amount?: number };
    if (!out.ok) throw new Error(out.reason ?? "Bid failed");
    return { ok: true, amount: out.amount ?? data.amount };
  });

// ---------- Auctions: settle (lazy + cron) ----------
export const settleAuction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { listingId: string }) => z.object({ listingId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await supabaseAdmin.rpc("settle_auction_tx", { _listing_id: data.listingId });
    if (error) throw error;
    return res as { ok: boolean; sold?: boolean; reason?: string; buyer_id?: string; amount?: number };
  });


// ---------- Challenge proof review (staff) ----------
export const reviewProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { proofId: string; approve: boolean; notes?: string }) =>
    z.object({ proofId: z.string().uuid(), approve: z.boolean(), notes: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Atomic review: rejects double-review, awards exactly once, also applies level-up bonus
    const { data: res, error } = await supabaseAdmin.rpc("review_proof_tx", {
      _proof_id: data.proofId,
      _reviewer: context.userId,
      _approve: data.approve,
      _notes: data.notes ?? "",
    });
    if (error) throw new Error(error.message);
    const out = (res as any) ?? {};
    if (!out.ok) return out;
    // Notification + audit log are non-economic, safe to do after the tx
    await supabaseAdmin.from("notifications").insert({
      user_id: out.user_id, kind: "proof_result",
      title: data.approve ? "Proof approved 🎉" : "Proof rejected",
      body: data.notes ?? null, link: `/challenges/${out.challenge_id}`,
    });
    await supabaseAdmin.from("moderation_actions").insert({
      moderator_id: context.userId, action: data.approve ? "approve_proof" : "reject_proof",
      target_kind: "proof", target_id: data.proofId, reason: data.notes ?? null,
    });
    return out;
  });


// ---------- Admin: review challenge ----------
export const reviewChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { challengeId: string; approve: boolean; notes?: string }) =>
    z.object({ challengeId: z.string().uuid(), approve: z.boolean(), notes: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isStaff } = await supabaseAdmin.rpc("is_staff", { _user_id: context.userId });
    if (!isStaff) throw new Error("Forbidden");
    await supabaseAdmin.from("challenges").update({
      status: data.approve ? "active" : "rejected",
    }).eq("id", data.challengeId);
    await supabaseAdmin.from("moderation_actions").insert({
      moderator_id: context.userId, action: data.approve ? "approve_challenge" : "reject_challenge",
      target_kind: "challenge", target_id: data.challengeId, reason: data.notes ?? null,
    });
    const { data: chal } = await supabaseAdmin.from("challenges").select("creator_id, title").eq("id", data.challengeId).single();
    if (chal?.creator_id) {
      await supabaseAdmin.from("notifications").insert({
        user_id: chal.creator_id,
        kind: data.approve ? "challenge_approved" : "challenge_rejected",
        title: data.approve ? "Challenge approved" : "Challenge rejected",
        body: chal.title, link: `/challenges/${data.challengeId}`,
      });
    }
    return { ok: true };
  });

// ---------- Admin: adjust DICE ----------
export const adminAdjustDice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; delta: number; reason: string }) =>
    z.object({ userId: z.string().uuid(), delta: z.number().int(), reason: z.string().min(3).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: data.userId, _delta: data.delta, _type: "admin_adjust",
      _source: "admin", _ref_kind: "admin", _ref_id: null as any, _note: data.reason,
    });
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId, action: "admin_dice_adjust", entity: "wallet",
      entity_id: data.userId, metadata: { delta: data.delta, reason: data.reason },
    });
    return { ok: true };
  });

// ---------- Admin: grant role ----------
export const grantRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; role: "user" | "moderator" | "admin" }) =>
    z.object({ userId: z.string().uuid(), role: z.enum(["user", "moderator", "admin"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    await supabaseAdmin.from("user_roles").upsert({ user_id: data.userId, role: data.role } as any, { onConflict: "user_id,role" });
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId, action: "grant_role", entity: "user", entity_id: data.userId,
      metadata: { role: data.role },
    });
    return { ok: true };
  });

// claimFirstAdmin removed: bootstrap owner/admin via secure deployment/migration only.



// ---------- Gallery: like + reward creator ----------
export const toggleGalleryLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { itemId: string }) => z.object({ itemId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await rateLimit(supabaseAdmin, context.userId, "gallery_like", 60, 60, "likes");
    const { data: item } = await supabaseAdmin.from("gallery_items").select("id,user_id").eq("id", data.itemId).maybeSingle();
    if (!item) throw new Error("Not found");
    const { data: existing } = await supabaseAdmin.from("gallery_likes").select("id").eq("item_id", data.itemId).eq("user_id", context.userId).maybeSingle();
    if (existing) {
      await supabaseAdmin.from("gallery_likes").delete().eq("id", existing.id);
      return { liked: false };
    }
    await supabaseAdmin.from("gallery_likes").insert({ item_id: data.itemId, user_id: context.userId });
    if (item.user_id !== context.userId) {
      // Creator gets +10
      await supabaseAdmin.rpc("wallet_adjust", {
        _user: item.user_id, _delta: 10, _type: "event",
        _source: "gallery_like", _ref_kind: "gallery_item", _ref_id: data.itemId, _note: "Your post was liked",
      });
      // Liker gets +5
      await supabaseAdmin.rpc("wallet_adjust", {
        _user: context.userId, _delta: 5, _type: "event",
        _source: "gallery_like", _ref_kind: "gallery_item", _ref_id: data.itemId, _note: "You liked a post",
      });
    }
    return { liked: true };
  });

// ---------- Cancel a waiting room (host only) — refunds escrow ----------
export const cancelRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { roomId: string }) => z.object({ roomId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: room } = await supabaseAdmin.from("game_rooms").select("*").eq("id", data.roomId).single();
    if (!room) throw new Error("Room not found");
    if (room.host_id !== context.userId) throw new Error("Only the host can cancel");
    if (room.status !== "waiting") throw new Error("Room already has players — cannot cancel");
    const sourceMap: Record<string, string> = {
      coinflip: "coinflip", dice: "dice_pvp", split_steal: "split_steal",
    };
    const src = sourceMap[room.kind as string] ?? (room.kind as string);
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: room.host_id, _delta: room.stake, _type: "refund",
      _source: src, _ref_kind: room.kind, _ref_id: room.id, _note: "Lobby cancelled — refund",
    });
    await supabaseAdmin.from("game_players").delete().eq("room_id", room.id);
    await supabaseAdmin.from("game_rooms").update({
      status: "cancelled", finished_at: new Date().toISOString(),
    }).eq("id", room.id);
    return { ok: true };
  });

// ---------- Create challenge (charges 500 DICE for non-staff) ----------
export const createChallengePaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    title: z.string().min(3).max(100),
    description: z.string().min(3).max(1000),
    rules: z.string().max(1000).nullable().optional(),
    category: z.string(),
    difficulty: z.string(),
    proof_type: z.string(),
    dice_reward: z.number().int().min(0).max(500),
    xp_reward: z.number().int().min(0).max(200),
    tags: z.array(z.string()).max(10),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: staff } = await supabaseAdmin.rpc("is_staff", { _user_id: context.userId });
    const fee = staff ? 0 : 500;
    if (fee > 0) {
      await supabaseAdmin.rpc("wallet_adjust", {
        _user: context.userId, _delta: -fee, _type: "marketplace_purchase",
        _source: "challenge_create", _ref_kind: "challenge", _ref_id: null as any, _note: "Challenge creation fee",
      });
    }
    const { data: row, error } = await supabaseAdmin.from("challenges").insert({
      creator_id: context.userId,
      title: data.title, description: data.description, rules: data.rules ?? null,
      category: data.category as any, difficulty: data.difficulty as any, proof_type: data.proof_type as any,
      dice_reward: data.dice_reward, xp_reward: data.xp_reward,
      tags: data.tags, status: "active",
    }).select("id").single();
    if (error) {
      // refund
      if (fee > 0) {
        await supabaseAdmin.rpc("wallet_adjust", {
          _user: context.userId, _delta: fee, _type: "refund",
          _source: "challenge_create", _ref_kind: "challenge", _ref_id: null as any, _note: "Refund — insert failed",
        });
      }
      throw error;
    }
    return { id: row.id, fee };
  });

// ---------- Send friend request (with notification) ----------
export const sendFriendRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { addresseeId: string }) => z.object({ addresseeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if (data.addresseeId === context.userId) throw new Error("Can't friend yourself");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await rateLimit(supabaseAdmin, context.userId, "friend_req", 3600, 30, "friend requests");
    const { data: existing } = await supabaseAdmin.from("friendships").select("id,status")
      .or(`and(requester_id.eq.${context.userId},addressee_id.eq.${data.addresseeId}),and(requester_id.eq.${data.addresseeId},addressee_id.eq.${context.userId})`)
      .maybeSingle();
    if (existing) throw new Error("Already exists");
    const { error } = await supabaseAdmin.from("friendships").insert({
      requester_id: context.userId, addressee_id: data.addresseeId, status: "pending",
    });
    if (error) throw error;
    const { data: me } = await supabaseAdmin.from("profiles").select("username,display_name").eq("id", context.userId).single();
    await supabaseAdmin.from("notifications").insert({
      user_id: data.addresseeId, kind: "friend_request",
      title: "New friend request",
      body: `${me?.display_name ?? me?.username ?? "Someone"} wants to be friends`,
      link: "/friends",
    });
    return { ok: true };
  });

// ---------- Respond to friend request ----------
export const respondFriendRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { friendshipId: string; accept: boolean }) =>
    z.object({ friendshipId: z.string().uuid(), accept: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("friendships").select("*").eq("id", data.friendshipId).single();
    if (!row) throw new Error("Not found");
    if (row.addressee_id !== context.userId) throw new Error("Not your request");
    await supabaseAdmin.from("friendships").update({
      status: data.accept ? "accepted" : "blocked",
    }).eq("id", data.friendshipId);
    if (data.accept) {
      const { data: me } = await supabaseAdmin.from("profiles").select("username,display_name").eq("id", context.userId).single();
      await supabaseAdmin.from("notifications").insert({
        user_id: row.requester_id, kind: "friend_accept",
        title: "Friend request accepted",
        body: `${me?.display_name ?? me?.username ?? "Someone"} accepted your request`,
        link: "/friends",
      });
    }
    return { ok: true };
  });

// ---------- Buy VIP status (7 days, 5000 DICE) ----------
const VIP_COST = 5000;
const VIP_DAYS = 7;
export const buyVip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: context.userId, _delta: -VIP_COST, _type: "marketplace_purchase",
      _source: "vip", _ref_kind: "vip", _ref_id: null as any, _note: `VIP ${VIP_DAYS} days`,
    });
    const { data: prof } = await supabaseAdmin.from("profiles").select("vip_until").eq("id", context.userId).single();
    const base = prof?.vip_until && new Date(prof.vip_until) > new Date() ? new Date(prof.vip_until) : new Date();
    base.setDate(base.getDate() + VIP_DAYS);
    await supabaseAdmin.from("profiles").update({ vip_until: base.toISOString() }).eq("id", context.userId);
    return { ok: true, vip_until: base.toISOString() };
  });

// ---------- Buy a level-up ----------
// Cost = current_level * 500. Level 10 grants 1h VIP bonus.
export const buyLevelUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin.from("profiles").select("level,vip_until").eq("id", context.userId).single();
    const lvl = prof?.level ?? 1;
    const cost = lvl * 500;
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: context.userId, _delta: -cost, _type: "marketplace_purchase",
      _source: "level_up", _ref_kind: "level", _ref_id: null as any, _note: `Lvl ${lvl} -> ${lvl + 1}`,
    });
    const newLevel = lvl + 1;
    // Stack XP forward so the purchased level "counts" toward XP progress.
    // Threshold to BE level N (per award_idle_xp formula) is 100*(N+1)^2.
    const xpThreshold = 100 * (newLevel + 1) * (newLevel + 1);
    const { data: cur } = await supabaseAdmin.from("profiles").select("xp").eq("id", context.userId).single();
    const newXp = Math.max(Number(cur?.xp ?? 0), xpThreshold);
    const updates: any = { level: newLevel, xp: newXp };
    let bonus: string | null = null;
    if (newLevel === 10) {
      const base = prof?.vip_until && new Date(prof.vip_until) > new Date() ? new Date(prof.vip_until) : new Date();
      base.setHours(base.getHours() + 1);
      updates.vip_until = base.toISOString();
      bonus = "1 hour VIP unlocked!";
    } else if (newLevel % 5 === 0) {
      // every 5 levels: small DICE gift
      await supabaseAdmin.rpc("wallet_adjust", {
        _user: context.userId, _delta: 250, _type: "event",
        _source: "level_up_bonus", _ref_kind: "level", _ref_id: null as any, _note: `Level ${newLevel} bonus`,
      });
      bonus = "+250 DICE bonus";
    }
    await supabaseAdmin.from("profiles").update(updates).eq("id", context.userId);
    return { ok: true, level: newLevel, cost, bonus };
  });

// ---------- Send chat message (with optional media for VIP) ----------
export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { body: string; mediaUrl?: string | null; mediaKind?: string | null }) =>
    z.object({
      body: z.string().max(4000),
      mediaUrl: z.string().url().nullable().optional(),
      mediaKind: z.string().max(60).nullable().optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await rateLimit(supabaseAdmin, context.userId, "chat_msg", 60, 30, "chat");
    const { data: prof } = await supabaseAdmin.from("profiles").select("vip_until").eq("id", context.userId).single();
    const isVip = !!prof?.vip_until && new Date(prof.vip_until) > new Date();
    const maxLen = isVip ? 4000 : 500;
    if ((data.body?.length ?? 0) > maxLen) throw new Error(`Message too long (limit ${maxLen})`);
    if (data.mediaUrl && !isVip) throw new Error("VIP required to send images");
    if (!data.body?.trim() && !data.mediaUrl) throw new Error("Empty message");
    // Restrict mediaUrl to our own Supabase storage to prevent tracking pixels / phishing.
    if (data.mediaUrl) {
      let host = "";
      try { host = new URL(data.mediaUrl).host; } catch { throw new Error("Invalid media URL"); }
      const supaHost = (() => { try { return new URL(process.env.SUPABASE_URL ?? "").host; } catch { return ""; } })();
      const ok = (supaHost && host === supaHost) || host.endsWith(".supabase.co") || host.endsWith(".supabase.in");
      if (!ok) throw new Error("Media must be hosted in app storage");
    }
    const { error } = await supabaseAdmin.from("chat_messages").insert({
      user_id: context.userId,
      body: data.body ?? "",
      media_url: data.mediaUrl ?? null,
      media_kind: data.mediaKind ?? null,
    });
    if (error) throw error;
    return { ok: true };
  });

// ---------- Bot: Coin Flip vs Bot ----------
export const coinFlipBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { stake: number; side: "heads" | "tails" }) =>
    z.object({ stake: z.number().int().min(10).max(5000), side: z.enum(["heads", "tails"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stake = data.stake;
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: context.userId, _delta: -stake, _type: "game_stake",
      _source: "coinflip_bot", _ref_kind: "coinflip", _ref_id: null as any, _note: "vs Bot",
    });
    const flip = cryptoRandFloat() < 0.5 ? "heads" : "tails";
    const won = flip === data.side;
    if (won) {
      await supabaseAdmin.rpc("wallet_adjust", {
        _user: context.userId, _delta: stake * 2, _type: "game_payout",
        _source: "coinflip_bot", _ref_kind: "coinflip", _ref_id: null as any, _note: "Win vs Bot",
      });
    }
    const cfbDelta = won ? stake : -stake;
    await supabaseAdmin.rpc("record_game_result" as any, {
      _uid: context.userId, _kind: "coinflip", _delta: cfbDelta,
      _outcome: won ? "win" : "loss",
      _room_id: null, _details: { flip, vs: "bot" } as any,
    });
    return { flip, won, delta: cfbDelta };

  });

// ---------- Bot: Split or Steal vs Bot ----------
export const splitStealBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { stake: number; choice: "split" | "steal" }) =>
    z.object({ stake: z.number().int().min(10).max(5000), choice: z.enum(["split", "steal"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stake = data.stake;
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: context.userId, _delta: -stake, _type: "game_stake",
      _source: "split_steal_bot", _ref_kind: "split_steal", _ref_id: null as any, _note: "vs Bot",
    });
    // Bot is slightly cooperative: 55% split, 45% steal
    const bot: "split" | "steal" = cryptoRandFloat() < 0.55 ? "split" : "steal";
    const pot = stake * 2;
    let payout = 0;
    let outcome: "split_split" | "you_steal" | "bot_steal" | "both_steal" = "both_steal";
    if (data.choice === "split" && bot === "split") { payout = Math.floor(pot / 2); outcome = "split_split"; }
    else if (data.choice === "steal" && bot === "split") { payout = pot; outcome = "you_steal"; }
    else if (data.choice === "split" && bot === "steal") { payout = 0; outcome = "bot_steal"; }
    else { payout = 0; outcome = "both_steal"; }
    if (payout > 0) {
      await supabaseAdmin.rpc("wallet_adjust", {
        _user: context.userId, _delta: payout, _type: "game_payout",
        _source: "split_steal_bot", _ref_kind: "split_steal", _ref_id: null as any, _note: outcome,
      });
    }
    const ssbDelta = payout - stake;
    await supabaseAdmin.rpc("record_game_result" as any, {
      _uid: context.userId, _kind: "split_steal", _delta: ssbDelta,
      _outcome: ssbDelta > 0 ? "win" : ssbDelta < 0 ? "loss" : "tie",
      _room_id: null, _details: { outcome, bot, vs: "bot" } as any,
    });
    return { bot, outcome, payout, delta: ssbDelta };
  });



// ---------- Submit challenge proof (server-validated) ----------
// Validates the challenge is active, before its deadline, rate-limits uploads,
// re-signs media on demand and never stores a long-lived signed URL.
export const submitProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { challengeId: string; mediaPath: string; mediaKind: string; caption?: string }) =>
    z.object({
      challengeId: z.string().uuid(),
      mediaPath: z.string().min(1).max(300),
      mediaKind: z.string().max(80),
      caption: z.string().max(500).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await rateLimit(supabaseAdmin, context.userId, "proof_submit", 3600, 5, "proof uploads");

    // Challenge gate: must exist, be active and not past deadline.
    const { data: chal } = await supabaseAdmin
      .from("challenges")
      .select("id,status,deadline")
      .eq("id", data.challengeId)
      .maybeSingle();
    if (!chal) throw new Error("Challenge not found");
    if (chal.status !== "active") throw new Error("Challenge is not accepting submissions");
    if (chal.deadline && new Date(chal.deadline) < new Date()) {
      throw new Error("Challenge deadline has passed");
    }

    // Path must live under the caller's user folder (matches storage RLS).
    if (!data.mediaPath.startsWith(`${context.userId}/`)) {
      throw new Error("Invalid media path");
    }

    // Verify the object actually exists and check its size (<= 25MB).
    const { data: obj, error: dlErr } = await supabaseAdmin.storage
      .from("proof-media")
      .createSignedUrl(data.mediaPath, 60);
    if (dlErr || !obj?.signedUrl) throw new Error("Upload not found");

    const head = await fetch(obj.signedUrl, { method: "HEAD" });
    const size = Number(head.headers.get("content-length") ?? 0);
    if (!size || size > 25 * 1024 * 1024) {
      // Best-effort cleanup, then reject.
      await supabaseAdmin.storage.from("proof-media").remove([data.mediaPath]);
      throw new Error("Media too large (max 25MB)");
    }

    // Re-issue a short-lived signed URL just so the moderator can view it.
    const { data: signed } = await supabaseAdmin.storage
      .from("proof-media")
      .createSignedUrl(data.mediaPath, 60 * 60 * 24); // 24h

    const { data: proof, error } = await supabaseAdmin
      .from("challenge_proofs")
      .insert({
        challenge_id: data.challengeId,
        user_id: context.userId,
        media_url: signed?.signedUrl ?? null,
        media_kind: data.mediaKind,
        caption: data.caption ?? null,
        status: "pending",
      } as any)
      .select("id")
      .single();
    if (error) {
      await supabaseAdmin.storage.from("proof-media").remove([data.mediaPath]);
      throw error;
    }
    await supabaseAdmin
      .from("challenge_participants")
      .upsert(
        { challenge_id: data.challengeId, user_id: context.userId } as any,
        { onConflict: "challenge_id,user_id" },
      );
    return { ok: true, id: proof.id };
  });

// ---------- Admin moderation ----------
export const adminDeleteListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { listingId: string; reason?: string }) =>
    z.object({ listingId: z.string().uuid(), reason: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await supabaseAdmin.rpc("admin_delete_listing_tx" as any, {
      _listing_id: data.listingId, _reason: data.reason ?? null,
    });
    if (error) throw new Error(error.message);
    return res as any;
  });

export const adminDeleteChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { challengeId: string; reason?: string }) =>
    z.object({ challengeId: z.string().uuid(), reason: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await supabaseAdmin.rpc("admin_delete_challenge_tx" as any, {
      _challenge_id: data.challengeId, _reason: data.reason ?? null,
    });
    if (error) throw new Error(error.message);
    return res as any;
  });

export const grantAchievement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; achievementId: string }) =>
    z.object({ userId: z.string().uuid(), achievementId: z.string().min(1).max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await supabaseAdmin.rpc("grant_achievement_tx" as any, {
      _user: data.userId, _achievement: data.achievementId,
    });
    if (error) throw new Error(error.message);
    return res as any;
  });

export const setActiveTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tag: string | null }) => z.object({ tag: z.string().nullable() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await supabaseAdmin.rpc("set_active_tag" as any, { _tag: data.tag });
    if (error) throw new Error(error.message);
    return res as any;
  });
