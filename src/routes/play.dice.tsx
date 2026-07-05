import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Dices } from "lucide-react";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { playDiceSolo, createDiceRoom, joinDiceRoom, cancelRoom } from "@/lib/dice.functions";
import { useAuth } from "@/hooks/use-auth";
import { useWallet } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/format";
import { toast } from "sonner";
import { Die3D } from "@/components/dice/casino/Die3D";
import { CasinoFrame } from "@/components/dice/casino/CasinoFrame";
import { useFx } from "@/lib/fx";


export const Route = createFileRoute("/play/dice")({
  head: () => ({ meta: [{ title: "Dice — DICE" }] }),
  component: () => <AppShell><DicePage /></AppShell>,
});

function DiePair({ total, rolling }: { total: number; rolling: boolean }) {
  // Split total (2-12) into two faces; if 0 show placeholder pair (1,1)
  const a = total ? Math.max(1, Math.min(6, Math.ceil(total / 2))) : 1;
  const b = total ? total - a : 1;
  return (
    <div className="flex gap-4">
      <Die3D value={a} rolling={rolling} />
      <Die3D value={Math.max(1, Math.min(6, b)) || 1} rolling={rolling} />
    </div>
  );
}

function DicePage() {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="font-display text-3xl font-bold flex items-center gap-2"><Dices className="size-7" /> Dice</h1>
      <Tabs defaultValue="solo">
        <TabsList><TabsTrigger value="solo">Solo vs House</TabsTrigger><TabsTrigger value="pvp">Multiplayer</TabsTrigger></TabsList>
        <TabsContent value="solo"><Solo /></TabsContent>
        <TabsContent value="pvp"><PvP /></TabsContent>
      </Tabs>
    </div>
  );
}

function Solo() {
  const { user } = useAuth();
  const { data: wallet } = useWallet(user?.id);
  const qc = useQueryClient();
  const [stake, setStake] = useState(50);
  const [result, setResult] = useState<{ me: number; house: number; delta: number; outcome: string } | null>(null);
  const [rolling, setRolling] = useState(false);
  const play = useServerFn(playDiceSolo);
  const fx = useFx();

  async function roll() {
    if (!wallet || wallet.balance < stake) return toast.error("Not enough DICE");
    setRolling(true); setResult(null);
    fx.play("dice");
    try {
      const r = await play({ data: { stake } });
      setTimeout(() => {
        setResult(r);
        setRolling(false);
        qc.invalidateQueries({ queryKey: ["wallet"] });
        if (r.outcome === "win") fx.celebrate({ amount: r.delta });
        else if (r.outcome === "lose") fx.celebrate({ amount: r.delta, shake: true });
      }, 700);
    } catch (e: any) { toast.error(e.message); setRolling(false); }
  }


  return (
    <div className="space-y-4">
      <CasinoFrame title="Solo vs House" subtitle="Higher roll wins · tie refunds" icon={<Dices className="size-6 text-amber-400" />}>
        <div className="mt-2 flex items-center justify-center gap-10">
          <div className="flex flex-col items-center"><div className="text-xs uppercase tracking-widest text-amber-100/70 mb-3">You</div><DiePair total={result?.me ?? 0} rolling={rolling} /></div>
          <div className="text-2xl text-amber-200/60">vs</div>
          <div className="flex flex-col items-center"><div className="text-xs uppercase tracking-widest text-amber-100/70 mb-3">House</div><DiePair total={result?.house ?? 0} rolling={rolling} /></div>
        </div>
        {result && <div className={`mt-6 text-center font-display text-2xl ${result.outcome === "win" ? "text-emerald-400" : result.outcome === "tie" ? "text-amber-100/70" : "text-destructive"}`}>{result.outcome.toUpperCase()} {result.delta > 0 && `+${fmt(result.delta)} DICE`}{result.delta < 0 && `${fmt(result.delta)} DICE`}</div>}
      </CasinoFrame>
      <Card className="glass p-5">
        <div className="flex justify-between text-sm"><span>Stake</span><span className="font-semibold">{fmt(stake)} DICE</span></div>
        <Slider min={10} max={Math.min(1000, Number(wallet?.balance ?? 100))} step={10} value={[stake]} onValueChange={(v) => setStake(v[0])} className="mt-2" />
        <Button onClick={roll} disabled={rolling} className="mt-4 w-full glow-red">{rolling ? "Rolling..." : "Roll"}</Button>
      </Card>
    </div>
  );
}

