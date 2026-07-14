import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion, useAnimation } from "framer-motion";
import { CircleDot } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/dice/TopNav";
import { CasinoFrame } from "@/components/dice/casino/CasinoFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WHEEL_SEGMENTS, wheelSpin } from "@/lib/wheel.functions";
import { useAuth } from "@/hooks/use-auth";
import { useWallet } from "@/hooks/use-profile";
import { fmt } from "@/lib/format";

export const Route = createFileRoute("/play/wheel")({
  head: () => ({
    meta: [
      { title: "Wheel of Fortune — DICE" },
      { name: "description", content: "Bet DICE and spin the Wheel of Fortune to multiply your stake up to 10x." },
      { property: "og:title", content: "Wheel of Fortune — DICE" },
      { property: "og:description", content: "Spin the wheel — multiply your DICE up to 10x." },
      { property: "og:url", content: "https://yungdice.com/play/wheel" },
    ],
    links: [{ rel: "canonical", href: "https://yungdice.com/play/wheel" }],
  }),
  component: () => <AppShell><Wheel /></AppShell>,
});

const N = WHEEL_SEGMENTS.length;
const SEG_DEG = 360 / N;

function segColor(mult: number, i: number) {
  if (mult === 0) return "#3a0a0a";
  if (mult >= 10) return "#dc2626";
  if (mult >= 5)  return "#f59e0b";
  if (mult >= 2)  return "#0ea5e9";
  if (mult >= 1)  return "#16a34a";
  if (mult >= 0.5) return i % 2 ? "#4b5563" : "#374151";
  return i % 2 ? "#111827" : "#1f2937";
}

