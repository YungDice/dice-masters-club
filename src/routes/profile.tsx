import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Trophy, Flame, Star, Calendar, Award, ShoppingBag, Crown, MapPin, Swords } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyProfile } from "@/hooks/use-profile";
import { AppShell } from "@/components/dice/TopNav";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DiceBadge } from "@/components/dice/DiceBadge";
import { COUNTRIES } from "@/lib/countries";
import { ProfileBackdrop } from "@/components/dice/ProfileBackdrop";
import { AchievementGrid } from "@/components/dice/AchievementGrid";
import { useEquippedFor, TitleBadge, frameClasses } from "@/lib/cosmetics";
import { LoadoutCard } from "@/components/dice/LoadoutCard";
import { finalizeMyStaleGames } from "@/lib/stats.functions";
import { NameBadges } from "@/components/dice/NameBadges";
import { CompetitiveStatsCard, useCompetitiveStats } from "@/components/dice/CompetitiveStatsCard";



import { fmt, timeAgo } from "@/lib/format";



export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile — DICE" }] }),
  component: () => <AppShell><MyProfile /></AppShell>,
});

function MyProfile() {
  const { user } = useAuth();
  const { data: p } = useMyProfile(user?.id);
  const qc = useQueryClient();
  const finalizeStaleGames = useServerFn(finalizeMyStaleGames);

  // Realtime: refresh stats & achievements as new game results / achievements roll in.
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase.channel(`profile-live:${user.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "game_results", filter: `user_id=eq.${user.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["rank-stats", user.id] });
          qc.invalidateQueries({ queryKey: ["my-ach", user.id] });
          qc.invalidateQueries({ queryKey: ["achievements-full", user.id] });
          qc.invalidateQueries({ queryKey: ["wallet", user.id] });
        })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "user_achievements", filter: `user_id=eq.${user.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["my-ach", user.id] });
          qc.invalidateQueries({ queryKey: ["achievements-full", user.id] });
        })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "user_baddies", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["achievements-full", user.id] }))
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user?.id, qc]);

  const sold = useQuery({
    queryKey: ["my-sold", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("marketplace_listings")
        .select("id,title,price,current_bid,preview_url,category,sale_type,updated_at,tag_value")
        .eq("seller_id", user!.id).eq("status", "sold")
        .order("updated_at", { ascending: false }).limit(12);
      return data ?? [];
    },
  });

  const myAchievements = useQuery({
    queryKey: ["my-ach", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("user_achievements").select("*, achievements(*)").eq("user_id", user!.id);
      return data ?? [];
    },
  });

  const { data: stats } = useCompetitiveStats(user?.id);

  const equipped = useEquippedFor(p).data;

  useEffect(() => {
    // Kick a one-off finalize so any dangling games get counted before stats render.
    if (!user?.id) return;
    void finalizeStaleGames({ data: { olderThanSeconds: 30 } })
      .then(() => qc.invalidateQueries({ queryKey: ["competitive-stats", user.id] }))
      .catch(() => {});
  }, [user?.id, qc, finalizeStaleGames]);

  if (!p) return <div className="text-center text-muted-foreground py-10">Loading profile…</div>;

  const tag = (p as any).tag as string | null;
  const vipUntil = (p as any).vip_until ? new Date((p as any).vip_until) : null;
  const vipActive = vipUntil && vipUntil > new Date();
  const banner = (p as any).banner_url as string | null;
  const profileBg = (p as any).profile_bg_url as string | null;

  return (
    <ProfileBackdrop url={vipActive ? profileBg : null}>
    <div className="space-y-4 relative">


      <Card className="glass overflow-hidden border-white/10">
        <div className={`w-full ${banner && vipActive ? "h-32 md:h-48" : "h-24 md:h-32"} relative`}
             style={banner && vipActive ? undefined : { background: "radial-gradient(ellipse at top, hsl(var(--primary) / 0.35), transparent 70%), linear-gradient(135deg, #0b0a14 0%, #1a1023 100%)" }}>
          {banner && vipActive && <img src={banner} alt="banner" className="w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/80" />
        </div>
        <div className="p-6 -mt-12 relative">
          <div className="flex flex-wrap items-end gap-5">
            <Avatar className={`size-24 ring-4 ring-background shadow-xl ${frameClasses(equipped?.frame)}`}>
              <AvatarImage src={p.avatar_url ?? undefined} />
              <AvatarFallback className="text-2xl">{p.display_name[0]}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h1 className="font-display text-3xl font-bold flex items-center gap-2 flex-wrap">
                <span>{p.display_name}{tag && <span className="text-primary font-mono">#{tag}</span>}</span>
                <TitleBadge title={equipped?.title} />
                {vipActive && <Crown className="size-5 text-amber-400" />}
                <NameBadges userId={p.id} emoji={(p as any).user_emoji} />
              </h1>

              <div className="text-muted-foreground">@{p.username} · Lvl {p.level}</div>
              {p.bio && <p className="mt-2 text-sm">{p.bio}</p>}
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-1"><Star className="size-4 text-primary" />{fmt(p.xp)} XP</div>
                <div className="flex items-center gap-1"><Flame className="size-4 text-primary" />{p.streak_days}d streak</div>
                {p.country && (() => {
                  const c = COUNTRIES.find((x) => x.code === p.country);
                  return c ? <div className="flex items-center gap-1"><MapPin className="size-4 text-muted-foreground" /><span>{c.flag} {c.name}</span></div> : null;
                })()}
                <div className="flex items-center gap-1"><Calendar className="size-4 text-muted-foreground" />Joined {timeAgo(p.created_at)}</div>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Link to="/settings"><Button variant="ghost">Edit profile</Button></Link>
            </div>
          </div>
        </div>
      </Card>

      <CompetitiveStatsCard stats={stats} />

      <LoadoutCard profile={p} />




      <Card className="glass p-5">
        <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2"><Award className="size-4 text-primary" />Achievements</h2>
        {user?.id && <AchievementGrid userId={user.id} />}
      </Card>


      <Card className="glass p-5">
        <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2"><ShoppingBag className="size-4 text-primary" />Items I sold</h2>
        {!sold.data?.length ? (
          <p className="text-sm text-muted-foreground">You haven't sold anything on the marketplace yet.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {sold.data.map((l: any) => (
              <div key={l.id} className="rounded-md border border-border/60 overflow-hidden">
                <div className="aspect-square bg-black/30 grid place-items-center">
                  {l.category === "tag"
                    ? <div className="text-2xl font-mono font-bold text-primary">#{l.tag_value}</div>
                    : l.preview_url ? <img src={l.preview_url} className="w-full h-full object-cover" loading="lazy" /> : <ShoppingBag className="size-10 text-muted-foreground" />}
                </div>
                <div className="p-2 space-y-1">
                  <div className="text-xs text-muted-foreground capitalize">{l.category} · sold {timeAgo(l.updated_at)}</div>
                  <div className="text-sm font-semibold line-clamp-1">{l.title}</div>
                  <DiceBadge size="sm" amount={l.sale_type === "auction" ? (l.current_bid ?? l.price) : l.price} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
    </ProfileBackdrop>
  );
}