function PvP() {
  const { user } = useAuth();
  const { data: wallet } = useWallet(user?.id);
  const qc = useQueryClient();
  const [stake, setStake] = useState(100);
  const [isPrivate, setIsPrivate] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ hostRoll: number; joinRoll: number; winnerId: string | null; pot: number } | null>(null);
  const create = useServerFn(createDiceRoom);
  const join = useServerFn(joinDiceRoom);
  const cancel = useServerFn(cancelRoom);

  const rooms = useQuery({
    queryKey: ["dice-rooms"],
    queryFn: async () => {
      const { data } = await supabase.from("game_rooms").select("*").eq("kind", "dice").eq("status", "waiting").eq("is_private", false).order("created_at", { ascending: false }).limit(20);
      const list = data ?? [];
      const ids = list.map((r: any) => r.host_id);
      const { data: profs } = ids.length ? await supabase.from("profiles").select("id,username,display_name").in("id", ids) : { data: [] };
      const m = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
      return list.map((r: any) => ({ ...r, host: m[r.host_id] ?? null }));
    },
  });

  useEffect(() => {
    const ch = supabase.channel("dice-rooms").on("postgres_changes", { event: "*", schema: "public", table: "game_rooms", filter: "kind=eq.dice" }, () => qc.invalidateQueries({ queryKey: ["dice-rooms"] })).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  // Watch active room for results (host side)
  useEffect(() => {
    if (!activeRoomId) return;
    const ch = supabase.channel(`dice-room-${activeRoomId}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "game_rooms", filter: `id=eq.${activeRoomId}` }, async (payload) => {
      const r: any = payload.new;
      if (r.status === "finished") {
        setLastResult({ hostRoll: r.state.hostRoll, joinRoll: r.state.joinRoll, winnerId: r.winner_id, pot: r.stake * 2 });
        setActiveRoomId(null);
        qc.invalidateQueries({ queryKey: ["wallet"] });
        qc.invalidateQueries({ queryKey: ["dice-rooms"] });
      }
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeRoomId, qc]);

  async function host() {
    if (!wallet || wallet.balance < stake) return toast.error("Not enough DICE");
    try {
      const r = await create({ data: { stake, isPrivate } });
      setActiveRoomId((r as any).id);
      toast.success("Lobby created — waiting for opponent");
    } catch (e: any) { toast.error(e.message); }
  }

  async function accept(roomId: string, stake: number) {
    if (!wallet || wallet.balance < stake) return toast.error("Not enough DICE");
    try {
      const r = await join({ data: { roomId } });
      setLastResult({ hostRoll: r.hostRoll, joinRoll: r.joinRoll, winnerId: r.winnerId, pot: r.pot });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-4">
      <Card className="glass p-6">
        <p className="text-sm text-muted-foreground">Create a lobby. When someone joins, both players roll. Higher roll takes the pot. Tie refunds both.</p>
        <div className="mt-4">
          <div className="flex justify-between text-sm"><span>Stake</span><span className="font-semibold">{fmt(stake)} DICE</span></div>
          <Slider min={10} max={Math.min(2000, Number(wallet?.balance ?? 100))} step={10} value={[stake]} onValueChange={(v) => setStake(v[0])} className="mt-2" />
          <label className="flex items-center gap-2 mt-3 text-sm"><Switch checked={isPrivate} onCheckedChange={setIsPrivate} /> Private (invite code)</label>
        </div>
        <Button className="mt-4 glow-red" onClick={host} disabled={!!activeRoomId}>{activeRoomId ? "Lobby waiting…" : "Create lobby"}</Button>
        {activeRoomId && (
          <Button
            variant="outline"
            className="mt-2 ml-2"
            onClick={async () => {
              try {
                await cancel({ data: { roomId: activeRoomId } });
                toast.success("Lobby cancelled — refunded");
                setActiveRoomId(null);
                qc.invalidateQueries({ queryKey: ["wallet"] });
                qc.invalidateQueries({ queryKey: ["dice-rooms"] });
              } catch (e: any) { toast.error(e.message); }
            }}
          >
            Leave lobby & refund
          </Button>
        )}
      </Card>

      {lastResult && (
        <CasinoFrame title="Result" icon={<Dices className="size-6 text-amber-400" />}>
          <div className="flex items-center justify-center gap-10">
            <div className="flex flex-col items-center"><div className="text-xs uppercase tracking-widest text-amber-100/70 mb-3">Host</div><DiePair total={lastResult.hostRoll} rolling={false} /></div>
            <div className="text-2xl text-amber-200/60">vs</div>
            <div className="flex flex-col items-center"><div className="text-xs uppercase tracking-widest text-amber-100/70 mb-3">Challenger</div><DiePair total={lastResult.joinRoll} rolling={false} /></div>
          </div>
          <div className={`mt-4 text-center font-display text-2xl ${lastResult.winnerId === user?.id ? "text-emerald-400" : lastResult.winnerId === null ? "text-amber-100/70" : "text-destructive"}`}>
            {lastResult.winnerId === user?.id ? `+${fmt(lastResult.pot / 2)} DICE` : lastResult.winnerId === null ? "TIE — refunded" : `-${fmt(lastResult.pot / 2)} DICE`}
          </div>
        </CasinoFrame>
      )}

      <Card className="glass p-5">
        <h2 className="font-display text-lg font-semibold">Open lobbies</h2>
        <div className="mt-3 space-y-2">
          {(rooms.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No public lobbies. Create one!</p>}
          {(rooms.data ?? []).map((r: any) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
              <div><div className="font-medium">{r.host?.display_name ?? "Player"}</div><div className="text-xs text-muted-foreground">@{r.host?.username}</div></div>
              <div className="text-sm font-semibold">{fmt(r.stake)} DICE</div>
              <Button size="sm" onClick={() => accept(r.id, r.stake)} disabled={r.host_id === user?.id}>{r.host_id === user?.id ? "Yours" : "Join"}</Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
