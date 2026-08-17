import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { fmt, timeAgo } from "@/lib/format";

function RailHeader({ title, to }: { title: string; to?: string }) {
  return (
    <div className="flex items-center justify-between px-1 pb-2">
      <div className="text-[12px] font-medium uppercase tracking-widest text-fog">{title}</div>
      {to && (
        <Link to={to as any} className="text-[12px] font-medium text-ice hover:text-white transition-colors">
          See all
        </Link>
      )}
    </div>
  );
}

function Row({
  href,
  avatar,
  fallback,
  name,
  verified,
  value,
  sub,
  subTone = "neutral",
}: {
  href?: string;
  avatar?: string | null;
  fallback: string;
  name: string;
  verified?: boolean;
  value: string;
  sub?: string;
  subTone?: "neutral" | "pos" | "neg";
}) {
  const inner = (
    <div className="flex h-12 items-center gap-2.5 rounded px-2 transition-colors hover:bg-slate">
      <Avatar className="size-7 rounded">
        <AvatarImage src={avatar ?? undefined} />
        <AvatarFallback className="text-[10px]">{fallback}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[14px] font-medium">{name}</span>
          {verified && <span className="size-1 shrink-0 rounded-full bg-ice" aria-hidden />}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="num text-[14px] leading-tight">{value}</div>
        {sub && (
          <div
            className={`text-[10px] leading-tight ${
              subTone === "neg" ? "text-destructive" : subTone === "pos" ? "text-white" : "text-fog"
            }`}
          >
            {sub}
          </div>
        )}
      </div>
    </div>
  );
  return href ? (
    <li style={{ borderTop: "1px solid var(--iron)" }}>
      <Link to={href as any}>{inner}</Link>
    </li>
  ) : (
    <li style={{ borderTop: "1px solid var(--iron)" }}>{inner}</li>
  );
}

export function RightRail() {
  const top = useQuery({
    queryKey: ["rail-top-players"],
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,username,display_name,avatar_url,xp,level")
        .order("xp", { ascending: false })
        .limit(8);
      return data ?? [];
    },
  });

  const wins = useQuery({
    queryKey: ["rail-recent-wins"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("game_results")
        .select("id,kind,delta,created_at")
        .gt("delta", 0)
        .order("created_at", { ascending: false })
        .limit(8);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-8">
      <section>
        <RailHeader title="Top Players" to="/leaderboard" />
        <ul>
          {(top.data ?? []).map((p, i) => (
            <Row
              key={p.id}
              href={p.username ? `/u/${p.username}` : undefined}
              avatar={p.avatar_url}
              fallback={String(i + 1)}
              name={p.display_name ?? p.username ?? "Player"}
              verified={i < 3}
              value={fmt(p.xp ?? 0)}
              sub={`Lvl ${p.level ?? 1}`}
            />
          ))}
          {(top.data ?? []).length === 0 && (
            <li className="px-2 py-3 text-[12px] text-fog">Leaderboard warming up…</li>
          )}
        </ul>
      </section>

      <section>
        <RailHeader title="Live Wins" to="/play" />
        <ul>
          {(wins.data ?? []).map((r: any) => (
            <Row
              key={r.id}
              fallback={String(r.kind ?? "?").slice(0, 1).toUpperCase()}
              name={String(r.kind).replace(/_/g, " ")}
              value={`+${fmt(r.delta)}`}
              sub={timeAgo(r.created_at)}
            />
          ))}
          {(wins.data ?? []).length === 0 && (
            <li className="px-2 py-3 text-[12px] text-fog">No wins yet today.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
