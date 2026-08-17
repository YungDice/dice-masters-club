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
import { createCoinFlip, joinCoinFlip, pickCoinFlipSide, cancelRoom, coinFlipBot } from "@/lib/dice.functions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CasinoFrame } from "@/components/dice/casino/CasinoFrame";
import { useAuth } from "@/hooks/use-auth";
import { useWallet } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/format";
import { toast } from "sonner";
import { Coin3D } from "@/components/dice/casino/Coin3D";

export const Route = createFileRoute("/play/coinflip")({
  head: () => ({
    meta: [
      { title: "Coin Flip — DICE" },
      { name: "description", content: "Heads or tails on DICE — solo vs bot or PvP escrow. Bet DICE and flip for instant payouts." },
      { property: "og:title", content: "Coin Flip — DICE" },
      { property: "og:description", content: "Heads or tails, solo or PvP, on DICE." },
      { property: "og:url", content: "https://yungdice.com/play/coinflip" },
    ],
    links: [{ rel: "canonical", href: "https://yungdice.com/play/coinflip" }],
  }),
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
        ? await supabase.from("profiles").select("id,username,display_name,avatar_url,tag").in("id", hostIds)
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
      <h1 className="font-display text-3xl font-medium flex items-center gap-2"><Coins className="text-foreground" />Coin Flip</h1>
      <Tabs defaultValue="bot">
        <TabsList>
          <TabsTrigger value="bot">Solo vs Bot</TabsTrigger>
          <TabsTrigger value="pvp">Multiplayer</TabsTrigger>
        </TabsList>
        <TabsContent value="bot"><BotPanel /></TabsContent>
        <TabsContent value="pvp" className="space-y-4">
          <CasinoFrame title="Create a lobby" subtitle="Heads or tails — winner takes the pot" icon={<Coins className="size-6 text-foreground" />}>
            <p className="text-sm text-muted-foreground">First to lock in a side gets it; the other gets the opposite.</p>
            <div className="mt-4">
              <div className="flex justify-between text-sm text-foreground"><span>Stake</span><span className="font-semibold">{fmt(stake)} DICE</span></div>
              <Slider min={10} max={Math.min(2000, Number(wallet?.balance ?? 100))} step={10} value={[stake]} onValueChange={(v) => setStake(v[0])} className="mt-2" />
              <label className="flex items-center gap-2 mt-3 text-sm text-foreground"><Switch checked={isPrivate} onCheckedChange={setIsPrivate} /> Private (invite code)</label>
            </div>
            <Button className="mt-4 glow-red" onClick={host}>Create lobby</Button>
          </CasinoFrame>

          <Card className="glass p-5">
            <h2 className="font-display text-lg font-medium">Open lobbies</h2>
            <div className="mt-3 space-y-2">
              {(rooms.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No public lobbies. Create one!</p>}
              {(rooms.data ?? []).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                  <div>
                    <div className="font-medium">{r.host?.display_name ?? "Player"}</div>
                    <div className="text-xs text-muted-foreground">@{r.host?.username}{r.host?.tag && <span className="text-primary">#{r.host.tag}</span>}</div>
                  </div>
                  <div className="text-sm font-semibold">{fmt(r.stake)} DICE</div>
                  <Button size="sm" onClick={() => accept(r.id, r.stake)} disabled={r.host_id === user?.id}>
                    {r.host_id === user?.id ? "Yours" : "Join"}
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BotPanel() {
  const { user } = useAuth();
  const { data: wallet } = useWallet(user?.id);
  const qc = useQueryClient();
  const [stake, setStake] = useState(100);
  const [side, setSide] = useState<"heads" | "tails">("heads");
  const [flipping, setFlipping] = useState(false);
  const [result, setResult] = useState<{ flip: "heads" | "tails"; won: boolean; delta: number } | null>(null);
  const flipFn = useServerFn(coinFlipBot);

  async function play() {
    if (!wallet || wallet.balance < stake) return toast.error("Not enough DICE");
    setFlipping(true); setResult(null);
    try {
      const r = await flipFn({ data: { stake, side } });
      setTimeout(() => {
        setResult(r);
        setFlipping(false);
        qc.invalidateQueries({ queryKey: ["wallet"] });
        toast(`${r.flip.toUpperCase()} — ${r.won ? "You won!" : "You lost."}`);
      }, 1400);
    } catch (e: any) { toast.error(e.message); setFlipping(false); }
  }

  return (
    <CasinoFrame title="Coin Flip vs Bot" subtitle="50/50 · pure luck" icon={<Coins className="size-6 text-foreground" />}>
      <div className="grid place-items-center py-4">
        <Coin3D side={result?.flip ?? null} flipping={flipping} />
      </div>
      <div className="flex justify-center gap-3 mt-2">
        {(["heads", "tails"] as const).map((s) => (
          <button key={s} disabled={flipping}
            onClick={() => setSide(s)}
            className={`rounded-lg px-5 py-2 font-display text-lg uppercase tracking-wider transition ${side === s ? "bg-primary text-black" : "bg-black/30 text-foreground hover:bg-black/50"}`}
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            {s}
          </button>
        ))}
      </div>
      <div className="mt-4 max-w-md mx-auto">
        <div className="flex justify-between text-sm text-foreground"><span>Stake</span><span className="font-semibold">{fmt(stake)} DICE</span></div>
        <Slider min={10} max={Math.min(2000, Number(wallet?.balance ?? 100))} step={10} value={[stake]} onValueChange={(v) => setStake(v[0])} className="mt-2" />
        <Button onClick={play} disabled={flipping} className="mt-4 w-full glow-red">{flipping ? "Flipping…" : `Flip — ${fmt(stake)} DICE`}</Button>
        {result && !flipping && (
          <div className={`mt-4 text-center font-display text-2xl ${result.won ? "text-emerald-400" : "text-destructive"}`}>
            {result.flip.toUpperCase()} · {result.won ? `+${fmt(result.delta)}` : fmt(result.delta)} DICE
          </div>
        )}
      </div>
    </CasinoFrame>
  );
}

function RoomView({ roomId, onLeave }: { roomId: string; onLeave: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const pick = useServerFn(pickCoinFlipSide);
  const cancel = useServerFn(cancelRoom);
  const [picking, setPicking] = useState(false);
  const [cancelling, setCancelling] = useState(false);

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

  async function leaveLobby() {
    setCancelling(true);
    try {
      await cancel({ data: { roomId } });
      toast.success("Lobby cancelled — stake refunded");
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["cf-rooms"] });
      qc.invalidateQueries({ queryKey: ["cf-my"] });
      onLeave();
    } catch (e: any) { toast.error(e.message); }
    finally { setCancelling(false); }
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <Card className="glass p-6 text-center felt-bg">
        <h1 className="font-display text-2xl font-medium">Lobby · {fmt(r.stake)} DICE</h1>
        {r.invite_code && <p className="text-xs text-muted-foreground mt-1">Invite code: <span className="font-mono font-bold text-foreground">{r.invite_code}</span></p>}

        {r.status === "waiting" && (
          <div className="mt-6 space-y-4">
            <p className="text-muted-foreground">Waiting for an opponent to join…</p>
            {isHost && (
              <Button variant="outline" disabled={cancelling} onClick={leaveLobby}>
                {cancelling ? "Cancelling…" : "Leave lobby & refund"}
              </Button>
            )}
          </div>
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
          <div className="mt-6 space-y-3">
            <Coin3D side={null} flipping />
            <p className="text-muted-foreground">You picked <b>{youPick}</b>. Flipping…</p>
          </div>
        )}

        {r.status === "finished" && state.flip && (
          <div className="mt-6 space-y-3">
            <Coin3D side={state.flip} flipping={false} />
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
