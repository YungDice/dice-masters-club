import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/dice/TopNav";
import { PageHeader } from "@/components/dice/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/format";
import { sendSpectatorReaction } from "@/lib/spectate.functions";

export const Route = createFileRoute("/spectate")({
  component: () => <AppShell><Spectate /></AppShell>,
});

const reactions = ["🔥", "🎲", "😱", "👏", "💀"] as const;

function Spectate() {
  const qc = useQueryClient();
  const sendReaction = useServerFn(sendSpectatorReaction);
  const [busy, setBusy] = useState(false);
  const rooms = useQuery({
    queryKey: ["spectate-rooms"],
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("game_rooms" as any).select("id, kind, stake, state, created_at").eq("status", "active").eq("is_private", false).order("stake", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const roomIds = useMemo(() => (rooms.data ?? []).map((room: any) => room.id), [rooms.data]);
  const feed = useQuery({
    queryKey: ["spectate-reactions", roomIds.join(",")],
    enabled: roomIds.length > 0,
    refetchInterval: 5_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("spectator_reactions" as any).select("room_id, emoji, created_at").in("room_id", roomIds).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
  const react = async (roomId: string, emoji: typeof reactions[number]) => {
    setBusy(true);
    try {
      await sendReaction({ data: { roomId, emoji } });
      qc.invalidateQueries({ queryKey: ["spectate-reactions"] });
    } finally {
      setBusy(false);
    }
  };

  return <div className="space-y-5">
    <PageHeader icon={Eye} title="Table Lounge" subtitle="Follow public active tables. Player hands, decks and other private state are never shown." />
    {(rooms.data ?? []).length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{(rooms.data ?? []).map((room: any) => {
      const recent = (feed.data ?? []).filter((item: any) => item.room_id === room.id).slice(0, 12);
      return <Card key={room.id} className="glass p-4"><div className="flex items-center justify-between"><div className="inline-flex items-center gap-2 font-bold capitalize"><Radio className="size-4 animate-pulse text-rose-200" />Live {room.kind}</div><div className="text-sm font-bold text-amber-200">{fmt(room.stake ?? 0)} DICE</div></div><div className="mt-3 rounded-lg border border-white/[0.08] bg-black/15 p-3 text-xs text-muted-foreground">{room.state ? "This table currently exposes public match state." : "The table is active."}</div><div className="mt-3 min-h-9 rounded-lg bg-black/20 p-2 text-lg">{recent.length ? recent.map((item: any, index: number) => <span key={`${item.created_at}-${index}`}>{item.emoji}</span>) : "—"}</div><div className="mt-2 flex gap-1">{reactions.map((emoji) => <Button key={emoji} size="sm" variant="outline" disabled={busy} onClick={() => react(room.id, emoji)}>{emoji}</Button>)}</div></Card>;
    })}</div> : <Card className="glass p-8 text-center"><Eye className="mx-auto size-8 text-amber-200" /><div className="mt-3 font-display text-xl font-bold">No public table is live</div><div className="mt-1 text-sm text-muted-foreground">Come back when another public table opens.</div></Card>}
  </div>;
}
