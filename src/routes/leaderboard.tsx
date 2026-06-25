import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Crown } from "lucide-react";
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

function Board({ orderBy, label }: { orderBy: "xp" | "level"; label: string }) {
  const q = useQuery({
    queryKey: ["lb", orderBy],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,username,display_name,avatar_url,xp,level").order(orderBy, { ascending: false }).limit(50);
      return data ?? [];
    },
  });
  return (
    <Card className="glass p-5">
      <h2 className="font-display text-lg font-semibold mb-3">{label}</h2>
      <ol className="space-y-1">
        {(q.data ?? []).map((p, i) => (
          <li key={p.id} className="flex items-center gap-3 rounded-md hover:bg-white/5 p-2">
            <span className={`w-7 text-right font-display font-bold ${i === 0 ? "text-gold" : i < 3 ? "text-primary" : "text-muted-foreground"}`}>{i === 0 ? <Crown className="inline size-4" /> : `#${i + 1}`}</span>
            <Avatar className="size-8"><AvatarImage src={p.avatar_url ?? undefined} /><AvatarFallback>{p.display_name?.[0]}</AvatarFallback></Avatar>
            <Link to="/u/$username" params={{ username: p.username }} className="flex-1 text-sm font-medium hover:underline">{p.display_name}</Link>
            <span className="text-xs text-muted-foreground">Lvl {p.level}</span>
            <span className="text-sm font-semibold w-20 text-right">{fmt(p.xp)} XP</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function LB() {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold">Leaderboard</h1>
      <Tabs defaultValue="xp">
        <TabsList><TabsTrigger value="xp">XP</TabsTrigger><TabsTrigger value="level">Level</TabsTrigger></TabsList>
        <TabsContent value="xp"><Board orderBy="xp" label="Top players by XP" /></TabsContent>
        <TabsContent value="level"><Board orderBy="level" label="Top players by level" /></TabsContent>
      </Tabs>
    </div>
  );
}
