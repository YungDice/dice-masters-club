import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Rocket } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/dice/TopNav";
import { CasinoFrame } from "@/components/dice/casino/CasinoFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { rocketPlay } from "@/lib/rocket.functions";
import { useAuth } from "@/hooks/use-auth";
import { useWallet } from "@/hooks/use-profile";
import { fmt } from "@/lib/format";

export const Route = createFileRoute("/play/rocket")({
  head: () => ({
    meta: [
      { title: "Rocket — DICE" },
      { name: "description", content: "Set your target multiplier and cash out before the rocket crashes. Bet DICE on the climb." },
      { property: "og:title", content: "Rocket — DICE" },
      { property: "og:description", content: "Cash out before the rocket crashes." },
      { property: "og:url", content: "https://yungdice.com/play/rocket" },
    ],
    links: [{ rel: "canonical", href: "https://yungdice.com/play/rocket" }],
  }),
  component: () => <AppShell><RocketGame /></AppShell>,
});

function RocketGame() {
  const { user } = useAuth();
  const { data: wallet } = useWallet(user?.id);
  const qc = useQueryClient();
  const [bet, setBet] = useState(50);
  const [target, setTarget] = useState(2.00);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(1.0);
  const [result, setResult] = useState<{ crash: number; won: boolean; target: number; payout: number; delta: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const play = useServerFn(rocketPlay);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  async function launch() {
    if (!wallet || wallet.balance < bet) return toast.error("Not enough DICE");
    const t = Math.round(target * 100) / 100;
    if (t < 1.01 || t > 100) return toast.error("Target must be 1.01x – 100x");
    setBusy(true); setResult(null); setLive(1.0);
    try {
      const r = await play({ data: { bet, target: t } });
      // Animate to crash point
      const start = performance.now();
      const dur = Math.min(6000, 900 + Math.log2(r.crash) * 900);
      const from = 1;
      const to = r.crash;
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / dur);
        // eased curve — accelerates
        const eased = Math.pow(p, 1.6);
        const v = from + (to - from) * eased;
        setLive(Math.max(1, v));
        if (p < 1) rafRef.current = requestAnimationFrame(step);
        else {
          setResult(r);
          qc.invalidateQueries({ queryKey: ["wallet"] });
          toast(r.won ? `+${fmt(r.payout - bet)} DICE — crashed at ${r.crash.toFixed(2)}x` : `Crashed at ${r.crash.toFixed(2)}x`);
          setBusy(false);
        }
      };
      rafRef.current = requestAnimationFrame(step);
    } catch (e: any) {
      toast.error(e.message);
      setBusy(false);
    }
  }

  const rocketY = Math.min(320, (live - 1) * 60);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <h1 className="font-display text-3xl font-medium flex items-center gap-2">
        <Rocket className="text-foreground" /> Rocket
      </h1>
      <CasinoFrame title="Set your target" subtitle="Cash out before the crash" icon={<Rocket className="size-6 text-foreground" />}>
        <div className="grid md:grid-cols-[1fr_1.2fr] gap-6">
          <div className="space-y-4">
            <div>
              <Label className="text-foreground">Bet (DICE)</Label>
              <Input type="number" min={1} max={10000} value={bet}
                onChange={(e) => setBet(Math.max(1, Math.floor(Number(e.target.value) || 0)))}
                disabled={busy} className="bg-black/40 text-foreground" />
              <div className="mt-2 flex gap-2 flex-wrap">
                {[10, 50, 100, 500, 1000].map((v) => (
                  <button key={v} disabled={busy} onClick={() => setBet(v)}
                    className="px-2 py-1 rounded bg-white/5 text-foreground text-xs hover:bg-white/5 disabled:opacity-50">{v}</button>
                ))}
                <button disabled={busy || !wallet} onClick={() => setBet(Math.min(10000, Number(wallet?.balance ?? 0)))}
                  className="px-2 py-1 rounded bg-white/5 text-foreground text-xs hover:bg-white/5 disabled:opacity-50">Max</button>
              </div>
            </div>
            <div>
              <Label className="text-foreground">Target multiplier (1.01x – 100x)</Label>
              <Input type="number" step="0.01" min={1.01} max={100} value={target}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  setTarget(Math.round(n * 100) / 100);
                }}
                disabled={busy} className="bg-black/40 text-foreground" />
              <div className="mt-2 flex gap-2 flex-wrap">
                {[1.25, 1.5, 2, 3, 5, 10].map((v) => (
                  <button key={v} disabled={busy} onClick={() => setTarget(v)}
                    className="px-2 py-1 rounded bg-white/5 text-foreground text-xs hover:bg-white/5 disabled:opacity-50">{v}x</button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                Potential payout: <b className="text-foreground">{fmt(Math.floor(bet * target))}</b> DICE
              </p>
            </div>
            <Button onClick={launch} disabled={busy} className="w-full glow-red font-display text-base h-11">
              {busy ? "Launching…" : "Launch 🚀"}
            </Button>
          </div>
          <div
            className="relative rounded-xl overflow-hidden h-[360px]"
            style={{
              background: "linear-gradient(to top, #080809 0%, #141415 40%, #0a1a3a 90%, #000814 100%)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {/* stars */}
            <div className="absolute inset-0 opacity-40" style={{
              backgroundImage: "radial-gradient(circle at 20% 30%, #fff 1px, transparent 1px), radial-gradient(circle at 60% 20%, #fff 1px, transparent 1px), radial-gradient(circle at 80% 70%, #fff 1px, transparent 1px), radial-gradient(circle at 30% 80%, #fff 1px, transparent 1px)",
              backgroundSize: "200px 200px",
            }} />
            <motion.div
              className="absolute left-1/2 -translate-x-1/2"
              style={{ bottom: 30 + rocketY }}
              animate={busy ? { rotate: [-3, 3, -3] } : { rotate: 0 }}
              transition={{ repeat: Infinity, duration: 0.3 }}
            >
              <Rocket className="size-14 text-foreground drop-shadow-[0_0_20px_rgba(252,211,77,0.7)]" />
              {busy && (
                <motion.div
                  className="absolute left-1/2 -translate-x-1/2 -bottom-6 w-3 h-8 rounded-full bg-gradient-to-t from-red-500 via-white/5 to-white/5"
                  animate={{ scaleY: [1, 1.4, 1] }}
                  transition={{ repeat: Infinity, duration: 0.15 }}
                />
              )}
            </motion.div>
            <div className="absolute inset-x-0 top-4 text-center">
              <div className={`font-display font-black text-5xl md:text-6xl ${result ? (result.won ? "text-emerald-300" : "text-red-400") : "text-foreground"}`}>
                {live.toFixed(2)}x
              </div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground mt-1">
                {result ? (result.won ? "Cashed out!" : "Crashed") : busy ? "Ascending…" : `Target ${target.toFixed(2)}x`}
              </div>
            </div>
          </div>
        </div>
      </CasinoFrame>
    </div>
  );
}
