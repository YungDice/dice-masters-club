// Wheel of Fortune — 16 segments with multipliers. Spin, land on segment, payout = bet * mult.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomInt } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Expected value ~0.96 → house edge ~4%
export const WHEEL_SEGMENTS: number[] = [
  0, 0.1, 1.5, 0.5, 0.1, 2, 0.5, 0.1,
  0, 1.5, 0.5, 0.1, 5, 0.5, 0.1, 10,
];

export const wheelSpin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bet: number }) =>
    z.object({ bet: z.number().int().min(1).max(10000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: debitErr } = await supabaseAdmin.rpc("wallet_adjust", {
      _user: context.userId, _delta: -data.bet, _type: "game_stake",
      _source: "wheel", _ref_kind: "wheel", _ref_id: null as any, _note: "Wheel spin",
    });
    if (debitErr) throw new Error(debitErr.message || "Insufficient balance");
    const idx = randomInt(0, WHEEL_SEGMENTS.length);
    const mult = WHEEL_SEGMENTS[idx];
    const payout = Math.floor(data.bet * mult);
    if (payout > 0) {
      await supabaseAdmin.rpc("wallet_adjust", {
        _user: context.userId, _delta: payout, _type: "game_payout",
        _source: "wheel", _ref_kind: "wheel", _ref_id: null as any, _note: `Wheel ${mult}x`,
      });
    }
    const net = payout - data.bet;
    await supabaseAdmin.rpc("record_game_result" as any, {
      _uid: context.userId, _kind: "wheel", _delta: net,
      _outcome: net > 0 ? "win" : net < 0 ? "loss" : "tie",
      _room_id: null, _details: { index: idx, mult, payout } as any,
      _wagered: data.bet, _payout: payout,
    });
    return { index: idx, mult, payout, delta: net };
  });
