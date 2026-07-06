import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomInt } from "node:crypto";
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
  // Cryptographically secure shuffle (Fisher–Yates)
  for (let i = d.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
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

// ---------------- Private state helpers ----------------
// Secret state (deck contents, dealer hole card) lives in `game_private_state`
// which has no client-readable RLS policy. `game_rooms.state` only ever holds
// the sanitized public view, so even if a client subscribes to the room row
// they cannot see the next cards.
async function savePrivate(adm: any, roomId: string, priv: { deck: Card[]; dealerHole?: Card | null; hand?: Card[] }) {
  const { error } = await (adm.rpc as any)("save_game_private_state", {
    _room_id: roomId,
    _state: priv,
  });
  if (error) throw error;
}
async function loadPrivate(adm: any, roomId: string): Promise<any> {
  const { data } = await adm.from("game_private_state").select("state").eq("room_id", roomId).single();
  if (!data) throw new Error("Game state not found");
  return data.state;
}

// ---------------- Blackjack (single player, interactive) ----------------
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

    const fullState = { player, dealer, bet: data.bet, status, outcome, delta, doubled: false };
    // Public state: never contains the deck, and hides the hole card while still in play
    const publicState = bjView(fullState);
    const { data: room, error } = await supabaseAdmin.from("game_rooms").insert({
      kind: "blackjack", host_id: context.userId, stake: data.bet,
      max_players: 1, is_private: true,
      status: status === "finished" ? "finished" : "active",
      state: { ...publicState, _full_dealer_revealed: status === "finished" ? dealer : null },
    }).select("id").single();
    if (error) throw error;
    // Persist secret deck + true dealer hand
    await savePrivate(supabaseAdmin, room.id, { deck, dealerHole: dealer[1], hand: player });
    if (status === "finished" && outcome) {
      await supabaseAdmin.rpc("record_game_result" as any, {
        _uid: context.userId, _kind: "blackjack", _delta: delta,
        _outcome: outcome === "push" ? "tie" : outcome === "blackjack" ? "win" : outcome,
        _room_id: room.id, _details: { initial: true } as any,
        _wagered: data.bet, _payout: delta + data.bet,
      });
    }
    return { roomId: room.id, ...publicState };
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
    const priv = await loadPrivate(supabaseAdmin, room.id);
    const pubState = room.state as any;
    if (pubState.status !== "player_turn") throw new Error("Hand finished");
    // Reconstruct full state
    const player: Card[] = priv.hand ?? pubState.player;
    const dealer: Card[] = [pubState.dealer[0], priv.dealerHole];
    const deck: Card[] = priv.deck;
    let bet = pubState.bet;
    let doubled = !!pubState.doubled;
    let status: "player_turn" | "dealer_turn" | "finished" = "player_turn";

    if (data.action === "double") {
      if (player.length !== 2 || doubled) throw new Error("Cannot double now");
      await supabaseAdmin.rpc("wallet_adjust", {
        _user: context.userId, _delta: -bet, _type: "game_stake",
        _source: "blackjack", _ref_kind: "blackjack", _ref_id: room.id, _note: "Double down",
      });
      doubled = true; bet = bet * 2;
      player.push(deck.pop()!);
      status = "dealer_turn";
    } else if (data.action === "hit") {
      player.push(deck.pop()!);
      if (bjScore(player) >= 21) status = "dealer_turn";
    } else {
      status = "dealer_turn";
    }

    let outcome: "win" | "loss" | "push" | null = null;
    let delta = -bet;
    if (status === "dealer_turn") {
      while (bjScore(dealer) < 17) dealer.push(deck.pop()!);
      const ps = bjScore(player), ds = bjScore(dealer);
      let payAmount = 0;
      if (ps > 21) outcome = "loss";
      else if (ds > 21 || ps > ds) { outcome = "win"; payAmount = bet * 2; }
      else if (ps === ds) { outcome = "push"; payAmount = bet; }
      else outcome = "loss";
      if (payAmount > 0) {
        await supabaseAdmin.rpc("wallet_adjust", {
          _user: context.userId, _delta: payAmount,
          _type: outcome === "win" ? "game_payout" : "refund",
          _source: "blackjack", _ref_kind: "blackjack", _ref_id: room.id, _note: outcome,
        });
      }
      status = "finished";
      delta = payAmount - bet;
    }

    const fullState = { player, dealer, bet, doubled, status, outcome, delta };
    const view = bjView(fullState);
    await supabaseAdmin.from("game_rooms").update({
      state: view,
      status: status === "finished" ? "finished" : "active",
      finished_at: status === "finished" ? new Date().toISOString() : null,
    }).eq("id", room.id);
    await savePrivate(supabaseAdmin, room.id, { deck, dealerHole: dealer[1], hand: player });
    if (status === "finished" && outcome) {
      await supabaseAdmin.rpc("record_game_result" as any, {
        _uid: context.userId, _kind: "blackjack", _delta: delta,
        _outcome: outcome === "push" ? "tie" : outcome,
        _room_id: room.id, _details: { doubled, action: data.action } as any,
        _wagered: bet, _payout: delta + bet,
      });
    }
    return { roomId: room.id, ...view };

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
  let isStraight = true;
  for (let i = 1; i < 5; i++) if (ranks[i] !== ranks[i-1] + 1) { isStraight = false; break; }
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
  if (countVals[0] === 2) {
    const pairRank = Number(Object.keys(counts).find(k => counts[Number(k)] === 2));
    if (pairRank >= 9) return "jacks_or_better";
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
    const publicState = { hand, bet: data.bet, phase: "draw", outcome: null, payout: 0 };
    const { data: room, error } = await supabaseAdmin.from("game_rooms").insert({
      kind: "poker", host_id: context.userId, stake: data.bet,
      max_players: 1, is_private: true, status: "active", state: publicState,
    }).select("id").single();
    if (error) throw error;
    await savePrivate(supabaseAdmin, room.id, { deck, hand });
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
    const pubState = room.state as any;
    if (pubState.phase !== "draw") throw new Error("Already finished");
    const priv = await loadPrivate(supabaseAdmin, room.id);
    const deck: Card[] = priv.deck;
    const hand: Card[] = priv.hand ?? pubState.hand;
    const newHand: Card[] = hand.map((c: Card, i: number) => data.hold[i] ? c : deck.pop()!);
    const result = vpEvaluate(newHand);
    const payAmount = pubState.bet * VP_PAY[result];
    if (payAmount > 0) {
      await supabaseAdmin.rpc("wallet_adjust", {
        _user: context.userId, _delta: payAmount, _type: "game_payout",
        _source: "video_poker", _ref_kind: "poker", _ref_id: room.id, _note: result,
      });
    }
    const next = { hand: newHand, bet: pubState.bet, phase: "finished", outcome: result, payout: payAmount };
    await supabaseAdmin.from("game_rooms").update({
      state: next, status: "finished", finished_at: new Date().toISOString(),
    }).eq("id", room.id);
    await savePrivate(supabaseAdmin, room.id, { deck, hand: newHand });
    const vpDelta = payAmount - pubState.bet;
    await supabaseAdmin.rpc("record_game_result" as any, {
      _uid: context.userId, _kind: "poker", _delta: vpDelta,
      _outcome: vpDelta > 0 ? "win" : vpDelta < 0 ? "loss" : "tie",
      _room_id: room.id, _details: { result } as any,
      _wagered: pubState.bet, _payout: payAmount,
    });
    return { hand: newHand, outcome: result, payout: payAmount, delta: vpDelta };

  });

