import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------- Shared card helpers ----------------
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
function bjScore(h: Card[]) {
  let t = h.reduce((a, c) => a + c.v, 0);
  let aces = h.filter((c) => c.r === "A").length;
  while (t > 21 && aces > 0) { t -= 10; aces--; }
  return t;
}

// ---------------- Blackjack (interactive) ----------------
// Stores hidden state (deck) inside game_rooms.state. Room is_private=true so RLS
// only allows host to read; we still only return sanitized state from server fns.
async function payout(adm: any, userId: string, amount: number, source: string, refId: string, note: string, type = "game_payout") {
  if (amount > 0) {
    await adm.rpc("wallet_adjust", {
      _user: userId, _delta: amount, _type: type,
      _source: source, _ref_kind: "blackjack", _ref_id: refId, _note: note,
    });
  }
}
function bjView(state: any) {
  const dealerVisible = state.status === "player_turn"
    ? [state.dealer[0], { r: "?", s: "?" }]
    : state.dealer;
  return {
    player: state.player,
    dealer: dealerVisible,
    playerScore: bjScore(state.player),
    dealerScore: state.status === "player_turn" ? bjScore([state.dealer[0]]) : bjScore(state.dealer),
    status: state.status,
    outcome: state.outcome ?? null,
    bet: state.bet,
    doubled: state.doubled ?? false,
    delta: state.delta ?? 0,
    canDouble: state.status === "player_turn" && state.player.length === 2 && !state.doubled,
  };
}

export const bjDeal = createServerFn({ method: "POST" })
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
    const ps = bjScore(player), ds = bjScore(dealer);
    let status: "player_turn" | "finished" = "player_turn";
    let outcome: "win" | "loss" | "push" | "blackjack" | null = null;
    let delta = -data.bet;

    // Natural blackjack handling
    if (ps === 21) {
      status = "finished";
      if (ds === 21) {
        outcome = "push";
        await supabaseAdmin.rpc("wallet_adjust", {
          _user: context.userId, _delta: data.bet, _type: "refund",
          _source: "blackjack", _ref_kind: "blackjack", _ref_id: null as any, _note: "Push",
        });
        delta = 0;
      } else {
        outcome = "blackjack";
        const pay = Math.floor(data.bet * 2.5);
        await supabaseAdmin.rpc("wallet_adjust", {
          _user: context.userId, _delta: pay, _type: "game_payout",
          _source: "blackjack", _ref_kind: "blackjack", _ref_id: null as any, _note: "Blackjack 3:2",
        });
        delta = pay - data.bet;
      }
    }

    const state = { deck, player, dealer, bet: data.bet, status, outcome, delta, doubled: false };
    const { data: room, error } = await supabaseAdmin.from("game_rooms").insert({
      kind: "blackjack", host_id: context.userId, stake: data.bet,
      max_players: 1, is_private: true, status: status === "finished" ? "finished" : "active",
      state,
    }).select("id").single();
    if (error) throw error;
    return { roomId: room.id, ...bjView(state) };
  });

