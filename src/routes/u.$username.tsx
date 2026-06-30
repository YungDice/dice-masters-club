import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trophy, Flame, Star, Calendar, Award, Swords, Shield, Circle, Check, X, UserMinus, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/dice/TopNav";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProfileBackdrop } from "@/components/dice/ProfileBackdrop";
import { useAuth } from "@/hooks/use-auth";
import { fmt, timeAgo } from "@/lib/format";
import { tierFor } from "@/lib/rank";
import { isVipActive } from "@/lib/limits";
import { respondFriendRequest, sendFriendRequest } from "@/lib/dice.functions";
import { toast } from "sonner";


export const Route = createFileRoute("/u/$username")({
  head: () => ({ meta: [{ title: "Profile — DICE" }] }),
  component: () => <AppShell><UProfile /></AppShell>,
});

function UProfile() {
  const { username } = Route.useParams();
  const { user } = useAuth();
  const prof = useQuery({
    queryKey: ["u", username],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
      return data;
    },
  });
  const achievements = useQuery({
    queryKey: ["u-ach", prof.data?.id],
    enabled: !!prof.data?.id,
    queryFn: async () => {
      const { data } = await supabase.from("user_achievements").select("*, achievements(*)").eq("user_id", prof.data!.id);
      return data ?? [];
    },
  });
  const games = useQuery({
    queryKey: ["u-games", prof.data?.id],
    enabled: !!prof.data?.id,
    queryFn: async () => {
      const { data } = await supabase.from("game_results").select("*").eq("user_id", prof.data!.id).order("created_at", { ascending: false }).limit(8);
      return data ?? [];
    },
  });
  const rankStats = useQuery({
    queryKey: ["u-rank", prof.data?.id],
    enabled: !!prof.data?.id,
    queryFn: async () => {
      const { data } = await supabase.from("game_results").select("outcome").eq("user_id", prof.data!.id).limit(1000);
      const rows = data ?? [];
      const wins = rows.filter((r: any) => r.outcome === "win").length;
      const losses = rows.filter((r: any) => r.outcome === "loss").length;
      const total = wins + losses;
      const ratio = total > 0 ? wins / total : 0;
      return { wins, losses, total, ratio };
    },
  });


  const friendship = useQuery({
    queryKey: ["friendship", user?.id, prof.data?.id],
    enabled: !!user?.id && !!prof.data?.id && user.id !== prof.data.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("friendships")
        .select("*")
        .or(`and(requester_id.eq.${user!.id},addressee_id.eq.${prof.data!.id}),and(requester_id.eq.${prof.data!.id},addressee_id.eq.${user!.id})`)
        .maybeSingle();
      return data;
    },
  });

  if (!prof.data) return <div className="text-center text-muted-foreground py-20">Loading…</div>;
  const p = prof.data;
  const isMe = user?.id === p.id;
  const f: any = friendship.data;
  const rel = !f ? "none"
    : f.status === "accepted" ? "friends"
    : f.status === "pending" ? (f.requester_id === user?.id ? "sent" : "incoming")
    : f.status === "blocked" ? "blocked"
    : "none";

  const profileBg = (p as any).profile_bg_url as string | null;
  const vipActive = isVipActive((p as any).vip_until);
  const onlineMs = (p as any).last_seen_at ? Date.now() - new Date((p as any).last_seen_at).getTime() : Infinity;
  const isOnline = onlineMs < 2 * 60 * 1000;
  const qc = useQueryClient();
  const sendReqFn = useServerFn(sendFriendRequest);
  const respondFn = useServerFn(respondFriendRequest);

  async function addFriend() {
    if (!user) return;
    try { await sendReqFn({ data: { addresseeId: p.id } }); toast.success("Friend request sent"); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
    friendship.refetch();
  }
  async function cancelOrRemove() {
    if (!f?.id) return;
    await supabase.from("friendships").delete().eq("id", f.id);
    toast.success(rel === "friends" ? "Removed friend" : "Cancelled");
    friendship.refetch();
    qc.invalidateQueries({ queryKey: ["friends"] });
  }
  async function respond(accept: boolean) {
    if (!f?.id) return;
    try { await respondFn({ data: { friendshipId: f.id, accept } }); toast.success(accept ? "Accepted" : "Declined"); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
    friendship.refetch();
  }

  return (
    <ProfileBackdrop url={vipActive ? profileBg : null}>
    <div className="space-y-4">
      <Card className="glass overflow-hidden">
        {p.banner_url && vipActive && (
          <div className="h-32 md:h-48 w-full bg-black/40">
            <img src={p.banner_url} alt="banner" className="w-full h-full object-cover" />
          </div>
        )}
        <div className="p-6">
          <div className="flex flex-wrap items-center gap-5">
            <Avatar className="size-24 ring-2 ring-primary/40"><AvatarImage src={p.avatar_url ?? undefined} /><AvatarFallback className="text-2xl">{p.display_name[0]}</AvatarFallback></Avatar>
            <div className="flex-1">
              <h1 className="font-display text-3xl font-bold flex items-center gap-2">
                <span>{p.display_name}{p.tag && <span className="text-primary font-mono">#{p.tag}</span>}</span>
                <span className={`inline-flex items-center gap-1 text-xs font-normal ${isOnline ? "text-emerald-400" : "text-muted-foreground"}`}>
                  <Circle className={`size-2 ${isOnline ? "fill-emerald-400 text-emerald-400" : "fill-muted-foreground/50 text-muted-foreground/50"}`} />
                  {isOnline ? "Online" : (p as any).last_seen_at ? `Last seen ${timeAgo((p as any).last_seen_at)}` : "Offline"}
                </span>
              </h1>
              <div className="text-muted-foreground">@{p.username} · Lvl {p.level}</div>
              {p.bio && <p className="mt-2 text-sm">{p.bio}</p>}
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-1"><Star className="size-4 text-primary" />{fmt(p.xp)} XP</div>
                <div className="flex items-center gap-1"><Flame className="size-4 text-primary" />{p.streak_days}d streak</div>
                <div className="flex items-center gap-1"><Calendar className="size-4 text-muted-foreground" />Joined {timeAgo(p.created_at)}</div>
              </div>
            </div>
            {!isMe && (
              <div className="flex gap-2">
                {rel === "friends" ? (
                  <Button variant="outline" onClick={cancelOrRemove}><UserMinus className="size-4 mr-1" />Remove friend</Button>
                ) : rel === "sent" ? (
                  <Button variant="outline" onClick={cancelOrRemove}><X className="size-4 mr-1" />Cancel request</Button>
                ) : rel === "incoming" ? (
                  <>
                    <Button onClick={() => respond(true)}><Check className="size-4 mr-1" />Accept</Button>
                    <Button variant="outline" onClick={() => respond(false)}><X className="size-4 mr-1" />Decline</Button>
                  </>
                ) : rel === "blocked" ? null : (
                  <Button onClick={addFriend}><UserPlus className="size-4 mr-1" />Add friend</Button>
                )}
              </div>
            )}
            {isMe && <Link to="/settings"><Button variant="outline">Edit profile</Button></Link>}
          </div>
        </div>
      </Card>

      {(() => {
        const rs = rankStats.data ?? { wins: 0, losses: 0, total: 0, ratio: 0 };
        const tier = tierFor(rs.wins, rs.ratio);
        return (
          <Card className="glass p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`grid size-12 place-items-center rounded-xl bg-white/5 ring-1 ring-white/10 ${tier.color}`}>
                  <Shield className="size-6" />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">Competitive rank</div>
                  <div className={`font-display text-2xl font-bold ${tier.color}`}>{tier.name}</div>
                </div>
              </div>
              <div className="flex gap-4 text-sm">
                <div className="text-center"><div className="text-emerald-400 font-bold text-lg">{rs.wins}</div><div className="text-xs text-muted-foreground">Wins</div></div>
                <div className="text-center"><div className="text-destructive font-bold text-lg">{rs.losses}</div><div className="text-xs text-muted-foreground">Losses</div></div>
                <div className="text-center"><div className="font-bold text-lg flex items-center gap-1"><Swords className="size-4 text-primary" />{Math.round(rs.ratio * 100)}%</div><div className="text-xs text-muted-foreground">W/L</div></div>
              </div>
            </div>
          </Card>
        );
      })()}



      <div className="grid gap-4 md:grid-cols-2">
        <Card className="glass p-5">
          <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2"><Award className="size-4 text-primary" />Achievements</h2>
          {achievements.data?.length === 0 && <p className="text-sm text-muted-foreground">No badges yet.</p>}
          <div className="grid grid-cols-3 gap-2">
            {(achievements.data ?? []).map((a: any) => (
              <div key={a.achievement_id} className="rounded-md border border-border/60 p-3 text-center">
                <Trophy className="mx-auto size-6 text-gold" />
                <div className="text-xs mt-1 font-semibold">{a.achievements?.name}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="glass p-5">
          <h2 className="font-display text-lg font-semibold mb-3">Recent games</h2>
          {games.data?.length === 0 && <p className="text-sm text-muted-foreground">No games yet.</p>}
          <ul className="space-y-1 text-sm">
            {(games.data ?? []).map((g) => (
              <li key={g.id} className="flex justify-between rounded-md bg-white/5 px-3 py-1.5"><span className="capitalize">{g.kind} · {g.outcome}</span><span className={g.delta > 0 ? "text-emerald-400" : g.delta < 0 ? "text-destructive" : ""}>{g.delta > 0 ? "+" : ""}{fmt(g.delta)} DICE</span></li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
    </ProfileBackdrop>
  );
}
