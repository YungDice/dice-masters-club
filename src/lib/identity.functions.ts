import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const claimCollectionTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tag: string }) => z.object({ tag: z.string().regex(/^[A-Za-z0-9]{2,6}$/) }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("claim_collection_tag_tx", {
      _uid: context.userId,
      _tag: data.tag,
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; tag: string };
  });

export const listCollectionTagForSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tag: string; price: number; sale_type: "fixed" | "auction"; duration_hours: number }) =>
    z.object({
      tag: z.string().regex(/^[A-Za-z0-9]{2,6}$/),
      price: z.number().int().min(100).max(1_000_000),
      sale_type: z.enum(["fixed", "auction"]),
      duration_hours: z.number().int().min(1).max(168),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("list_collection_tag_tx", {
      _seller: context.userId,
      _tag: data.tag,
      _price: data.price,
      _sale_type: data.sale_type,
      _duration_hours: data.duration_hours,
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; id: string };
  });
