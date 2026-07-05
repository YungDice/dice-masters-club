import { createFileRoute, Link } from "@tanstack/react-router";
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
import { useEquippedFor, TitleBadge, frameClasses, bannerStyle } from "@/lib/cosmetics";



import { fmt, timeAgo } from "@/lib/format";

import { RANK_TIERS, tierFor } from "@/lib/rank";



export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile — DICE" }] }),
  component: () => <AppShell><MyProfile /></AppShell>,
});

function MyProfile() {
  const { user } = useAuth();
  const { data: p } = useMyProfile(user?.id);

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

  const rank = useQuery({
    queryKey: ["rank-stats", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase.from("user_game_stats" as any).select("*").eq("user_id", user!.id).maybeSingle();
      const row = (data ?? {}) as any;
      const wins = Number(row.wins ?? 0);
      const losses = Number(row.losses ?? 0);
      const total = Number(row.games_played ?? 0);
      const ratio = losses > 0 ? wins / losses : (wins > 0 ? wins : 0);
      return { wins, losses, total, ratio, rank_score: Number(row.rank_score ?? 0), net: Number(row.net ?? 0) };
    },
  });

  const equipped = useEquippedFor(p).data;

  if (!p) return <div className="text-center text-muted-foreground py-10">Loading profile…</div>;

  const tag = (p as any).tag as string | null;
  const vipUntil = (p as any).vip_until ? new Date((p as any).vip_until) : null;
  const vipActive = vipUntil && vipUntil > new Date();
  const banner = (p as any).banner_url as string | null;
  const profileBg = (p as any).profile_bg_url as string | null;
  const tier = tierFor(rank.data?.wins ?? 0, rank.data?.ratio ?? 0);
  const bannerCosmetic = equipped?.banner;
  const bannerCss = bannerStyle(bannerCosmetic);



  return (
    <ProfileBackdrop url={vipActive ? profileBg : null}>
    <div className="space-y-4 relative">


      <Card className="glass overflow-hidden border-white/10">
        <div className={`w-full ${(banner && vipActive) || bannerCss ? "h-32 md:h-48" : "h-24 md:h-32"} relative`}
             style={bannerCss ?? (banner && vipActive ? undefined : { background: "radial-gradient(ellipse at top, hsl(var(--primary) / 0.35), transparent 70%), linear-gradient(135deg, #0b0a14 0%, #1a1023 100%)" })}>
          {banner && vipActive && !bannerCss && <img src={banner} alt="banner" className="w-full h-full object-cover" />}
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

      <Card className={`glass p-5 ${tier.glow ? `shadow-lg ${tier.glow}` : ""}`}>
        <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2"><Swords className="size-4 text-primary" />Rank</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-md border border-border/60 p-3 text-center bg-black/20">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Tier</div>
            <div className={`text-2xl font-display font-bold ${tier.color}`}>{tier.name}</div>
          </div>
          <div className="rounded-md border border-border/60 p-3 text-center bg-black/20">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Wins</div>
            <div className="text-2xl font-display font-bold text-emerald-400">{rank.data?.wins ?? 0}</div>
          </div>
          <div className="rounded-md border border-border/60 p-3 text-center bg-black/20">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Losses</div>
            <div className="text-2xl font-display font-bold text-rose-400">{rank.data?.losses ?? 0}</div>
          </div>
          <div className="rounded-md border border-border/60 p-3 text-center bg-black/20">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Rank Score</div>
            <div className="text-2xl font-display font-bold text-primary">
              {rank.data?.total ? fmt(Math.round(rank.data.rank_score)) : "—"}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">Computed from your full game history ({rank.data?.total ?? 0} games tracked · net {fmt(rank.data?.net ?? 0)} DICE).</p>
      </Card>


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