export const VP_PAYTABLE = VP_PAY;

// ============================================================
// MULTIPLAYER BLACKJACK
// Public state in game_rooms.state holds the sanitized view; secret
// state (deck + dealer hole card) lives in game_private_state.
// ============================================================

type MbjSeat = {
  userId: string; displayName: string; hand: Card[];
  status: "playing" | "stand" | "bust" | "blackjack";
  doubled: boolean; outcome?: "win" | "loss" | "push" | "blackjack" | null;
  delta?: number; bet: number; leftEarly?: boolean;
};

function mbjPublicView(state: any) {
  return {
    phase: state.phase,
    turn: state.turn,
    bet: state.bet,
    revealDealer: !!state.revealDealer,
    dealer: state.revealDealer
      ? state.dealer
      : (state.dealer?.length ? [state.dealer[0], { r: "?", s: "?" }] : []),
    dealerScore: state.revealDealer ? bjScore(state.dealer) : (state.dealer?.length ? bjScore([state.dealer[0]]) : 0),
    seats: (state.seats ?? []).map((s: MbjSeat) => ({
      userId: s.userId, displayName: s.displayName,
      hand: s.hand, score: bjScore(s.hand ?? []),
      status: s.status, doubled: s.doubled, outcome: s.outcome ?? null,
      delta: s.delta ?? 0, bet: s.bet, leftEarly: !!s.leftEarly,
    })),
  };
}

