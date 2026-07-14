import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Bird, Play, RotateCw, Trophy } from "lucide-react";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { flappyStart, flappyGate, flappyEnd } from "@/lib/minigame.functions";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useMyProfile } from "@/hooks/use-profile";
import { useEquippedFor } from "@/lib/cosmetics";

// Visual constants
const W = 480, H = 640;
const PIPE_W = 70, GAP = 170;
const PIPE_SPACING = 230;
const GRAVITY = 0.45;
const FLAP_V = -7.5;
const SCROLL_V = 2.4;
const DIE_SIZE = 34;

type Pipe = { x: number; topH: number; passed: boolean; idx: number };

function FlappyGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<"idle" | "playing" | "dead">("idle");
  const [score, setScore] = useState(0);
  const [reward, setReward] = useState(0);
  const [best, setBest] = useState<number>(0);
  useEffect(() => {
    if (typeof window !== "undefined") {
      setBest(Number(window.localStorage.getItem("flappy_best") ?? 0));
    }
  }, []);
  const roomIdRef = useRef<string | null>(null);
  const sentGateRef = useRef(0);
  const qc = useQueryClient();

  // Equipped dice skin (cosmetic)
  const { user } = useAuth();
  const prof = useMyProfile(user?.id);
  const equipped = useEquippedFor(prof.data);
  const skin = (equipped.data as any)?.dice_skin;
  const skinColor = String(skin?.meta?.color ?? "#fef3c7");
  const skinPip = String(skin?.meta?.pip ?? "#0b4d3a");
  const skinImage = (skin?.meta?.image_url ?? null) as string | null;
  const skinImgRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!skinImage) { skinImgRef.current = null; return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = skinImage;
    img.onload = () => { skinImgRef.current = img; };
  }, [skinImage]);

  // Mutable game state
  const stateRef = useRef({
    y: H / 2, v: 0, pipes: [] as Pipe[], frame: 0, nextIdx: 1,
  });

  async function startRun() {
    try {
      const r = await flappyStart();
      roomIdRef.current = r.roomId;
      sentGateRef.current = 0;
      stateRef.current = { y: H / 2, v: 0, pipes: [], frame: 0, nextIdx: 1 };
      setScore(0); setReward(0); setStatus("playing");
    } catch (e: any) { toast.error(e.message); }
  }

  async function endRun() {
    if (!roomIdRef.current) return;
    const id = roomIdRef.current;
    roomIdRef.current = null;
    setStatus("dead");
    setBest((b) => { const nb = Math.max(b, score); localStorage.setItem("flappy_best", String(nb)); return nb; });
    try {
      const r = await flappyEnd({ data: { roomId: id } });
      setReward(r.reward);
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch {}
  }

  function flap() {
    if (status === "idle") { startRun(); return; }
    if (status === "playing") stateRef.current.v = FLAP_V;
  }

  // Award gate on server
  async function awardGate(gate: number) {
    if (!roomIdRef.current) return;
    try {
      const r = await flappyGate({ data: { roomId: roomIdRef.current, gate } });
      setReward(r.total);
      qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e: any) {
      // Don't kill the run on transient errors; just stop awarding
      console.warn("flappyGate", e?.message);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === "Space") { e.preventDefault(); flap(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (status !== "playing") return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    let raf = 0; let alive = true; let lastT = performance.now();
    const loop = (t: number) => {
      if (!alive) return;
      // Fixed-step physics: 60Hz baseline regardless of monitor refresh.
      // dt is in 60Hz "frames" so velocity/gravity constants stay tuned for 60fps.
      let dt = (t - lastT) / (1000 / 60);
      lastT = t;
      if (dt > 4) dt = 4; // pause/tab switch guard
      const s = stateRef.current;
      s.frame++;
      s.v += GRAVITY * dt;
      s.y += s.v * dt;

      // Spawn pipes
      if (s.pipes.length === 0 || s.pipes[s.pipes.length - 1].x < W - PIPE_SPACING) {
        const topH = 60 + Math.floor(Math.random() * (H - GAP - 160));
        s.pipes.push({ x: W + 20, topH, passed: false, idx: s.nextIdx++ });
      }
      // Move + cull pipes
      for (const p of s.pipes) p.x -= SCROLL_V * dt;
      s.pipes = s.pipes.filter((p) => p.x + PIPE_W > -10);

      // Collisions
      const x = 90;
      if (s.y < 0 || s.y + DIE_SIZE > H - 30) { endRun(); return; }
      for (const p of s.pipes) {
        const within = x + DIE_SIZE > p.x && x < p.x + PIPE_W;
        if (within && (s.y < p.topH || s.y + DIE_SIZE > p.topH + GAP)) { endRun(); return; }
        if (!p.passed && p.x + PIPE_W < x) {
          p.passed = true;
          setScore((sc) => {
            const nsc = sc + 1;
            if (p.idx > sentGateRef.current) {
              sentGateRef.current = p.idx;
              awardGate(p.idx);
            }
            return nsc;
          });
        }
      }

      // Draw
      ctx.fillStyle = "#04201a";
      ctx.fillRect(0, 0, W, H);
      // Felt grid
      ctx.strokeStyle = "rgba(201,168,76,0.06)";
      for (let i = 0; i < W; i += 32) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke(); }
      // Ground
      ctx.fillStyle = "#0b4d3a";
      ctx.fillRect(0, H - 30, W, 30);
      ctx.fillStyle = "#c9a84c";
      ctx.fillRect(0, H - 30, W, 2);

      // Pipes (gold-trimmed)
      for (const p of s.pipes) {
        ctx.fillStyle = "#0b4d3a";
        ctx.fillRect(p.x, 0, PIPE_W, p.topH);
        ctx.fillRect(p.x, p.topH + GAP, PIPE_W, H - 30 - (p.topH + GAP));
        ctx.strokeStyle = "#c9a84c";
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x, 0, PIPE_W, p.topH);
        ctx.strokeRect(p.x, p.topH + GAP, PIPE_W, H - 30 - (p.topH + GAP));
        // Lip
        ctx.fillStyle = "#0d6149";
        ctx.fillRect(p.x - 4, p.topH - 12, PIPE_W + 8, 12);
        ctx.fillRect(p.x - 4, p.topH + GAP, PIPE_W + 8, 12);
      }

      // The DIE (uses equipped dice skin cosmetic if any)
      ctx.save();
      ctx.translate(x + DIE_SIZE / 2, s.y + DIE_SIZE / 2);
      ctx.rotate(Math.max(-0.4, Math.min(0.9, s.v / 12)));
      const img = skinImgRef.current;
      if (img) {
        // Draw skin image as the die face
        ctx.beginPath();
        ctx.roundRect(-DIE_SIZE / 2, -DIE_SIZE / 2, DIE_SIZE, DIE_SIZE, 6);
        ctx.save();
        ctx.clip();
        ctx.drawImage(img, -DIE_SIZE / 2, -DIE_SIZE / 2, DIE_SIZE, DIE_SIZE);
        ctx.restore();
        ctx.strokeStyle = "#c9a84c";
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.fillStyle = skinColor;
        ctx.strokeStyle = "#c9a84c";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-DIE_SIZE / 2, -DIE_SIZE / 2, DIE_SIZE, DIE_SIZE, 6);
        ctx.fill(); ctx.stroke();
        // pips (face = 5)
        ctx.fillStyle = skinPip;
        const r = 2.5;
        const pip = (dx: number, dy: number) => { ctx.beginPath(); ctx.arc(dx, dy, r, 0, Math.PI * 2); ctx.fill(); };
        pip(-8, -8); pip(8, -8); pip(0, 0); pip(-8, 8); pip(8, 8);
      }
      ctx.restore();

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [status, skinColor, skinPip]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2"><Bird className="text-amber-400" /> Flappy DICE</h1>
          <p className="text-sm text-muted-foreground">Tap, click, or press <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-xs">Space</kbd> to flap. Clear a gate, earn 50 DICE.</p>
        </div>
        <div className="flex gap-3 text-sm">
          <div className="rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10"><div className="text-[10px] uppercase text-muted-foreground">Score</div><div className="font-bold text-amber-200">{score}</div></div>
          <div className="rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10"><div className="text-[10px] uppercase text-muted-foreground">Best</div><div className="font-bold text-amber-200">{best}</div></div>
          <div className="rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10"><div className="text-[10px] uppercase text-muted-foreground">+DICE</div><div className="font-bold text-emerald-300">+{reward}</div></div>
        </div>
      </div>

      <Card className="glass p-4 grid place-items-center">
        <div className="relative" style={{ width: W, maxWidth: "100%" }}>
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            onMouseDown={flap}
            onTouchStart={(e) => { e.preventDefault(); flap(); }}
            className="rounded-xl border border-amber-400/30 max-w-full h-auto cursor-pointer select-none"
            style={{ background: "#04201a", touchAction: "none" }}
          />
          {status !== "playing" && (
            <div className="absolute inset-0 grid place-items-center bg-black/60 rounded-xl">
              <div className="text-center space-y-3 p-6">
                {status === "idle" ? (
                  <>
                    <Bird className="mx-auto size-12 text-amber-300" />
                    <h2 className="font-display text-2xl">Ready to flap?</h2>
                    <Button size="lg" onClick={startRun}><Play className="mr-1.5 size-4" /> Start run</Button>
                  </>
                ) : (
                  <>
                    <Trophy className="mx-auto size-12 text-amber-300" />
                    <h2 className="font-display text-2xl">Run over</h2>
                    <p className="text-sm">Score <span className="text-amber-200 font-bold">{score}</span> · Earned <span className="text-emerald-300 font-bold">+{reward}</span> DICE</p>
                    <Button size="lg" onClick={startRun}><RotateCw className="mr-1.5 size-4" /> Play again</Button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

export const Route = createFileRoute("/play/flappy")({
  head: () => ({ meta: [{ title: "Flappy DICE — DICE" }, { name: "description", content: "Flappy Bird-style DICE minigame. 50 DICE per gate." }] }),
  component: () => <AppShell><FlappyGame /></AppShell>,
});
