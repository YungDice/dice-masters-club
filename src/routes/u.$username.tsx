import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Flame, Star, Calendar, Award, Swords, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/dice/TopNav";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { fmt, timeAgo } from "@/lib/format";
import { tierFor } from "@/lib/rank";
import { toast } from "sonner";

export const Route = createFileRoute("/u/$username")({
  head: () => ({ meta: [{ title: "Profile — DICE" }] }),
  component: () => <AppShell><UProfile /></AppShell>,
});

function UProfile() {
  const { username } = Route.useParams();
  const { user } = useAuth();
  const prof = useQuery({ queryKey: ["u", username], queryFn: async () => (await supabase.from("profiles").select("*").eq("username", username).maybeSingle()).data });
  const achievements = useQuery({ queryKey: ["u-ach", prof.data?.id], enabled: !!prof.data?.id, queryFn: async () => (await supabase.from("user_achievements").select("*, achievements(*)").eq("user_id", prof.data!.id)).data ?? [] });
  const games = useQuery({ queryKey: ["u-games", prof.data?.id], enabled: !!prof.data?.id, queryFn: async () => (await supabase.from("game_results").select("*").eq("user_id", prof.data!.id).order("created_at", { ascending: false }).limit(8)).data ?? [] });
  const rankStats = useQuery({
    queryKey: ["u-rank", prof.data?.id], enabled: !!prof.data?.id,
    queryFn: async () => {
      const { data } = await (supabase as any).from("user_game_stats").select("wins,losses,games").eq("user_id", prof.data!.id).maybeSingle();
      const wins = data?.wins ?? 0; const losses = data?.losses ?? 0; const total = data?.games ?? wins + losses;
      return { wins, losses, total, ratio: total > 0 ? wins / total : 0 };
    },
  });
  const friendship = useQuery({
    queryKey: ["friendship", user?.id, prof.data?.id], enabled: !!user?.id && !!prof.data?.id && user.id !== prof.data.id,
    queryFn: async () => (await supabase.from("friendships").select("*").or(`and(requester_id.eq.${user!.id},addressee_id.eq.${prof.data!.id}),and(requester_id.eq.${prof.data!.id},addressee_id.eq.${user!.id})`).maybeSingle()).data,
  });

  if (!prof.data) return <div className="text-center text-muted-foreground py-20">Loading…</div>;
  const p = prof.data;
  const isMe = user?.id === p.id;
  const f: any = friendship.data;
  const rel = !f ? "none" : f.status === "accepted" ? "friends" : f.status === "pending" ? (f.requester_id === user?.id ? "sent" : "incoming") : f.status === "blocked" ? "blocked" : "none";

  async function addFriend() {
    if (!user) return;
    const { error } = await supabase.from("friendships").insert({ requester_id: user.id, addressee_id: p.id });
    if (error) toast.error(error.message); else { toast.success("Friend request sent"); friendship.refetch(); }
  }

  const rs = rankStats.data ?? { wins: 0, losses: 0, total: 0, ratio: 0 };
  const tier = tierFor(rs.wins, rs.ratio);
  return <div className="space-y-4">
    <Card className="glass overflow-hidden">
      {p.banner_url && <div className="h-32 md:h-48 w-full bg-black/40"><img src={p.banner_url} alt="banner" className="w-full h-full object-cover" /></div>}
      <div className="p-6"><div className="flex flex-wrap items-center gap-5">
        <Avatar className="size-24 ring-2 ring-primary/40"><AvatarImage src={p.avatar_url ?? undefined} /><AvatarFallback className="text-2xl">{p.display_name[0]}</AvatarFallback></Avatar>
        <div className="flex-1"><h1 className="font-display text-3xl font-bold">{p.display_name}{p.tag && <span className="text-primary font-mono">#{p.tag}</span>}</h1><div className="text-muted-foreground">@{p.username} · Lvl {p.level}</div>{p.bio && <p className="mt-2 text-sm">{p.bio}</p>}<div className="mt-3 flex flex-wrap gap-4 text-sm"><div className="flex items-center gap-1"><Star className="size-4 text-primary" />{fmt(p.xp)} XP</div><div className="flex items-center gap-1"><Flame className="size-4 text-primary" />{p.streak_days}d streak</div><div className="flex items-center gap-1"><Calendar className="size-4 text-muted-foreground" />Joined {timeAgo(p.created_at)}</div></div></div>
        {!isMe && <div className="flex gap-2">{rel === "friends" ? <Button variant="outline" disabled>✓ Friends</Button> : rel === "sent" ? <Button variant="outline" disabled>Request sent</Button> : rel === "incoming" ? <Button variant="outline" disabled>Respond in Friends tab</Button> : rel === "blocked" ? null : <Button onClick={addFriend}>Add friend</Button>}</div>}
        {isMe && <Link to="/settings"><Button variant="outline">Edit profile</Button></Link>}
      </div></div>
    </Card>

    <Card className="glass p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><div className={`grid size-12 place-items-center rounded-xl bg-white/5 ring-1 ring-white/10 ${tier.color}`}><Shield className="size-6" /></div><div><div className="text-xs uppercase tracking-widest text-muted-foreground">Competitive rank</div><div className={`font-display text-2xl font-bold ${tier.color}`}>{tier.name}</div></div></div><div className="flex gap-4 text-sm"><div className="text-center"><div className="text-emerald-400 font-bold text-lg">{rs.wins}</div><div className="text-xs text-muted-foreground">Wins</div></div><div className="text-center"><div className="text-destructive font-bold text-lg">{rs.losses}</div><div className="text-xs text-muted-foreground">Losses</div></div><div className="text-center"><div className="font-bold text-lg flex items-center gap-1"><Swords className="size-4 text-primary" />{Math.round(rs.ratio * 100)}%</div><div className="text-xs text-muted-foreground">W/L</div></div></div></div></Card>

    <div className="grid gap-4 md:grid-cols-2"><Card className="glass p-5"><h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2"><Award className="size-4 text-primary" />Achievements</h2>{achievements.data?.length === 0 && <p className="text-sm text-muted-foreground">No badges yet.</p>}<div className="grid grid-cols-3 gap-2">{(achievements.data ?? []).map((a: any) => <div key={a.achievement_id} className="rounded-md border border-border/60 p-3 text-center"><Trophy className="mx-auto size-6 text-gold" /><div className="text-xs mt-1 font-semibold">{a.achievements?.name}</div></div>)}</div></Card><Card className="glass p-5"><h2 className="font-display text-lg font-semibold mb-3">Recent games</h2>{games.data?.length === 0 && <p className="text-sm text-muted-foreground">No games yet.</p>}<ul className="space-y-1 text-sm">{(games.data ?? []).map((g: any) => <li key={g.id} className="flex justify-between rounded-md bg-white/5 px-3 py-1.5"><span className="capitalize">{g.kind} · {g.outcome}</span><span className={g.delta > 0 ? "text-emerald-400" : g.delta < 0 ? "text-destructive" : ""}>{g.delta > 0 ? "+" : ""}{fmt(g.delta)} DICE</span></li>)}</ul></Card></div>
  </div>;
}
