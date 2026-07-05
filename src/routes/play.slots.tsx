import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Cherry, Minus, Plus } from "lucide-react";
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
import { useFx } from "@/lib/fx";


export const Route = createFileRoute("/play/slots")({
  head: () => ({ meta: [{ title: "Slots — DICE" }] }),
  component: () => <AppShell><Slots /></AppShell>,
});

const SYMBOLS = ["7", "BAR", "🍒", "🍋", "🔔", "💎"];
const SYMBOL_COLOR: Record<string, string> = {
  "7": "text-amber-300", "BAR": "text-rose-400",
  "🍒": "", "🍋": "", "🔔": "", "💎": "",
};
const ROW_H = 96;
const VISIBLE = 3;            // visible rows in the window
const STRIP_LEN = 40;          // total symbols on a virtual strip
const TARGET_INDEX = STRIP_LEN - 6; // where the winning symbol lands

function buildStrip(target: string): string[] {
  const s = Array.from({ length: STRIP_LEN }, () =>
    SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
  );
  s[TARGET_INDEX] = target;
  return s;
}

function Reel({
  strip,
  spinning,
  stopDelayMs,
}: {
  strip: string[];
  spinning: boolean;
  stopDelayMs: number;
}) {
  // Center the target symbol on the middle row of the window.
  const finalY = -(TARGET_INDEX - 1) * ROW_H;
  const spinY = -(STRIP_LEN - VISIBLE) * ROW_H;
  return (
    <div
      className="relative w-28 overflow-hidden rounded-xl bg-black/70 border border-amber-300/40 shadow-inner"
      style={{ height: ROW_H * VISIBLE }}
    >
      {/* fade edges */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.85) 0%, transparent 28%, transparent 72%, rgba(0,0,0,0.85) 100%)",
        }}
      />
      {/* center highlight */}
      <div
        className="pointer-events-none absolute left-0 right-0 z-10 border-y border-amber-300/40 bg-amber-300/5"
        style={{ top: ROW_H, height: ROW_H }}
      />
      <div
        className="will-change-transform"
        style={
          spinning
            ? {
                transform: `translate3d(0, ${spinY}px, 0)`,
                animation: "slot-spin 0.45s linear infinite",
              }
            : {
                transform: `translate3d(0, ${finalY}px, 0)`,
                transition: `transform ${1.4 + stopDelayMs / 1000}s cubic-bezier(0.08,0.82,0.17,1) ${stopDelayMs / 1000}s`,
              }
        }
      >
        {strip.map((s, i) => (
          <div
            key={i}
            className={`grid place-items-center font-display font-bold select-none ${SYMBOL_COLOR[s] ?? "text-amber-100"}`}
            style={{ height: ROW_H, fontSize: s === "BAR" ? 30 : 46 }}
          >
            {s}
          </div>
        ))}
      </div>
      <style>{`@keyframes slot-spin { from { transform: translate3d(0, ${spinY}px, 0); } to { transform: translate3d(0, ${spinY - ROW_H * 4}px, 0); } }`}</style>
    </div>
  );
}

