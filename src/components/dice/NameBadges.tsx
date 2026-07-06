import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePodium, podiumEmoji, type PodiumEntry } from "@/hooks/use-podium";

/**
 * Renders decorations shown next to a user's nickname anywhere in the app:
 *  - A custom user emoji (from profiles.user_emoji)
 *  - Podium indicators (🥇🥈🥉) with a tooltip like "#1 XP"
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
        <span className="text-base leading-none select-none" aria-label="user emoji">
          {emoji}
        </span>
      )}
      {entries.length > 0 && (
        <TooltipProvider delayDuration={100}>
          {entries.map((e) => (
            <Tooltip key={`${e.rank}-${e.category}`}>
              <TooltipTrigger asChild>
                <span
                  className="text-sm leading-none cursor-help select-none"
                  aria-label={`#${e.rank} ${e.category}`}
                >
                  {podiumEmoji(e.rank)}
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
