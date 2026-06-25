import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import { Cherry } from "lucide-react";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { playSlots } from "@/lib/dice.functions";
import { useAuth } from "@/hooks/use-auth";
import { useWallet } from "@/hooks/use-profile";
import { fmt } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/play/slots")({
  head: () => ({ meta: [{ title: "Slots — DICE" }] }),
  component: () => <AppShell><Slots /></AppShell>,
});

function Slots() {
  const { user } = useAuth();
  const { data: wallet } = useWallet(user?.id);
  const qc = useQueryClient();
  const [bet, setBet] = useState(25);
  const [reels, setReels] = useState<string[]>(["?", "?", "?"]);
  const [payout, setPayout] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const play = useServerFn(playSlots);

  async function spin() {
    if (!wallet || wallet.balance < bet) return toast.error("Not enough DICE");
    setSpinning(true); setPayout(null);
    try {
      const r = await play({ data: { bet } });
      setTimeout(() => { setReels(r.reels as string[]); setPayout(r.payout); setSpinning(false); qc.invalidateQueries({ queryKey: ["wallet"] }); if (r.payout > 0) toast.success(`+${fmt(r.payout)} DICE!`); }, 900);
    } catch (e: any) { toast.error(e.message); setSpinning(false); }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Card className="glass p-8 text-center">
        <h1 className="font-display text-3xl font-bold flex items-center justify-center gap-2"><Cherry />Slots</h1>
        <div className="mt-8 flex justify-center gap-3">
          {reels.map((s, i) => (
            <motion.div key={i} animate={spinning ? { y: [0, -20, 0] } : {}} transition={{ duration: 0.5, repeat: spinning ? 3 : 0, delay: i * 0.1 }} className="size-24 rounded-lg glass grid place-items-center font-display text-4xl font-bold">{s}</motion.div>
          ))}
        </div>
        {payout !== null && payout > 0 && <div className="mt-6 font-display text-2xl text-emerald-400">WIN +{fmt(payout)} DICE</div>}
        {payout === 0 && <div className="mt-6 font-display text-2xl text-muted-foreground">No luck this time</div>}
      </Card>
      <Card className="glass p-5">
        <div className="text-xs text-muted-foreground mb-3">Paytable: 3× 7=25x · 3× BAR=15x · 3× 💎=10x · 3× 🔔=7x · 3× 🍒=5x · 3× 🍋=3x · two-match=1.5x</div>
        <div className="flex justify-between text-sm"><span>Bet</span><span className="font-semibold">{fmt(bet)} DICE</span></div>
        <Slider min={5} max={Math.min(500, Number(wallet?.balance ?? 50))} step={5} value={[bet]} onValueChange={(v) => setBet(v[0])} className="mt-2" />
        <Button onClick={spin} disabled={spinning} className="mt-4 w-full glow-red">{spinning ? "Spinning..." : "Spin"}</Button>
      </Card>
    </div>
  );
}
