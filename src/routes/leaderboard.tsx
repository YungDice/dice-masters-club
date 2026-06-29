import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Crown, Trophy, Coins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmt } from "@/lib/format";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard — DICE" }] }),
  component: () => <AppShell><LB /></AppShell>,
});

function ProfileBoard({ orderBy, label, unit }: { orderBy: "xp" | "level"; label: string; unit: string }) {
  const q = useQuery({
    queryKey: ["lb", orderBy],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,username,display_name,avatar_url,xp,level,tag").order(orderBy, { ascending: false }).limit(50);
      return data ?? [];
    },
  });
  return (
    <Card className="glass p-5">
      <h2 className="font-display text-lg font-semibold mb-3">{label}</h2>
      <ol className="space-y-1">
        {(q.data ?? []).map((p, i) => {
          const points = orderBy === "xp" ? p.xp : p.level;
          return (
            <li key={p.id} className="flex items-center gap-3 rounded-md hover:bg-white/5 p-2">
              <span className={`w-7 text-right font-display font-bold ${i === 0 ? "text-gold" : i < 3 ? "text-primary" : "text-muted-foreground"}`}>{i === 0 ? <Crown className="inline size-4" /> : `#${i + 1}`}</span>
              <Avatar className="size-8"><AvatarImage src={p.avatar_url ?? undefined} /><AvatarFallback>{p.display_name?.[0]}</AvatarFallback></Avatar>
              <Link to="/u/$username" params={{ username: p.username }} className="flex-1 text-sm font-medium hover:underline truncate">{p.display_name}</Link>
              <span className="text-xs text-muted-foreground">Lvl {p.level}</span>
              <span className="text-sm font-bold w-28 text-right text-foreground">{fmt(points)} <span className="text-xs text-muted-foreground font-normal">{unit}</span></span>
            </li>
          );
        })}
        {q.data && q.data.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No players yet.</p>}
      </ol>
    </Card>
  );
}

function DiceBoard() {
  const q = useQuery({
    queryKey: ["lb", "dice"],
    queryFn: async () => {
      const { data } = await supabase.from("dice_wallets").select("user_id,balance,lifetime_earned").order("balance", { ascending: false }).limit(50);
      const list = data ?? [];
      const ids = list.map((w) => w.user_id);
      const { data: profs } = ids.length ? await supabase.from("profiles").select("id,username,display_name,avatar_url,level").in("id", ids) : { data: [] };
      const m = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
      return list.map((w) => ({ ...w, profile: m[w.user_id] }));
    },
  });
  return (
    <Card className="glass p-5">
      <h2 className="font-display text-lg font-semibold mb-3">Richest players</h2>
      <ol className="space-y-1">
        {(q.data ?? []).map((w: any, i) => (
          <li key={w.user_id} className="flex items-center gap-3 rounded-md hover:bg-white/5 p-2">
            <span className={`w-7 text-right font-display font-bold ${i === 0 ? "text-gold" : i < 3 ? "text-primary" : "text-muted-foreground"}`}>{i === 0 ? <Crown className="inline size-4" /> : `#${i + 1}`}</span>
            <Avatar className="size-8"><AvatarImage src={w.profile?.avatar_url ?? undefined} /><AvatarFallback>{w.profile?.display_name?.[0] ?? "?"}</AvatarFallback></Avatar>
            {w.profile?.username
              ? <Link to="/u/$username" params={{ username: w.profile.username }} className="flex-1 text-sm font-medium hover:underline truncate">{w.profile.display_name}</Link>
              : <span className="flex-1 text-sm text-muted-foreground">Anonymous</span>}
            <span className="text-xs text-muted-foreground">Lifetime {fmt(w.lifetime_earned)}</span>
            <span className="text-sm font-bold w-28 text-right text-primary">{fmt(w.balance)} <span className="text-xs text-muted-foreground font-normal">DICE</span></span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function LB() {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold flex items-center gap-2"><Trophy className="text-primary" /> Leaderboard</h1>
      <Tabs defaultValue="dice">
        <TabsList>
          <TabsTrigger value="dice"><Coins className="size-4 mr-1" /> DICE</TabsTrigger>
          <TabsTrigger value="xp">XP</TabsTrigger>
          <TabsTrigger value="level">Level</TabsTrigger>
        </TabsList>
        <TabsContent value="dice"><DiceBoard /></TabsContent>
        <TabsContent value="xp"><ProfileBoard orderBy="xp" label="Top players by XP" unit="XP" /></TabsContent>
        <TabsContent value="level"><ProfileBoard orderBy="level" label="Top players by level" unit="LVL" /></TabsContent>
      </Tabs>
    </div>
  );
}
