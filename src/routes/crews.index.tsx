import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Users, Trophy, Plus, Search, Crown, Shield, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/dice/TopNav";
import { PageHeader } from "@/components/dice/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/dice/EmptyState";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { fmt } from "@/lib/format";
import { toast } from "sonner";
import { joinCrew } from "@/lib/crew.functions";

export const Route = createFileRoute("/crews/")({
  head: () => ({
    meta: [
      { title: "Crews — DICE" },
      { name: "description", content: "Found or join a Crew, donate DICE, and climb the weekly crew leaderboard." },
    ],
  }),
  component: () => <AppShell><CrewsIndex /></AppShell>,
});

function CrewsIndex() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const join = useServerFn(joinCrew);
  const [q, setQ] = useState("");

  const myMembership = useQuery({
    queryKey: ["my-crew", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("crew_members" as any)
        .select("*, crew:crews(*)")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data as any;
    },
  });

  const crews = useQuery({
    queryKey: ["crews-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("crews" as any)
        .select("*")
        .order("weekly_score", { ascending: false })
        .limit(60);
      return (data ?? []) as any[];
    },
  });

  const weekly = useQuery({
    queryKey: ["crew-weekly-current"],
    queryFn: async () => {
      const { data } = await supabase
        .from("crews" as any)
        .select("id,name,tag,weekly_score,member_count,level")
        .gt("weekly_score", 0)
        .order("weekly_score", { ascending: false })
        .limit(25);
      return (data ?? []) as any[];
    },
  });

  const filtered = useMemo(() => {
    const list = crews.data ?? [];
    if (!q.trim()) return list;
    const s = q.toLowerCase();
    return list.filter((c: any) =>
      c.name.toLowerCase().includes(s) || c.tag.toLowerCase().includes(s),
    );
  }, [crews.data, q]);

  async function onJoin(id: string) {
    try {
      const res: any = await join({ data: { crewId: id } });
      if (res?.joined) toast.success("Welcome to the crew!");
      else if (res?.requested) toast.success("Join request sent");
      qc.invalidateQueries({ queryKey: ["my-crew"] });
      qc.invalidateQueries({ queryKey: ["crews-list"] });
      if (res?.joined) navigate({ to: "/crews/$id", params: { id } });
    } catch (e: any) {
      toast.error(e.message ?? "Could not join");
    }
  }

  const myCrew = myMembership.data?.crew;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Users}
        title="Crews"
        subtitle="Team up, donate DICE, and climb the weekly crew leaderboard."
        actions={
          !myCrew ? (
            <Button asChild><Link to="/crews/new"><Plus className="size-4 mr-1.5" /> Found crew</Link></Button>
          ) : (
            <Button asChild variant="outline">
              <Link to="/crews/$id" params={{ id: myCrew.id }}>
                <Shield className="size-4 mr-1.5" /> My crew
              </Link>
            </Button>
          )
        }
      />

      {myCrew && (
        <Card className="p-4 flex items-center gap-4">
          <Avatar className="size-12 ring-1 ring-amber-400/40">
            <AvatarFallback>{myCrew.tag}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-muted-foreground">You are in</div>
            <div className="text-lg font-semibold truncate">
              {myCrew.name} <span className="font-mono text-primary">[{myCrew.tag}]</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Weekly score: <b className="text-amber-200">{fmt(myCrew.weekly_score)}</b> · Members: {myCrew.member_count}/{myCrew.max_members} · Level {myCrew.level}
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/crews/$id" params={{ id: myCrew.id }}>Open</Link>
          </Button>
        </Card>
      )}

      <Tabs defaultValue="browse">
        <TabsList>
          <TabsTrigger value="browse"><Search className="size-4 mr-1.5" /> Browse</TabsTrigger>
          <TabsTrigger value="weekly"><Trophy className="size-4 mr-1.5" /> Weekly leaderboard</TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="mt-4 space-y-3">
          <div className="max-w-md">
            <Input placeholder="Search by name or tag" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {filtered.length === 0 ? (
            <EmptyState icon={Users} title="No crews yet" description="Be the first to found one." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((c: any) => (
                <Card key={c.id} className="p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-11 ring-1 ring-amber-400/40">
                      <AvatarFallback className="font-mono text-xs">{c.tag}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <Link to="/crews/$id" params={{ id: c.id }} className="font-semibold truncate hover:underline block">
                        {c.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        <span className="font-mono text-primary">[{c.tag}]</span> · Lvl {c.level}
                      </div>
                    </div>
                    {c.is_open ? (
                      <span className="text-[10px] uppercase tracking-widest text-emerald-300/80">Open</span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-widest text-amber-200/70">Request</span>
                    )}
                  </div>
                  {c.description && <p className="text-xs text-muted-foreground line-clamp-2">{c.description}</p>}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div><div className="text-muted-foreground">Members</div><div className="font-semibold">{c.member_count}/{c.max_members}</div></div>
                    <div><div className="text-muted-foreground">Weekly</div><div className="font-semibold text-amber-200">{fmt(c.weekly_score)}</div></div>
                    <div><div className="text-muted-foreground">Min lvl</div><div className="font-semibold">{c.min_level}</div></div>
                  </div>
                  <Button
                    size="sm"
                    variant={myCrew ? "outline" : "default"}
                    disabled={!!myCrew || c.member_count >= c.max_members}
                    onClick={() => onJoin(c.id)}
                  >
                    {myCrew ? "Already in a crew" : c.is_open ? "Join" : "Request to join"}
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="weekly" className="mt-4">
          {(weekly.data ?? []).length === 0 ? (
            <EmptyState icon={Trophy} title="No scores yet" description="Donate DICE to your crew to earn weekly points." />
          ) : (
            <Card className="p-0 overflow-hidden">
              <div className="divide-y divide-white/5">
                {weekly.data!.map((c: any, i: number) => (
                  <Link
                    key={c.id}
                    to="/crews/$id"
                    params={{ id: c.id }}
                    className="flex items-center gap-3 p-3 hover:bg-white/[0.04]"
                  >
                    <div className={`w-8 text-center font-mono text-lg ${i === 0 ? "text-amber-300" : i === 1 ? "text-zinc-200" : i === 2 ? "text-amber-700" : "text-muted-foreground"}`}>
                      {i === 0 ? <Crown className="size-5 inline text-amber-300" /> : `#${i + 1}`}
                    </div>
                    <Avatar className="size-9"><AvatarFallback className="text-[10px] font-mono">{c.tag}</AvatarFallback></Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{c.name} <span className="font-mono text-primary text-xs">[{c.tag}]</span></div>
                      <div className="text-xs text-muted-foreground">Lvl {c.level} · {c.member_count} members</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-amber-200">{fmt(c.weekly_score)}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-widest">weekly pts</div>
                    </div>
                  </Link>
                ))}
              </div>
              <div className="p-3 border-t border-white/5 text-[11px] text-muted-foreground flex items-center gap-2">
                <Sparkles className="size-3.5 text-amber-300" />
                Weekly rewards paid Mondays 00:05 UTC — top 5 crews split up to 100k / 50k / 25k / 10k / 5k DICE,
                distributed to members by contribution.
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
