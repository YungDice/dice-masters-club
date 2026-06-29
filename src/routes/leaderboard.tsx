import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Crown, Trophy, Coins, Gem, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmt } from "@/lib/format";
import { PageHeader } from "@/components/dice/PageHeader";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard — DICE" }] }),
  component: () => <AppShell><LB /></AppShell>,
});

type Row = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  level: number;
  tag: string | null;
  points: number;
  lifetime?: number | null;
};

const DAILY_REWARDS = [
  { dice: 1500, vip: "1 Day VIP", podiumH: "h-48", grad: "from-amber-200 via-amber-400 to-amber-700", ring: "ring-amber-300/80", glow: "shadow-[0_0_50px_-5px_rgba(252,211,77,0.55)]" },
  { dice: 750,  vip: "12h VIP",   podiumH: "h-36", grad: "from-slate-100 via-slate-300 to-slate-500", ring: "ring-slate-200/70", glow: "shadow-[0_0_40px_-5px_rgba(203,213,225,0.4)]" },
  { dice: 500,  vip: null,        podiumH: "h-28", grad: "from-orange-300 via-orange-500 to-orange-800", ring: "ring-orange-400/70", glow: "shadow-[0_0_40px_-5px_rgba(251,146,60,0.45)]" },
];

function NameTag({ p }: { p: Row }) {
  return (
    <span className="truncate">
      <span className="font-semibold">{p.display_name}</span>
      {p.tag && <span className="text-primary font-mono">#{p.tag}</span>}
    </span>
  );
}

function Countdown() {
  const [s, setS] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 5));
      const diff = Math.max(0, next.getTime() - now.getTime());
      const h = Math.floor(diff / 3.6e6);
      const m = Math.floor((diff % 3.6e6) / 6e4);
      const sec = Math.floor((diff % 6e4) / 1000);
      setS(`${h}h ${m}m ${sec}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono">{s}</span>;
}

function Podium({ top, unit }: { top: Row[]; unit: string }) {
  // Visual order: 2nd, 1st, 3rd
  const order = [top[1], top[0], top[2]];
  const ranks = [2, 1, 3];
  return (
    <div className="relative">
      <div className="absolute inset-x-0 -top-8 h-40 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-400/20 via-transparent to-transparent pointer-events-none" />
      <div className="grid grid-cols-3 gap-3 md:gap-6 items-end relative">
        {order.map((p, idx) => {
          const rank = ranks[idx];
          const r = DAILY_REWARDS[rank - 1];
          if (!p) return <div key={idx} />;
          return (
            <motion.div
              key={p.id}
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 * idx, type: "spring", stiffness: 90 }}
              className="flex flex-col items-center"
            >
              <div className="relative mb-3">
                {rank === 1 && <Crown className="absolute -top-7 left-1/2 -translate-x-1/2 size-7 text-amber-300 drop-shadow-[0_0_8px_rgba(252,211,77,0.7)]" />}
                <Avatar className={`size-20 md:size-24 ring-4 ${r.ring} shadow-[0_0_30px_-5px] shadow-amber-500/30`}>
                  <AvatarImage src={p.avatar_url ?? undefined} />
                  <AvatarFallback className="text-2xl">{p.display_name[0]}</AvatarFallback>
                </Avatar>
              </div>
              <Link to="/u/$username" params={{ username: p.username }} className="text-center max-w-full px-1">
                <div className="font-display font-bold truncate text-sm md:text-base">
                  {p.display_name}
                  {p.tag && <span className="text-primary font-mono">#{p.tag}</span>}
                </div>
                <div className="text-xs text-muted-foreground font-mono truncate">@{p.username}</div>
              </Link>
              <div className={`mt-3 w-full ${r.podiumH} rounded-t-xl bg-gradient-to-b ${r.grad} relative overflow-hidden border border-white/10`}>
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),transparent_40%)]" />
                <div className="absolute inset-x-0 top-2 text-center font-display font-black text-3xl md:text-5xl text-black/70">{rank}</div>
                <div className="absolute inset-x-0 bottom-2 text-center text-[10px] md:text-xs text-black/80 font-semibold px-1">
                  <div>{fmt(p.points)} {unit}</div>
                </div>
              </div>
              <div className="mt-2 text-center text-xs">
                <div className="flex items-center justify-center gap-1 text-primary font-bold"><Gem className="size-3" />+{fmt(r.dice)}</div>
                {r.vip && <div className="text-amber-300 text-[10px] font-medium">+{r.vip}</div>}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function Board({ rows, unit }: { rows: Row[]; unit: string }) {
  const top = rows.slice(0, 3);
  const rest = rows.slice(3);
  return (
    <Card className="glass p-4 md:p-6 overflow-hidden">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="font-display text-base md:text-lg font-semibold flex items-center gap-2">
          <Trophy className="size-4 text-amber-300" /> Daily rewards reset in
        </h2>
        <div className="text-sm text-muted-foreground flex items-center gap-1"><Clock className="size-4" /><Countdown /></div>
      </div>
      {top.length > 0 ? <Podium top={top} unit={unit} /> : <p className="text-sm text-muted-foreground text-center py-6">No players yet.</p>}
      {rest.length > 0 && (
        <ol className="space-y-1 mt-6 border-t border-white/5 pt-4">
          {rest.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 rounded-md hover:bg-white/5 p-2">
              <span className="w-7 text-right font-display font-bold text-muted-foreground">#{i + 4}</span>
              <Avatar className="size-8"><AvatarImage src={p.avatar_url ?? undefined} /><AvatarFallback>{p.display_name[0]}</AvatarFallback></Avatar>
              <Link to="/u/$username" params={{ username: p.username }} className="flex-1 text-sm hover:underline truncate">
                <NameTag p={p} />
                <span className="ml-1 text-xs text-muted-foreground font-mono">@{p.username}</span>
              </Link>
              <span className="text-xs text-muted-foreground">Lvl {p.level}</span>
              <span className="text-sm font-bold w-28 text-right text-foreground">{fmt(p.points)} <span className="text-xs text-muted-foreground font-normal">{unit}</span></span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function ProfileBoard({ orderBy, unit }: { orderBy: "xp" | "level"; unit: string }) {
  const q = useQuery({
    queryKey: ["lb", orderBy],
    queryFn: async (): Promise<Row[]> => {
      const { data } = await supabase.from("profiles").select("id,username,display_name,avatar_url,xp,level,tag").order(orderBy, { ascending: false }).limit(50);
      return (data ?? []).map((p: any) => ({ ...p, points: orderBy === "xp" ? p.xp : p.level }));
    },
  });
  return <Board rows={q.data ?? []} unit={unit} />;
}

function DiceBoard() {
  const q = useQuery({
    queryKey: ["lb", "dice"],
    queryFn: async (): Promise<Row[]> => {
      const { data } = await supabase.from("dice_wallets").select("user_id,balance,lifetime_earned").order("balance", { ascending: false }).limit(50);
      const list = data ?? [];
      const ids = list.map((w) => w.user_id);
      const { data: profs } = ids.length ? await supabase.from("profiles").select("id,username,display_name,avatar_url,level,tag").in("id", ids) : { data: [] };
      const m = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
      return list
        .filter((w) => m[w.user_id])
        .map((w: any) => ({ ...m[w.user_id], points: w.balance, lifetime: w.lifetime_earned }));
    },
  });
  return <Board rows={q.data ?? []} unit="DICE" />;
}

function LB() {
  return (
    <div className="space-y-4">
      <PageHeader
        icon={Trophy}
        title="Leaderboard"
        subtitle="Top 3 each day earn DICE & VIP — climb the ranks."
        accent="gold"
      />
      <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm flex flex-wrap items-center gap-x-6 gap-y-1">
        <span className="font-semibold text-amber-300 flex items-center gap-1"><Trophy className="size-4" /> Daily prizes</span>
        <span><span className="text-amber-300 font-bold">#1</span> 1,500 DICE + 1 Day VIP</span>
        <span><span className="text-slate-300 font-bold">#2</span> 750 DICE + 12h VIP</span>
        <span><span className="text-orange-400 font-bold">#3</span> 500 DICE</span>
      </div>
      <Tabs defaultValue="xp">
        <TabsList className="bg-card/40 backdrop-blur">
          <TabsTrigger value="xp">XP</TabsTrigger>
          <TabsTrigger value="dice"><Coins className="size-4 mr-1" /> DICE</TabsTrigger>
          <TabsTrigger value="level">Level</TabsTrigger>
        </TabsList>
        <TabsContent value="xp"><ProfileBoard orderBy="xp" unit="XP" /></TabsContent>
        <TabsContent value="dice"><DiceBoard /></TabsContent>
        <TabsContent value="level"><ProfileBoard orderBy="level" unit="LVL" /></TabsContent>
      </Tabs>
    </div>
  );
}
