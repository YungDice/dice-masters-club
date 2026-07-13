// Rocket (Crash) minigame — player picks a target multiplier, server generates a crash point.
// If crash >= target, payout = bet * target. Else, lose bet.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const HOUSE_EDGE = 0.01; // 1%

function crashPoint(): number {
  // Provably-fair-ish crash: r in (0,1], crash = max(1, floor((100-edge*100) / (r*100)) / 100)
  const { randomInt } = require("node:crypto") as typeof import("node:crypto");
  // 32-bit uniform in (0,1]
  const r = (randomInt(1, 1_000_000_001) / 1_000_000_001);
  const raw = (1 - HOUSE_EDGE) / r;
  const c = Math.max(1.0, Math.floor(raw * 100) / 100);
  return Math.min(c, 1000); // cap 1000x
}

export const rocketPlay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bet: number; target: number }) =>
    z.object({
      bet: z.number().int().min(1).max(10000),
      // 1.01x .. 100x, 2 decimals
      target: z.number().min(1.01).max(100).multipleOf(0.01),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const target = Math.round(data.target * 100) / 100;
    // Debit
    const { error: debitErr } = await supabaseAdmin.rpc("wallet_adjust", {
      _user: context.userId, _delta: -data.bet, _type: "game_stake",
      _source: "rocket", _ref_kind: "rocket", _ref_id: null as any, _note: `Rocket ${target}x`,
    });
    if (debitErr) throw new Error(debitErr.message || "Insufficient balance");
    const crash = crashPoint();
    const won = crash >= target;
    let payout = 0;
    if (won) {
      payout = Math.floor(data.bet * target);
      await supabaseAdmin.rpc("wallet_adjust", {
        _user: context.userId, _delta: payout, _type: "game_payout",
        _source: "rocket", _ref_kind: "rocket", _ref_id: null as any, _note: `Rocket win @ ${target}x`,
      });
    }
    const net = payout - data.bet;
    await supabaseAdmin.rpc("record_game_result" as any, {
      _uid: context.userId, _kind: "rocket", _delta: net,
      _outcome: net > 0 ? "win" : net < 0 ? "loss" : "tie",
      _room_id: null,
      _details: { target, crash, payout } as any,
      _wagered: data.bet, _payout: payout,
    });
    return { crash, target, won, payout, delta: net };
  });
