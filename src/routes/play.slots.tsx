import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
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
import { CasinoFrame } from "@/components/dice/casino/CasinoFrame";
import { toast } from "sonner";

export const Route = createFileRoute("/play/slots")({
  head: () => ({ meta: [{ title: "Slots — DICE" }] }),
  component: () => <AppShell><Slots /></AppShell>,
});

const SYMBOLS = ["7", "BAR", "🍒", "🍋", "🔔", "💎"];
const SYMBOL_COLORS: Record<string, string> = {
  "7": "text-amber-400", "BAR": "text-red-400", "🍒": "", "🍋": "", "🔔": "", "💎": "",
};
const ROW_H = 96;

function buildStrip(target: string, length = 32): string[] {
  const strip: string[] = [];
  for (let i = 0; i < length - 3; i++) {
    strip.push(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
  }
  strip.push(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
  strip.push(target);
  strip.push(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
  return strip;
}

function Reel({ strip, spinning, stopDelayMs }: { strip: string[]; spinning: boolean; stopDelayMs: number }) {
  const targetIndex = strip.length - 2;
  const finalY = -(targetIndex * ROW_H - ROW_H);
  return (
    <div className="relative w-24 overflow-hidden rounded-lg bg-black/40 border border-white/10" style={{ height: ROW_H * 3 }}>
      <div className="pointer-events-none absolute inset-0 z-10"
        style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.85) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.85) 100%)" }} />
      <motion.div
        key={spinning ? "spinning" : "stop-" + strip.join("")}
        initial={{ y: 0 }}
        animate={spinning ? { y: [-ROW_H * 6, -ROW_H * 6 + 1] } : { y: finalY }}
        transition={spinning
          ? { duration: 0.18, repeat: Infinity, ease: "linear" }
          : { duration: 1.1 + stopDelayMs / 1000, ease: [0.16, 1, 0.3, 1], delay: stopDelayMs / 1000 }}
      >
        {strip.map((s, i) => (
          <div key={i} className={`grid place-items-center font-display font-bold ${SYMBOL_COLORS[s] ?? ""}`}
            style={{ height: ROW_H, fontSize: s === "BAR" ? 28 : 44 }}>
            {s}
          </div>
        ))}
      </motion.div>
    </div>
  );
}

function Slots() {
  const { user } = useAuth();
  const { data: wallet } = useWallet(user?.id);
  const qc = useQueryClient();
  const [bet, setBet] = useState(25);
  const [strips, setStrips] = useState<string[][]>(() => [buildStrip("?"), buildStrip("?"), buildStrip("?")]);
  const [payout, setPayout] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const play = useServerFn(playSlots);

  function blip(frequency = 220, duration = 0.08) {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx: AudioContext = audioRef.current ? (audioRef.current as any).ctx : new Ctx();
      if (!audioRef.current) (audioRef.current as any) = { ctx };
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = frequency; o.type = "square";
      g.gain.value = 0.04;
      o.connect(g); g.connect(ctx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      o.stop(ctx.currentTime + duration);
    } catch {}
  }

  async function spin() {
    if (!wallet || wallet.balance < bet) return toast.error("Not enough DICE");
    setSpinning(true); setPayout(null);
    blip(180, 0.12);
    setStrips([
      buildStrip(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]),
      buildStrip(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]),
      buildStrip(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]),
    ]);
    try {
      const r = await play({ data: { bet } });
      const reels = r.reels as string[];
      setStrips(reels.map((sym) => buildStrip(sym, 36)));
      setTimeout(() => blip(440, 0.05), 1100);
      setTimeout(() => blip(523, 0.05), 1500);
      setTimeout(() => blip(659, 0.08), 1900);
      setTimeout(() => {
        setSpinning(false);
        setPayout(r.payout);
        qc.invalidateQueries({ queryKey: ["wallet"] });
        if (r.payout > 0) toast.success(`+${fmt(r.payout)} DICE!`);
      }, 2300);
    } catch (e: any) {
      toast.error(e.message); setSpinning(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <CasinoFrame title="Slots" subtitle="Pull the lever · match symbols" icon={<Cherry className="size-6 text-red-300" />}>
        <div className="text-center">
          <div className="inline-flex gap-3 p-4 rounded-xl" style={{ background: "rgba(0,0,0,0.55)", border: "1px solid rgba(201,168,76,0.45)" }}>
            {strips.map((strip, i) => (
              <Reel key={i} strip={strip} spinning={spinning} stopDelayMs={i * 350} />
            ))}
          </div>
          {!spinning && payout !== null && payout > 0 && (
            <div className="mt-6 font-display text-2xl text-emerald-400">🎉 +{fmt(payout)} DICE</div>
          )}
          {!spinning && payout === 0 && <div className="mt-6 font-display text-xl text-amber-100/70">No win — spin again</div>}
        </div>
      </CasinoFrame>

      <Card className="glass p-5">
        <div className="text-xs text-muted-foreground mb-3">Paytable: 3× 7=25x · 3× BAR=15x · 3× 💎=10x · 3× 🔔=7x · 3× 🍒=5x · 3× 🍋=3x · two-match=1.5x</div>
        <div className="flex justify-between text-sm"><span>Bet</span><span className="font-semibold">{fmt(bet)} DICE</span></div>
        <Slider min={5} max={Math.min(500, Number(wallet?.balance ?? 50))} step={5} value={[bet]} onValueChange={(v) => setBet(v[0])} className="mt-2" />
        <Button onClick={spin} disabled={spinning} className="mt-4 w-full glow-red">
          {spinning ? "Spinning..." : "Spin"}
        </Button>
      </Card>
    </div>
  );
}
