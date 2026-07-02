import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    toUser: string;
    fromBaddies?: string[];
    toBaddies?: string[];
    fromDice?: number;
    toDice?: number;
    note?: string;
  }) =>
    z.object({
      toUser: z.string().uuid(),
      fromBaddies: z.array(z.string().uuid()).max(10).optional().default([]),
      toBaddies: z.array(z.string().uuid()).max(10).optional().default([]),
      fromDice: z.number().int().min(0).max(10_000_000).optional().default(0),
      toDice: z.number().int().min(0).max(10_000_000).optional().default(0),
      note: z.string().max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("create_trade_tx" as any, {
      _to: data.toUser,
      _from_baddies: data.fromBaddies,
      _to_baddies: data.toBaddies,
      _from_dice: data.fromDice,
      _to_dice: data.toDice,
      _note: data.note ?? null,
    });
    if (error) throw new Error(error.message);
    return res as { ok: boolean; trade_id: string };
  });

export const respondTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tradeId: string; accept: boolean }) =>
    z.object({ tradeId: z.string().uuid(), accept: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("respond_trade_tx" as any, {
      _trade_id: data.tradeId, _accept: data.accept,
    });
    if (error) throw new Error(error.message);
    return res as { ok: boolean; accepted?: boolean; reason?: string };
  });

export const cancelTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tradeId: string }) => z.object({ tradeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("cancel_trade_tx" as any, {
      _trade_id: data.tradeId,
    });
    if (error) throw new Error(error.message);
    return res as { ok: boolean };
  });
