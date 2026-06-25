import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import { Spade } from "lucide-react";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { playBlackjack } from "@/lib/dice.functions";
import { useAuth } from "@/hooks/use-auth";
import { useWallet } from "@/hooks/use-profile";
import { fmt } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/play/blackjack")({
  head: () => ({ meta: [{ title: "Blackjack — DICE" }] }),
  component: () => <AppShell><BJ /></AppShell>,
});

function CardView({ r, s }: { r: string; s: string }) {
  const red = s === "♥" || s === "♦";
  return <motion.div initial={{ rotateY: 180 }} animate={{ rotateY: 0 }} className={`w-14 h-20 rounded-md bg-white text-black grid place-items-center font-display text-xl font-bold ${red ? "text-red-600" : ""} shadow-lg`}>{r}{s}</motion.div>;
}

function BJ() {
  const { user } = useAuth();
  const { data: wallet } = useWallet(user?.id);
  const qc = useQueryClient();
  const [bet, setBet] = useState(100);
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const play = useServerFn(playBlackjack);

  async function deal() {
    if (!wallet || wallet.balance < bet) return toast.error("Not enough DICE");
    setBusy(true);
    try { const r = await play({ data: { bet } }); setRes(r); qc.invalidateQueries({ queryKey: ["wallet"] }); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Card className="glass p-8 felt-bg">
        <h1 className="font-display text-3xl font-bold text-center flex items-center justify-center gap-2"><Spade />Blackjack</h1>
        <div className="mt-8 space-y-6">
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-2 text-center">Dealer {res ? `(${res.dealerScore})` : ""}</div>
            <div className="flex justify-center gap-2 min-h-20">{res?.dealer?.map((c: any, i: number) => <CardView key={i} {...c} />)}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-2 text-center">You {res ? `(${res.playerScore})` : ""}</div>
            <div className="flex justify-center gap-2 min-h-20">{res?.player?.map((c: any, i: number) => <CardView key={i} {...c} />)}</div>
          </div>
        </div>
        {res && <div className={`mt-6 text-center font-display text-2xl ${res.outcome === "win" ? "text-emerald-400" : res.outcome === "push" ? "text-muted-foreground" : "text-destructive"}`}>
          {res.outcome.toUpperCase()} {res.delta !== 0 && (res.delta > 0 ? `+${fmt(res.delta)}` : fmt(res.delta))} DICE
        </div>}
      </Card>
      <Card className="glass p-5">
        <div className="text-xs text-muted-foreground mb-3">Dealer stands on 17. Quick-deal mode (auto hit/stand simulation). Visit again for live decision mode.</div>
        <div className="flex justify-between text-sm"><span>Bet</span><span className="font-semibold">{fmt(bet)} DICE</span></div>
        <Slider min={10} max={Math.min(2000, Number(wallet?.balance ?? 100))} step={10} value={[bet]} onValueChange={(v) => setBet(v[0])} className="mt-2" />
        <Button onClick={deal} disabled={busy} className="mt-4 w-full glow-red">{busy ? "Dealing..." : "Deal"}</Button>
      </Card>
    </div>
  );
}
