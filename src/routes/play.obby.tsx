import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Mountain, Play, RotateCw, Trophy, Flame } from "lucide-react";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { obbyStart, obbyCheckpoint, obbyFinish, obbyAbandon } from "@/lib/minigame.functions";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// World constants
const VIEW_W = 720, VIEW_H = 380;
const TILE = 32;
const GRAVITY = 0.6;
const MOVE_V = 4;
const JUMP_V = -11;
const PLAYER_W = 22, PLAYER_H = 28;

type Tile = " " | "#" | "L" | "G"; // solid, lava, goal

type LevelData = {
  chunks: Array<{ length: number; gap: number; hazards: number; platforms: number; difficulty: number }>;
  totalChunks: number;
};

// Build a flat 2D tile map from server-issued seed + chunk meta.
function buildMap(seed: string, level: LevelData) {
  // Deterministic PRNG seeded the same way as server.
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 33 + seed.charCodeAt(i)) >>> 0;
  function rnd() { h = (h * 1664525 + 1013904223) >>> 0; return h / 0xffffffff; }

  const rows = 12;
  let cols = 4;
  const map: Tile[][] = Array.from({ length: rows }, () => Array(4).fill(" ") as Tile[]);
  // Floor for spawn
  for (let x = 0; x < cols; x++) map[rows - 1][x] = "#";

  const checkpointsX: number[] = [];
  for (const c of level.chunks) {
    const start = cols;
    cols += c.length + c.gap;
    for (const row of map) while (row.length < cols) row.push(" " as Tile);
    // Floor with gaps (lava in gap)
    for (let x = start; x < start + c.length; x++) map[rows - 1][x] = "#";
    for (let x = start + c.length; x < cols; x++) map[rows - 1][x] = "L";

    // Platforms
    for (let p = 0; p < c.platforms; p++) {
      const px = start + 1 + Math.floor(rnd() * Math.max(1, c.length - 2));
      const py = rows - 3 - Math.floor(rnd() * 4);
      const len = 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < len && px + i < cols; i++) {
        if (map[py] && map[py][px + i] === " ") map[py][px + i] = "#";
      }
    }

    // Hazards (lava blocks on the floor segment, never on first 2 tiles)
    for (let i = 0; i < c.hazards; i++) {
      const hx = start + 2 + Math.floor(rnd() * Math.max(1, c.length - 3));
      if (hx < start + c.length && map[rows - 1][hx] === "#") map[rows - 2][hx] = "L";
    }

    // Checkpoint at end of this chunk's solid floor
    checkpointsX.push(start + c.length - 1);
  }

  // Goal tile at the very end
  cols += 2;
  for (const row of map) while (row.length < cols) row.push(" " as Tile);
  map[rows - 1][cols - 1] = "#";
  map[rows - 2][cols - 1] = "G";
  return { map, rows, cols, checkpointsX };
}

function ObbyGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<"idle" | "playing" | "won" | "dead">("idle");
  const [checkpoint, setCheckpoint] = useState(0);
  const [reward, setReward] = useState(0);
  const [tries, setTries] = useState(0);
  const roomIdRef = useRef<string | null>(null);
  const checkpointRef = useRef(0);
  const mapRef = useRef<ReturnType<typeof buildMap> | null>(null);
  const playerRef = useRef({ x: 60, y: 0, vx: 0, vy: 0, onGround: false });
  const camRef = useRef(0);
  const keysRef = useRef<Record<string, boolean>>({});
  const qc = useQueryClient();

  async function startRun() {
    try {
      const r = await obbyStart();
      roomIdRef.current = r.roomId;
      checkpointRef.current = 0;
      mapRef.current = buildMap(r.seed, r.level as LevelData);
      playerRef.current = { x: 60, y: (mapRef.current.rows - 2) * TILE - PLAYER_H, vx: 0, vy: 0, onGround: false };
      camRef.current = 0;
      setCheckpoint(0); setReward(0); setStatus("playing"); setTries((t) => t + 1);
    } catch (e: any) { toast.error(e.message); }
  }

  async function bailOut(win: boolean) {
    const id = roomIdRef.current; if (!id) return;
    roomIdRef.current = null;
    if (win) {
      try {
        const r = await obbyFinish({ data: { roomId: id } });
        setReward(r.reward);
        setStatus("won");
        qc.invalidateQueries({ queryKey: ["wallet"] });
        qc.invalidateQueries({ queryKey: ["profile"] });
        toast.success(`Level complete! +${r.reward} DICE`);
      } catch (e: any) { toast.error(e.message); setStatus("dead"); }
    } else {
      setStatus("dead");
      try { await obbyAbandon({ data: { roomId: id } }); } catch {}
    }
  }

  useEffect(() => {
    const dn = (e: KeyboardEvent) => { keysRef.current[e.code] = true; if (["Space","ArrowUp","ArrowLeft","ArrowRight","KeyA","KeyD","KeyW"].includes(e.code)) e.preventDefault(); };
    const up = (e: KeyboardEvent) => { keysRef.current[e.code] = false; };
    window.addEventListener("keydown", dn); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, []);

  useEffect(() => {
    if (status !== "playing" || !mapRef.current) return;
    const ctx = canvasRef.current?.getContext("2d"); if (!ctx) return;
    const { map, rows, cols, checkpointsX } = mapRef.current;
    let raf = 0, alive = true, lastT = performance.now();

    function solidAt(tx: number, ty: number) {
      if (ty < 0 || ty >= rows || tx < 0 || tx >= cols) return false;
      return map[ty][tx] === "#";
    }
    function tileAt(tx: number, ty: number): Tile {
      if (ty < 0 || ty >= rows || tx < 0 || tx >= cols) return " ";
      return map[ty][tx];
    }

    const loop = (t: number) => {
      if (!alive) return;
      let dt = (t - lastT) / (1000 / 60);
      lastT = t;
      if (dt > 4) dt = 4;
      const p = playerRef.current;
      const k = keysRef.current;
      const left = k["ArrowLeft"] || k["KeyA"];
      const right = k["ArrowRight"] || k["KeyD"];
      const jump = k["Space"] || k["ArrowUp"] || k["KeyW"];

      p.vx = (right ? MOVE_V : 0) - (left ? MOVE_V : 0);
      if (jump && p.onGround) { p.vy = JUMP_V; p.onGround = false; }
      p.vy = Math.min(p.vy + GRAVITY * dt, 16);

      // Horizontal collide
      p.x += p.vx * dt;
      {
        const tx1 = Math.floor(p.x / TILE), tx2 = Math.floor((p.x + PLAYER_W - 1) / TILE);
        const ty1 = Math.floor(p.y / TILE), ty2 = Math.floor((p.y + PLAYER_H - 1) / TILE);
        for (let ty = ty1; ty <= ty2; ty++) {
          if (solidAt(tx1, ty) && p.vx < 0) p.x = (tx1 + 1) * TILE;
          if (solidAt(tx2, ty) && p.vx > 0) p.x = tx2 * TILE - PLAYER_W;
        }
      }
      // Vertical collide
      p.y += p.vy * dt;
      p.onGround = false;
      {
        const tx1 = Math.floor(p.x / TILE), tx2 = Math.floor((p.x + PLAYER_W - 1) / TILE);
        const ty1 = Math.floor(p.y / TILE), ty2 = Math.floor((p.y + PLAYER_H - 1) / TILE);
        for (let tx = tx1; tx <= tx2; tx++) {
          if (solidAt(tx, ty1) && p.vy < 0) { p.y = (ty1 + 1) * TILE; p.vy = 0; }
          if (solidAt(tx, ty2) && p.vy > 0) { p.y = ty2 * TILE - PLAYER_H; p.vy = 0; p.onGround = true; }
        }
      }


      // Hazard check (any lava overlap)
      {
        const tx1 = Math.floor(p.x / TILE), tx2 = Math.floor((p.x + PLAYER_W - 1) / TILE);
        const ty1 = Math.floor(p.y / TILE), ty2 = Math.floor((p.y + PLAYER_H - 1) / TILE);
        for (let ty = ty1; ty <= ty2; ty++) for (let tx = tx1; tx <= tx2; tx++) {
          const t = tileAt(tx, ty);
          if (t === "L") { bailOut(false); return; }
          if (t === "G") { bailOut(true); return; }
        }
      }
      if (p.y > rows * TILE + 200) { bailOut(false); return; }

      // Checkpoints (purely informational; final goal is server-enforced)
      const ptx = Math.floor((p.x + PLAYER_W / 2) / TILE);
      const nextCp = checkpointRef.current;
      if (nextCp < checkpointsX.length && ptx >= checkpointsX[nextCp]) {
        const idx = nextCp + 1;
        checkpointRef.current = idx;
        setCheckpoint(idx);
        if (roomIdRef.current) obbyCheckpoint({ data: { roomId: roomIdRef.current, checkpoint: idx } }).catch(() => {});
      }

      // Camera
      camRef.current = Math.max(0, Math.min(p.x - VIEW_W / 2 + PLAYER_W / 2, cols * TILE - VIEW_W));

      // Draw
      ctx.fillStyle = "#080809";
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      const cam = camRef.current;
      const startTx = Math.max(0, Math.floor(cam / TILE) - 1);
      const endTx = Math.min(cols, Math.ceil((cam + VIEW_W) / TILE) + 1);
      for (let ty = 0; ty < rows; ty++) {
        for (let tx = startTx; tx < endTx; tx++) {
          const t = map[ty][tx];
          const px = tx * TILE - cam, py = ty * TILE;
          if (t === "#") {
            ctx.fillStyle = "#141415";
            ctx.fillRect(px, py, TILE, TILE);
            ctx.strokeStyle = "rgba(255,255,255,0.08)";
            ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
          } else if (t === "L") {
            const wob = Math.sin((Date.now() + tx * 60) / 200) * 2;
            ctx.fillStyle = "#7a1f1f";
            ctx.fillRect(px, py + 4 + wob, TILE, TILE - 4 - wob);
            ctx.fillStyle = "#e23b3b";
            ctx.fillRect(px, py + 4 + wob, TILE, 4);
          } else if (t === "G") {
            ctx.fillStyle = "rgba(255,255,255,0.08)";
            ctx.fillRect(px + 6, py + 4, 4, TILE - 8);
            ctx.beginPath();
            ctx.moveTo(px + 10, py + 4);
            ctx.lineTo(px + TILE - 2, py + 10);
            ctx.lineTo(px + 10, py + 16);
            ctx.closePath();
            ctx.fill();
          }
        }
      }

      // Player (a tumbling DIE)
      const dx = p.x - cam, dy = p.y;
      ctx.save();
      ctx.translate(dx + PLAYER_W / 2, dy + PLAYER_H / 2);
      ctx.rotate(((p.x % 360) / 360) * Math.PI * 2);
      ctx.fillStyle = "#fef3c7";
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-PLAYER_W / 2, -PLAYER_H / 2, PLAYER_W, PLAYER_H, 4);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#141415";
      ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [status]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-medium flex items-center gap-2"><Mountain className="text-foreground" /> DICE Obby</h1>
          <p className="text-sm text-muted-foreground">Run, jump, dodge the lava. <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-xs">A/D</kbd> or <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-xs">←/→</kbd>, <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-xs">Space</kbd> jump. Reach the flag for 150 DICE.</p>
        </div>
        <div className="flex gap-3 text-sm">
          <div className="rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10"><div className="text-[10px] uppercase text-muted-foreground">Checkpoint</div><div className="font-bold text-foreground">{checkpoint}/8</div></div>
          <div className="rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10"><div className="text-[10px] uppercase text-muted-foreground">Attempts</div><div className="font-bold text-foreground flex items-center gap-1"><Flame className="size-3" />{tries}</div></div>
        </div>
      </div>

      <Card className="glass p-4 grid place-items-center">
        <div className="relative" style={{ width: VIEW_W, maxWidth: "100%" }}>
          <canvas
            ref={canvasRef}
            width={VIEW_W}
            height={VIEW_H}
            className="rounded-xl border border-white/10 max-w-full h-auto select-none"
            style={{ background: "#080809" }}
          />
          {status !== "playing" && (
            <div className="absolute inset-0 grid place-items-center bg-black/65 rounded-xl">
              <div className="text-center space-y-3 p-6">
                {status === "idle" ? (
                  <>
                    <Mountain className="mx-auto size-12 text-foreground" />
                    <h2 className="font-display text-2xl">Ready to climb?</h2>
                    <Button size="lg" onClick={startRun}><Play className="mr-1.5 size-4" /> Start level</Button>
                  </>
                ) : status === "won" ? (
                  <>
                    <Trophy className="mx-auto size-12 text-foreground" />
                    <h2 className="font-display text-2xl">Level cleared</h2>
                    <p className="text-sm">Earned <span className="text-emerald-300 font-bold">+{reward}</span> DICE</p>
                    <Button size="lg" onClick={startRun}><RotateCw className="mr-1.5 size-4" /> New level</Button>
                  </>
                ) : (
                  <>
                    <Flame className="mx-auto size-12 text-white" />
                    <h2 className="font-display text-2xl">You died</h2>
                    <p className="text-sm">Reached checkpoint <span className="text-foreground font-bold">{checkpoint}/8</span>.</p>
                    <Button size="lg" onClick={startRun}><RotateCw className="mr-1.5 size-4" /> Try again</Button>
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

export const Route = createFileRoute("/play/obby")({
  head: () => ({
    meta: [
      { title: "DICE Obby — DICE" },
      { name: "description", content: "2D obstacle course minigame on DICE. Run, jump, and dodge — earn +150 DICE per cleared level." },
      { property: "og:title", content: "DICE Obby — DICE" },
      { property: "og:description", content: "2D obstacle course — +150 DICE per cleared level." },
      { property: "og:url", content: "https://yungdice.com/play/obby" },
    ],
    links: [{ rel: "canonical", href: "https://yungdice.com/play/obby" }],
  }),
  component: () => <AppShell><ObbyGame /></AppShell>,
});
