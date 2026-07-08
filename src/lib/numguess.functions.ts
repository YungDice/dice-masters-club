// Number Guess minigame server functions.
// - Random number is generated server-side when the round starts.
// - Bet is escrowed up front; payouts settle on resolve.
// - 1-10 mode is stateful (up to 3 guesses per session).
// - 1-100 and 1-1000 modes are one-shot (single-number or range).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomInt } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const cryptoRandInt = (min: number, maxInclusive: number) =>
  randomInt(min, maxInclusive + 1);

const MAX_BET_10 = 2000;
const MAX_BET_GENERIC = 10000;
const ATTEMPT_PAYOUT = [3, 2, 1]; // 1st, 2nd, 3rd guess multipliers

const RANGE_PAY_100: Record<number, number> = { 25: 2, 10: 3, 5: 5 };
const RANGE_PAY_1000: Record<number, number> = { 250: 2, 100: 3, 25: 5, 1: 100 };

// ---------- 1-10 : stateful ----------
export const guess10Start = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bet: number }) =>
    z.object({ bet: z.number().int().min(1).max(MAX_BET_10) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: context.userId, _delta: -data.bet, _type: "game_stake",
      _source: "numguess" as any, _ref_kind: "numguess" as any as any as any, _ref_id: null as any, _note: "Guess 1-10 stake",
    });
    const secret = cryptoRandInt(1, 10);
    const state = {
      mode: "10", secret, bet: data.bet,
      attempts: [] as number[], finished: false, startedAt: Date.now(),
    };
    const { data: room, error } = await supabaseAdmin.from("game_rooms").insert({
      kind: "numguess" as any, host_id: context.userId, stake: data.bet,
      max_players: 1, is_private: true, status: "active", state,
    } as any).select("id").single();
    if (error) throw error;
    return { roomId: room.id };
  });

export const guess10Attempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { roomId: string; guess: number }) =>
    z.object({
      roomId: z.string().uuid(),
      guess: z.number().int().min(1).max(10),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: room } = await supabaseAdmin.from("game_rooms").select("*")
      .eq("id", data.roomId).eq("host_id", context.userId).eq("kind", "numguess" as any).single();
    if (!room) throw new Error("Session not found");
    if (room.status !== "active") throw new Error("Round already ended");
    const s: any = room.state ?? {};
    if (s.finished) throw new Error("Round already ended");
    if (s.mode !== "10") throw new Error("Wrong mode for this call");
    const attempts: number[] = Array.isArray(s.attempts) ? s.attempts : [];
    if (attempts.length >= 3) throw new Error("No guesses left");
    if (attempts.includes(data.guess)) throw new Error("You already tried that number");
    attempts.push(data.guess);

    const correct = data.guess === s.secret;
    const outOfGuesses = attempts.length >= 3 && !correct;
    const finished = correct || outOfGuesses;

    let payout = 0;
    if (correct) {
      const mult = ATTEMPT_PAYOUT[attempts.length - 1] ?? 0;
      payout = s.bet * mult;
      if (payout > 0) {
        await supabaseAdmin.rpc("wallet_adjust", {
          _user: context.userId, _delta: payout, _type: "game_payout",
          _source: "numguess" as any, _ref_kind: "numguess" as any as any as any, _ref_id: room.id,
          _note: `Guess 1-10 win (try ${attempts.length})`,
        });
      }
    }

    const newState = { ...s, attempts, finished };
    await supabaseAdmin.from("game_rooms").update({
      state: newState,
      status: finished ? "finished" : "active",
      finished_at: finished ? new Date().toISOString() : null,
    }).eq("id", room.id);

    if (finished) {
      const net = payout - s.bet;
      await supabaseAdmin.rpc("record_game_result" as any, {
        _uid: context.userId, _kind: "numguess" as any as any, _delta: net,
        _outcome: net > 0 ? "win" : net < 0 ? "loss" : "tie",
        _room_id: room.id,
        _details: { mode: "10", secret: s.secret, attempts, payout } as any,
        _wagered: s.bet, _payout: payout,
      });
    }

    return {
      correct,
      finished,
      attemptsUsed: attempts.length,
      remaining: Math.max(0, 3 - attempts.length),
      payout,
      // Only reveal the secret when the round ends.
      secret: finished ? s.secret : null,
    };
  });

// ---------- 1-100 / 1-1000 : one-shot ----------
const ChoiceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("single"), value: z.number().int() }),
  z.object({
    kind: z.literal("range"),
    start: z.number().int(),
    end: z.number().int(),
  }),
]);

function rangeSize(start: number, end: number) {
  return Math.max(0, end - start + 1);
}

export const guessOneShot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      mode: z.union([z.literal("100"), z.literal("1000")]),
      bet: z.number().int().min(1).max(MAX_BET_GENERIC),
      choice: ChoiceSchema,
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const maxN = data.mode === "100" ? 100 : 1000;

    // Validate choice
    let multiplier = 0;
    if (data.choice.kind === "single") {
      if (data.choice.value < 1 || data.choice.value > maxN) {
        throw new Error(`Number must be between 1 and ${maxN}`);
      }
      multiplier = data.mode === "100" ? 10 : 100;
    } else {
      const { start, end } = data.choice;
      if (start < 1 || end > maxN || start > end) {
        throw new Error(`Range must be within 1-${maxN}`);
      }
      const size = rangeSize(start, end);
      const table = data.mode === "100" ? RANGE_PAY_100 : RANGE_PAY_1000;
      if (!(size in table)) {
        const allowed = Object.keys(table).sort((a, b) => Number(a) - Number(b)).join(", ");
        throw new Error(`Range size must be one of: ${allowed}`);
      }
      multiplier = table[size];
    }

    // Take bet
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: context.userId, _delta: -data.bet, _type: "game_stake",
      _source: "numguess" as any, _ref_kind: "numguess" as any as any as any, _ref_id: null as any,
      _note: `Guess 1-${maxN} stake`,
    });

    const secret = cryptoRandInt(1, maxN);
    const won =
      data.choice.kind === "single"
        ? secret === data.choice.value
        : secret >= data.choice.start && secret <= data.choice.end;

    let payout = 0;
    if (won) {
      payout = data.bet * multiplier;
      await supabaseAdmin.rpc("wallet_adjust", {
        _user: context.userId, _delta: payout, _type: "game_payout",
        _source: "numguess" as any, _ref_kind: "numguess" as any as any as any, _ref_id: null as any,
        _note: `Guess 1-${maxN} win ${multiplier}x`,
      });
    }

    const net = payout - data.bet;
    await supabaseAdmin.rpc("record_game_result" as any, {
      _uid: context.userId, _kind: "numguess" as any as any, _delta: net,
      _outcome: net > 0 ? "win" : net < 0 ? "loss" : "tie",
      _room_id: null,
      _details: { mode: data.mode, secret, choice: data.choice, multiplier, payout } as any,
      _wagered: data.bet, _payout: payout,
    });

    return { secret, won, payout, delta: net, multiplier };
  });
