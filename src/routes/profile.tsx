import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
import { fmt, timeAgo } from "@/lib/format";
import { tierFor } from "@/lib/rank";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile — DICE" }] }),
  component: () => <AppShell><MyProfile /></AppShell>,
});

function MyProfile() {
  const { user } = useAuth();
  const { data: p } = useMyProfile(user?.id);
  const sold = useQuery({
    queryKey: ["my-sold", user?.id], enabled: !!user?.id, staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase.from("marketplace_listings").select("id,title,price,current_bid,preview_url,category,sale_type,updated_at,tag_value").eq("seller_id", user!.id).eq("status", "sold").order("updated_at", { ascending: false }).limit(12);
      return data ?? [];
    },
  });
  const myAchievements = useQuery({
    queryKey: ["my-ach", user?.id], enabled: !!user?.id, staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("user_achievements").select("*, achievements(*)").eq("user_id", user!.id);
      return data ?? [];
    },
  });
  const rank = useQuery({
    queryKey: ["rank", user?.id], enabled: !!user?.id, staleTime: 30_000,
    queryFn: async () => {
      const { data } = await (supabase as any).from("user_game_stats").select("wins,losses,games").eq("user_id", user!.id).maybeSingle();
      const wins = data?.wins ?? 0; const losses = data?.losses ?? 0; const total = data?.games ?? wins + losses;
      return { wins, losses, total, ratio: total > 0 ? wins / total : 0 };
    },
  });

  if (!p) return <div className="text-center text-muted-foreground py-10">Loading profile…</div>;
  const tag = (p as any).tag as string | null;
  const vipUntil = (p as any).vip_until ? new Date((p as any).vip_until) : null;
  const vipActive = !!(vipUntil && vipUntil > new Date());
  const banner = (p as any).banner_url as string | null;
  const profileBg = (p as any).profile_bg_url as string | null;
  const tier = tierFor(rank.data?.wins ?? 0, rank.data?.ratio ?? 0);
  const background = profileBg && vipActive ? {
    backgroundImage: `linear-gradient(to bottom, rgba(8,6,14,0.76), rgba(8,6,14,0.94)), url(${profileBg})`,
    backgroundSize: "cover", backgroundAttachment: "fixed", backgroundPosition: "center",
  } : undefined;

  return (
    <div className="relative -mx-4 -my-6 min-h-[calc(100vh-3.5rem)] space-y-4 px-4 py-6" style={background}>
      <Card className="glass overflow-hidden border-white/10">
        <div className={`w-full ${banner && vipActive ? "h-32 md:h-48" : "h-24 md:h-32"} relative`} style={banner && vipActive ? undefined : { background: "radial-gradient(ellipse at top, hsl(var(--primary) / 0.35), transparent 70%), linear-gradient(135deg, #0b0a14 0%, #1a1023 100%)" }}>
          {banner && vipActive && <img src={banner} alt="banner" className="w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/80" />
        </div>
        <div className="p-6 -mt-12 relative"><div className="flex flex-wrap items-end gap-5">
          <Avatar className="size-24 ring-4 ring-background shadow-xl"><AvatarImage src={p.avatar_url ?? undefined} /><AvatarFallback className="text-2xl">{p.display_name[0]}</AvatarFallback></Avatar>
          <div className="flex-1"><h1 className="font-display text-3xl font-bold flex items-center gap-2"><span>{p.display_name}{tag && <span className="text-primary font-mono">#{tag}</span>}</span>{vipActive && <Crown className="size-5 text-amber-400" />}</h1><div className="text-muted-foreground">@{p.username} · Lvl {p.level}</div>{p.bio && <p className="mt-2 text-sm">{p.bio}</p>}
            <div className="mt-3 flex flex-wrap gap-4 text-sm"><div className="flex items-center gap-1"><Star className="size-4 text-primary" />{fmt(p.xp)} XP</div><div className="flex items-center gap-1"><Flame className="size-4 text-primary" />{p.streak_days}d streak</div>{p.country && (() => { const c = COUNTRIES.find((x) => x.code === p.country); return c ? <div className="flex items-center gap-1"><MapPin className="size-4 text-muted-foreground" /><span>{c.flag} {c.name}</span></div> : null; })()}<div className="flex items-center gap-1"><Calendar className="size-4 text-muted-foreground" />Joined {timeAgo(p.created_at)}</div></div>
          </div><Link to="/settings"><Button variant="ghost">Edit profile</Button></Link>
        </div></div>
      </Card>

      <Card className={`glass p-5 ${tier.glow ? `shadow-lg ${tier.glow}` : ""}`}><h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2"><Swords className="size-4 text-primary" />Rank</h2><div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Tier" value={tier.name} valueClass={tier.color} /><Stat label="Wins" value={rank.data?.wins ?? 0} valueClass="text-emerald-400" /><Stat label="Losses" value={rank.data?.losses ?? 0} valueClass="text-rose-400" /><Stat label="W/L Ratio" value={rank.data?.total ? `${(rank.data.ratio * 100).toFixed(0)}%` : "—"} valueClass="text-primary" />
      </div><p className="text-xs text-muted-foreground mt-3">Computed from every tracked game ({rank.data?.total ?? 0} games).</p></Card>

      <Card className="glass p-5"><h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2"><Award className="size-4 text-primary" />Achievements</h2>{myAchievements.data?.length === 0 && <p className="text-sm text-muted-foreground">No badges yet.</p>}<div className="grid grid-cols-3 md:grid-cols-6 gap-2">{(myAchievements.data ?? []).map((a: any) => <div key={a.achievement_id} className="rounded-md border border-border/60 p-3 text-center"><Trophy className="mx-auto size-6 text-gold" /><div className="text-xs mt-1 font-semibold">{a.achievements?.name}</div></div>)}</div></Card>

      <Card className="glass p-5"><h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2"><ShoppingBag className="size-4 text-primary" />Items I sold</h2>{!sold.data?.length ? <p className="text-sm text-muted-foreground">You haven't sold anything on the marketplace yet.</p> : <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">{sold.data.map((l: any) => <div key={l.id} className="rounded-md border border-border/60 overflow-hidden"><div className="aspect-square bg-black/30 grid place-items-center">{l.category === "tag" ? <div className="text-2xl font-mono font-bold text-primary">#{l.tag_value}</div> : l.preview_url ? <img src={l.preview_url} className="w-full h-full object-cover" loading="lazy" /> : <ShoppingBag className="size-10 text-muted-foreground" />}</div><div className="p-2 space-y-1"><div className="text-xs text-muted-foreground capitalize">{l.category} · sold {timeAgo(l.updated_at)}</div><div className="text-sm font-semibold line-clamp-1">{l.title}</div><DiceBadge size="sm" amount={l.sale_type === "auction" ? (l.current_bid ?? l.price) : l.price} /></div></div>)}</div>}</Card>
    </div>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return <div className="rounded-md border border-border/60 p-3 text-center bg-black/20"><div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div><div className={`text-2xl font-display font-bold ${valueClass ?? ""}`}>{value}</div></div>;
}