function Slots() {
  const { user } = useAuth();
  const { data: wallet } = useWallet(user?.id);
  const qc = useQueryClient();
  const [bet, setBet] = useState(25);
  const [strips, setStrips] = useState<string[][]>(() => [
    buildStrip("7"), buildStrip("💎"), buildStrip("🔔"),
  ]);
  const [spinPhase, setSpinPhase] = useState<"idle" | "spinning" | "settling">("idle");
  const [payout, setPayout] = useState<number | null>(null);
  const audioRef = useRef<{ ctx?: AudioContext }>({});
  const play = useServerFn(playSlots);

  function blip(frequency = 220, duration = 0.08) {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      if (!audioRef.current.ctx) audioRef.current.ctx = new Ctx();
      const ctx = audioRef.current.ctx!;
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = frequency; o.type = "square";
      g.gain.value = 0.05;
      o.connect(g); g.connect(ctx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      o.stop(ctx.currentTime + duration);
    } catch {}
  }

  async function spin() {
    if (spinPhase !== "idle") return;
    if (!wallet || wallet.balance < bet) return toast.error("Not enough DICE");
    setPayout(null);
    // Pre-fill with garbage targets while waiting on the server
    setStrips([
      buildStrip(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]),
      buildStrip(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]),
      buildStrip(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]),
    ]);
    setSpinPhase("spinning");
    blip(180, 0.12);
    try {
      const r = await play({ data: { bet } });
      const reels = r.reels as string[];
      // Tiny delay so the "spinning" CSS state actually paints before we settle.
      requestAnimationFrame(() => {
        setStrips(reels.map((sym) => buildStrip(sym)));
        setSpinPhase("settling");
      });
      // Each reel staggers by 350ms; final settle at ~1400 + 700ms padding.
      const total = 2400;
      setTimeout(() => blip(523, 0.06), 1400);
      setTimeout(() => blip(659, 0.06), 1800);
      setTimeout(() => blip(784, 0.1), 2200);
      setTimeout(() => {
        setSpinPhase("idle");
        setPayout(r.payout);
        qc.invalidateQueries({ queryKey: ["wallet"] });
        if (r.payout > 0) toast.success(`+${fmt(r.payout)} DICE!`);
      }, total);
    } catch (e: any) {
      toast.error(e.message); setSpinPhase("idle");
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); spin(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const max = Math.max(5, Math.min(500, Number(wallet?.balance ?? 50)));
  const isSpinning = spinPhase !== "idle";

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <CasinoFrame
        title="Slots"
        subtitle="Pull the lever · match three"
        icon={<Cherry className="size-6 text-rose-300" />}
      >
        <div className="text-center">
          {/* Machine */}
          <div
            className="relative inline-block rounded-2xl px-6 pt-6 pb-5"
            style={{
              background:
                "radial-gradient(120% 80% at 50% 0%, rgba(201,168,76,0.25), rgba(0,0,0,0.65) 65%)",
              border: "1px solid rgba(201,168,76,0.55)",
              boxShadow:
                "inset 0 0 30px rgba(0,0,0,0.6), 0 0 32px -8px rgba(201,168,76,0.45)",
            }}
          >
            <div className="flex gap-3 justify-center">
              {strips.map((strip, i) => (
                <Reel
                  key={i}
                  strip={strip}
                  spinning={spinPhase === "spinning"}
                  stopDelayMs={spinPhase === "settling" ? i * 350 : 0}
                />
              ))}
            </div>
            {/* Side bulbs */}
            <div className="pointer-events-none absolute -left-1 top-6 bottom-6 w-2 flex flex-col justify-between">
              {Array.from({ length: 6 }).map((_, i) => (
                <span key={i} className={`block size-2 rounded-full ${isSpinning ? "bg-amber-300 animate-pulse" : "bg-amber-300/40"}`} />
              ))}
            </div>
            <div className="pointer-events-none absolute -right-1 top-6 bottom-6 w-2 flex flex-col justify-between">
              {Array.from({ length: 6 }).map((_, i) => (
                <span key={i} className={`block size-2 rounded-full ${isSpinning ? "bg-amber-300 animate-pulse" : "bg-amber-300/40"}`} />
              ))}
            </div>
          </div>

          <div className="min-h-[2.25rem] mt-5">
            {!isSpinning && payout !== null && payout > 0 && (
              <div className="font-display text-2xl text-emerald-400 animate-in fade-in zoom-in-95">
                🎉 +{fmt(payout)} DICE
              </div>
            )}
            {!isSpinning && payout === 0 && (
              <div className="font-display text-lg text-amber-100/70">No win — spin again</div>
            )}
          </div>
        </div>
      </CasinoFrame>

      <Card className="glass p-5 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">Bet</span>
          <span className="font-display text-amber-200">{fmt(bet)} DICE</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={() => setBet((b) => Math.max(5, b - 5))} disabled={isSpinning}>
            <Minus className="size-4" />
          </Button>
          <Slider
            min={5}
            max={max}
            step={5}
            value={[Math.min(bet, max)]}
            onValueChange={(v) => setBet(v[0])}
            disabled={isSpinning}
            className="flex-1"
          />
          <Button size="icon" variant="outline" onClick={() => setBet((b) => Math.min(max, b + 5))} disabled={isSpinning}>
            <Plus className="size-4" />
          </Button>
        </div>
        <div className="text-[11px] text-muted-foreground leading-relaxed">
          Paytable: 3× 7 = 25x · 3× BAR = 15x · 3× 💎 = 10x · 3× 🔔 = 7x · 3× 🍒 = 5x · 3× 🍋 = 3x · any two match = 1.5x
        </div>
        <Button onClick={spin} disabled={isSpinning} className="w-full glow-red h-12 text-base">
          {isSpinning ? "Spinning…" : `Spin · ${fmt(bet)} DICE`}
        </Button>
      </Card>
    </div>
  );
}
