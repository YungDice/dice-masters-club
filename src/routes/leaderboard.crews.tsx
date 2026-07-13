import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users, Trophy, Crown, Clock, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/dice/TopNav";
import { PageHeader } from "@/components/dice/PageHeader";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/dice/EmptyState";
import { fmt } from "@/lib/format";

export const Route = createFileRoute("/leaderboard/crews")({
  head: () => ({
    meta: [
      { title: "Crews Leaderboard — DICE" },
      { name: "description", content: "Rank crews by total points, weekly score, and crew level." },
    ],
  }),
  component: () => (
    <AppShell>
      <div className="space-y-4">
        <PageHeader
          icon={Users}
          title="Crews Leaderboard"
          subtitle="Top crews by total points, weekly score, and crew level."
          accent="gold"
        />
        <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm flex items-center justify-between flex-wrap gap-2">
          <span className="font-semibold text-amber-300 inline-flex items-center gap-1">
            <Users className="size-4" /> Crew rankings
          </span>
          <Link to="/leaderboard" className="text-amber-300 hover:underline inline-flex items-center gap-1">
            <Trophy className="size-4" /> Players leaderboard →
          </Link>
        </div>
        <CrewsLeaderboard />
      </div>
    </AppShell>
  ),
});

const tabTrigger =
  "flex-1 h-full text-sm md:text-base font-display font-semibold rounded-lg data-[state=active]:bg-gradient-to-b data-[state=active]:from-amber-400/30 data-[state=active]:to-amber-700/20 data-[state=active]:text-amber-100 data-[state=active]:shadow-[inset_0_0_0_1px_rgba(252,211,77,0.4)]";

function CrewsLeaderboard() {
  return (
    <Tabs defaultValue="total">
      <TabsList className="mx-auto grid w-full max-w-lg grid-cols-3 h-12 gap-1 p-1.5 bg-gradient-to-b from-card/70 to-card/30 backdrop-blur border border-amber-300/20 rounded-xl">
        <TabsTrigger value="total" className={tabTrigger}><Trophy className="size-4 mr-1.5" /> Total</TabsTrigger>
        <TabsTrigger value="weekly" className={tabTrigger}><Clock className="size-4 mr-1.5" /> Weekly</TabsTrigger>
        <TabsTrigger value="level" className={tabTrigger}><Crown className="size-4 mr-1.5" /> Level</TabsTrigger>
      </TabsList>
      <TabsContent value="total" className="mt-4"><Board orderBy="total" unit="PTS" /></TabsContent>
      <TabsContent value="weekly" className="mt-4"><Board orderBy="weekly" unit="PTS" /></TabsContent>
      <TabsContent value="level" className="mt-4"><Board orderBy="level" unit="LVL" /></TabsContent>
    </Tabs>
  );
}

type CrewRow = {
  id: string;
  name: string;
  tag: string;
  avatar_url: string | null;
  banner_url?: string | null;
  level: number;
  total_score: number;
  weekly_score: number;
  member_count: number;
};