export const bjAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { roomId: string; action: "hit" | "stand" | "double" }) =>
    z.object({ roomId: z.string().uuid(), action: z.enum(["hit", "stand", "double"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: room } = await supabaseAdmin.from("game_rooms").select("*")
      .eq("id", data.roomId).eq("host_id", context.userId).single();
    if (!room) throw new Error("Room not found");
    const s = room.state as any;
    if (s.status !== "player_turn") throw new Error("Hand finished");

    if (data.action === "double") {
      if (s.player.length !== 2 || s.doubled) throw new Error("Cannot double now");
      // take additional stake
      await supabaseAdmin.rpc("wallet_adjust", {
        _user: context.userId, _delta: -s.bet, _type: "game_stake",
        _source: "blackjack", _ref_kind: "blackjack", _ref_id: room.id, _note: "Double down",
      });
      s.doubled = true;
      s.bet = s.bet * 2;
      // one card then stand
      s.player.push(s.deck.pop()!);
      s.status = "dealer_turn";
    } else if (data.action === "hit") {
      s.player.push(s.deck.pop()!);
      if (bjScore(s.player) >= 21) s.status = "dealer_turn";
    } else {
      s.status = "dealer_turn";
    }

    // Dealer plays if it's their turn
    if (s.status === "dealer_turn") {
      // dealer reveals & hits until 17+
      while (bjScore(s.dealer) < 17) s.dealer.push(s.deck.pop()!);
      const ps = bjScore(s.player), ds = bjScore(s.dealer);
      let outcome: "win" | "loss" | "push";
      let payAmount = 0;
      if (ps > 21) outcome = "loss";
      else if (ds > 21 || ps > ds) { outcome = "win"; payAmount = s.bet * 2; }
      else if (ps === ds) { outcome = "push"; payAmount = s.bet; }
      else outcome = "loss";
      if (payAmount > 0) {
        await supabaseAdmin.rpc("wallet_adjust", {
          _user: context.userId, _delta: payAmount,
          _type: outcome === "win" ? "game_payout" : "refund",
          _source: "blackjack", _ref_kind: "blackjack", _ref_id: room.id, _note: outcome,
        });
      }
      s.status = "finished";
      s.outcome = outcome;
      s.delta = payAmount - s.bet;
    }

    await supabaseAdmin.from("game_rooms").update({
      state: s,
      status: s.status === "finished" ? "finished" : "active",
      finished_at: s.status === "finished" ? new Date().toISOString() : null,
    }).eq("id", room.id);
    return { roomId: room.id, ...bjView(s) };
  });

// ---------------- Video Poker (Jacks or Better) ----------------
const VP_PAY: Record<string, number> = {
  royal_flush: 250, straight_flush: 50, four_kind: 25, full_house: 9,
  flush: 6, straight: 4, three_kind: 3, two_pair: 2, jacks_or_better: 1, none: 0,
};
const RANK_ORDER = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
function rankIdx(r: string) { return RANK_ORDER.indexOf(r); }
function vpEvaluate(h: Card[]): keyof typeof VP_PAY {
  const ranks = h.map(c => rankIdx(c.r)).sort((a,b) => a-b);
  const suits = h.map(c => c.s);
  const counts: Record<number, number> = {};
  ranks.forEach(r => counts[r] = (counts[r] ?? 0) + 1);
  const countVals = Object.values(counts).sort((a,b) => b-a);
  const isFlush = suits.every(s => s === suits[0]);
  // straights
  let isStraight = true;
  for (let i = 1; i < 5; i++) if (ranks[i] !== ranks[i-1] + 1) { isStraight = false; break; }
  // wheel A-2-3-4-5
  const wheel = JSON.stringify(ranks) === JSON.stringify([0,1,2,3,12]);
  const royal = isFlush && JSON.stringify(ranks) === JSON.stringify([8,9,10,11,12]);
  if (royal) return "royal_flush";
  if (isFlush && (isStraight || wheel)) return "straight_flush";
  if (countVals[0] === 4) return "four_kind";
  if (countVals[0] === 3 && countVals[1] === 2) return "full_house";
  if (isFlush) return "flush";
  if (isStraight || wheel) return "straight";
  if (countVals[0] === 3) return "three_kind";
  if (countVals[0] === 2 && countVals[1] === 2) return "two_pair";
  // jacks or better: pair of J,Q,K,A
  if (countVals[0] === 2) {
    const pairRank = Number(Object.keys(counts).find(k => counts[Number(k)] === 2));
    if (pairRank >= 9) return "jacks_or_better"; // J=9
  }
  return "none";
}

export const vpDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bet: number }) =>
    z.object({ bet: z.number().int().min(5).max(2500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: context.userId, _delta: -data.bet, _type: "game_stake",
      _source: "video_poker", _ref_kind: "poker", _ref_id: null as any, _note: "Deal",
    });
    const deck = newDeck();
    const hand: Card[] = [deck.pop()!, deck.pop()!, deck.pop()!, deck.pop()!, deck.pop()!];
    const state = { deck, hand, bet: data.bet, phase: "draw", outcome: null, payout: 0 };
    const { data: room, error } = await supabaseAdmin.from("game_rooms").insert({
      kind: "poker", host_id: context.userId, stake: data.bet,
      max_players: 1, is_private: true, status: "active", state,
    }).select("id").single();
    if (error) throw error;
    return { roomId: room.id, hand, phase: "draw" as const };
  });