// Public room state stays sanitized at all times.
async function persistMbj(adm: any, roomId: string, full: any, opts: { roomStatus?: string; finishedAt?: string | null } = {}) {
  const view = mbjPublicView(full);
  const patch: any = { state: view };
  if (opts.roomStatus !== undefined) patch.status = opts.roomStatus;
  if (opts.finishedAt !== undefined) patch.finished_at = opts.finishedAt;
  await adm.from("game_rooms").update(patch).eq("id", roomId);
  await savePrivate(adm, roomId, { deck: full.deck ?? [], dealerHole: full.dealer?.[1] ?? null });
}

async function loadMbjFull(adm: any, roomId: string) {
  const { data: room } = await adm.from("game_rooms").select("*").eq("id", roomId).single();
  if (!room) throw new Error("Room not found");
  let priv: any = { deck: [], dealerHole: null };
  if (room.status !== "waiting") {
    try { priv = await loadPrivate(adm, roomId); } catch { /* no private yet */ }
  }
  const pub = (room.state ?? {}) as any;
  // Reconstruct the full state used by server logic
  const dealerFull = pub.revealDealer
    ? pub.dealer
    : (pub.dealer?.length ? [pub.dealer[0], priv.dealerHole] : []);
  const full = {
    phase: pub.phase,
    turn: pub.turn,
    bet: pub.bet,
    revealDealer: pub.revealDealer,
    dealer: dealerFull,
    deck: priv.deck ?? [],
    seats: pub.seats ?? [],
  };
  return { room, full };
}

export const mbjCreate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bet: number; maxPlayers: number }) =>
    z.object({ bet: z.number().int().min(10).max(2000), maxPlayers: z.number().int().min(2).max(4) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: context.userId, _delta: -data.bet, _type: "game_stake",
      _source: "blackjack_mp", _ref_kind: "blackjack", _ref_id: null as any, _note: "Lobby create",
    });
    const { data: prof } = await supabaseAdmin.from("profiles").select("display_name,username").eq("id", context.userId).single();
    const seat: MbjSeat = { userId: context.userId, displayName: prof?.display_name ?? prof?.username ?? "Host",
      hand: [], status: "playing", doubled: false, bet: data.bet };
    const lobbyState = { phase: "lobby", turn: 0, bet: data.bet, seats: [seat], dealer: [], revealDealer: false };
    const { data: room, error } = await supabaseAdmin.from("game_rooms").insert({
      kind: "blackjack", host_id: context.userId, stake: data.bet,
      max_players: data.maxPlayers, is_private: false, status: "waiting",
      state: mbjPublicView(lobbyState),
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
    await supabaseAdmin.from("game_rooms").update({ state: mbjPublicView(s) }).eq("id", room.id);
    return { ok: true };
  });

