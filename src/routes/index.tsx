import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { Dices, Trophy, Gamepad2, ShoppingBag, Users, Flame, Sparkles, ArrowRight, Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWallet, useMyProfile } from "@/hooks/use-profile";
import { AppShell } from "@/components/dice/TopNav";
import { DiceBadge } from "@/components/dice/DiceBadge";
import { EmptyState } from "@/components/dice/EmptyState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { DiceLogo } from "@/components/dice/Logo";
import { claimDaily } from "@/lib/dice.functions";
import { fmt, timeAgo, xpForLevel } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DICE — Home" },
      { name: "description", content: "Your DICE lobby: balance, daily challenge, friends activity, featured marketplace, leaderboard." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center"><DiceLogo size={48} /></div>;
  if (!user) return <Landing />;
  return <AppShell><Dashboard /></AppShell>;
}

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-6">
        <DiceLogo />
        <Link to="/auth"><Button variant="outline">Sign in</Button></Link>
      </header>
      <section className="mx-auto max-w-7xl px-4 pt-12 pb-24 text-center">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-xs">
            <Sparkles className="size-3 text-primary" /> Virtual-currency only · 18+
          </div>
          <h1 className="mt-6 font-display text-5xl md:text-7xl font-bold leading-tight">
            Complete challenges.<br /> Earn <span className="text-gradient-red">DICE</span>. Play games.
          </h1>
          <p className="mt-5 max-w-2xl mx-auto text-muted-foreground text-lg">
            DICE is a premium social gaming platform with virtual currency. Take on challenges,
            wager DICE in games with friends, sell digital creations, climb the leaderboard.
            DICE has no real-world value — it's pure play.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link to="/auth"><Button size="lg" className="glow-red">Get started — 500 DICE bonus</Button></Link>
            <Link to="/auth"><Button variant="outline" size="lg">Sign in</Button></Link>
          </div>
        </motion.div>
        <div className="mt-20 grid md:grid-cols-4 gap-4">
          {[
            { i: Trophy, t: "Challenges", d: "Earn DICE & XP completing safe creative tasks. Submit photo/video proof." },
            { i: Gamepad2, t: "Games", d: "Dice, Coin Flip, Blackjack, Slots, Split-or-Steal, Poker rooms." },
            { i: ShoppingBag, t: "Marketplace", d: "Trade digital art, stickers, avatars and challenge templates for DICE." },
            { i: Users, t: "Social", d: "Add friends, share activity, leaderboards, achievements, badges." },
          ].map((f) => (
            <Card key={f.t} className="glass p-5 text-left">
              <div className="grid size-10 place-items-center rounded-md bg-primary/15 text-primary"><f.i className="size-5" /></div>
              <h3 className="mt-3 font-display font-semibold">{f.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
            </Card>
          ))}
        </div>
        <p className="mt-16 text-xs text-muted-foreground max-w-xl mx-auto">
          DICE currency cannot be purchased with real money, exchanged for cash or crypto, or
          redeemed for any real-world prize. Play responsibly. If you need a break, use the
          break-reminder tool in Settings.
        </p>
      </section>
    </div>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const { data: profile } = useMyProfile(user?.id);
  const { data: wallet } = useWallet(user?.id);
  const claim = useServerFn(claimDaily);
  const [claiming, setClaiming] = useState(false);

  const dailyClaimed = useQuery({
    queryKey: ["daily-claimed", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const since = new Date(); since.setUTCHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("dice_transactions")
        .select("id")
        .eq("user_id", user!.id)
        .eq("source", "daily")
        .gte("created_at", since.toISOString())
        .limit(1);
      return (data?.length ?? 0) > 0;
    },
  });


  const daily = useQuery({
    queryKey: ["daily-challenge"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("challenges").select("id,title,description,dice_reward,category").eq("is_daily", true).eq("status", "active").limit(1).maybeSingle();
      return data;
    },
  });
  const featured = useQuery({
    queryKey: ["featured-challenges"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("challenges").select("id,title,description,dice_reward,category").eq("is_featured", true).eq("status", "active").limit(4);
      return data ?? [];
    },
  });
  const feed = useQuery({
    queryKey: ["activity-feed"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("activity_feed").select("id,title,created_at,user_id,profiles!activity_feed_user_id_fkey(username,display_name,avatar_url)").order("created_at", { ascending: false }).limit(6);
      return data ?? [];
    },
  });
  const recentGames = useQuery({
    queryKey: ["recent-games", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase.from("game_results").select("id,kind,outcome,delta").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(5);
      return data ?? [];
    },
  });
  const notif = useQuery({
    queryKey: ["notif-preview", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase.from("notifications").select("id,title,body,created_at").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(4);
      return data ?? [];
    },
  });
  const leaderPreview = useQuery({
    queryKey: ["lb-preview"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,username,display_name,avatar_url,xp,level").order("xp", { ascending: false }).limit(5);
      return data ?? [];
    },
  });
  const featuredListings = useQuery({
    queryKey: ["fea-listings"],
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("marketplace_listings").select("id,title,category,price").eq("status", "active").order("created_at", { ascending: false }).limit(4);
      return data ?? [];
    },
  });

  async function onClaim() {
    setClaiming(true);
    try {
      const r = await claim();
      if (r.ok) toast.success(`+${r.reward} DICE — daily reward claimed!`);
      else toast("Already claimed today. Come back tomorrow!");
      dailyClaimed.refetch();
    } catch (e: any) { toast.error(e.message); }
    finally { setClaiming(false); }
  }


  const xp = profile?.xp ?? 0;
  const lvl = profile?.level ?? 1;
  const nextXp = xpForLevel(lvl + 1);
  const prevXp = xpForLevel(lvl);
  const pct = Math.min(100, Math.max(0, ((xp - prevXp) / Math.max(1, nextXp - prevXp)) * 100));

  return (
    <div className="space-y-5">
      {/* Hero: greeting + level progress + daily reward */}
      <div
        className="relative overflow-hidden rounded-2xl p-5 md:p-6"
        style={{
          background: "radial-gradient(ellipse at top right, rgba(201,168,76,0.18), transparent 60%), linear-gradient(135deg, #0b0f17 0%, #0a1410 100%)",
          border: "1px solid rgba(201,168,76,0.25)",
        }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-10 mix-blend-overlay"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)", backgroundSize: "8px 8px" }} />
        <div className="relative grid gap-5 md:grid-cols-[1fr_auto] items-center">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-widest text-amber-200/60">Welcome back</div>
            <h1 className="font-display text-2xl md:text-3xl font-bold truncate">
              {profile?.display_name ?? "Player"}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <div className="flex items-baseline gap-2">
                <span className="text-xs text-muted-foreground">Balance</span>
                <span className="font-display text-2xl font-bold text-amber-100">{fmt(wallet?.balance ?? 0)}</span>
                <span className="text-xs text-amber-200/60">DICE</span>
              </div>
              <div className="flex items-center gap-1 text-sm">
                <Flame className="size-4 text-primary" />
                <span className="font-medium">{profile?.streak_days ?? 0}</span>
                <span className="text-muted-foreground">day streak</span>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-amber-200/80">Level {lvl}</span>
                <span className="text-muted-foreground">{fmt(xp)} / {fmt(nextXp)} XP</span>
              </div>
              <Progress value={pct} />
              <div className="text-[10px] text-muted-foreground mt-1">+25 XP every minute on DICE · +500 DICE per level</div>
            </div>
          </div>
          <div className="flex md:flex-col gap-2 md:items-end">
            {dailyClaimed.data ? (
              <div className="text-xs text-emerald-400 font-medium inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-3 py-1.5 ring-1 ring-emerald-400/30">
                <Flame className="size-4" /> Daily claimed
              </div>
            ) : (
              <Button onClick={onClaim} disabled={claiming} className="glow-red">
                <Flame className="size-4 mr-1" /> Claim daily reward
              </Button>
            )}
            <Link to="/play" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              Go to game lobby <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Bento row 1: Daily challenge (wide) + Notifications */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="glass p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-semibold flex items-center gap-2"><Sparkles className="size-4 text-primary" /> Today's challenge</h2>
            <Link to="/challenges" className="text-xs text-muted-foreground hover:text-foreground">View all <ArrowRight className="inline size-3" /></Link>
          </div>
          {daily.data ? (
            <Link to="/challenges/$id" params={{ id: daily.data.id }} className="block rounded-lg border border-border/60 p-4 hover:border-amber-400/40 transition">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-lg font-semibold truncate">{daily.data.title}</div>
                  <div className="text-sm text-muted-foreground line-clamp-2">{daily.data.description}</div>
                </div>
                <DiceBadge amount={daily.data.dice_reward} />
              </div>
            </Link>
          ) : (
            <EmptyState icon={Sparkles} title="No daily challenge yet" description="Check back soon." />
          )}
        </Card>
        <Card className="glass p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-semibold flex items-center gap-2"><Bell className="size-4 text-primary" /> Recent</h2>
            <Link to="/notifications" className="text-xs text-muted-foreground hover:text-foreground">All <ArrowRight className="inline size-3" /></Link>
          </div>
          <ul className="space-y-2 text-sm">
            {(notif.data ?? []).length === 0 && <li className="text-muted-foreground text-xs">No new notifications.</li>}
            {(notif.data ?? []).slice(0, 4).map((n) => (
              <li key={n.id} className="rounded-md border border-border/60 p-2">
                <div className="font-medium text-sm line-clamp-1">{n.title}</div>
                {n.body && <div className="text-xs text-muted-foreground line-clamp-1">{n.body}</div>}
                <div className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(n.created_at)}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Quick play tiles */}
      <Card className="glass p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg font-semibold flex items-center gap-2"><Gamepad2 className="size-4 text-primary" /> Quick play</h2>
          <Link to="/play" className="text-xs text-muted-foreground hover:text-foreground">Lobby <ArrowRight className="inline size-3" /></Link>
        </div>
        <div className="grid gap-3 grid-cols-3 sm:grid-cols-6">
          {[
            { to: "/play/dice", t: "Dice" }, { to: "/play/coinflip", t: "Coin Flip" }, { to: "/play/blackjack", t: "Blackjack" },
            { to: "/play/slots", t: "Slots" }, { to: "/play/roulette", t: "Roulette" }, { to: "/play/poker", t: "Poker" },
          ].map((g) => (
            <Link key={g.to} to={g.to as any} className="group rounded-lg p-3 text-center transition"
              style={{ background: "rgba(11,77,58,0.35)", border: "1px solid rgba(201,168,76,0.3)" }}
            >
              <Dices className="mx-auto size-6 text-amber-300 mb-1 group-hover:scale-110 transition" />
              <div className="text-xs font-semibold text-amber-50">{g.t}</div>
            </Link>
          ))}
        </div>
      </Card>

      {/* Bento row 2: Featured challenges */}
      <Card className="glass p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg font-semibold flex items-center gap-2"><Trophy className="size-4 text-primary" /> Featured challenges</h2>
          <Link to="/challenges" className="text-xs text-muted-foreground hover:text-foreground">Browse all <ArrowRight className="inline size-3" /></Link>
        </div>
        {(featured.data ?? []).length === 0 ? (
          <EmptyState icon={Trophy} title="No featured challenges" description="Staff will spotlight new ones soon." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(featured.data ?? []).map((c) => (
              <Link key={c.id} to="/challenges/$id" params={{ id: c.id }} className="rounded-lg border border-border/60 p-3 hover:border-amber-400/40 transition">
                <div className="text-sm font-semibold line-clamp-1">{c.title}</div>
                <div className="text-xs text-muted-foreground line-clamp-2 mt-1">{c.description}</div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] uppercase text-muted-foreground">{c.category}</span>
                  <DiceBadge size="sm" amount={c.dice_reward} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* Bento row 3: Recent games + leaderboard preview + marketplace picks */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="glass p-5">
          <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2"><Gamepad2 className="size-4 text-primary" /> Recent results</h2>
          <ul className="space-y-1 text-sm">
            {(recentGames.data ?? []).length === 0 && <li className="text-muted-foreground text-xs">No games yet — try your first one.</li>}
            {(recentGames.data ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-md bg-white/5 px-3 py-1.5">
                <span className="capitalize text-xs">{r.kind} · {r.outcome}</span>
                <span className={`text-sm font-semibold ${r.delta > 0 ? "text-emerald-400" : r.delta < 0 ? "text-destructive" : ""}`}>{r.delta > 0 ? "+" : ""}{fmt(r.delta)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="glass p-5">
          <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2"><Trophy className="size-4 text-amber-400" /> Top players</h2>
          <ul className="space-y-2">
            {(leaderPreview.data ?? []).map((p, i) => (
              <li key={p.id} className="flex items-center gap-3">
                <div className={`w-6 text-right text-sm font-bold ${i === 0 ? "text-gold" : "text-muted-foreground"}`}>#{i + 1}</div>
                <Avatar className="size-7"><AvatarImage src={p.avatar_url ?? undefined} /><AvatarFallback>{p.display_name?.[0] ?? "?"}</AvatarFallback></Avatar>
                <div className="flex-1 text-sm truncate">{p.display_name}</div>
                <div className="text-xs text-muted-foreground">Lvl {p.level}</div>
              </li>
            ))}
          </ul>
          <Link to="/leaderboard" className="mt-3 inline-flex text-xs text-muted-foreground hover:text-foreground">View leaderboard <ArrowRight className="inline size-3" /></Link>
        </Card>
        <Card className="glass p-5">
          <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2"><ShoppingBag className="size-4 text-primary" /> Marketplace</h2>
          {(featuredListings.data ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing live yet.</p>
          ) : (
            <ul className="space-y-2">
              {(featuredListings.data ?? []).map((l) => (
                <Link key={l.id} to="/marketplace/$id" params={{ id: l.id }} className="block rounded-md border border-border/60 p-2 hover:border-amber-400/40">
                  <div className="text-sm font-medium line-clamp-1">{l.title}</div>
                  <div className="flex justify-between items-center mt-1"><span className="text-[10px] uppercase text-muted-foreground">{l.category}</span><DiceBadge size="sm" amount={l.price} /></div>
                </Link>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Friend activity */}
      <Card className="glass p-5">
        <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2"><Users className="size-4 text-primary" /> Friend activity</h2>
        <ul className="space-y-2 text-sm">
          {(feed.data ?? []).length === 0 && <li className="text-muted-foreground text-xs">Nothing yet — add friends to see their wins.</li>}
          {(feed.data ?? []).map((a: any) => (
            <li key={a.id} className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2">
              <Avatar className="size-7"><AvatarImage src={a.profiles?.avatar_url} /><AvatarFallback>{a.profiles?.display_name?.[0] ?? "?"}</AvatarFallback></Avatar>
              <div className="flex-1 min-w-0"><span className="font-medium">{a.profiles?.display_name}</span> <span className="text-muted-foreground">{a.title}</span></div>
              <span className="text-xs text-muted-foreground shrink-0">{timeAgo(a.created_at)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
            ))}
          </ul>
          <Link to="/marketplace" className="mt-3 inline-flex text-xs text-muted-foreground hover:text-foreground">Browse marketplace <ArrowRight className="inline size-3" /></Link>
        </Card>
      </div>
    </div>
  );
}
