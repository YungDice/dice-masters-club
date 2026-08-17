import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Club } from "lucide-react";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { vpDeal, vpDraw, VP_PAYTABLE } from "@/lib/bj-vp.functions";
import { useAuth } from "@/hooks/use-auth";
import { useWallet } from "@/hooks/use-profile";
import { fmt } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/play/poker")({
  head: () => ({
    meta: [
      { title: "Video Poker — DICE" },
      { name: "description", content: "Jacks or Better video poker on DICE — hold cards, draw for pairs, straights, flushes, and royal flushes." },
      { property: "og:title", content: "Video Poker — DICE" },
      { property: "og:description", content: "Jacks or Better video poker on DICE." },
      { property: "og:url", content: "https://yungdice.com/play/poker" },
    ],
    links: [{ rel: "canonical", href: "https://yungdice.com/play/poker" }],
  }),
  component: () => <AppShell><VP /></AppShell>,
});

type CardT = { r: string; s: string };
const HAND_NAMES: Record<string, string> = {
  royal_flush: "ROYAL FLUSH", straight_flush: "STRAIGHT FLUSH", four_kind: "FOUR OF A KIND",
  full_house: "FULL HOUSE", flush: "FLUSH", straight: "STRAIGHT",
  three_kind: "THREE OF A KIND", two_pair: "TWO PAIR", jacks_or_better: "JACKS OR BETTER",
  none: "NO WIN",
};

function VPCard({ c, held, onClick, index, replaced }: { c: CardT; held: boolean; onClick: () => void; index: number; replaced: boolean }) {
  const red = c.s === "♥" || c.s === "♦";
  return (
    <div className="flex flex-col items-center gap-2">
      <motion.button
        type="button"
        onClick={onClick}
        initial={{ y: -100, opacity: 0, rotateY: 180 }}
        animate={{ y: 0, opacity: 1, rotateY: 0 }}
        key={`${c.r}${c.s}-${replaced ? "new" : "old"}-${index}`}
        transition={{ delay: index * 0.08, type: "spring", stiffness: 180, damping: 18 }}
        whileHover={{ scale: 1.04 }}
        className={`w-20 h-28 rounded-lg bg-white shadow-xl grid place-items-center transition-all ${
          held ? "ring-4 ring-primary -translate-y-2" : ""
        }`}>
        <div className={`flex flex-col items-center font-display font-bold ${red ? "text-red-600" : "text-black"}`}>
          <span className="text-3xl leading-none">{c.r}</span>
          <span className="text-3xl leading-none">{c.s}</span>
        </div>
      </motion.button>
      <span className={`text-[10px] uppercase font-bold tracking-wider ${held ? "text-primary" : "text-muted-foreground"}`}>
        {held ? "HELD" : "—"}
      </span>
    </div>
  );
}

function VP() {
  const { user } = useAuth();
  const { data: wallet } = useWallet(user?.id);
  const qc = useQueryClient();
  const [bet, setBet] = useState(25);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [hand, setHand] = useState<CardT[]>([]);
  const [held, setHeld] = useState<boolean[]>([false, false, false, false, false]);
  const [phase, setPhase] = useState<"idle" | "draw" | "finished">("idle");
  const [outcome, setOutcome] = useState<string | null>(null);
  const [payout, setPayout] = useState(0);
  const [busy, setBusy] = useState(false);
  const [replaced, setReplaced] = useState<boolean[]>([false, false, false, false, false]);
  const deal = useServerFn(vpDeal);
  const draw = useServerFn(vpDraw);

  async function start() {
    if (!wallet || wallet.balance < bet) return toast.error("Not enough DICE");
    setBusy(true);
    try {
      const r = await deal({ data: { bet } });
      setRoomId(r.roomId); setHand(r.hand as CardT[]);
      setHeld([false, false, false, false, false]);
      setReplaced([false, false, false, false, false]);
      setOutcome(null); setPayout(0);
      setPhase("draw");
      qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function drawNow() {
    if (!roomId) return;
    setBusy(true);
    try {
      const r = await draw({ data: { roomId, hold: held } });
      setReplaced(held.map((h) => !h));
      setHand(r.hand as CardT[]);
      setOutcome(r.outcome); setPayout(r.payout);
      setPhase("finished");
      qc.invalidateQueries({ queryKey: ["wallet"] });
      if (r.payout > 0) toast.success(`${HAND_NAMES[r.outcome]} — +${fmt(r.payout)} DICE`);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  function toggleHold(i: number) {
    if (phase !== "draw") return;
    setHeld((h) => h.map((v, idx) => (idx === i ? !v : v)));
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Card className="glass p-8 felt-bg">
        <h1 className="font-display text-3xl font-medium text-center flex items-center justify-center gap-2"><Club />Video Poker <span className="text-sm font-normal text-muted-foreground">— Jacks or Better</span></h1>

        <div className="mt-8 min-h-44 flex justify-center gap-3">
          <AnimatePresence>
            {hand.length === 0 ? (
              <div className="text-muted-foreground text-sm self-center">Place a bet and deal to start.</div>
            ) : hand.map((c, i) => (
              <VPCard key={i} c={c} held={held[i]} onClick={() => toggleHold(i)} index={i} replaced={replaced[i]} />
            ))}
          </AnimatePresence>
        </div>

        {phase === "finished" && outcome && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className={`mt-6 text-center font-display text-3xl ${payout > 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
            {HAND_NAMES[outcome]} {payout > 0 && `+${fmt(payout)} DICE`}
          </motion.div>
        )}
        {phase === "draw" && (
          <div className="mt-4 text-center text-sm text-muted-foreground">Tap cards to HOLD, then draw to replace the rest.</div>
        )}
      </Card>

      <Card className="glass p-5">
        {phase === "draw" ? (
          <Button onClick={drawNow} disabled={busy} className="w-full glow-red">Draw</Button>
        ) : (
          <>
            <div className="flex justify-between text-sm"><span>Bet</span><span className="font-semibold">{fmt(bet)} DICE</span></div>
            <Slider min={5} max={Math.min(500, Number(wallet?.balance ?? 50))} step={5} value={[bet]} onValueChange={(v) => setBet(v[0])} className="mt-2" />
            <Button onClick={start} disabled={busy} className="mt-4 w-full glow-red">{phase === "finished" ? "Deal again" : "Deal"}</Button>
          </>
        )}
      </Card>

      <Card className="glass p-5">
        <h3 className="font-display font-medium mb-2">Paytable (per 1 DICE bet)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-xs">
          {Object.entries(VP_PAYTABLE).filter(([k]) => k !== "none").map(([k, v]) => (
            <div key={k} className="flex justify-between rounded bg-white/5 px-2 py-1">
              <span>{HAND_NAMES[k]}</span><span className="font-semibold text-primary">{v}x</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
