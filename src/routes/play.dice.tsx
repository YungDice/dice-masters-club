import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import { Dices } from "lucide-react";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { playDiceSolo } from "@/lib/dice.functions";
import { useAuth } from "@/hooks/use-auth";
import { useWallet } from "@/hooks/use-profile";
import { fmt } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/play/dice")({
  head: () => ({ meta: [{ title: "Dice — DICE" }] }),
  component: () => <AppShell><DicePage /></AppShell>,
});

function Die({ v }: { v: number }) {
  return <div className="size-16 rounded-lg glass grid place-items-center font-display text-3xl font-bold glow-red">{v}</div>;
}

function DicePage() {
  const { user } = useAuth();
  const { data: wallet } = useWallet(user?.id);
  const qc = useQueryClient();
  const [stake, setStake] = useState(50);
  const [result, setResult] = useState<{ me: number; house: number; delta: number; outcome: string } | null>(null);
  const [rolling, setRolling] = useState(false);
  const play = useServerFn(playDiceSolo);

  async function roll() {
    if (!wallet || wallet.balance < stake) return toast.error("Not enough DICE");
    setRolling(true); setResult(null);
    try {
      const r = await play({ data: { stake } });
      setTimeout(() => { setResult(r); setRolling(false); qc.invalidateQueries({ queryKey: ["wallet"] }); }, 700);
    } catch (e: any) { toast.error(e.message); setRolling(false); }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Card className="glass p-8 text-center felt-bg">
        <h1 className="font-display text-3xl font-bold flex items-center justify-center gap-2"><Dices className="size-7" />Dice</h1>
        <p className="text-sm text-muted-foreground">Higher roll wins. Tie refunds your stake.</p>
        <div className="mt-8 flex items-center justify-center gap-10">
          <div><div className="text-xs uppercase text-muted-foreground mb-2">You</div><motion.div animate={rolling ? { rotate: [0, 360] } : {}} transition={{ duration: 0.6 }}><Die v={result?.me ?? 0} /></motion.div></div>
          <div className="text-2xl text-muted-foreground">vs</div>
          <div><div className="text-xs uppercase text-muted-foreground mb-2">House</div><motion.div animate={rolling ? { rotate: [0, -360] } : {}} transition={{ duration: 0.6 }}><Die v={result?.house ?? 0} /></motion.div></div>
        </div>
        {result && <div className={`mt-6 font-display text-2xl ${result.outcome === "win" ? "text-emerald-400" : result.outcome === "tie" ? "text-muted-foreground" : "text-destructive"}`}>{result.outcome.toUpperCase()} {result.delta > 0 && `+${fmt(result.delta)} DICE`}{result.delta < 0 && `${fmt(result.delta)} DICE`}</div>}
      </Card>
      <Card className="glass p-5">
        <div className="flex justify-between text-sm"><span>Stake</span><span className="font-semibold">{fmt(stake)} DICE</span></div>
        <Slider min={10} max={Math.min(1000, Number(wallet?.balance ?? 100))} step={10} value={[stake]} onValueChange={(v) => setStake(v[0])} className="mt-2" />
        <Button onClick={roll} disabled={rolling} className="mt-4 w-full glow-red">{rolling ? "Rolling..." : "Roll"}</Button>
      </Card>
    </div>
  );
}