function Wheel() {
  const { user } = useAuth();
  const { data: wallet } = useWallet(user?.id);
  const qc = useQueryClient();
  const controls = useAnimation();
  const [bet, setBet] = useState(50);
  const [busy, setBusy] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<{ mult: number; payout: number; index: number } | null>(null);
  const play = useServerFn(wheelSpin);

  async function spin() {
    if (!wallet || wallet.balance < bet) return toast.error("Not enough DICE");
    setBusy(true); setResult(null);
    try {
      const r = await play({ data: { bet } });
      // Target angle: segment center should land at top (pointer at 0deg / -90deg visually).
      // We build the wheel starting angle at -90 (top) and go clockwise.
      const segCenter = r.index * SEG_DEG + SEG_DEG / 2;
      const spins = 5 + Math.floor(Math.random() * 3);
      const target = spins * 360 - segCenter;
      // Ensure monotonic forward rotation.
      const base = Math.floor(rotation / 360) * 360;
      const finalRotation = base + target;
      await controls.start({
        rotate: finalRotation,
        transition: { duration: 4.2, ease: [0.16, 1, 0.3, 1] },
      });
      setRotation(finalRotation);
      setResult({ mult: r.mult, payout: r.payout, index: r.index });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      toast(r.mult > 0 ? `Landed on ${r.mult}x — payout ${fmt(r.payout)}` : "Landed on 0x — no payout");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  const wheelSize = 340;
  const cx = wheelSize / 2;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <h1 className="font-display text-3xl font-bold flex items-center gap-2">
        <CircleDot className="text-amber-400" /> Wheel of Fortune
      </h1>
      <CasinoFrame title="Spin to win" subtitle="Bet DICE, multiply up to 10x" icon={<CircleDot className="size-6 text-amber-400" />}>
        <div className="grid md:grid-cols-[1fr_1.2fr] gap-6 items-center">
          <div className="space-y-4">
            <div>
              <Label className="text-amber-100">Bet (DICE)</Label>
              <Input type="number" min={1} max={10000} value={bet}
                onChange={(e) => setBet(Math.max(1, Math.floor(Number(e.target.value) || 0)))}
                disabled={busy} className="bg-black/40 text-amber-50" />
              <div className="mt-2 flex gap-2 flex-wrap">
                {[10, 50, 100, 500, 1000].map((v) => (
                  <button key={v} disabled={busy} onClick={() => setBet(v)}
                    className="px-2 py-1 rounded bg-amber-400/10 text-amber-100 text-xs hover:bg-amber-400/20 disabled:opacity-50">{v}</button>
                ))}
                <button disabled={busy || !wallet} onClick={() => setBet(Math.min(10000, Number(wallet?.balance ?? 0)))}
                  className="px-2 py-1 rounded bg-amber-400/10 text-amber-100 text-xs hover:bg-amber-400/20 disabled:opacity-50">Max</button>
              </div>
            </div>
            <Button onClick={spin} disabled={busy} className="w-full glow-red font-display text-base h-11">
              {busy ? "Spinning…" : "Spin the wheel"}
            </Button>
            <div className="text-xs text-amber-100/70">
              Segments: {WHEEL_SEGMENTS.filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b).map((m) => `${m}x`).join(" · ")}
            </div>
            {result && (
              <div className="rounded-lg border border-amber-400/30 bg-black/40 p-4 text-center">
                <div className="text-xs uppercase tracking-widest text-amber-200/70">Result</div>
                <div className={`font-display text-3xl font-bold ${result.mult > 1 ? "text-emerald-300" : result.mult > 0 ? "text-amber-200" : "text-red-400"}`}>
                  {result.mult}x
                </div>
                <div className={`text-sm ${result.payout - bet > 0 ? "text-emerald-300" : "text-red-400"}`}>
                  {result.payout - bet >= 0 ? `+${fmt(result.payout - bet)}` : fmt(result.payout - bet)} DICE
                </div>
              </div>
            )}
          </div>
          <div className="relative mx-auto" style={{ width: wheelSize, height: wheelSize }}>
            {/* pointer */}
            <div className="absolute left-1/2 -translate-x-1/2 -top-2 z-10"
              style={{ width: 0, height: 0, borderLeft: "12px solid transparent", borderRight: "12px solid transparent", borderTop: "22px solid #fcd34d", filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.6))" }}
            />
            <motion.svg
              width={wheelSize} height={wheelSize} viewBox={`0 0 ${wheelSize} ${wheelSize}`}
              animate={controls}
              initial={{ rotate: 0 }}
              style={{ transformOrigin: "50% 50%" }}
            >
              <circle cx={cx} cy={cx} r={cx - 2} fill="#0b0a14" stroke="#c9a84c" strokeWidth={4} />
              {WHEEL_SEGMENTS.map((mult, i) => {
                // Start at top (-90deg), clockwise
                const a0 = (-90 + i * SEG_DEG) * Math.PI / 180;
                const a1 = (-90 + (i + 1) * SEG_DEG) * Math.PI / 180;
                const r = cx - 6;
                const x0 = cx + r * Math.cos(a0), y0 = cx + r * Math.sin(a0);
                const x1 = cx + r * Math.cos(a1), y1 = cx + r * Math.sin(a1);
                const large = SEG_DEG > 180 ? 1 : 0;
                const d = `M ${cx} ${cx} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
                const mid = (a0 + a1) / 2;
                const tx = cx + (r * 0.68) * Math.cos(mid);
                const ty = cx + (r * 0.68) * Math.sin(mid);
                const rot = ((-90 + i * SEG_DEG + SEG_DEG / 2) + 90);
                return (
                  <g key={i}>
                    <path d={d} fill={segColor(mult, i)} stroke="rgba(0,0,0,0.4)" strokeWidth={1} />
                    <text
                      x={tx} y={ty}
                      fill="#fff8dc"
                      fontSize={14}
                      fontWeight={800}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={`rotate(${rot} ${tx} ${ty})`}
                      style={{ fontFamily: "inherit" }}
                    >
                      {mult}x
                    </text>
                  </g>
                );
              })}
              <circle cx={cx} cy={cx} r={22} fill="#c9a84c" stroke="#8a6608" strokeWidth={3} />
            </motion.svg>
          </div>
        </div>
      </CasinoFrame>
    </div>
  );
}
