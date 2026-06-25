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
