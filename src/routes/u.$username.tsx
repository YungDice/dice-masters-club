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
  const qc = useQueryClient();
  const sendReqFn = useServerFn(sendFriendRequest);
  const respondFn = useServerFn(respondFriendRequest);

  const prof = useQuery({
    queryKey: ["u", username],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const pid = prof.data?.id;
  const achievements = useQuery({
    queryKey: ["u-ach", pid],
    enabled: !!pid,
    queryFn: async () => {
      const { data } = await supabase.from("user_achievements").select("*, achievements(*)").eq("user_id", pid!);
      return data ?? [];
    },
  });
  const games = useQuery({
    queryKey: ["u-games", pid],
    enabled: !!pid,
    queryFn: async () => {
      const { data } = await supabase.from("game_results").select("*").eq("user_id", pid!).order("created_at", { ascending: false }).limit(8);
      return data ?? [];
    },
  });
  const rankStats = useQuery({
    queryKey: ["u-rank", pid],
    enabled: !!pid,
    queryFn: async () => {
      const { data } = await supabase.from("game_results").select("outcome,delta,wagered,payout").eq("user_id", pid!).limit(5000);
      const rows = (data ?? []) as any[];
      const wins = rows.filter((r) => r.outcome === "win").length;
      const losses = rows.filter((r) => r.outcome === "loss").length;
      const draws = rows.filter((r) => r.outcome === "draw").length;
      const total = rows.length;
      const wagered = rows.reduce((s, r) => s + Number(r.wagered ?? 0), 0);
      const won = rows.reduce((s, r) => s + Math.max(Number(r.payout ?? 0), Number(r.delta ?? 0) > 0 ? Number(r.delta) : 0), 0);
      const lost = rows.reduce((s, r) => s + (Number(r.delta ?? 0) < 0 ? -Number(r.delta) : 0), 0);
      const ratio = losses === 0 ? (wins > 0 ? wins : 0) : wins / losses;
      return { wins, losses, draws, total, wagered, won, lost, ratio };
    },
  });

  const friendship = useQuery({
    queryKey: ["friendship", user?.id, pid],
    enabled: !!user?.id && !!pid && user!.id !== pid,
    queryFn: async () => {
      const { data } = await supabase
        .from("friendships")
        .select("*")
        .or(`and(requester_id.eq.${user!.id},addressee_id.eq.${pid}),and(requester_id.eq.${pid},addressee_id.eq.${user!.id})`)
        .maybeSingle();
      return data;
    },
  });

  if (prof.isLoading) return <div className="text-center text-muted-foreground py-20">Loading…</div>;
  if (!prof.data) return <div className="text-center text-muted-foreground py-20">User not found.</div>;
  const p: any = prof.data;
  const isMe = user?.id === p.id;
  const f: any = friendship.data;
  const rel = !f ? "none"
    : f.status === "accepted" ? "friends"
    : f.status === "pending" ? (f.requester_id === user?.id ? "sent" : "incoming")
    : f.status === "blocked" ? "blocked"
    : "none";

  const profileBg = p.profile_bg_url as string | null;
  const vipActive = isVipActive(p.vip_until);
  const onlineMs = p.last_seen_at ? Date.now() - new Date(p.last_seen_at).getTime() : Infinity;
  const isOnline = onlineMs < 2 * 60 * 1000;
  const dn = p.display_name ?? p.username ?? "User";

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
            <Avatar className="size-24 ring-2 ring-primary/40"><AvatarImage src={p.avatar_url ?? undefined} /><AvatarFallback className="text-2xl">{dn[0]?.toUpperCase() ?? "?"}</AvatarFallback></Avatar>
            <div className="flex-1">
              <h1 className="font-display text-3xl font-bold flex items-center gap-2">
                <span>{dn}{p.tag && <span className="text-primary font-mono">#{p.tag}</span>}</span>

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
        const rs: any = rankStats.data ?? { wins: 0, losses: 0, draws: 0, total: 0, wagered: 0, won: 0, lost: 0, ratio: 0 };
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
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="text-center"><div className="text-emerald-400 font-bold text-lg">{rs.wins}</div><div className="text-xs text-muted-foreground">Wins</div></div>
                <div className="text-center"><div className="text-destructive font-bold text-lg">{rs.losses}</div><div className="text-xs text-muted-foreground">Losses</div></div>
                {rs.draws ? <div className="text-center"><div className="font-bold text-lg">{rs.draws}</div><div className="text-xs text-muted-foreground">Draws</div></div> : null}
                <div className="text-center"><div className="font-bold text-lg flex items-center gap-1"><Swords className="size-4 text-primary" />{rs.losses === 0 ? (rs.wins ? "∞" : "—") : rs.ratio.toFixed(2)}</div><div className="text-xs text-muted-foreground">W/L</div></div>
                <div className="text-center"><div className="font-bold text-lg">{fmt(rs.wagered)}</div><div className="text-xs text-muted-foreground">Wagered</div></div>
              </div>
            </div>
          </Card>
        );
      })()}





      <div className="grid gap-4 md:grid-cols-2">
        <Card className="glass p-5">
          <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2"><Award className="size-4 text-primary" />Achievements</h2>
          {pid && <AchievementGrid userId={pid} />}
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
