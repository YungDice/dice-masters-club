import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CircleDot, RotateCcw, Trash2 } from "lucide-react";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { rouletteSpin, WHEEL_AMERICAN, pocketColor, type Bet, type BetType } from "@/lib/roulette.functions";
import { useAuth } from "@/hooks/use-auth";
import { useWallet } from "@/hooks/use-profile";
import { fmt } from "@/lib/format";
import { toast } from "sonner";
import { CasinoFrame } from "@/components/dice/casino/CasinoFrame";

export const Route = createFileRoute("/play/roulette")({
  head: () => ({
    meta: [
      { title: "Roulette — DICE" },
      { name: "description", content: "American Roulette on DICE. Place chips on 0, 00, numbers, or outside bets, spin the wheel, and settle instantly." },
      { property: "og:title", content: "Roulette — DICE" },
      { property: "og:description", content: "American Roulette — 0 / 00 wheel on DICE." },
      { property: "og:url", content: "https://yungdice.com/play/roulette" },
    ],
    links: [{ rel: "canonical", href: "https://yungdice.com/play/roulette" }],
  }),
  component: () => <AppShell><RoulettePage /></AppShell>,
});

const CHIPS = [5, 25, 100, 500, 1000];
const CHIP_COLORS: Record<number, string> = {
  5: "#dc2626", 25: "#16a34a", 100: "#1d4ed8", 500: "#9333ea", 1000: "#f59e0b",
};

function Chip({ value, selected, onClick }: { value: number; selected?: boolean; onClick?: () => void }) {
  const c = CHIP_COLORS[value];
  return (
    <button onClick={onClick} aria-label={`${value} chip`}
      className={`relative size-12 rounded-full transition ${selected ? "scale-110 ring-2 ring-white/10" : "hover:scale-105"}`}
      style={{
        background: `radial-gradient(circle at 35% 30%, ${c}cc, ${c} 70%)`,
        border: `3px dashed rgba(255,255,255,0.85)`,
        boxShadow: "inset 0 -4px 6px rgba(0,0,0,0.4), 0 4px 8px rgba(0,0,0,0.35)",
      }}>
      <span className="absolute inset-0 grid place-items-center text-[10px] font-black text-white drop-shadow">{value}</span>
    </button>
  );
}

function StackedChips({ amount }: { amount: number }) {
  // Break amount into chips (greedy) for stack viz, cap visible chips
  const denoms = [1000, 500, 100, 25, 5];
  const chips: number[] = [];
  let rem = amount;
  for (const d of denoms) { while (rem >= d && chips.length < 5) { chips.push(d); rem -= d; } }
  return (
    <div className="relative w-7 h-7">
      {chips.map((d, i) => (
        <div key={i} className="absolute left-1/2 -translate-x-1/2 size-6 rounded-full"
          style={{
            bottom: i * 3,
            background: `radial-gradient(circle at 35% 30%, ${CHIP_COLORS[d]}cc, ${CHIP_COLORS[d]} 70%)`,
            border: "2px dashed rgba(255,255,255,0.85)",
            boxShadow: "0 1px 2px rgba(0,0,0,0.5)",
          }} />
      ))}
    </div>
  );
}

// Number grid: 3 rows (top=3,6,..,36 ; mid=2,5,..,35 ; bot=1,4,..,34)
const ROWS: number[][] = [
  Array.from({ length: 12 }, (_, i) => 3 + i * 3),
  Array.from({ length: 12 }, (_, i) => 2 + i * 3),
  Array.from({ length: 12 }, (_, i) => 1 + i * 3),
];

