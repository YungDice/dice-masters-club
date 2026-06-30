import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomInt } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BADDIES = [
  { rarity: "common", weight: 60, income: 25, names: ["Pocket Gremlin", "Neon Munchkin", "Lucky Imp"] },
  { rarity: "rare", weight: 25, income: 60, names: ["Chrome Diva", "Dice Sprite", "Velvet Rogue"] },
  { rarity: "epic", weight: 12, income: 150, names: ["Royal Misfit", "Arcade Queen", "Midnight Icon"] },
  { rarity: "legendary", weight: 3, income: 400, names: ["Golden Baddie", "The House Boss", "Celestial Highroller"] },
] as const;

function rollBaddie() {
  const roll = randomInt(1, 101);
  let running = 0;
  const selected = BADDIES.find((entry) => {
    running += entry.weight;
    return roll <= running;
  }) ?? BADDIES[0];
  return {
    rarity: selected.rarity,
    income: selected.income,
    name: selected.names[randomInt(0, selected.names.length)],
  };
}

async function rateLimit(admin: any, userId: string, key: string, seconds: number, max: number) {
  const { data, error } = await admin.rpc("rate_limit_hit", {
    _user: userId,
    _key: key,
    _window_seconds: seconds,
    _max_hits: max,
  });
  if (error) throw error;
  if (data === false) throw new Error("Slow down and try again later");
}

export const openBaddieCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await rateLimit(supabaseAdmin, context.userId, "baddie_case_open", 3600, 6);
    const baddie = rollBaddie();
    const { data, error } = await supabaseAdmin.rpc("create_baddie_tx", {
      _user: context.userId,
      _name: baddie.name,
      _rarity: baddie.rarity,
      _income_per_hour: baddie.income,
    });
    if (error) throw new Error(error.message);
    return data as {
      id: string;
      name: string;
      rarity: "common" | "rare" | "epic" | "legendary";
      income_per_hour: number;
      last_collected_at: string;
    };
  });

export const collectBaddieIncome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { baddieId: string }) => z.object({ baddieId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("collect_baddie_income_tx", {
      _user: context.userId,
      _baddie_id: data.baddieId,
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; amount: number; last_collected_at: string };
  });