export const vpDraw = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { roomId: string; hold: boolean[] }) =>
    z.object({
      roomId: z.string().uuid(),
      hold: z.array(z.boolean()).length(5),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: room } = await supabaseAdmin.from("game_rooms").select("*")
      .eq("id", data.roomId).eq("host_id", context.userId).single();
    if (!room) throw new Error("Room not found");
    const s = room.state as any;
    if (s.phase !== "draw") throw new Error("Already finished");
    const newHand: Card[] = s.hand.map((c: Card, i: number) =>
      data.hold[i] ? c : s.deck.pop()!);
    const result = vpEvaluate(newHand);
    const payAmount = s.bet * VP_PAY[result];
    if (payAmount > 0) {
      await supabaseAdmin.rpc("wallet_adjust", {
        _user: context.userId, _delta: payAmount, _type: "game_payout",
        _source: "video_poker", _ref_kind: "poker", _ref_id: room.id, _note: result,
      });
    }
    s.hand = newHand; s.phase = "finished"; s.outcome = result; s.payout = payAmount;
    await supabaseAdmin.from("game_rooms").update({
      state: s, status: "finished", finished_at: new Date().toISOString(),
    }).eq("id", room.id);
    return { hand: newHand, outcome: result, payout: payAmount, delta: payAmount - s.bet };
  });

export const VP_PAYTABLE = VP_PAY;

// ============================================================
// MULTIPLAYER BLACKJACK (lobbies, turn-based, shared dealer)
// ============================================================
// state shape (game_rooms.state):
// {
//   phase: 'lobby'|'playing'|'finished',
//   turn: number,
//   bet: number,
//   seats: [{ userId, displayName, hand: Card[], status:'playing'|'stand'|'bust'|'blackjack', doubled:boolean, outcome?:'win'|'loss'|'push'|'blackjack', delta?:number, bet:number }],
//   dealer: Card[],
//   deck: Card[],
//   revealDealer: boolean,
// }

function mbjPublicView(state: any) {
  return {
    phase: state.phase,
    turn: state.turn,
    bet: state.bet,
    revealDealer: !!state.revealDealer,
    dealer: state.revealDealer ? state.dealer : (state.dealer?.length ? [state.dealer[0], { r: "?", s: "?" }] : []),
    dealerScore: state.revealDealer ? bjScore(state.dealer) : (state.dealer?.length ? bjScore([state.dealer[0]]) : 0),
    seats: (state.seats ?? []).map((s: any) => ({
      userId: s.userId, displayName: s.displayName,
      hand: s.hand, score: bjScore(s.hand ?? []),
      status: s.status, doubled: s.doubled, outcome: s.outcome ?? null,
      delta: s.delta ?? 0, bet: s.bet, leftEarly: !!s.leftEarly,
    })),
  };
}

export const mbjCreate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bet: number; maxPlayers: number }) =>
    z.object({ bet: z.number().int().min(10).max(2000), maxPlayers: z.number().int().min(2).max(4) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Stake from host
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: context.userId, _delta: -data.bet, _type: "game_stake",
      _source: "blackjack_mp", _ref_kind: "blackjack", _ref_id: null as any, _note: "Lobby create",
    });
    const { data: prof } = await supabaseAdmin.from("profiles").select("display_name,username").eq("id", context.userId).single();
    const seat = { userId: context.userId, displayName: prof?.display_name ?? prof?.username ?? "Host",
      hand: [], status: "playing", doubled: false, bet: data.bet };
    const state = { phase: "lobby", turn: 0, bet: data.bet, seats: [seat], dealer: [], deck: [], revealDealer: false };
    const { data: room, error } = await supabaseAdmin.from("game_rooms").insert({
      kind: "blackjack", host_id: context.userId, stake: data.bet,
      max_players: data.maxPlayers, is_private: false, status: "waiting", state,
    }).select("id").single();
    if (error) throw error;
    return { roomId: room.id };
  });

