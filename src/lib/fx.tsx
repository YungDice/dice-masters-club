import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fmt } from "@/lib/format";

// ---------- Sound (persistent toggle, WebAudio blips) ----------

type SoundKind = "click" | "coin" | "dice" | "spin" | "win" | "big-win" | "lose";
const KEY = "dice.sound.enabled";

function useSoundInternal() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const v = window.localStorage.getItem(KEY);
    return v === null ? true : v === "1";
  });
  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = useCallback(() => {
    if (typeof window === "undefined") return null;
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    if (!ctxRef.current) ctxRef.current = new Ctx();
    return ctxRef.current;
  }, []);

  const beep = useCallback((freq: number, dur = 0.09, type: OscillatorType = "square", vol = 0.05, delay = 0) => {
    const ctx = getCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t0); o.stop(t0 + dur);
  }, [getCtx]);

  const play = useCallback((kind: SoundKind) => {
    if (!enabled) return;
    switch (kind) {
      case "click": beep(520, 0.05, "triangle", 0.04); break;
      case "coin": beep(880, 0.07, "sine", 0.05); beep(1320, 0.09, "sine", 0.04, 0.06); break;
      case "dice": beep(180, 0.06, "square", 0.05); beep(240, 0.05, "square", 0.04, 0.08); break;
      case "spin": beep(220, 0.5, "sawtooth", 0.03); break;
      case "win":
        beep(523, 0.07, "sine", 0.06);
        beep(659, 0.07, "sine", 0.06, 0.08);
        beep(784, 0.12, "sine", 0.07, 0.16);
        break;
      case "big-win":
        [523, 659, 784, 1046, 1318].forEach((f, i) => beep(f, 0.14, "sine", 0.07, i * 0.09));
        break;
      case "lose": beep(200, 0.18, "sawtooth", 0.05); beep(140, 0.22, "sawtooth", 0.04, 0.14); break;
    }
  }, [beep, enabled]);

  const toggle = useCallback(() => {
    setEnabled((e) => {
      const next = !e;
      try { window.localStorage.setItem(KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  }, []);

  return { enabled, toggle, play };
}

// ---------- Celebrate (confetti + XP fly-outs + shake) ----------

type FlyItem = { id: number; text: string; tone: "win" | "loss" | "info" };
type CelebrateOpts = {
  amount?: number;         // DICE amount (positive win / negative loss)
  label?: string;          // custom label overrides amount formatting
  big?: boolean;           // big burst
  shake?: boolean;         // screen shake
  origin?: { x: number; y: number }; // 0..1 confetti origin
  silent?: boolean;        // suppress sound
};

type FxCtx = {
  enabled: boolean;
  toggleSound: () => void;
  play: (kind: SoundKind) => void;
  celebrate: (opts: CelebrateOpts) => void;
  loss: (amount: number, opts?: { silent?: boolean }) => void;
};

const Ctx = createContext<FxCtx | null>(null);

export function FxProvider({ children }: { children: React.ReactNode }) {
  const { enabled, toggle, play } = useSoundInternal();
  const [items, setItems] = useState<FlyItem[]>([]);
  const idRef = useRef(0);

  const push = useCallback((text: string, tone: FlyItem["tone"]) => {
    const id = ++idRef.current;
    setItems((xs) => [...xs, { id, text, tone }]);
    window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 1600);
  }, []);

  const shake = useCallback(() => {
    if (typeof document === "undefined") return;
    const el = document.body;
    el.classList.remove("fx-shake");
    // force reflow so animation restarts
    void el.offsetWidth;
    el.classList.add("fx-shake");
    window.setTimeout(() => el.classList.remove("fx-shake"), 420);
  }, []);

  const celebrate = useCallback((opts: CelebrateOpts) => {
    const { amount = 0, label, big = false, shake: doShake = false, origin, silent = false } = opts;
    const positive = amount >= 0;
    const text = label ?? (positive ? `+${fmt(amount)} DICE` : `${fmt(amount)} DICE`);
    push(text, positive ? "win" : "loss");
    if (doShake) shake();
    if (!silent && positive) play(big ? "big-win" : "win");
    if (!silent && !positive) play("lose");

    if (!positive) return;
    const o = origin ?? { x: 0.5, y: 0.6 };
    const colors = ["#c9a84c", "#ffd166", "#ef4444", "#22c55e", "#a855f7"];
    if (big) {
      confetti({ particleCount: 140, spread: 90, startVelocity: 55, origin: o, colors, scalar: 1.1 });
      setTimeout(() => confetti({ particleCount: 80, spread: 120, angle: 60, origin: { x: 0, y: 0.7 }, colors }), 120);
      setTimeout(() => confetti({ particleCount: 80, spread: 120, angle: 120, origin: { x: 1, y: 0.7 }, colors }), 220);
    } else {
      confetti({ particleCount: 55, spread: 65, startVelocity: 42, origin: o, colors, scalar: 0.9 });
    }
  }, [play, push, shake]);

  const loss = useCallback((amount: number, opts?: { silent?: boolean }) => {
    push(`${fmt(amount)} DICE`, "loss");
    if (!opts?.silent) play("lose");
  }, [play, push]);

  const value = useMemo<FxCtx>(() => ({ enabled, toggleSound: toggle, play, celebrate, loss }), [enabled, toggle, play, celebrate, loss]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {/* Fly-out overlay */}
      <div className="pointer-events-none fixed inset-x-0 top-24 z-[9999] flex flex-col items-center gap-2">
        <AnimatePresence>
          {items.map((it) => (
            <motion.div
              key={it.id}
              initial={{ opacity: 0, y: 20, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -60, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
              className={`px-5 py-2 rounded-full font-display text-lg font-bold backdrop-blur-md ring-1 shadow-2xl ${
                it.tone === "win"
                  ? "text-emerald-300 bg-emerald-500/15 ring-emerald-400/40"
                  : it.tone === "loss"
                  ? "text-rose-300 bg-rose-500/15 ring-rose-400/40"
                  : "text-amber-200 bg-amber-500/10 ring-amber-400/40"
              }`}
              style={{ textShadow: "0 0 12px currentColor" }}
            >
              {it.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export function useFx() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFx must be used inside <FxProvider>");
  return v;
}