function Wheel({ angle }: { angle: number }) {
  const size = 280;
  const r = size / 2;
  const seg = 360 / WHEEL_AMERICAN.length;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <motion.div
        animate={{ rotate: angle }}
        transition={{ duration: 4.5, ease: [0.18, 0.7, 0.2, 1] }}
        className="absolute inset-0 rounded-full"
        style={{
          background: "radial-gradient(circle at 50% 50%, #3b1f10, #1a0c06)",
          border: "8px solid #c9a84c",
          boxShadow: "0 0 40px -6px rgba(255,255,255,0.08), inset 0 0 24px rgba(0,0,0,0.7)",
        }}
      >
        <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0">
          {WHEEL_AMERICAN.map((p, i) => {
            const a0 = (i * seg - 90 - seg / 2) * Math.PI / 180;
            const a1 = ((i + 1) * seg - 90 - seg / 2) * Math.PI / 180;
            const x0 = r + r * Math.cos(a0), y0 = r + r * Math.sin(a0);
            const x1 = r + r * Math.cos(a1), y1 = r + r * Math.sin(a1);
            const col = pocketColor(p);
            const fill = col === "red" ? "#b91c1c" : col === "black" ? "#0a0a0a" : "#15803d";
            const path = `M ${r} ${r} L ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1} Z`;
            const mid = (i * seg - 90);
            const tx = r + (r - 22) * Math.cos(mid * Math.PI / 180);
            const ty = r + (r - 22) * Math.sin(mid * Math.PI / 180);
            return (
              <g key={i}>
                <path d={path} fill={fill} stroke="#c9a84c" strokeWidth={0.5} />
                <text x={tx} y={ty} fill="white" fontSize="10" fontWeight="700" textAnchor="middle"
                  dominantBaseline="middle" transform={`rotate(${mid + 90} ${tx} ${ty})`}>{p}</text>
              </g>
            );
          })}
          <circle cx={r} cy={r} r={48} fill="#1a0c06" stroke="#c9a84c" strokeWidth={3} />
          <circle cx={r} cy={r} r={20} fill="#c9a84c" />
        </svg>
      </motion.div>
      {/* Pointer at top */}
      <div className="absolute left-1/2 -translate-x-1/2 -top-2 z-10"
        style={{ width: 0, height: 0, borderLeft: "10px solid transparent", borderRight: "10px solid transparent", borderTop: "16px solid #c9a84c" }} />
    </div>
  );
}

type BetMap = Record<string, number>; // key like "straight:7", "red", "dozen1"
function betKey(b: BetType, v?: number | "00") {
  return v === undefined ? b : `${b}:${v}`;
}
function parseKey(k: string): { type: BetType; value?: number | "00" } {
  const [t, v] = k.split(":");
  if (v === undefined) return { type: t as BetType };
  return { type: t as BetType, value: v === "00" ? "00" : parseInt(v, 10) };
}

