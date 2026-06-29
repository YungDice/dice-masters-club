import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { heartbeatXp } from "@/lib/xp.functions";
import { useAuth } from "@/hooks/use-auth";
import { fmt } from "@/lib/format";

/**
 * Pings the server every 60s while signed-in. The server awards XP/DICE based
 * on real elapsed time, so refresh/sleep cycles can't be gamed.
 */
export function useIdleXp() {
  const { user } = useAuth();
  const tick = useServerFn(heartbeatXp);
  const qc = useQueryClient();
  const running = useRef(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const fire = async () => {
      if (running.current) return;
      running.current = true;
      try {
        const r = await tick({ data: undefined as any });
        if (cancelled) return;
        if (r?.leveled_up) {
          toast.success(
            `Level ${r.level}! +${fmt(r.dice_awarded)} DICE`,
            { description: "You leveled up — keep playing." },
          );
          qc.invalidateQueries({ queryKey: ["wallet", user.id] });
        }
        if (r?.gained_xp) {
          qc.invalidateQueries({ queryKey: ["profile", user.id] });
        }
      } catch {
        /* network blip — try again next tick */
      } finally {
        running.current = false;
      }
    };

    // First call after 60s; subsequent every 60s.
    const id = setInterval(fire, 60_000);
    // Prime the timer on mount so last_xp_tick_at gets set
    fire();
    return () => { cancelled = true; clearInterval(id); };
  }, [user?.id]);
}