export const mbjLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { roomId: string }) => z.object({ roomId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: room } = await supabaseAdmin.from("game_rooms").select("*").eq("id", data.roomId).single();
    if (!room) throw new Error("Room not found");
    if (room.status === "finished" || room.status === "cancelled") {
      throw new Error("Game already ended");
    }

    // --- Waiting lobby: refund & remove seat ---
    if (room.status === "waiting") {
      const s = room.state as any;
      const idx = s.seats.findIndex((x: any) => x.userId === context.userId);
      if (idx < 0) throw new Error("Not in lobby");
      await supabaseAdmin.rpc("wallet_adjust", {
        _user: context.userId, _delta: room.stake, _type: "refund",
        _source: "blackjack_mp", _ref_kind: "blackjack", _ref_id: room.id, _note: "Leave lobby",
      });
      s.seats.splice(idx, 1);
      if (s.seats.length === 0) {
        await supabaseAdmin.from("game_rooms").update({ state: mbjPublicView(s), status: "cancelled", finished_at: new Date().toISOString() }).eq("id", room.id);
      } else {
        const patch: any = { state: mbjPublicView(s) };
        if (room.host_id === context.userId) patch.host_id = s.seats[0].userId;
        await supabaseAdmin.from("game_rooms").update(patch).eq("id", room.id);
      }
      return { ok: true, mode: "refunded" };
    }

    // --- Active game: forfeit seat, game continues for others ---
    const { room: r2, full: s } = await loadMbjFull(supabaseAdmin, data.roomId);
    const idx = s.seats.findIndex((x: any) => x.userId === context.userId);
    if (idx < 0) throw new Error("Not in this game");
    const seat = s.seats[idx];
    if (seat.outcome || seat.leftEarly) throw new Error("Already resolved");
    seat.leftEarly = true;
    seat.status = "stand";

    const activeRemaining = s.seats.filter((x: any) => !x.leftEarly && !x.outcome && x.status === "playing").length;
    if (activeRemaining === 0) {
      await mbjResolve(supabaseAdmin, r2, s);
      await persistMbj(supabaseAdmin, r2.id, s, { roomStatus: "finished", finishedAt: new Date().toISOString() });
      return { ok: true, mode: "forfeit_resolved" };
    }
    if (s.turn === idx) {
      while (s.turn < s.seats.length && s.seats[s.turn].status !== "playing") s.turn++;
      if (s.turn >= s.seats.length) {
        await mbjResolve(supabaseAdmin, r2, s);
        await persistMbj(supabaseAdmin, r2.id, s, { roomStatus: "finished", finishedAt: new Date().toISOString() });
        return { ok: true, mode: "forfeit_resolved" };
      }
    }
    await persistMbj(supabaseAdmin, r2.id, s);
    return { ok: true, mode: "forfeit" };
  });

export const mbjCleanup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("cleanup_abandoned_lobbies" as any);
    if (error) throw error;
    return data;
  });

async function mbjResolve(adm: any, room: any, s: any) {
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
    await adm.from("notifications").insert({
      user_id: seat.userId, kind: "game_turn",
      title: `Blackjack: ${outcome.toUpperCase()}`,
      body: `Hand ${ps} vs Dealer ${ds} · ${seat.delta >= 0 ? "+" : ""}${seat.delta} DICE`,
      link: `/play/blackjack`,
    });
    await adm.rpc("record_game_result", {
      _uid: seat.userId, _kind: "blackjack", _delta: seat.delta,
      _outcome: outcome === "push" ? "tie" : outcome === "blackjack" ? "win" : outcome,
      _room_id: room.id, _details: { ps, ds, mp: true },
      _wagered: seat.bet, _payout: seat.delta + seat.bet,
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
    const pub = room.state as any;
    if (!pub.seats || pub.seats.length < 1) throw new Error("Need at least 1 player");
    const deck = newDeck();
    const s: any = { phase: "playing", turn: 0, bet: pub.bet, seats: pub.seats, dealer: [], deck, revealDealer: false };
    for (const seat of s.seats) seat.hand = [deck.pop()!, deck.pop()!];
    s.dealer = [deck.pop()!, deck.pop()!];
    for (const seat of s.seats) {
      if (bjScore(seat.hand) === 21) seat.status = "blackjack";
    }
    s.turn = 0;
    while (s.turn < s.seats.length && s.seats[s.turn].status !== "playing") s.turn++;
    if (s.turn >= s.seats.length) {
      await mbjResolve(supabaseAdmin, room, s);
      await persistMbj(supabaseAdmin, room.id, s, { roomStatus: "finished", finishedAt: new Date().toISOString() });
    } else {
      await persistMbj(supabaseAdmin, room.id, s, { roomStatus: "active" });
    }
    return { ok: true };
  });

export const mbjAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { roomId: string; action: "hit" | "stand" | "double" }) =>
    z.object({ roomId: z.string().uuid(), action: z.enum(["hit", "stand", "double"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { room, full: s } = await loadMbjFull(supabaseAdmin, data.roomId);
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
    while (s.turn < s.seats.length && s.seats[s.turn].status !== "playing") s.turn++;
    if (s.turn >= s.seats.length) {
      await mbjResolve(supabaseAdmin, room, s);
      await persistMbj(supabaseAdmin, room.id, s, { roomStatus: "finished", finishedAt: new Date().toISOString() });
    } else {
      await persistMbj(supabaseAdmin, room.id, s);
    }
    return { ok: true };
  });

export const mbjView = mbjPublicView;
