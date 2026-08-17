import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Dices, Coins, ChevronRight, RotateCcw, Target, Sparkles } from "lucide-react";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CasinoFrame } from "@/components/dice/casino/CasinoFrame";
import { useAuth } from "@/hooks/use-auth";
import { useWallet } from "@/hooks/use-profile";
import { fmt } from "@/lib/format";
import {
  guess10Start,
  guess10Attempt,
  guessOneShot,
} from "@/lib/numguess.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/play/numguess")({
  head: () => ({
    meta: [
      { title: "Number Guess — DICE" },
      { name: "description", content: "Pick a mode, place a bet, and guess the hidden number on DICE for up to 100x payouts." },
      { property: "og:title", content: "Number Guess — DICE" },
      { property: "og:description", content: "Guess the hidden number — up to 100x payouts." },
      { property: "og:url", content: "https://yungdice.com/play/numguess" },
    ],
    links: [{ rel: "canonical", href: "https://yungdice.com/play/numguess" }],
  }),
  component: () => <AppShell><NumberGuess /></AppShell>,
});

const MAX_BET_10 = 2000;

function NumberGuess() {
  const [mode, setMode] = useState<"10" | "100" | "1000">("10");
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <CasinoFrame
        title="Number Guess"
        subtitle="Pick a mode · guess the number · win up to 100x"
        icon={<Target className="size-6 text-foreground" />}
      >
        <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
          <TabsList className="grid w-full grid-cols-3 h-11 bg-black/40 border border-white/10">
            <TabsTrigger value="10">1 – 10</TabsTrigger>
            <TabsTrigger value="100">1 – 100</TabsTrigger>
            <TabsTrigger value="1000">1 – 1000</TabsTrigger>
          </TabsList>
          <TabsContent value="10" className="mt-4"><Mode10 /></TabsContent>
          <TabsContent value="100" className="mt-4"><ModeOneShot mode="100" /></TabsContent>
          <TabsContent value="1000" className="mt-4"><ModeOneShot mode="1000" /></TabsContent>
        </Tabs>
      </CasinoFrame>
    </div>
  );
}

function BalancePill() {
  const { user } = useAuth();
  const { data: wallet } = useWallet(user?.id);
  return (
    <div className="flex items-center gap-1.5 text-foreground text-sm font-mono">
      <Coins className="size-4" /> {fmt(wallet?.balance ?? 0)} DICE
    </div>
  );
}