function RoulettePage() {
  const { user } = useAuth();
  const { data: wallet } = useWallet(user?.id);
  const qc = useQueryClient();
  const spinFn = useServerFn(rouletteSpin);

  const [chip, setChip] = useState(25);
  const [bets, setBets] = useState<BetMap>({});
  const [spinning, setSpinning] = useState(false);
  const [angle, setAngle] = useState(0);
  const [result, setResult] = useState<{ pocket: number | "00"; payout: number; net: number } | null>(null);
  const [history, setHistory] = useState<(number | "00")[]>([]);

  const total = useMemo(() => Object.values(bets).reduce((s, n) => s + n, 0), [bets]);

  function addBet(b: BetType, v?: number | "00") {
    if (spinning) return;
    const k = betKey(b, v);
    setBets((m) => ({ ...m, [k]: (m[k] ?? 0) + chip }));
  }
  function clearBets() { if (!spinning) setBets({}); }
  function undo() {
    if (spinning) return;
    const keys = Object.keys(bets);
    if (!keys.length) return;
    const last = keys[keys.length - 1];
    setBets((m) => {
      const next = { ...m };
      next[last] -= chip;
      if (next[last] <= 0) delete next[last];
      return next;
    });
  }

  async function spin() {
    if (spinning) return;
    if (!total) return toast.error("Place a bet first");
    if (!wallet || wallet.balance < total) return toast.error("Not enough DICE");
    setResult(null);
    const list: Bet[] = Object.entries(bets).map(([k, amount]) => {
      const { type, value } = parseKey(k);
      return { type, value, amount };
    });
    setSpinning(true);
    try {
      const r = await spinFn({ data: { bets: list } });
      // Animate wheel so pocketIndex lands at top (angle 0)
      // Pointer is at top, segments start at index 0 = top after rotating by seg*idx clockwise => rotate = -idx*seg (mod 360) + N full turns
      const seg = 360 / WHEEL_AMERICAN.length;
      const target = -r.pocketIndex * seg;
      const turns = 5 * 360;
      setAngle((a) => {
        // Always rotate forward at least `turns + small adjustment`
        const base = Math.floor(a / 360) * 360;
        return base + turns + target;
      });
      setTimeout(() => {
        setResult({ pocket: r.pocket, payout: r.payout, net: r.net });
        setHistory((h) => [r.pocket, ...h].slice(0, 12));
        setSpinning(false);
        setBets({});
        qc.invalidateQueries({ queryKey: ["wallet"] });
        if (r.payout > 0) toast.success(`${r.pocket} ${r.color.toUpperCase()} — +${fmt(r.payout)} DICE`);
        else toast(`${r.pocket} ${r.color.toUpperCase()} — no win`);
      }, 4600);
    } catch (e: any) { toast.error(e.message); setSpinning(false); }
  }

  function cellBg(n: number) {
    return pocketColor(n) === "red" ? "bg-red-700" : "bg-neutral-900";
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display text-3xl font-medium flex items-center gap-2"><CircleDot className="text-foreground" />Roulette <span className="text-sm font-normal text-muted-foreground">— American (0 / 00)</span></h1>
        <div className="flex gap-1 text-xs">
          {history.map((p, i) => (
            <span key={i} className="size-6 rounded-full grid place-items-center font-bold text-white"
              style={{ background: pocketColor(p) === "red" ? "#b91c1c" : pocketColor(p) === "black" ? "#0a0a0a" : "#15803d" }}>
              {p}
            </span>
          ))}
        </div>
      </div>

      <Tabs defaultValue="solo">
        <TabsList>
          <TabsTrigger value="solo">Solo vs House</TabsTrigger>
          <TabsTrigger value="live">Live Table</TabsTrigger>
        </TabsList>

        <TabsContent value="solo" className="space-y-4">
          <CasinoFrame title="American Roulette" subtitle="0 / 00 · place chips · spin" icon={<CircleDot className="size-6 text-foreground" />}>

            <div className="grid grid-cols-1 md:grid-cols-[300px,1fr] gap-6 items-center">
              <div className="flex flex-col items-center gap-3">
                <Wheel angle={angle} />
                <AnimatePresence>
                  {result && !spinning && (
                    <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                      className={`font-display text-3xl ${result.net > 0 ? "text-emerald-400" : result.net < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      {result.pocket} · {result.net > 0 ? `+${fmt(result.net)}` : fmt(result.net)} DICE
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Felt table — horizontal scroll on small screens */}
              <div className="rounded-xl p-3 overflow-x-auto" style={{ background: "linear-gradient(180deg, #064e3b, #022c1f)", boxShadow: "inset 0 0 24px rgba(0,0,0,0.5)" }}>
               <div className="min-w-[700px]">
                {/* zero / double-zero */}
                <div className="grid grid-cols-[60px,repeat(12,1fr),60px] gap-1">
                  <div className="row-span-3 grid grid-rows-2 gap-1">
                    <button disabled={spinning} onClick={() => addBet("straight", 0)} className="bg-green-700 hover:brightness-110 text-white font-bold grid place-items-center rounded relative">
                      0 {bets[betKey("straight", 0)] && <span className="absolute -top-1 -right-1"><StackedChips amount={bets[betKey("straight", 0)]} /></span>}
                    </button>
                    <button disabled={spinning} onClick={() => addBet("straight", "00")} className="bg-green-700 hover:brightness-110 text-white font-bold grid place-items-center rounded relative">
                      00 {bets[betKey("straight", "00")] && <span className="absolute -top-1 -right-1"><StackedChips amount={bets[betKey("straight", "00")]} /></span>}
                    </button>
                  </div>
                  {/* number rows */}
                  {ROWS.map((row, ri) => (
                    <Fragment key={ri}>
                      {row.map((n) => (
                        <button key={n} disabled={spinning} onClick={() => addBet("straight", n)}
                          className={`${cellBg(n)} text-white font-bold grid place-items-center rounded h-10 hover:brightness-125 relative`}>
                          {n}
                          {bets[betKey("straight", n)] && <span className="absolute -top-1 -right-1"><StackedChips amount={bets[betKey("straight", n)]} /></span>}
                        </button>
                      ))}
                      {/* column bets at right */}
                      <button disabled={spinning} onClick={() => addBet(ri === 0 ? "col3" : ri === 1 ? "col2" : "col1")}
                        className="bg-emerald-800 text-white text-xs font-bold rounded hover:brightness-125 relative">
                        2:1
                        {bets[ri === 0 ? "col3" : ri === 1 ? "col2" : "col1"] && <span className="absolute -top-1 -right-1"><StackedChips amount={bets[ri === 0 ? "col3" : ri === 1 ? "col2" : "col1"]} /></span>}
                      </button>
                    </Fragment>
                  ))}
                </div>
                {/* dozens */}
                <div className="grid grid-cols-3 gap-1 mt-1 ml-[64px] mr-[64px]">
                  {(["dozen1", "dozen2", "dozen3"] as const).map((d, i) => (
                    <button key={d} disabled={spinning} onClick={() => addBet(d)}
                      className="bg-emerald-800 text-white font-bold h-9 rounded hover:brightness-125 relative">
                      {["1st 12", "2nd 12", "3rd 12"][i]}
                      {bets[d] && <span className="absolute -top-1 -right-1"><StackedChips amount={bets[d]} /></span>}
                    </button>
                  ))}
                </div>
                {/* even-money */}
                <div className="grid grid-cols-6 gap-1 mt-1 ml-[64px] mr-[64px]">
                  {([
                    ["low", "1-18"], ["even", "EVEN"], ["red", "RED"],
                    ["black", "BLACK"], ["odd", "ODD"], ["high", "19-36"],
                  ] as [BetType, string][]).map(([t, label]) => {
                    const isRed = t === "red", isBlack = t === "black";
                    return (
                      <button key={t} disabled={spinning} onClick={() => addBet(t)}
                        className={`${isRed ? "bg-red-700" : isBlack ? "bg-neutral-900" : "bg-emerald-800"} text-white font-bold h-9 rounded hover:brightness-125 relative`}>
                        {label}
                        {bets[t] && <span className="absolute -top-1 -right-1"><StackedChips amount={bets[t]} /></span>}
                      </button>
                    );
                  })}
                </div>
               </div>
              </div>
            </div>
          </CasinoFrame>

          <Card className="glass p-3 sticky bottom-2 z-20 backdrop-blur">
            <div className="flex items-center gap-3 flex-nowrap overflow-x-auto">
              <div className="text-xs uppercase text-muted-foreground shrink-0">Chip</div>
              <div className="flex items-center gap-2 shrink-0">
                {CHIPS.map((v) => <Chip key={v} value={v} selected={chip === v} onClick={() => setChip(v)} />)}
              </div>
              <div className="ml-auto flex items-center gap-2 shrink-0">
                <div className="text-sm text-muted-foreground whitespace-nowrap">Total: <b className="text-foreground">{fmt(total)}</b> DICE</div>
                <Button variant="outline" size="sm" onClick={undo} disabled={!total || spinning}><RotateCcw className="size-4" /></Button>
                <Button variant="outline" size="sm" onClick={clearBets} disabled={!total || spinning}><Trash2 className="size-4" /></Button>
                <Button onClick={spin} disabled={spinning || !total} className="glow-red">
                  {spinning ? "Spinning…" : "SPIN"}
                </Button>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="live">
          <Card className="glass p-10 text-center">
            <CircleDot className="size-10 mx-auto text-foreground opacity-70" />
            <h3 className="font-display text-xl mt-3">Live shared table — coming soon</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
              We're rolling out a shared live wheel where everyone bets into the same spin. Spin solo for now —
              your wins still land in your wallet.
            </p>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
