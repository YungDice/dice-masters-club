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
import { RightRail } from "@/components/dice/RightRail";
import { Panel, SectionHeader, PillLink, OutlineAction } from "@/components/dice/Surface";
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

  const quickPlay = [
    { to: "/play/dice", t: "Dice" },
    { to: "/play/coinflip", t: "Coin Flip" },
    { to: "/play/blackjack", t: "Blackjack" },
    { to: "/play/slots", t: "Slots" },
    { to: "/play/roulette", t: "Roulette" },
    { to: "/play/rocket", t: "Rocket" },
    { to: "/play/wheel", t: "Wheel" },
    { to: "/play/numguess", t: "Number Guess" },
    { to: "/play/poker", t: "Poker" },
  ];

  return (
    <div className="space-y-12">
      {/* Filter pill bar */}
      <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
        <PillLink to="/" active>All</PillLink>
        <PillLink to="/play">Games</PillLink>
        <PillLink to="/challenges">Challenges</PillLink>
        <PillLink to="/marketplace">Market</PillLink>
        <PillLink to="/baddies">Baddies</PillLink>
        <PillLink to="/crews">Crews</PillLink>
        <PillLink to="/leaderboard">Ranks</PillLink>
        <PillLink to="/season-pass">Season</PillLink>
      </div>

      {/* Hero — featured card */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Panel className="p-3">
          <div className="relative overflow-hidden rounded-lg bg-obsidian" style={{ aspectRatio: "16 / 6", minHeight: 200 }}>
            <div aria-hidden className="absolute inset-0 grid place-items-center opacity-[0.14]">
              <Dices className="size-64 text-white" strokeWidth={1} />
            </div>
            <div className="absolute inset-x-0 bottom-0 p-4 md:p-5" style={{ background: "linear-gradient(to top, rgba(8,8,9,0.92), rgba(8,8,9,0))" }}>
              <div className="flex items-end gap-3">
                <Avatar className="size-14 rounded-full ring-1 ring-white/10">
                  <AvatarImage src={profile?.avatar_url ?? undefined} />
                  <AvatarFallback>{(profile?.display_name ?? "P")[0]}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h1 className="truncate text-[20px] font-medium leading-tight">
                      {profile?.display_name ?? "Player"}
                    </h1>
                    <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-ice" />
                  </div>
                  <div className="text-[14px] text-fog">
                    <span className="num text-white">{fmt(wallet?.balance ?? 0)}</span> DICE balance
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4-up stat strip */}
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            {[
              { l: "Balance", v: fmt(wallet?.balance ?? 0), s: "DICE" },
              { l: "Level", v: String(lvl), s: `${fmt(xp)} / ${fmt(nextXp)} XP` },
              { l: "Streak", v: String(profile?.streak_days ?? 0), s: "days" },
              { l: "Season", v: String(profile?.level ?? 1), s: "tier progress" },
            ].map((s) => (
              <div key={s.l} className="rounded bg-graphite px-3 py-2">
                <div className="text-[12px] text-fog">{s.l}</div>
                <div className="num text-[16px]">{s.v}</div>
                <div className="text-[10px] text-fog">{s.s}</div>
              </div>
            ))}
          </div>

          <div className="mt-3">
            <Progress value={pct} />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {dailyClaimed.data ? (
              <span className="inline-flex items-center gap-1.5 rounded bg-graphite px-3 py-2 text-[12px] text-fog">
                <Flame className="size-4" strokeWidth={1.5} /> Daily claimed
              </span>
            ) : (
              <OutlineAction onClick={onClaim} disabled={claiming}>
                <Flame className="size-4" strokeWidth={1.5} /> Claim daily reward
              </OutlineAction>
            )}
            <Link to="/play">
              <OutlineAction className="border-iron">
                <Gamepad2 className="size-4" strokeWidth={1.5} /> Play now
              </OutlineAction>
            </Link>
          </div>
        </Panel>
      </motion.div>

      {/* Quick play */}
      <section>
        <SectionHeader title="Quick Play" to="/play" linkLabel="Lobby" subtitle="Provably fair, server-authoritative rounds" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickPlay.map((g) => (
            <Link key={g.to} to={g.to as any} className="group">
              <Panel className="flex items-center gap-3 transition-colors hover:bg-graphite">
                <div className="grid size-8 shrink-0 place-items-center rounded bg-graphite">
                  <Dices className="size-5 text-white group-hover:text-ice transition-colors" strokeWidth={1.5} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[14px] font-medium">{g.t}</span>
                    <span aria-hidden className="size-1 rounded-full bg-ice" />
                  </div>
                  <div className="num text-[12px] text-fog">wager DICE · instant</div>
                </div>
              </Panel>
            </Link>
          ))}
        </div>
      </section>

      {/* Today's challenge */}
      <section>
        <SectionHeader title="Today's Challenge" to="/challenges" subtitle="Fresh task, fresh DICE — resets daily" />
        {daily.data ? (
          <Link to="/challenges/$id" params={{ id: daily.data.id }}>
            <Panel className="flex items-start justify-between gap-3 transition-colors hover:bg-graphite">
              <div className="min-w-0">
                <div className="truncate text-[20px] font-medium">{daily.data.title}</div>
                <div className="line-clamp-2 text-[14px] text-fog">{daily.data.description}</div>
              </div>
              <DiceBadge amount={daily.data.dice_reward} />
            </Panel>
          </Link>
        ) : (
          <EmptyState icon={Sparkles} title="No daily challenge yet" description="Check back soon." />
        )}
      </section>

      {/* Featured challenges */}
      <section>
        <SectionHeader title="Featured Challenges" to="/challenges" subtitle="Curated by staff" />
        {(featured.data ?? []).length === 0 ? (
          <EmptyState icon={Trophy} title="No featured challenges" description="Staff will spotlight new ones soon." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(featured.data ?? []).map((c) => (
              <Link key={c.id} to="/challenges/$id" params={{ id: c.id }}>
                <Panel className="h-full transition-colors hover:bg-graphite">
                  <div className="line-clamp-1 text-[14px] font-medium">{c.title}</div>
                  <div className="mt-1 line-clamp-2 text-[12px] text-fog">{c.description}</div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wide text-fog">{c.category}</span>
                    <DiceBadge size="sm" amount={c.dice_reward} />
                  </div>
                </Panel>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Featured drops */}
      <section>
        <SectionHeader title="Featured Drops" to="/marketplace" subtitle="Latest live listings" />
        {(featuredListings.data ?? []).length === 0 ? (
          <EmptyState icon={ShoppingBag} title="Nothing live yet" description="Be the first to list an item." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(featuredListings.data ?? []).map((l) => (
              <Link key={l.id} to="/marketplace/$id" params={{ id: l.id }}>
                <div
                  className="overflow-hidden rounded-lg bg-charcoal transition-colors hover:bg-graphite"
                  style={{ boxShadow: "rgba(255,255,255,0.08) 0 0 0 1px inset" }}
                >
                  <div className="relative grid aspect-square place-items-center bg-obsidian">
                    <ShoppingBag className="size-12 text-white/20" strokeWidth={1.5} />
                    <span className="absolute bottom-2 right-2 rounded bg-charcoal px-2 py-1 num text-[12px]">
                      {fmt(l.price)} DICE
                    </span>
                  </div>
                  <div className="flex h-14 flex-col justify-center px-3">
                    <div className="truncate text-[14px] font-medium">{l.title}</div>
                    <div className="truncate text-[12px] text-fog">{l.category}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Activity / results / notifications */}
      <section>
        <SectionHeader title="Activity" to="/friends" linkLabel="Friends" subtitle="Your results and your crew's moves" />
        <div className="grid gap-3 lg:grid-cols-3">
          <Panel>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-medium uppercase tracking-widest text-fog">Recent Results</span>
            </div>
            <ul>
              {(recentGames.data ?? []).length === 0 && (
                <li className="py-2 text-[12px] text-fog">No games yet — try your first one.</li>
              )}
              {(recentGames.data ?? []).slice(0, 6).map((r: any) => (
                <li key={r.id} className="flex h-12 items-center justify-between gap-2" style={{ borderTop: "1px solid var(--iron)" }}>
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium capitalize">{String(r.kind).replace(/_/g, " ")}</div>
                    <div className="num text-[10px] text-fog">bet {fmt(r.wagered ?? 0)} · {r.outcome}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={`num text-[14px] ${r.delta > 0 ? "text-white" : r.delta < 0 ? "text-destructive" : "text-fog"}`}>
                      {r.delta > 0 ? "+" : ""}{fmt(r.delta)}
                    </div>
                    <div className="text-[10px] text-fog">{timeAgo(r.created_at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel className="lg:col-span-1">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-medium uppercase tracking-widest text-fog">Notifications</span>
              <Link to="/notifications" className="text-[12px] font-medium text-ice hover:text-white">All</Link>
            </div>
            <ul>
              {(notif.data ?? []).length === 0 && <li className="py-2 text-[12px] text-fog">No new notifications.</li>}
              {(notif.data ?? []).slice(0, 4).map((n) => (
                <li key={n.id} className="py-2" style={{ borderTop: "1px solid var(--iron)" }}>
                  <div className="line-clamp-1 text-[14px] font-medium">{n.title}</div>
                  {n.body && <div className="line-clamp-1 text-[12px] text-fog">{n.body}</div>}
                  <div className="num text-[10px] text-fog">{timeAgo(n.created_at)}</div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-medium uppercase tracking-widest text-fog">Friend Activity</span>
              <Link to="/friends" className="text-[12px] font-medium text-ice hover:text-white">Friends</Link>
            </div>
            <ul>
              {friendIds.isLoading && <li className="py-2 text-[12px] text-fog">Loading…</li>}
              {!friendIds.isLoading && (friendIds.data?.length ?? 0) === 0 && (
                <li className="py-2 text-[12px] text-fog">Add friends to see their activity here.</li>
              )}
              {(friendIds.data?.length ?? 0) > 0 && (feed.data ?? []).length === 0 && (
                <li className="py-2 text-[12px] text-fog">No friend activity yet.</li>
              )}
              {(feed.data ?? []).slice(0, 6).map((a: any) => {
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
                  <li key={a.id} className="flex h-12 items-center gap-2.5" style={{ borderTop: "1px solid var(--iron)" }}>
                    <Avatar className="size-7 rounded">
                      <AvatarImage src={a.profiles?.avatar_url} />
                      <AvatarFallback className="text-[10px]">{a.profiles?.display_name?.[0] ?? "?"}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 truncate text-[14px]">
                      <span className="font-medium">{a.profiles?.display_name}</span>{" "}
                      <span className="text-fog">{label}</span>
                    </div>
                    <span className="shrink-0 text-[10px] text-fog">{timeAgo(a.created_at)}</span>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      </section>
    </div>
  );
}



