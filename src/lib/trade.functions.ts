import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

export const listTradeableFriendBaddies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { friendId: string }) => z.object({ friendId: uuid }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: result, error } = await (context.supabase as any).rpc("list_tradeable_friend_baddies_tx", { _friend_id: data.friendId });
    if (error) throw new Error(error.message);
    return result ?? [];
  });

export const createFriendTradeOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { friendId: string; offeredBaddieId: string; requestedBaddieId: string }) =>
    z.object({ friendId: uuid, offeredBaddieId: uuid, requestedBaddieId: uuid }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: result, error } = await (context.supabase as any).rpc("create_baddie_trade_offer_tx", {
      _target_user: data.friendId,
      _offered_baddie: data.offeredBaddieId,
      _requested_baddie: data.requestedBaddieId,
    });
    if (error) throw new Error(error.message);
    return result;
  });

export const acceptFriendTradeOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { offerId: string }) => z.object({ offerId: uuid }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: result, error } = await (context.supabase as any).rpc("accept_baddie_trade_offer_tx", { _offer_id: data.offerId });
    if (error) throw new Error(error.message);
    return result;
  });

export const cancelFriendTradeOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { offerId: string }) => z.object({ offerId: uuid }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: result, error } = await (context.supabase as any).rpc("cancel_baddie_trade_offer_tx", { _offer_id: data.offerId });
    if (error) throw new Error(error.message);
    return result;
  });
