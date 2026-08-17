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
      { title: "DICE — Social Gaming & Virtual Currency" },
      { name: "description", content: "DICE is a virtual-currency social gaming platform. Complete challenges, earn DICE, play games with friends, and climb the leaderboard. 18+ only." },
      { property: "og:title", content: "DICE — Social Gaming & Virtual Currency" },
      { property: "og:description", content: "Complete challenges, earn DICE, play games with friends, and climb the leaderboard. Virtual-currency only. 18+." },
      { property: "og:url", content: "https://yungdice.com/" },
    ],
    links: [{ rel: "canonical", href: "https://yungdice.com/" }],
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
        <Link to="/auth" search={{}}><Button variant="outline">Sign in</Button></Link>
      </header>
      <main>
      <section className="mx-auto max-w-7xl px-4 pt-12 pb-24 text-center">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-xs">
            <Sparkles className="size-3 text-primary" /> Virtual-currency only · 18+
          </div>
          <h1 className="mt-6 font-display text-4xl md:text-6xl font-medium leading-[1.15] tracking-[-0.01em]">
            Complete challenges.<br /> Earn <span className="text-gradient-red">DICE</span>. Play games.
          </h1>
          <p className="mt-5 max-w-2xl mx-auto text-muted-foreground text-lg">
            DICE is a premium social gaming platform with virtual currency. Take on challenges,
            wager DICE in games with friends, sell digital creations, climb the leaderboard.
            DICE has no real-world value — it's pure play.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link to="/auth" search={{}}><Button size="lg" className="glow-red">Get started — 2500 DICE bonus</Button></Link>
            <Link to="/auth" search={{}}><Button variant="outline" size="lg">Sign in</Button></Link>
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
              <h2 className="mt-3 font-display font-medium">{f.t}</h2>
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
      </main>
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
  const friendIds = useQuery({
    queryKey: ["friend-ids", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("friendships")
        .select("requester_id,addressee_id,status")
        .eq("status", "accepted")
        .or(`requester_id.eq.${user!.id},addressee_id.eq.${user!.id}`);
      const ids = new Set<string>();
      for (const r of (data ?? []) as any[]) {
        if (r.requester_id !== user!.id) ids.add(r.requester_id);
        if (r.addressee_id !== user!.id) ids.add(r.addressee_id);
      }
      return Array.from(ids);
    },
  });
  const feed = useQuery({
    queryKey: ["friend-activity", user?.id, friendIds.data?.length ?? 0],
    enabled: !!user?.id && (friendIds.data?.length ?? 0) > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("activity_feed")
        .select("id,kind,title,payload,created_at,user_id,profiles!activity_feed_user_id_fkey(username,display_name,avatar_url)")
        .in("user_id", friendIds.data!)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });
  const recentGames = useQuery({
    queryKey: ["recent-games", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("game_results")
        .select("id,kind,outcome,delta,wagered,payout,created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(8);
      return data ?? [];
    },
  });
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`home-feeds-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "game_results", filter: `user_id=eq.${user.id}` },
        () => { recentGames.refetch(); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_feed" },
        (p: any) => { if (friendIds.data?.includes(p.new?.user_id)) feed.refetch(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, friendIds.data?.join(",")]);
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
    <div className="space-y-6">
      {/* Hero + Leaderboard row */}
      <div className="grid gap-5 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="lg:col-span-2 relative overflow-hidden rounded-lg p-6 md:p-8 min-h-[260px] bg-obsidian"
          style={{ boxShadow: "rgba(255,255,255,0.08) 0 0 0 1px inset" }}
        >
          {/* artwork motif */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-6 -bottom-6 md:right-8 md:bottom-8 opacity-60"
          >
            <div className="grid size-40 md:size-48 place-items-center rounded-lg bg-graphite"
              style={{ boxShadow: "rgba(255,255,255,0.08) 0 0 0 1px inset" }}>
              <Dices className="size-24 md:size-28 text-white/80" strokeWidth={1.5} />
            </div>
          </div>

          <div className="relative max-w-[62%] md:max-w-[58%]">
            <div className="inline-flex items-center gap-1.5 rounded bg-graphite px-2 py-1 text-[12px] text-fog">
              <Sparkles className="size-3 text-primary" strokeWidth={1.5} /> Featured
            </div>

            <h1 className="mt-3 font-display text-[32px] leading-[1.25] font-medium">
              Welcome back, <span className="text-primary">{profile?.display_name ?? "Player"}</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground max-w-md">
              Your DICE dashboard — claim daily rewards, jump into games with friends, and climb the ranks.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-5">
              <div className="flex items-baseline gap-2">
                <span className="text-xs text-fog">Balance</span>
                <span className="num text-[20px] font-medium">{fmt(wallet?.balance ?? 0)}</span>
                <span className="text-xs text-fog">DICE</span>
              </div>
              <div className="flex items-center gap-1 text-sm">
                <Flame className="size-4 text-primary" strokeWidth={1.5} />
                <span className="num font-medium">{profile?.streak_days ?? 0}</span>
                <span className="text-fog">day streak</span>
              </div>
            </div>

            <div className="mt-4 max-w-md">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-fog">Level {lvl}</span>
                <span className="num text-fog">{fmt(xp)} / {fmt(nextXp)} XP</span>
              </div>
              <Progress value={pct} />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {dailyClaimed.data ? (
                <div className="text-xs text-fog font-medium inline-flex items-center gap-1 rounded bg-graphite px-3 py-1.5">
                  <Flame className="size-4" strokeWidth={1.5} /> Daily claimed
                </div>
              ) : (
                <Button onClick={onClaim} disabled={claiming} variant="outline" className="border-primary text-foreground hover:border-white">
                  <Flame className="size-4 mr-1" strokeWidth={1.5} /> Claim daily reward
                </Button>
              )}

              <Link to="/play">
                <Button variant="outline" className="border-white/10 text-foreground hover:bg-white/5">
                  <Gamepad2 className="size-4 mr-1.5" /> Play now
                </Button>
              </Link>
            </div>
          </div>
        </motion.div>

        {/* Leaderboard side panel */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
        >
          <Card className="glass p-5 h-full" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-medium flex items-center gap-2">
                <Trophy className="size-4 text-foreground" /> Top Players
              </h2>
              <Link to="/leaderboard" className="text-xs text-muted-foreground hover:text-foreground">View all</Link>
            </div>
            <ul className="space-y-2.5">
              {(leaderPreview.data ?? []).map((p, i) => {
                const medal = i === 0 ? "text-foreground bg-white/5 ring-white/10"
                  : i === 1 ? "text-slate-200 bg-slate-300/10 ring-slate-300/30"
                  : i === 2 ? "text-white bg-white/5 ring-white/10"
                  : "text-muted-foreground bg-white/5 ring-white/10";
                return (
                  <li key={p.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-white/[0.04] transition">
                    <div className={`grid size-7 place-items-center rounded-md text-xs font-bold ring-1 ${medal}`}>
                      {i + 1}
                    </div>
                    <Avatar className="size-8 ring-1 ring-white/10">
                      <AvatarImage src={p.avatar_url ?? undefined} />
                      <AvatarFallback>{p.display_name?.[0] ?? "?"}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{p.display_name}</div>
                      <div className="text-[10px] text-muted-foreground">Lvl {p.level} · {fmt(p.xp)} XP</div>
                    </div>
                  </li>
                );
              })}
              {(leaderPreview.data ?? []).length === 0 && (
                <li className="text-muted-foreground text-xs">Leaderboard warming up…</li>
              )}
            </ul>
          </Card>
        </motion.div>
      </div>

      {/* Today's challenge + Notifications */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="glass p-5 lg:col-span-2 hover:border-white/10 transition">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-medium flex items-center gap-2"><Sparkles className="size-4 text-primary" /> Today's Challenge</h2>
            <Link to="/challenges" className="text-xs text-muted-foreground hover:text-foreground">View all <ArrowRight className="inline size-3" /></Link>
          </div>
          {daily.data ? (
            <Link to="/challenges/$id" params={{ id: daily.data.id }} className="block rounded-lg border border-border/60 p-4 hover:border-white/10 hover:bg-white/[0.02] transition">
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
            <h2 className="font-display text-lg font-medium flex items-center gap-2"><Bell className="size-4 text-primary" /> Recent</h2>
            <Link to="/notifications" className="text-xs text-muted-foreground hover:text-foreground">All</Link>
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
          <h2 className="font-display text-lg font-medium flex items-center gap-2"><Gamepad2 className="size-4 text-primary" /> Quick Play</h2>
          <Link to="/play" className="text-xs text-muted-foreground hover:text-foreground">Lobby <ArrowRight className="inline size-3" /></Link>
        </div>
        <div className="grid gap-3 grid-cols-3 sm:grid-cols-6">
          {[
            { to: "/play/dice", t: "Dice" }, { to: "/play/coinflip", t: "Coin Flip" }, { to: "/play/blackjack", t: "Blackjack" },
            { to: "/play/slots", t: "Slots" }, { to: "/play/roulette", t: "Roulette" }, { to: "/play/poker", t: "Poker" },
          ].map((g) => (
            <Link key={g.to} to={g.to as any}
              className="group rounded-lg bg-graphite p-3 text-center transition hover:bg-slate"
              style={{ boxShadow: "rgba(255,255,255,0.08) 0 0 0 1px inset" }}
            >
              <Dices className="mx-auto size-6 text-white mb-1 group-hover:text-primary transition-colors" strokeWidth={1.5} />
              <div className="text-xs font-medium">{g.t}</div>
            </Link>

          ))}
        </div>
      </Card>

      {/* Featured challenges */}
      <Card className="glass p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg font-medium flex items-center gap-2"><Trophy className="size-4 text-primary" /> Featured Challenges</h2>
          <Link to="/challenges" className="text-xs text-muted-foreground hover:text-foreground">Browse all <ArrowRight className="inline size-3" /></Link>
        </div>
        {(featured.data ?? []).length === 0 ? (
          <EmptyState icon={Trophy} title="No featured challenges" description="Staff will spotlight new ones soon." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(featured.data ?? []).map((c) => (
              <Link key={c.id} to="/challenges/$id" params={{ id: c.id }}
                className="rounded-xl border border-border/60 p-3 hover:border-white/10 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-15px_rgba(232,93,58,0.5)] transition">
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

      {/* Marketplace + Recent Results */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="glass p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-medium flex items-center gap-2"><ShoppingBag className="size-4 text-primary" /> Marketplace</h2>
            <Link to="/marketplace" className="text-xs text-muted-foreground hover:text-foreground">Browse <ArrowRight className="inline size-3" /></Link>
          </div>
          {(featuredListings.data ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing live yet.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {(featuredListings.data ?? []).map((l) => (
                <Link key={l.id} to="/marketplace/$id" params={{ id: l.id }}
                  className="rounded-lg border border-border/60 p-2.5 hover:border-white/10 hover:bg-white/[0.02] transition">
                  <div className="text-sm font-medium line-clamp-1">{l.title}</div>
                  <div className="flex justify-between items-center mt-1.5">
                    <span className="text-[10px] uppercase text-muted-foreground">{l.category}</span>
                    <DiceBadge size="sm" amount={l.price} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card className="glass p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-medium flex items-center gap-2"><Gamepad2 className="size-4 text-primary" /> Recent Results</h2>
          </div>
          <ul className="space-y-1.5 text-sm">
            {(recentGames.data ?? []).length === 0 && <li className="text-muted-foreground text-xs">No games yet — try your first one.</li>}
            {(recentGames.data ?? []).slice(0, 6).map((r: any) => (
              <li key={r.id} className="rounded-md bg-white/5 px-3 py-1.5">
                <div className="flex items-center justify-between">
                  <span className="capitalize text-xs font-medium">{r.kind} · <span className="opacity-80">{r.outcome}</span></span>
                  <span className={`text-sm font-semibold ${r.delta > 0 ? "text-emerald-400" : r.delta < 0 ? "text-destructive" : ""}`}>{r.delta > 0 ? "+" : ""}{fmt(r.delta)}</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>bet {fmt(r.wagered ?? 0)} · payout {fmt(r.payout ?? 0)}</span>
                  <span>{timeAgo(r.created_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Friend activity */}
      <Card className="glass p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg font-medium flex items-center gap-2"><Users className="size-4 text-primary" /> Friend Activity</h2>
          <Link to="/friends" className="text-xs text-muted-foreground hover:text-foreground">Friends <ArrowRight className="inline size-3" /></Link>
        </div>
        <ul className="space-y-2 text-sm">
          {friendIds.isLoading && <li className="text-muted-foreground text-xs">Loading…</li>}
          {!friendIds.isLoading && (friendIds.data?.length ?? 0) === 0 && <li className="text-muted-foreground text-xs">Add friends to see their activity here.</li>}
          {(friendIds.data?.length ?? 0) > 0 && (feed.data ?? []).length === 0 && <li className="text-muted-foreground text-xs">No friend activity yet.</li>}
          {(feed.data ?? []).map((a: any) => {
            const p = a.payload ?? {};
            let label = a.title ?? a.kind;
            if (a.kind === "game_result") label = `played ${p.game ?? "a game"} — ${p.outcome ?? ""} (${p.delta > 0 ? "+" : ""}${fmt(p.delta ?? 0)})`;
            else if (a.kind === "baddie_unlocked") label = `unboxed ${p.rarity ?? ""} Baddie ${p.name ?? ""}`;
            else if (a.kind === "baddie_income") label = `collected ${fmt(p.amount ?? 0)} DICE from a Baddie`;
            else if (a.kind === "marketplace_buy") label = `bought "${p.title ?? "an item"}" for ${fmt(p.price ?? 0)} DICE`;
            else if (a.kind === "marketplace_sell") label = `sold "${p.title ?? "an item"}" for ${fmt(p.price ?? 0)} DICE`;
            else if (a.kind === "auction_won") label = `won an auction for ${fmt(p.price ?? 0)} DICE`;
            else if (a.kind === "achievement") label = `earned achievement ${p.achievement ?? ""}`;
            return (
              <li key={a.id} className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2">
                <Avatar className="size-7"><AvatarImage src={a.profiles?.avatar_url} /><AvatarFallback>{a.profiles?.display_name?.[0] ?? "?"}</AvatarFallback></Avatar>
                <div className="flex-1 min-w-0 text-sm truncate"><span className="font-medium">{a.profiles?.display_name}</span> <span className="text-muted-foreground">{label}</span></div>
                <span className="text-xs text-muted-foreground shrink-0">{timeAgo(a.created_at)}</span>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}


