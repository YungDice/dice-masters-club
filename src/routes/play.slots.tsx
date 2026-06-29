import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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

const SYMBOLS = ["7", "BAR", "🍒", "🍋", "🔔", "💎"];
const SYMBOL_COLORS: Record<string, string> = {
  "7": "text-amber-400", "BAR": "text-red-400", "🍒": "", "🍋": "", "🔔": "", "💎": "",
};
const ROW_H = 96; // px, matches h-24 for symbol cells

// Build a long randomized strip for each reel; last 3 symbols of the strip
// will be: [above, target, below] so target lands on the visible center row.
function buildStrip(target: string, length = 32): string[] {
  const strip: string[] = [];
  for (let i = 0; i < length - 3; i++) {
    strip.push(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
  }
  strip.push(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]); // above
  strip.push(target);                                              // center
  strip.push(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]); // below
  return strip;
}

function Reel({ strip, spinning, stopDelayMs, isWin }: { strip: string[]; spinning: boolean; stopDelayMs: number; isWin: boolean }) {
  // Final offset positions the "target" (index length-2) in the center of a 3-row window.
  // Window height = 3*ROW_H; center row top = ROW_H. Strip translateY = -(targetIndex*ROW_H - ROW_H).
  const targetIndex = strip.length - 2;
  const finalY = -(targetIndex * ROW_H - ROW_H);

  return (
    <div className="relative w-24 overflow-hidden rounded-lg bg-black/40 border border-white/10"
      style={{ height: ROW_H * 3 }}>
      {/* gradient mask */}
      <div className="pointer-events-none absolute inset-0 z-10"
        style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.85) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.85) 100%)" }} />
      {/* highlight center on win */}
      {isWin && !spinning && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0.4, 1] }} transition={{ duration: 1.4, repeat: Infinity }}
          className="pointer-events-none absolute left-0 right-0 z-20"
          style={{ top: ROW_H, height: ROW_H, boxShadow: "inset 0 0 24px 4px hsl(var(--primary) / 0.6)", border: "2px solid hsl(var(--primary))", borderRadius: 6 }} />
      )}
      <motion.div
        key={spinning ? "spinning" : "stop-" + strip.join("")}
        initial={{ y: 0 }}
        animate={spinning
          ? { y: [-ROW_H * 6, -ROW_H * 6 + 1] } // continuously cycling animation
          : { y: finalY }}
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
  const [strips, setStrips] = useState<string[][]>(() => [
    buildStrip("?"), buildStrip("?"), buildStrip("?"),
  ]);
  const [results, setResults] = useState<string[] | null>(null);
  const [payout, setPayout] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const play = useServerFn(playSlots);

  // Lever click sound (tiny synthesized blip via WebAudio)
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
    setSpinning(true); setPayout(null); setResults(null);
    blip(180, 0.12);
    // Pre-build new spinning strips
    setStrips([
      buildStrip(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]),
      buildStrip(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]),
      buildStrip(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]),
    ]);
    try {
      const r = await play({ data: { bet } });
      const reels = r.reels as string[];
      // Build final strips ending on real result
      const newStrips = reels.map((sym) => buildStrip(sym, 36));
      setStrips(newStrips);
      // Stagger the reel stops
      setTimeout(() => { blip(440, 0.05); }, 1100);
      setTimeout(() => { blip(523, 0.05); }, 1500);
      setTimeout(() => { blip(659, 0.08); }, 1900);
      setTimeout(() => {
        setSpinning(false);
        setResults(reels);
        setPayout(r.payout);
        qc.invalidateQueries({ queryKey: ["wallet"] });
        if (r.payout > 0) {
          toast.success(`+${fmt(r.payout)} DICE!`);
          blip(880, 0.2);
          setTimeout(() => blip(1100, 0.25), 220);
        }
      }, 2300);
    } catch (e: any) {
      toast.error(e.message); setSpinning(false);
    }
  }

  const isWin = !!(payout && payout > 0);

  useEffect(() => () => {
    try { (audioRef.current as any)?.ctx?.close(); } catch {}
  }, []);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Card className="glass p-8 text-center relative overflow-hidden" style={{
        background: "radial-gradient(circle at 50% 0%, rgba(201,168,76,0.18), transparent 60%), linear-gradient(180deg, #1a0f06, #0a0604)",
        border: "1px solid rgba(201,168,76,0.35)",
      }}>
        <h1 className="font-display text-3xl font-bold flex items-center justify-center gap-2 relative"><Cherry className="text-red-400" />Slots</h1>

        {/* Marquee with chasing bulbs */}
        <div className="mt-6 mx-auto inline-block px-6 py-2 rounded-xl relative" style={{
          background: "linear-gradient(180deg, #3a1d08, #1a0c04)",
          border: "2px solid #c9a84c",
          boxShadow: "0 0 24px -4px rgba(201,168,76,0.6), inset 0 0 12px rgba(0,0,0,0.6)",
        }}>
          <div className="font-display text-xl tracking-[0.3em] text-amber-300" style={{ textShadow: "0 0 10px rgba(252,211,77,0.6)" }}>JACKPOT</div>
          {/* bulb ring */}
          <div className="absolute -inset-1 flex justify-between px-2 pointer-events-none">
            {Array.from({ length: 14 }).map((_, i) => (
              <motion.span key={i}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: (i % 7) * 0.12 }}
                className="size-1.5 rounded-full bg-amber-300"
                style={{ boxShadow: "0 0 6px rgba(252,211,77,0.9)" }} />
            ))}
          </div>
        </div>

        {/* Cabinet with reels + lever */}
        <div className="mt-6 inline-flex items-end gap-3">
          <div className="inline-flex gap-3 p-4 rounded-2xl" style={{
            background: "linear-gradient(180deg, #2a1a08, #0f0804)",
            border: "3px solid #c9a84c",
            boxShadow: "inset 0 0 20px rgba(0,0,0,0.7), 0 0 40px -8px rgba(201,168,76,0.5)",
          }}>
            {strips.map((strip, i) => (
              <Reel key={i} strip={strip} spinning={spinning}
                stopDelayMs={i * 350}
                isWin={isWin && !!results && results[0] === results[1] && results[1] === results[2]} />
            ))}
          </div>
          {/* Lever */}
          <motion.button
            onClick={spin}
            disabled={spinning}
            aria-label="Pull lever"
            initial={{ rotate: 0 }}
            animate={spinning ? { rotate: [0, 35, 0] } : { rotate: 0 }}
            transition={{ duration: 0.5 }}
            className="relative h-[19rem] w-6 origin-bottom disabled:cursor-not-allowed"
          >
            <div className="absolute inset-x-0 bottom-0 top-0 rounded-full"
              style={{ background: "linear-gradient(180deg, #6b6b6b, #1a1a1a)", boxShadow: "inset -2px 0 4px rgba(0,0,0,0.6)" }} />
            <div className="absolute left-1/2 -translate-x-1/2 -top-2 size-9 rounded-full"
              style={{
                background: "radial-gradient(circle at 30% 30%, #ff6b6b, #b91c1c)",
                boxShadow: "inset 0 -3px 6px rgba(0,0,0,0.5), 0 0 16px -2px rgba(220,38,38,0.7)",
                border: "2px solid #7f1d1d",
              }} />
          </motion.button>
        </div>

        {!spinning && payout !== null && payout > 0 && (
          <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="mt-6 font-display text-3xl text-emerald-400" style={{ textShadow: "0 0 12px rgba(52,211,153,0.7)" }}>
            🎉 WIN +{fmt(payout)} DICE
          </motion.div>
        )}
        {!spinning && payout === 0 && <div className="mt-6 font-display text-xl text-muted-foreground">No win — spin again</div>}
      </Card>

      <Card className="glass p-5">
        <div className="text-xs text-muted-foreground mb-3">Paytable: 3× 7=25x · 3× BAR=15x · 3× 💎=10x · 3× 🔔=7x · 3× 🍒=5x · 3× 🍋=3x · two-match=1.5x</div>
        <div className="flex justify-between text-sm"><span>Bet</span><span className="font-semibold">{fmt(bet)} DICE</span></div>
        <Slider min={5} max={Math.min(500, Number(wallet?.balance ?? 50))} step={5} value={[bet]} onValueChange={(v) => setBet(v[0])} className="mt-2" />
        <Button onClick={spin} disabled={spinning} className="mt-4 w-full glow-red text-lg py-6">
          {spinning ? "Spinning..." : "🎰 Pull the lever"}
        </Button>
      </Card>
    </div>
  );
}
