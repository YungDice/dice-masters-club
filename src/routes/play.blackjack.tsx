import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Spade } from "lucide-react";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { bjDeal, bjAction } from "@/lib/bj-vp.functions";
import { useAuth } from "@/hooks/use-auth";
import { useWallet } from "@/hooks/use-profile";
import { fmt } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/play/blackjack")({
  head: () => ({ meta: [{ title: "Blackjack — DICE" }] }),
  component: () => <AppShell><BJ /></AppShell>,
});

type CardT = { r: string; s: string };

function PlayingCard({ r, s, hidden, index }: { r: string; s: string; hidden?: boolean; index: number }) {
  const red = s === "♥" || s === "♦";
  return (
    <motion.div
      initial={{ y: -120, opacity: 0, rotateY: 180 }}
      animate={{ y: 0, opacity: 1, rotateY: hidden ? 180 : 0 }}
      transition={{ delay: index * 0.12, type: "spring", stiffness: 160, damping: 18 }}
      className="relative w-16 h-24 [perspective:800px]"
    >
      <div className="absolute inset-0 rounded-lg shadow-xl"
        style={{ transformStyle: "preserve-3d" as any }}>
        <div className="absolute inset-0 rounded-lg bg-white grid place-items-center [backface-visibility:hidden]">
          <div className={`flex flex-col items-center font-display font-bold ${red ? "text-red-600" : "text-black"}`}>
            <span className="text-2xl leading-none">{r}</span>
            <span className="text-2xl leading-none">{s}</span>
          </div>
        </div>
        <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary/80 to-primary/40 border border-primary/60 [transform:rotateY(180deg)] [backface-visibility:hidden] grid place-items-center">
          <Spade className="size-8 text-white/80" />
        </div>
      </div>
    </motion.div>
  );
}

function BJ() {
  const { user } = useAuth();
  const { data: wallet } = useWallet(user?.id);
  const qc = useQueryClient();
  const [bet, setBet] = useState(100);
  const [hand, setHand] = useState<any>(null); // {roomId, player[], dealer[], playerScore, dealerScore, status, outcome, canDouble, delta}
  const [busy, setBusy] = useState(false);
  const deal = useServerFn(bjDeal);
  const act = useServerFn(bjAction);

  async function newHand() {
    if (!wallet || wallet.balance < bet) return toast.error("Not enough DICE");
    setBusy(true);
    try {
      const r = await deal({ data: { bet } });
      setHand(r);
      qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function action(a: "hit" | "stand" | "double") {
    if (!hand?.roomId) return;
    setBusy(true);
    try {
      const r = await act({ data: { roomId: hand.roomId, action: a } });
      setHand(r);
      if (r.status === "finished") qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  const playing = hand && hand.status === "player_turn";
  const finished = hand && hand.status === "finished";

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Card className="glass p-8 felt-bg relative overflow-hidden">
        <h1 className="font-display text-3xl font-bold text-center flex items-center justify-center gap-2"><Spade />Blackjack</h1>
        <div className="mt-8 space-y-8">
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-2 text-center">
              Dealer {hand ? `(${hand.dealerScore}${playing ? "+?" : ""})` : ""}
            </div>
            <div className="flex justify-center gap-2 min-h-24">
              <AnimatePresence>
                {(hand?.dealer ?? []).map((c: CardT, i: number) => (
                  <PlayingCard key={`d-${i}-${c.r}${c.s}`} r={c.r} s={c.s} hidden={c.r === "?"} index={i} />
                ))}
              </AnimatePresence>
            </div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-2 text-center">You {hand ? `(${hand.playerScore})` : ""}</div>
            <div className="flex justify-center gap-2 min-h-24">
              <AnimatePresence>
                {(hand?.player ?? []).map((c: CardT, i: number) => (
                  <PlayingCard key={`p-${i}-${c.r}${c.s}`} r={c.r} s={c.s} index={i} />
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {finished && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className={`mt-6 text-center font-display text-3xl ${
              hand.outcome === "win" || hand.outcome === "blackjack" ? "text-emerald-400"
                : hand.outcome === "push" ? "text-muted-foreground" : "text-destructive"}`}>
            {(hand.outcome ?? "").toUpperCase()} {hand.delta !== 0 && (hand.delta > 0 ? `+${fmt(hand.delta)}` : fmt(hand.delta))} DICE
          </motion.div>
        )}
      </Card>

      <Card className="glass p-5">
        {!hand || finished ? (
          <>
            <div className="flex justify-between text-sm"><span>Bet</span><span className="font-semibold">{fmt(bet)} DICE</span></div>
            <Slider min={10} max={Math.min(2000, Number(wallet?.balance ?? 100))} step={10} value={[bet]} onValueChange={(v) => setBet(v[0])} className="mt-2" />
            <Button onClick={newHand} disabled={busy} className="mt-4 w-full glow-red">{busy ? "Dealing..." : finished ? "Deal again" : "Deal"}</Button>
          </>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <Button onClick={() => action("hit")} disabled={busy} className="glow-red">Hit</Button>
            <Button onClick={() => action("stand")} disabled={busy} variant="outline">Stand</Button>
            <Button onClick={() => action("double")} disabled={busy || !hand?.canDouble || (wallet?.balance ?? 0) < hand?.bet} variant="outline">
              Double
            </Button>
          </div>
        )}
        <div className="text-xs text-muted-foreground mt-3">Dealer stands on 17. Blackjack pays 3:2. Double doubles your stake and draws one card.</div>
      </Card>
    </div>
  );
}
