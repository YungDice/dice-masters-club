import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Daily reward ----------
export const claimDaily = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = new Date().toISOString().slice(0, 10);
    const { data: txs } = await supabaseAdmin
      .from("dice_transactions")
      .select("id, created_at")
      .eq("user_id", context.userId)
      .eq("source", "daily")
      .gte("created_at", today + "T00:00:00Z")
      .limit(1);
    if (txs && txs.length) return { ok: false, reason: "already_claimed" };
    const reward = 100;
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: context.userId,
      _delta: reward,
      _type: "daily_reward",
      _source: "daily",
      _ref_kind: null as any,
      _ref_id: null as any,
      _note: "Daily login reward",
    });
    return { ok: true, reward };
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
    const me = Math.ceil(Math.random() * 6) + Math.ceil(Math.random() * 6);
    const house = Math.ceil(Math.random() * 6) + Math.ceil(Math.random() * 6);
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
    // Solo result has no room row; client logs through transactions instead
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
      SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
      SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
      SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
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
    return { reels, payout, delta: payout - data.bet };
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
    const code = data.isPrivate ? Math.random().toString(36).slice(2, 8).toUpperCase() : null;
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
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: context.userId, _delta: -room.stake, _type: "escrow_lock",
      _source: "coinflip", _ref_kind: "coinflip", _ref_id: room.id, _note: "Escrow",
    });
    await supabaseAdmin.from("game_players").insert({
      room_id: room.id, user_id: context.userId, seat: 1, staked: room.stake,
    });
    await supabaseAdmin.from("game_rooms").update({
      status: "active",
      state: { ...(room.state as any), joiner_id: context.userId },
    }).eq("id", room.id);
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
    const flip = Math.random() < 0.5 ? "heads" : "tails";
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
    const j = Math.floor(Math.random() * (i + 1));
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
    return { player, dealer, outcome, delta: payout - data.bet, playerScore: p, dealerScore: dl };
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
    const code = data.isPrivate ? Math.random().toString(36).slice(2, 8).toUpperCase() : null;
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
    const code = data.isPrivate ? Math.random().toString(36).slice(2, 8).toUpperCase() : null;
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
    const hostRoll = Math.ceil(Math.random() * 6) + Math.ceil(Math.random() * 6);
    const joinRoll = Math.ceil(Math.random() * 6) + Math.ceil(Math.random() * 6);
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
    return { hostRoll, joinRoll, winnerId, pot };
  });

// ---------- Marketplace buy ----------
export const buyListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { listingId: string }) => z.object({ listingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: listing } = await supabaseAdmin.from("marketplace_listings")
      .select("*").eq("id", data.listingId).eq("status", "active").single();
    if (!listing) throw new Error("Not available");
    if (listing.seller_id === context.userId) throw new Error("Can't buy own");
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: context.userId, _delta: -listing.price, _type: "marketplace_purchase",
      _source: "marketplace", _ref_kind: "listing", _ref_id: listing.id, _note: listing.title,
    });
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: listing.seller_id, _delta: listing.price, _type: "marketplace_sale",
      _source: "marketplace", _ref_kind: "listing", _ref_id: listing.id, _note: listing.title,
    });
    await supabaseAdmin.from("marketplace_purchases").insert({
      listing_id: listing.id, buyer_id: context.userId, seller_id: listing.seller_id, price: listing.price,
    });
    await supabaseAdmin.from("marketplace_listings").update({
      sales_count: (listing.sales_count ?? 0) + 1,
    }).eq("id", listing.id);
    await supabaseAdmin.from("notifications").insert({
      user_id: listing.seller_id, kind: "marketplace_sale",
      title: "You made a sale!", body: `${listing.title} sold for ${listing.price} DICE`,
      link: `/marketplace/${listing.id}`,
    });
    return { ok: true };
  });