// ---------------- 1-10 ----------------
function Mode10() {
  const { user } = useAuth();
  const { data: wallet } = useWallet(user?.id);
  const qc = useQueryClient();
  const start = useServerFn(guess10Start);
  const attempt = useServerFn(guess10Attempt);

  const [bet, setBet] = useState(100);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [guess, setGuess] = useState<number | "">("");
  const [tried, setTried] = useState<number[]>([]);
  const [remaining, setRemaining] = useState(3);
  const [result, setResult] = useState<{
    finished: boolean;
    won: boolean;
    payout: number;
    secret: number | null;
    attempts: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const balance = wallet?.balance ?? 0;
  const canStart = bet > 0 && bet <= MAX_BET_10 && bet <= balance;

  async function onStart() {
    if (!canStart) return;
    setBusy(true);
    try {
      const r = await start({ data: { bet } });
      setRoomId(r.roomId);
      setTried([]);
      setRemaining(3);
      setResult(null);
      setGuess("");
      qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  }

  async function onGuess() {
    if (!roomId) return;
    if (typeof guess !== "number" || guess < 1 || guess > 10) {
      toast.error("Enter a number between 1 and 10");
      return;
    }
    setBusy(true);
    try {
      const r = await attempt({ data: { roomId, guess } });
      setTried((t) => [...t, guess as number]);
      setRemaining(r.remaining);
      setGuess("");
      if (r.finished) {
        setResult({
          finished: true, won: r.correct, payout: r.payout,
          secret: r.secret, attempts: r.attemptsUsed,
        });
        setRoomId(null);
        qc.invalidateQueries({ queryKey: ["wallet"] });
        if (r.correct) toast.success(`Correct! +${fmt(r.payout)} DICE`);
        else toast.error(`Out of guesses — number was ${r.secret}`);
      } else {
        toast.message(`Not it — ${r.remaining} guesses left`);
      }
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  const active = !!roomId;

  return (
    <Card className="glass p-5 space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">1 – 10 mode · up to 3 guesses</span>
        <BalancePill />
      </div>

      {!active && !result && (
        <>
          <BetInput bet={bet} setBet={setBet} max={Math.min(MAX_BET_10, balance)} disabled={busy} />
          <PayoutPreview bet={bet} lines={[
            { label: "1st guess", mult: 3 },
            { label: "2nd guess", mult: 2 },
            { label: "3rd guess", mult: 1 },
          ]} />
          <Button onClick={onStart} disabled={!canStart || busy} className="w-full glow-red h-11">
            Start · {fmt(bet)} DICE <ChevronRight className="size-4 ml-1" />
          </Button>
          {bet > MAX_BET_10 && <p className="text-xs text-destructive">Max bet in this mode is {MAX_BET_10} DICE.</p>}
        </>
      )}

      {active && (
        <>
          <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-center">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Guesses left</div>
            <div className="font-display text-4xl text-foreground">{remaining}</div>
            {tried.length > 0 && (
              <div className="text-xs text-muted-foreground mt-2">
                Tried: <span className="font-mono">{tried.join(", ")}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              type="number" min={1} max={10}
              placeholder="Pick 1 – 10"
              value={guess}
              onChange={(e) => setGuess(e.target.value === "" ? "" : Number(e.target.value))}
              disabled={busy}
              onKeyDown={(e) => e.key === "Enter" && onGuess()}
            />
            <Button onClick={onGuess} disabled={busy} className="glow-red">Guess</Button>
          </div>
        </>
      )}

      {result && !active && <ResultBanner result={result} onReset={() => setResult(null)} />}
    </Card>
  );
}

// ---------------- 1-100 / 1-1000 ----------------
function ModeOneShot({ mode }: { mode: "100" | "1000" }) {
  const { user } = useAuth();
  const { data: wallet } = useWallet(user?.id);
  const qc = useQueryClient();
  const play = useServerFn(guessOneShot);

  const maxN = mode === "100" ? 100 : 1000;
  const singleMult = mode === "100" ? 10 : 100;
  const rangeSizes: number[] = mode === "100" ? [25, 10, 5] : [250, 100, 25, 1];
  const rangePay: Record<number, number> = mode === "100"
    ? { 25: 2, 10: 3, 5: 5 }
    : { 250: 2, 100: 3, 25: 5, 1: 100 };

  const [bet, setBet] = useState(mode === "100" ? 100 : 100);
  const [style, setStyle] = useState<"single" | "range">("single");
  const [single, setSingle] = useState<number | "">("");
  const [rangeSize, setRangeSize] = useState<number>(rangeSizes[0]);
  const [rangeStart, setRangeStart] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    finished: boolean; won: boolean; payout: number; secret: number | null; attempts: number;
  } | null>(null);

  const balance = wallet?.balance ?? 0;
  const rangeEnd = typeof rangeStart === "number" ? rangeStart + rangeSize - 1 : null;

  const previewMult = useMemo(() => {
    if (style === "single") return singleMult;
    return rangePay[rangeSize];
  }, [style, singleMult, rangePay, rangeSize]);

  const canPlay =
    bet > 0 && bet <= balance &&
    (style === "single"
      ? typeof single === "number" && single >= 1 && single <= maxN
      : typeof rangeStart === "number" && rangeStart >= 1 && (rangeStart + rangeSize - 1) <= maxN);

  async function onPlay() {
    if (!canPlay) return;
    setBusy(true);
    try {
      const choice = style === "single"
        ? { kind: "single" as const, value: single as number }
        : { kind: "range" as const, start: rangeStart as number, end: (rangeStart as number) + rangeSize - 1 };
      const r = await play({ data: { mode, bet, choice } });
      setResult({
        finished: true, won: r.won, payout: r.payout,
        secret: r.secret, attempts: 1,
      });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      if (r.won) toast.success(`+${fmt(r.payout)} DICE (${r.multiplier}x)`);
      else toast.error(`Number was ${r.secret}`);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <Card className="glass p-5 space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">1 – {maxN} mode</span>
        <BalancePill />
      </div>

      <BetInput bet={bet} setBet={setBet} max={balance} disabled={busy} />

      <Tabs value={style} onValueChange={(v) => setStyle(v as any)}>
        <TabsList className="grid w-full grid-cols-2 h-10">
          <TabsTrigger value="single">Single number ({singleMult}x)</TabsTrigger>
          <TabsTrigger value="range">Range</TabsTrigger>
        </TabsList>

        <TabsContent value="single" className="mt-3">
          <Input
            type="number" min={1} max={maxN}
            placeholder={`Pick 1 – ${maxN}`}
            value={single}
            onChange={(e) => setSingle(e.target.value === "" ? "" : Number(e.target.value))}
            disabled={busy}
          />
        </TabsContent>

        <TabsContent value="range" className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {rangeSizes.map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => setRangeSize(sz)}
                disabled={busy}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition ${
                  rangeSize === sz
                    ? "bg-white/5 border-white/10 text-foreground"
                    : "border-white/10 text-muted-foreground hover:text-foreground"
                }`}
              >
                {sz} numbers · {rangePay[sz]}x
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number" min={1} max={maxN - rangeSize + 1}
              placeholder="Start"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value === "" ? "" : Number(e.target.value))}
              disabled={busy}
            />
            <span className="text-muted-foreground">–</span>
            <Input value={rangeEnd ?? ""} readOnly placeholder="End" />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Pick a start number; the range auto-extends by {rangeSize - 1}.
          </p>
        </TabsContent>
      </Tabs>

      <PayoutPreview bet={bet} lines={[{ label: "If you win", mult: previewMult }]} />

      <Button onClick={onPlay} disabled={!canPlay || busy} className="w-full glow-red h-11">
        {busy ? "Rolling…" : `Play · ${fmt(bet)} DICE`}
      </Button>

      {result && <ResultBanner result={result} onReset={() => setResult(null)} />}
    </Card>
  );
}

// ---------------- shared bits ----------------
function BetInput({
  bet, setBet, max, disabled,
}: { bet: number; setBet: (n: number) => void; max: number; disabled?: boolean }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold uppercase tracking-widest text-muted-foreground">Bet</span>
        <span className="text-muted-foreground">Balance {fmt(max)}</span>
      </div>
      <div className="flex gap-2">
        <Input
          type="number" min={1}
          value={bet}
          onChange={(e) => setBet(Math.max(0, Number(e.target.value) || 0))}
          disabled={disabled}
        />
        {[50, 100, 500, 1000].map((v) => (
          <Button
            key={v}
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || v > max}
            onClick={() => setBet(v)}
          >
            {v}
          </Button>
        ))}
      </div>
    </div>
  );
}

function PayoutPreview({ bet, lines }: { bet: number; lines: { label: string; mult: number }[] }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/30 p-3 space-y-1.5">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
        <Sparkles className="size-3" /> Payout preview
      </div>
      {lines.map((l) => (
        <div key={l.label} className="flex justify-between text-sm">
          <span className="text-muted-foreground">{l.label} ({l.mult}x)</span>
          <span className="font-mono text-foreground">{fmt(bet * l.mult)} DICE</span>
        </div>
      ))}
    </div>
  );
}

function ResultBanner({
  result, onReset,
}: {
  result: { finished: boolean; won: boolean; payout: number; secret: number | null; attempts: number };
  onReset: () => void;
}) {
  return (
    <div
      className={`rounded-lg border p-4 text-center ${
        result.won ? "border-emerald-400/40 bg-emerald-400/10" : "border-white/10 bg-white/5"
      }`}
    >
      <div className="font-display text-lg font-medium">
        {result.won ? `You won +${fmt(result.payout)} DICE!` : "No win this round"}
      </div>
      <div className="text-sm text-muted-foreground mt-1">
        Correct number was <span className="font-mono text-foreground">{result.secret}</span>
        {result.attempts > 1 && ` · ${result.attempts} attempts`}
      </div>
      <Button onClick={onReset} variant="outline" size="sm" className="mt-3">
        <RotateCcw className="size-3 mr-1" /> Play again
      </Button>
    </div>
  );
}
