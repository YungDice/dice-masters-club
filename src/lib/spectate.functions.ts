import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const sendSpectatorReaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { roomId: string; emoji: string }) => z.object({
    roomId: z.string().uuid(),
    emoji: z.enum(["🔥", "🎲", "😱", "👏", "💀"]),
  }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: result, error } = await (context.supabase as any).rpc("send_spectator_reaction_tx", {
      _room_id: data.roomId,
      _emoji: data.emoji,
    });
    if (error) throw new Error(error.message);
    return result;
  });