// ---------- Challenge proof review (staff) ----------
export const reviewProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { proofId: string; approve: boolean; notes?: string }) =>
    z.object({ proofId: z.string().uuid(), approve: z.boolean(), notes: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isStaff } = await supabaseAdmin.rpc("is_staff", { _user_id: context.userId });
    if (!isStaff) throw new Error("Forbidden");
    const { data: proof } = await supabaseAdmin.from("challenge_proofs").select("*").eq("id", data.proofId).single();
    if (!proof) throw new Error("Not found");
    await supabaseAdmin.from("challenge_proofs").update({
      status: data.approve ? "approved" : "rejected",
      reviewer_id: context.userId, reviewer_notes: data.notes ?? null,
      reviewed_at: new Date().toISOString(),
    }).eq("id", data.proofId);
    if (data.approve) {
      const { data: chal } = await supabaseAdmin.from("challenges").select("*").eq("id", proof.challenge_id).single();
      if (chal && chal.dice_reward > 0) {
        await supabaseAdmin.rpc("wallet_adjust", {
          _user: proof.user_id, _delta: chal.dice_reward, _type: "challenge_reward",
          _source: "challenge", _ref_kind: "challenge", _ref_id: chal.id, _note: chal.title,
        });
      }
      if (chal && chal.xp_reward > 0) {
        const { data: p } = await supabaseAdmin.from("profiles").select("xp,level").eq("id", proof.user_id).single();
        const newXp = (p?.xp ?? 0) + chal.xp_reward;
        const newLevel = Math.max(1, Math.floor(Math.sqrt(newXp / 100)));
        await supabaseAdmin.from("profiles").update({ xp: newXp, level: newLevel }).eq("id", proof.user_id);
      }
      await supabaseAdmin.from("challenge_participants").upsert({
        challenge_id: proof.challenge_id, user_id: proof.user_id, completed: true,
      } as any, { onConflict: "challenge_id,user_id" });
    }
    await supabaseAdmin.from("notifications").insert({
      user_id: proof.user_id, kind: "proof_result",
      title: data.approve ? "Proof approved 🎉" : "Proof rejected",
      body: data.notes ?? null, link: `/challenges/${proof.challenge_id}`,
    });
    await supabaseAdmin.from("moderation_actions").insert({
      moderator_id: context.userId, action: data.approve ? "approve_proof" : "reject_proof",
      target_kind: "proof", target_id: data.proofId, reason: data.notes ?? null,
    });
    return { ok: true };
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

// ---------- Bootstrap first admin (any signed-in user becomes admin if none exists) ----------
export const claimFirstAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "admin");
    if ((count ?? 0) > 0) return { ok: false, reason: "exists" };
    await supabaseAdmin.from("user_roles").upsert({ user_id: context.userId, role: "admin" } as any, { onConflict: "user_id,role" });
    return { ok: true };
  });

// ---------- Gallery: like + reward creator ----------
export const toggleGalleryLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { itemId: string }) => z.object({ itemId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: item } = await supabaseAdmin.from("gallery_items").select("id,user_id").eq("id", data.itemId).maybeSingle();
    if (!item) throw new Error("Not found");
    const { data: existing } = await supabaseAdmin.from("gallery_likes").select("id").eq("item_id", data.itemId).eq("user_id", context.userId).maybeSingle();
    if (existing) {
      await supabaseAdmin.from("gallery_likes").delete().eq("id", existing.id);
      return { liked: false };
    }
    await supabaseAdmin.from("gallery_likes").insert({ item_id: data.itemId, user_id: context.userId });
    if (item.user_id !== context.userId) {
      await supabaseAdmin.rpc("wallet_adjust", {
        _user: item.user_id, _delta: 10, _type: "event",
        _source: "gallery_like", _ref_kind: "gallery_item", _ref_id: data.itemId, _note: "Video liked",
      });
    }
    return { liked: true };
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
      tags: data.tags, status: "pending_review",
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