export const mbjJoin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { roomId: string }) => z.object({ roomId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: room } = await supabaseAdmin.from("game_rooms").select("*").eq("id", data.roomId).single();
    if (!room) throw new Error("Room not found");
    if (room.kind !== "blackjack") throw new Error("Wrong game");
    if (room.status !== "waiting") throw new Error("Game already started");
    const s = room.state as any;
    if (s.seats.find((x: any) => x.userId === context.userId)) throw new Error("Already in lobby");
    if (s.seats.length >= (room.max_players ?? 4)) throw new Error("Lobby full");
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: context.userId, _delta: -room.stake, _type: "game_stake",
      _source: "blackjack_mp", _ref_kind: "blackjack", _ref_id: room.id, _note: "Lobby join",
    });
    const { data: prof } = await supabaseAdmin.from("profiles").select("display_name,username").eq("id", context.userId).single();
    s.seats.push({ userId: context.userId, displayName: prof?.display_name ?? prof?.username ?? "Player",
      hand: [], status: "playing", doubled: false, bet: room.stake });
    await supabaseAdmin.from("game_rooms").update({ state: s }).eq("id", room.id);
    return { ok: true };
  });

export const mbjLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { roomId: string }) => z.object({ roomId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: room } = await supabaseAdmin.from("game_rooms").select("*").eq("id", data.roomId).single();
    if (!room) throw new Error("Room not found");
    if (room.status !== "waiting") throw new Error("Already started — can't leave");
    const s = room.state as any;
    const idx = s.seats.findIndex((x: any) => x.userId === context.userId);
    if (idx < 0) throw new Error("Not in lobby");
    // refund
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: context.userId, _delta: room.stake, _type: "refund",
      _source: "blackjack_mp", _ref_kind: "blackjack", _ref_id: room.id, _note: "Leave lobby",
    });
    s.seats.splice(idx, 1);
    if (s.seats.length === 0) {
      await supabaseAdmin.from("game_rooms").update({ state: s, status: "cancelled", finished_at: new Date().toISOString() }).eq("id", room.id);
    } else {
      await supabaseAdmin.from("game_rooms").update({ state: s }).eq("id", room.id);
    }
    return { ok: true };
  });

async function mbjResolve(adm: any, room: any, s: any) {
  // dealer draws to 17
  while (bjScore(s.dealer) < 17) s.dealer.push(s.deck.pop()!);
  s.revealDealer = true;
  const ds = bjScore(s.dealer);
  for (const seat of s.seats) {
    const ps = bjScore(seat.hand);
    let outcome: "win" | "loss" | "push" | "blackjack";
    let pay = 0;
    if (seat.status === "blackjack") { outcome = "blackjack"; pay = Math.floor(seat.bet * 2.5); }
    else if (seat.leftEarly || seat.status === "bust" || ps > 21) outcome = "loss";
    else if (ds > 21 || ps > ds) { outcome = "win"; pay = seat.bet * 2; }
    else if (ps === ds) { outcome = "push"; pay = seat.bet; }
    else outcome = "loss";
    seat.outcome = outcome;
    seat.delta = pay - seat.bet;
    if (pay > 0 && !seat.leftEarly) {
      await adm.rpc("wallet_adjust", {
        _user: seat.userId, _delta: pay,
        _type: outcome === "win" || outcome === "blackjack" ? "game_payout" : "refund",
        _source: "blackjack_mp", _ref_kind: "blackjack", _ref_id: room.id, _note: outcome,
      });
    }
    // notification
    await adm.from("notifications").insert({
      user_id: seat.userId, kind: "game_turn",
      title: `Blackjack: ${outcome.toUpperCase()}`,
      body: `Hand ${ps} vs Dealer ${ds} · ${seat.delta >= 0 ? "+" : ""}${seat.delta} DICE`,
      link: `/play/blackjack`,
    });
  }
  s.phase = "finished";
}

