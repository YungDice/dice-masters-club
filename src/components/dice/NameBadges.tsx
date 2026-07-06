import { Trophy } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePodium, type PodiumEntry } from "@/hooks/use-podium";

const RANK_COLOR: Record<number, string> = {
  1: "text-amber-300 drop-shadow-[0_0_6px_rgba(252,211,77,0.7)]",
  2: "text-slate-200 drop-shadow-[0_0_6px_rgba(203,213,225,0.6)]",
  3: "text-orange-400 drop-shadow-[0_0_6px_rgba(251,146,60,0.6)]",
};

/** Detects if `emoji` is actually a URL (or data URI) so we render an <img>. */
function isImage(s?: string | null): s is string {
  if (!s) return false;
  return /^(https?:|data:|\/)/i.test(s);
}

/**
 * Renders decorations next to a user's nickname:
 *  - A custom emoji OR image/GIF (from profiles.user_emoji)
 *  - Podium indicators (Trophy SVG, gold/silver/bronze tinted)
 *
 * Order: [emoji] [podium trophies]
 * Consumers should place this AFTER the display name and any #tag.
 */
export function NameBadges({
  userId,
  emoji,
  className = "",
}: {
  userId?: string | null;
  emoji?: string | null;
  className?: string;
}) {
  const { data: podium } = usePodium();
  const entries: PodiumEntry[] = (userId && podium?.[userId]) || [];

  if (!emoji && entries.length === 0) return null;

  return (
    <span className={`inline-flex items-center gap-1 align-middle ${className}`}>
      {emoji && (
        isImage(emoji) ? (
          <img
            src={emoji}
            alt="user emoji"
            className="inline-block h-5 w-5 rounded-sm object-cover select-none"
            loading="lazy"
          />
        ) : (
          <span className="text-base leading-none select-none" aria-label="user emoji">
            {emoji}
          </span>
        )
      )}
      {entries.length > 0 && (
        <TooltipProvider delayDuration={100}>
          {entries.map((e) => (
            <Tooltip key={`${e.rank}-${e.category}`}>
              <TooltipTrigger asChild>
                <span
                  className={`inline-flex items-center cursor-help select-none ${RANK_COLOR[e.rank] ?? ""}`}
                  aria-label={`#${e.rank} ${e.category}`}
                >
                  <Trophy className="size-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                #{e.rank} {e.category}
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
      )}
    </span>
  );
}
