import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Flame, Star, Calendar, Award, ShoppingBag, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyProfile } from "@/hooks/use-profile";
import { AppShell } from "@/components/dice/TopNav";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DiceBadge } from "@/components/dice/DiceBadge";

import { fmt, timeAgo } from "@/lib/format";
import { PaymentTestModeBanner } from "@/components/dice/PaymentTestModeBanner";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile — DICE" }] }),
  component: () => <AppShell><MyProfile /></AppShell>,
});

function MyProfile() {
  const { user } = useAuth();
  const nav = useNavigate();
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

  if (!p) return <div className="text-center text-muted-foreground py-10">Loading profile…</div>;

  const tag = (p as any).tag as string | null;
  const vipUntil = (p as any).vip_until ? new Date((p as any).vip_until) : null;
  const vipActive = vipUntil && vipUntil > new Date();

  return (
    <div className="space-y-4">
      <PaymentTestModeBanner />
      <Card className="glass p-6">
        <div className="flex flex-wrap items-center gap-5">
          <Avatar className="size-24 ring-2 ring-primary/40">
            <AvatarImage src={p.avatar_url ?? undefined} />
            <AvatarFallback className="text-2xl">{p.display_name[0]}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h1 className="font-display text-3xl font-bold flex items-center gap-2">
              {p.display_name}
              {vipActive && <Crown className="size-5 text-amber-400" />}
            </h1>
            <div className="text-muted-foreground">@{p.username}{tag && <span className="text-primary font-mono">#{tag}</span>} · Lvl {p.level}</div>
            {p.bio && <p className="mt-2 text-sm">{p.bio}</p>}
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-1"><Star className="size-4 text-primary" />{fmt(p.xp)} XP</div>
              <div className="flex items-center gap-1"><Flame className="size-4 text-primary" />{p.streak_days}d streak</div>
              <div className="flex items-center gap-1"><Calendar className="size-4 text-muted-foreground" />Joined {timeAgo(p.created_at)}</div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="outline" onClick={() => nav({ to: "/u/$username", params: { username: p.username } })}>Public view</Button>
            <Link to="/settings"><Button variant="ghost">Edit</Button></Link>
          </div>
        </div>
      </Card>

      <Card className="glass p-5">
        <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2"><Award className="size-4 text-primary" />Achievements</h2>
        {myAchievements.data?.length === 0 && <p className="text-sm text-muted-foreground">No badges yet.</p>}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {(myAchievements.data ?? []).map((a: any) => (
            <div key={a.achievement_id} className="rounded-md border border-border/60 p-3 text-center">
              <Trophy className="mx-auto size-6 text-gold" />
              <div className="text-xs mt-1 font-semibold">{a.achievements?.name}</div>
            </div>
          ))}
        </div>
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
  );
}