function Board({ orderBy, unit }: { orderBy: "level" | "total" | "weekly"; unit: string }) {
  const q = useQuery({
    queryKey: ["lb-crews", orderBy],
    queryFn: async (): Promise<CrewRow[]> => {
      // Prefer RPC; fall back to a plain table read if it's missing so the page never blanks.
      const rpc = await (supabase.rpc as any)("leaderboard_crews", { _order: orderBy, _limit: 50 });
      if (!rpc.error && rpc.data) {
        const ids = (rpc.data as any[]).map((c: any) => c.id).filter(Boolean);
        // Grab banner_url separately (RPC only returns avatar_url).
        const banners = ids.length
          ? await supabase.from("crews" as any).select("id,banner_url").in("id", ids)
          : { data: [] as any[] };
        const bmap = Object.fromEntries(((banners.data ?? []) as any[]).map((b: any) => [b.id, b.banner_url]));
        return (rpc.data as any[]).map((c: any) => ({ ...c, banner_url: bmap[c.id] ?? null }));
      }
      const col = orderBy === "level" ? "level" : orderBy === "weekly" ? "weekly_score" : "total_score";
      const { data } = await supabase
        .from("crews" as any)
        .select("id,name,tag,avatar_url,banner_url,level,total_score,weekly_score,member_count")
        .order(col, { ascending: false })
        .limit(50);
      return (data ?? []) as any as CrewRow[];
    },
  });

  if (q.isLoading) {
    return (
      <Card className="glass p-6">
        <div className="animate-pulse space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 rounded-md bg-white/5" />
          ))}
        </div>
      </Card>
    );
  }
  if (q.error) {
    return (
      <Card className="glass p-6 text-sm text-destructive">
        Couldn't load crews leaderboard. Please refresh.
      </Card>
    );
  }
  const rows = q.data ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No crews yet"
        description="Found a crew and start scoring points to appear here."
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Podium */}
      <div className="grid gap-3 md:grid-cols-3">
        {rows.slice(0, 3).map((c, i) => (
          <PodiumCard key={c.id} crew={c} rank={i + 1} orderBy={orderBy} unit={unit} />
        ))}
      </div>

      {/* Rest of the list */}
      {rows.length > 3 && (
        <Card className="glass overflow-hidden">
          <div className="divide-y divide-white/5">
            {rows.slice(3).map((c, i) => {
              const rank = i + 4;
              const points = orderBy === "level" ? c.level : orderBy === "weekly" ? c.weekly_score : c.total_score;
              return (
                <Link
                  key={c.id}
                  to="/crews/$id"
                  params={{ id: c.id }}
                  className="grid grid-cols-[3rem_auto_1fr_auto] items-center gap-3 px-3 py-2 hover:bg-white/[0.04]"
                >
                  <span className="w-10 text-right font-mono text-muted-foreground">#{rank}</span>
                  <Avatar className="size-10 ring-1 ring-white/10">
                    <AvatarImage src={c.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[10px] font-mono">{c.tag}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">
                      {c.name} <span className="font-mono text-primary text-xs">[{c.tag}]</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Lvl {c.level} · {c.member_count} members
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-amber-200">{fmt(points)}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-widest">{unit}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

function PodiumCard({
  crew,
  rank,
  orderBy,
  unit,
}: {
  crew: CrewRow;
  rank: number;
  orderBy: "level" | "total" | "weekly";
  unit: string;
}) {
  const points = orderBy === "level" ? crew.level : orderBy === "weekly" ? crew.weekly_score : crew.total_score;
  const ring =
    rank === 1 ? "ring-amber-300/70 shadow-[0_0_40px_-8px_rgba(252,211,77,0.5)]"
    : rank === 2 ? "ring-slate-200/60"
    : "ring-orange-400/60";
  const badge =
    rank === 1 ? "text-amber-300"
    : rank === 2 ? "text-slate-200"
    : "text-orange-400";
  return (
    <Link
      to="/crews/$id"
      params={{ id: crew.id }}
      className={`relative block rounded-xl border border-white/10 ring-1 ${ring} overflow-hidden group`}
    >
      <div className="relative h-24 md:h-28 w-full">
        {crew.banner_url ? (
          <img src={crew.banner_url} alt={`${crew.name ?? "Crew"} banner`} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div
            className="w-full h-full"
            style={{ background: "radial-gradient(ellipse at top, rgba(252,211,77,0.25), transparent 70%), linear-gradient(135deg,#0b0a14,#1a1023)" }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/50 to-transparent" />
        <div className={`absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-display font-bold ${badge}`}>
          {rank === 1 ? <Crown className="size-3.5" /> : <Shield className="size-3.5" />}
          #{rank}
        </div>
      </div>
      <div className="p-3 -mt-8 relative flex items-end gap-3">
        <Avatar className="size-14 ring-2 ring-background bg-background">
          <AvatarImage src={crew.avatar_url ?? undefined} />
          <AvatarFallback className="font-mono">{crew.tag}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">
            {crew.name} <span className="font-mono text-primary text-xs">[{crew.tag}]</span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            Lvl {crew.level} · {crew.member_count} members
          </div>
        </div>
        <div className="text-right">
          <div className="font-bold text-amber-200 text-lg leading-none">{fmt(points)}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-widest">{unit}</div>
        </div>
      </div>
    </Link>
  );
}
