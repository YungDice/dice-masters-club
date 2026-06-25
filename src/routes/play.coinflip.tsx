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
import { createCoinFlip, joinCoinFlip } from "@/lib/dice.functions";
import { useAuth } from "@/hooks/use-auth";
import { useWallet } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/play/coinflip")({
  head: () => ({ meta: [{ title: "Coin Flip — DICE" }] }),
  component: () => <AppShell><CFPage /></AppShell>,
});

function CFPage() {
  const { user } = useAuth();
  const { data: wallet } = useWallet(user?.id);
  const qc = useQueryClient();
  const [stake, setStake] = useState(100);
  const [pick, setPick] = useState<"heads" | "tails">("heads");
  const [isPrivate, setIsPrivate] = useState(false);
  const create = useServerFn(createCoinFlip);
  const join = useServerFn(joinCoinFlip);

  const rooms = useQuery({
    queryKey: ["cf-rooms"],
    queryFn: async () => {
      const { data } = await supabase.from("game_rooms").select("*, profiles!game_rooms_host_id_fkey(username,display_name,avatar_url)").eq("kind", "coinflip").eq("status", "waiting").eq("is_private", false).order("created_at", { ascending: false }).limit(20);
      return data ?? [];
    },
  });
  useEffect(() => {
    const ch = supabase.channel("cf-rooms").on("postgres_changes", { event: "*", schema: "public", table: "game_rooms", filter: "kind=eq.coinflip" }, () => qc.invalidateQueries({ queryKey: ["cf-rooms"] })).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  async function host() {
    if (!wallet || wallet.balance < stake) return toast.error("Not enough DICE");
    try { await create({ data: { stake, isPrivate, pick } }); toast.success("Room created"); qc.invalidateQueries({ queryKey: ["wallet"] }); }
    catch (e: any) { toast.error(e.message); }
  }
  async function accept(roomId: string, stake: number) {
    if (!wallet || wallet.balance < stake) return toast.error("Not enough DICE");
    try {
      const r = await join({ data: { roomId } });
      qc.invalidateQueries();
      toast(`Coin landed ${r.flip}! ${r.winnerId === user?.id ? "You won!" : "You lost."}`);
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Card className="glass p-6">
        <h1 className="font-display text-2xl font-bold flex items-center gap-2"><Coins />Coin Flip</h1>
        <p className="text-sm text-muted-foreground">Stake DICE. Both players' stakes go to escrow. Winner takes the pot.</p>
        <div className="mt-4 grid md:grid-cols-2 gap-4">
          <div className="flex gap-2">
            {(["heads", "tails"] as const).map((s) => (
              <motion.button key={s} whileTap={{ scale: 0.95 }} onClick={() => setPick(s)} className={`flex-1 rounded-lg border p-4 font-display text-lg ${pick === s ? "border-primary bg-primary/10" : "border-border"}`}>{s.toUpperCase()}</motion.button>
            ))}
          </div>
          <div>
            <div className="flex justify-between text-sm"><span>Stake</span><span className="font-semibold">{fmt(stake)} DICE</span></div>
            <Slider min={10} max={Math.min(2000, Number(wallet?.balance ?? 100))} step={10} value={[stake]} onValueChange={(v) => setStake(v[0])} className="mt-2" />
            <label className="flex items-center gap-2 mt-3 text-sm"><Switch checked={isPrivate} onCheckedChange={setIsPrivate} /> Private (invite code)</label>
          </div>
        </div>
        <Button className="mt-4 glow-red" onClick={host}>Create room</Button>
      </Card>

      <Card className="glass p-5">
        <h2 className="font-display text-lg font-semibold">Open public rooms</h2>
        <div className="mt-3 space-y-2">
          {(rooms.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No public rooms. Create one!</p>}
          {(rooms.data ?? []).map((r: any) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
              <div><div className="font-medium">{r.profiles?.display_name}</div><div className="text-xs text-muted-foreground">Picked {r.state?.host_pick}</div></div>
              <div className="text-sm font-semibold">{fmt(r.stake)} DICE</div>
              <Button size="sm" onClick={() => accept(r.id, r.stake)} disabled={r.host_id === user?.id}>{r.host_id === user?.id ? "Yours" : "Join"}</Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
