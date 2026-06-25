import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Coins } from "lucide-react";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { createCoinFlip, joinCoinFlip, pickCoinFlipSide } from "@/lib/dice.functions";
import { useAuth } from "@/hooks/use-auth";
import { useWallet } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/play/coinflip")({
  head: () => ({ meta: [{ title: "Coin Flip — DICE" }] }),
  component: () => <AppShell><CFPage /></AppShell>,
});

type Room = any;

function CFPage() {
  const { user } = useAuth();
  const { data: wallet } = useWallet(user?.id);
  const qc = useQueryClient();
  const [stake, setStake] = useState(100);
  const [isPrivate, setIsPrivate] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const create = useServerFn(createCoinFlip);
  const join = useServerFn(joinCoinFlip);

  // Find my active/waiting room
  const myRoom = useQuery({
    queryKey: ["cf-my", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("game_rooms")
        .select("*")
        .eq("kind", "coinflip")
        .in("status", ["waiting", "active"])
        .or(`host_id.eq.${user!.id},state->>joiner_id.eq.${user!.id}`)
        .order("created_at", { ascending: false })
        .limit(1);
      return (data?.[0] as Room) ?? null;
    },
  });

  const rooms = useQuery({
    queryKey: ["cf-rooms"],
    queryFn: async () => {
      const { data } = await supabase
        .from("game_rooms")
        .select("*")
        .eq("kind", "coinflip")
        .eq("status", "waiting")
        .eq("is_private", false)
        .order("created_at", { ascending: false })
        .limit(20);
      const list = data ?? [];
      const hostIds = list.map((r: any) => r.host_id);
      const { data: profs } = hostIds.length
        ? await supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", hostIds)
        : { data: [] };
      const m = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
      return list.map((r: any) => ({ ...r, host: m[r.host_id] ?? null }));
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("cf-rooms")
      .on("postgres_changes", { event: "*", schema: "public", table: "game_rooms", filter: "kind=eq.coinflip" }, () => {
        qc.invalidateQueries({ queryKey: ["cf-rooms"] });
        qc.invalidateQueries({ queryKey: ["cf-my"] });
        if (activeRoomId) qc.invalidateQueries({ queryKey: ["cf-room", activeRoomId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, activeRoomId]);

  useEffect(() => {
    if (myRoom.data?.id) setActiveRoomId(myRoom.data.id);
  }, [myRoom.data?.id]);

  async function host() {
    if (!wallet || wallet.balance < stake) return toast.error("Not enough DICE");
    try {
      const r = await create({ data: { stake, isPrivate } });
      toast.success("Room created — waiting for opponent");
      setActiveRoomId((r as any).id);
      qc.invalidateQueries();
    } catch (e: any) { toast.error(e.message); }
  }

  async function accept(roomId: string, stake: number) {
    if (!wallet || wallet.balance < stake) return toast.error("Not enough DICE");
    try {
      await join({ data: { roomId } });
      setActiveRoomId(roomId);
      qc.invalidateQueries();
    } catch (e: any) { toast.error(e.message); }
  }

  if (activeRoomId) {
    return <RoomView roomId={activeRoomId} onLeave={() => setActiveRoomId(null)} />;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Card className="glass p-6">
        <h1 className="font-display text-2xl font-bold flex items-center gap-2"><Coins />Coin Flip</h1>
        <p className="text-sm text-muted-foreground">Create a lobby and wait for an opponent. Once they join, the first player to lock in a side gets it — the other gets the opposite.</p>
        <div className="mt-4">
          <div className="flex justify-between text-sm"><span>Stake</span><span className="font-semibold">{fmt(stake)} DICE</span></div>
          <Slider min={10} max={Math.min(2000, Number(wallet?.balance ?? 100))} step={10} value={[stake]} onValueChange={(v) => setStake(v[0])} className="mt-2" />
          <label className="flex items-center gap-2 mt-3 text-sm"><Switch checked={isPrivate} onCheckedChange={setIsPrivate} /> Private (invite code)</label>
        </div>
        <Button className="mt-4 glow-red" onClick={host}>Create lobby</Button>
      </Card>

      <Card className="glass p-5">
        <h2 className="font-display text-lg font-semibold">Open lobbies</h2>
        <div className="mt-3 space-y-2">
          {(rooms.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No public lobbies. Create one!</p>}
          {(rooms.data ?? []).map((r: any) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
              <div>
                <div className="font-medium">{r.host?.display_name ?? "Player"}</div>
                <div className="text-xs text-muted-foreground">@{r.host?.username}</div>
              </div>
              <div className="text-sm font-semibold">{fmt(r.stake)} DICE</div>
              <Button size="sm" onClick={() => accept(r.id, r.stake)} disabled={r.host_id === user?.id}>
                {r.host_id === user?.id ? "Yours" : "Join"}
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function RoomView({ roomId, onLeave }: { roomId: string; onLeave: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const pick = useServerFn(pickCoinFlipSide);
  const [picking, setPicking] = useState(false);

  const room = useQuery({
    queryKey: ["cf-room", roomId],
    queryFn: async () => {
      const { data } = await supabase.from("game_rooms").select("*").eq("id", roomId).single();
      return data as Room;
    },
    refetchInterval: 1500,
  });

  useEffect(() => {
    const ch = supabase
      .channel(`cf-room-${roomId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game_rooms", filter: `id=eq.${roomId}` }, () => {
        qc.invalidateQueries({ queryKey: ["cf-room", roomId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [roomId, qc]);

  const r = room.data;
  if (!r) return <div className="text-center text-muted-foreground">Loading lobby…</div>;
  const state: any = r.state ?? {};
  const isHost = user?.id === r.host_id;
  const youPick = isHost ? state.host_pick : state.joiner_pick;
  const theirPick = isHost ? state.joiner_pick : state.host_pick;

  async function lockIn(side: "heads" | "tails") {
    setPicking(true);
    try {
      const res = await pick({ data: { roomId, side } });
      const youWon = res.winnerId === user?.id;
      toast(`Coin landed ${res.flip.toUpperCase()} — ${youWon ? "You won!" : "You lost."}`);
      qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setPicking(false); }
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <Card className="glass p-6 text-center felt-bg">
        <h1 className="font-display text-2xl font-bold">Lobby · {fmt(r.stake)} DICE</h1>
        {r.invite_code && <p className="text-xs text-muted-foreground mt-1">Invite code: <span className="font-mono font-bold text-foreground">{r.invite_code}</span></p>}

        {r.status === "waiting" && (
          <p className="mt-6 text-muted-foreground">Waiting for an opponent to join…</p>
        )}

        {r.status === "active" && !youPick && (
          <>
            <p className="mt-6 text-muted-foreground">Pick your side. Opponent gets the other.</p>
            <div className="mt-4 flex gap-3 justify-center">
              {(["heads", "tails"] as const).map((s) => (
                <motion.button
                  key={s} whileTap={{ scale: 0.95 }} disabled={picking}
                  onClick={() => lockIn(s)}
                  className="rounded-lg border border-border bg-card px-6 py-4 font-display text-xl hover:border-primary"
                >
                  {s.toUpperCase()}
                </motion.button>
              ))}
            </div>
          </>
        )}

        {r.status === "active" && youPick && !state.flip && (
          <p className="mt-6 text-muted-foreground">You picked <b>{youPick}</b>. Flipping…</p>
        )}

        {r.status === "finished" && state.flip && (
          <div className="mt-6 space-y-3">
            <motion.div initial={{ rotateX: 0 }} animate={{ rotateX: 720 }} transition={{ duration: 1 }}
              className="mx-auto size-32 rounded-full bg-gold/20 border-4 border-gold grid place-items-center font-display text-4xl font-bold text-gold glow-red">
              {state.flip === "heads" ? "H" : "T"}
            </motion.div>
            <div className="text-sm text-muted-foreground">Coin landed <b className="text-foreground">{state.flip.toUpperCase()}</b></div>
            <div className="text-sm">You picked <b>{youPick}</b> · Opponent picked <b>{theirPick}</b></div>
            <div className={`font-display text-3xl ${r.winner_id === user?.id ? "text-emerald-400" : "text-destructive"}`}>
              {r.winner_id === user?.id ? `+${fmt(r.stake)} DICE` : `-${fmt(r.stake)} DICE`}
            </div>
            <Button onClick={onLeave}>Back to lobbies</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
