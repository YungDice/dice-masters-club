import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/dice/TopNav";
import { PageHeader } from "@/components/dice/PageHeader";
import { Card } from "@/components/ui/card";
import { Eye, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/format";

export const Route = createFileRoute("/spectate")({
  component: () => <AppShell><Spectate /></AppShell>,
});

function Spectate() {
  const rooms = useQuery({
    queryKey: ["spectate-rooms"],
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("game_rooms" as any)
        .select("id, kind, stake, state, created_at")
        .eq("status", "active")
        .eq("is_private", false)
        .order("stake", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return <div className="space-y-5">
    <PageHeader icon={Eye} title="Table Lounge" subtitle="Follow public active tables. Player hands, decks and other private state are never shown." />
    {(rooms.data ?? []).length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{(rooms.data ?? []).map((room: any) => <Card key={room.id} className="glass p-4"><div className="flex items-center justify-between"><div className="inline-flex items-center gap-2 font-bold capitalize"><Radio className="size-4 animate-pulse text-rose-200" />Live {room.kind}</div><div className="text-sm font-bold text-amber-200">{fmt(room.stake ?? 0)} DICE</div></div><div className="mt-3 rounded-lg border border-white/[0.08] bg-black/15 p-3 text-xs text-muted-foreground">{room.state ? "This table currently exposes public match state." : "The table is active."}</div></Card>)}</div> : <Card className="glass p-8 text-center"><Eye className="mx-auto size-8 text-amber-200" /><div className="mt-3 font-display text-xl font-bold">No public table is live</div><div className="mt-1 text-sm text-muted-foreground">Come back when another public table opens.</div></Card>}
  </div>;
}