export const mbjStart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { roomId: string }) => z.object({ roomId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: room } = await supabaseAdmin.from("game_rooms").select("*").eq("id", data.roomId).single();
    if (!room) throw new Error("Room not found");
    if (room.host_id !== context.userId) throw new Error("Only host can start");
    if (room.status !== "waiting") throw new Error("Already started");
    const s = room.state as any;
    if (s.seats.length < 1) throw new Error("Need at least 1 player");
    const deck = newDeck();
    // deal 2 cards each, then 2 to dealer
    for (const seat of s.seats) seat.hand = [deck.pop()!, deck.pop()!];
    const dealer = [deck.pop()!, deck.pop()!];
    s.deck = deck;
    s.dealer = dealer;
    s.phase = "playing";
    s.revealDealer = false;
    // detect naturals
    for (const seat of s.seats) {
      if (bjScore(seat.hand) === 21) seat.status = "blackjack";
    }
    // advance turn to first non-blackjack seat
    s.turn = 0;
    while (s.turn < s.seats.length && s.seats[s.turn].status !== "playing") s.turn++;
    if (s.turn >= s.seats.length) {
      // everyone has blackjack — resolve immediately
      await mbjResolve(supabaseAdmin, room, s);
      await supabaseAdmin.from("game_rooms").update({
        state: s, status: "finished", finished_at: new Date().toISOString(),
      }).eq("id", room.id);
    } else {
      await supabaseAdmin.from("game_rooms").update({ state: s, status: "active" }).eq("id", room.id);
    }
    return { ok: true };
  });

export const mbjAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { roomId: string; action: "hit" | "stand" | "double" }) =>
    z.object({ roomId: z.string().uuid(), action: z.enum(["hit", "stand", "double"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: room } = await supabaseAdmin.from("game_rooms").select("*").eq("id", data.roomId).single();
    if (!room) throw new Error("Room not found");
    const s = room.state as any;
    if (s.phase !== "playing") throw new Error("Not playing");
    const seat = s.seats[s.turn];
    if (!seat || seat.userId !== context.userId) throw new Error("Not your turn");
    if (data.action === "double") {
      if (seat.hand.length !== 2 || seat.doubled) throw new Error("Cannot double");
      await supabaseAdmin.rpc("wallet_adjust", {
        _user: context.userId, _delta: -seat.bet, _type: "game_stake",
        _source: "blackjack_mp", _ref_kind: "blackjack", _ref_id: room.id, _note: "Double",
      });
      seat.doubled = true;
      seat.bet = seat.bet * 2;
      seat.hand.push(s.deck.pop()!);
      if (bjScore(seat.hand) > 21) seat.status = "bust";
      else seat.status = "stand";
    } else if (data.action === "hit") {
      seat.hand.push(s.deck.pop()!);
      if (bjScore(seat.hand) > 21) seat.status = "bust";
      else if (bjScore(seat.hand) === 21) seat.status = "stand";
    } else {
      seat.status = "stand";
    }
    // advance turn
    while (s.turn < s.seats.length && s.seats[s.turn].status !== "playing") s.turn++;
    if (s.turn >= s.seats.length) {
      await mbjResolve(supabaseAdmin, room, s);
      await supabaseAdmin.from("game_rooms").update({
        state: s, status: "finished", finished_at: new Date().toISOString(),
      }).eq("id", room.id);
    } else {
      await supabaseAdmin.from("game_rooms").update({ state: s }).eq("id", room.id);
    }
    return { ok: true };
  });

export const mbjView = mbjPublicView;
