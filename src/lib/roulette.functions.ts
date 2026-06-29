import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// American wheel order (clockwise starting at 0)
export const WHEEL_AMERICAN: (number | "00")[] = [
  0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1,
  "00", 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2,
];

const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export function pocketColor(p: number | "00"): "red" | "black" | "green" {
  if (p === 0 || p === "00") return "green";
  return REDS.has(p) ? "red" : "black";
}

// Bet types
export type BetType =
  | "straight"     // value: number|"00", pays 35:1
  | "red" | "black"
  | "even" | "odd"
  | "low" | "high"             // 1-18 / 19-36
  | "dozen1" | "dozen2" | "dozen3"
  | "col1" | "col2" | "col3"
  | "top_line";                 // 0,00,1,2,3 pays 6:1

export type Bet = { type: BetType; value?: number | "00"; amount: number };

const BetSchema = z.object({
  type: z.enum([
    "straight", "red", "black", "even", "odd", "low", "high",
    "dozen1", "dozen2", "dozen3", "col1", "col2", "col3", "top_line",
  ]),
  value: z.union([z.number().int().min(0).max(36), z.literal("00")]).optional(),
  amount: z.number().int().min(1).max(10000),
});

function settleOne(bet: Bet, p: number | "00"): number {
  const color = pocketColor(p);
  const n = typeof p === "number" ? p : -1; // 00 is not a number
  const is00 = p === "00";
  switch (bet.type) {
    case "straight": {
      if (bet.value === p) return bet.amount * 36; // 35:1 + stake
      return 0;
    }
    case "top_line": return (n === 0 || is00 || n === 1 || n === 2 || n === 3) ? bet.amount * 7 : 0;
    case "red":   return color === "red"   ? bet.amount * 2 : 0;
    case "black": return color === "black" ? bet.amount * 2 : 0;
    case "even":  return (n > 0 && n % 2 === 0) ? bet.amount * 2 : 0;
    case "odd":   return (n > 0 && n % 2 === 1) ? bet.amount * 2 : 0;
    case "low":   return (n >= 1 && n <= 18) ? bet.amount * 2 : 0;
    case "high":  return (n >= 19 && n <= 36) ? bet.amount * 2 : 0;
    case "dozen1": return (n >= 1 && n <= 12) ? bet.amount * 3 : 0;
    case "dozen2": return (n >= 13 && n <= 24) ? bet.amount * 3 : 0;
    case "dozen3": return (n >= 25 && n <= 36) ? bet.amount * 3 : 0;
    case "col1": return (n > 0 && n % 3 === 1) ? bet.amount * 3 : 0;
    case "col2": return (n > 0 && n % 3 === 2) ? bet.amount * 3 : 0;
    case "col3": return (n > 0 && n % 3 === 0) ? bet.amount * 3 : 0;
  }
}

export const rouletteSpin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bets: Bet[] }) => z.object({ bets: z.array(BetSchema).min(1).max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const total = data.bets.reduce((s, b) => s + b.amount, 0);
    if (total <= 0) throw new Error("Empty bet");
    // Debit total stake
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: context.userId, _delta: -total, _type: "game_stake",
      _source: "roulette", _ref_kind: "roulette", _ref_id: null as any, _note: "Roulette spin",
    });
    // Pick pocket index for animation alignment
    // Cryptographically secure pocket selection
    const { randomInt } = await import("node:crypto");
    const idx = randomInt(0, WHEEL_AMERICAN.length);

    const pocket = WHEEL_AMERICAN[idx];
    let payout = 0;
    const perBet: { type: BetType; value?: number | "00"; amount: number; won: number }[] = [];
    for (const b of data.bets) {
      const won = settleOne(b, pocket);
      perBet.push({ ...b, won });
      payout += won;
    }
    if (payout > 0) {
      await supabaseAdmin.rpc("wallet_adjust", {
        _user: context.userId, _delta: payout, _type: "game_payout",
        _source: "roulette", _ref_kind: "roulette", _ref_id: null as any,
        _note: `Roulette ${pocket}`,
      });
    }
    return { pocket, pocketIndex: idx, color: pocketColor(pocket), payout, net: payout - total, bets: perBet };
  });
