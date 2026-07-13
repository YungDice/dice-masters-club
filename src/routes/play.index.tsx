import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Dices, Coins, Spade, Cherry, HandHelping, Layers, CircleDot, Gamepad2, Users, User, Bird, Mountain, Swords, Target, Rocket } from "lucide-react";
import { AppShell } from "@/components/dice/TopNav";

type Mode = "solo" | "pvp" | "both";
type Game = { to: string; title: string; icon: any; desc: string; modes: Mode; minBet: number };

const games: Game[] = [
  { to: "/play/roulette",    title: "Roulette",       icon: CircleDot,   desc: "American 0/00 wheel. Place chips, spin, settle.", modes: "solo", minBet: 10 },
  { to: "/play/dice",        title: "Dice",           icon: Dices,       desc: "Roll two dice. Solo vs house or live PvP.",        modes: "both", minBet: 10 },
  { to: "/play/coinflip",    title: "Coin Flip",      icon: Coins,       desc: "Heads or tails. Solo vs bot or PvP escrow.",        modes: "both", minBet: 10 },
  { to: "/play/blackjack",   title: "Blackjack",      icon: Spade,       desc: "Hit, stand, double. Solo or live multiplayer.",     modes: "both", minBet: 25 },
  { to: "/play/slots",       title: "Slots",          icon: Cherry,      desc: "Spin the reels. Daily free spin.",                  modes: "solo", minBet: 5  },
  { to: "/play/split-steal", title: "Split or Steal", icon: HandHelping, desc: "Trust game. Both stake. Both choose.",              modes: "both", minBet: 50 },
  { to: "/play/poker",       title: "Video Poker",    icon: Layers,      desc: "Jacks or Better. Hold cards, draw the rest.",       modes: "solo", minBet: 10 },
  { to: "/play/flappy",      title: "Flappy DICE",    icon: Bird,        desc: "Tap to flap. +50 DICE per gate cleared.",          modes: "solo", minBet: 0  },
  { to: "/play/obby",        title: "DICE Obby",      icon: Mountain,    desc: "Run, jump, dodge. +150 DICE per level.",           modes: "solo", minBet: 0  },
  { to: "/play/dice-dominion", title: "DICE Dominion", icon: Swords,     desc: "Build your district, command your crew, and conquer the board.", modes: "pvp",  minBet: 0 },
  { to: "/play/numguess",    title: "Number Guess",   icon: Target,      desc: "Pick a mode, guess the number, win up to 100x.",    modes: "solo", minBet: 1  },
  { to: "/play/rocket",      title: "Rocket",         icon: Rocket,      desc: "Pick a target multiplier. Cash out before it crashes.", modes: "solo", minBet: 1 },
  { to: "/play/wheel",       title: "Wheel of Fortune", icon: CircleDot, desc: "Spin the wheel to multiply your DICE up to 10x.",  modes: "solo", minBet: 1 },
];



function GameTile({ g }: { g: Game }) {
  return (
    <Link to={g.to as any} className="group block">
      <div
        className="relative h-full rounded-2xl p-5 overflow-hidden transition-transform group-hover:-translate-y-0.5"
        style={{
          background: "radial-gradient(ellipse at top, #0b4d3a 0%, #073023 60%, #04201a 100%)",
          border: "1.5px solid #c9a84c",
          boxShadow: "inset 0 0 40px rgba(0,0,0,0.55), 0 8px 24px -10px rgba(0,0,0,0.6)",
        }}
      >
        <div className="pointer-events-none absolute inset-1 rounded-xl" style={{ border: "1px solid rgba(201,168,76,0.3)" }} />
        <div className="relative flex items-start justify-between gap-2">
          <div className="grid size-12 place-items-center rounded-xl bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/30 group-hover:scale-110 transition">
            <g.icon className="size-6" />
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-[10px] uppercase tracking-widest text-amber-200/70">Min bet</span>
            <span className="text-sm font-bold text-amber-100">{g.minBet} DICE</span>
          </div>
        </div>
        <h3 className="relative mt-4 font-display text-lg font-bold text-amber-50">{g.title}</h3>
        <p className="relative text-xs text-amber-100/60 mt-1 line-clamp-2">{g.desc}</p>
        <div className="relative mt-3 flex gap-1.5">
          {(g.modes === "solo" || g.modes === "both") && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-amber-100/80 ring-1 ring-white/10">
              <User className="size-3" /> Solo
            </span>
          )}
          {(g.modes === "pvp" || g.modes === "both") && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-amber-100/80 ring-1 ring-white/10">
              <Users className="size-3" /> PvP
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function PlayHub() {
  const [filter, setFilter] = useState<"all" | "solo" | "pvp">("all");
  const visible = games.filter((g) =>
    filter === "all" ? true : filter === "solo" ? (g.modes === "solo" || g.modes === "both") : (g.modes === "pvp" || g.modes === "both"),
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <Gamepad2 className="text-amber-400" /> Play
          </h1>
          <p className="text-sm text-muted-foreground">All games are virtual-currency only. Stakes use DICE — never real money.</p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-white/[0.04] p-1 ring-1 ring-white/5">
          {([
            { k: "all", l: "All" },
            { k: "solo", l: "Solo" },
            { k: "pvp", l: "PvP" },
          ] as const).map((c) => (
            <button
              key={c.k}
              onClick={() => setFilter(c.k)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                filter === c.k ? "bg-amber-400/20 text-amber-100 ring-1 ring-amber-400/40" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {c.l}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((g) => <GameTile key={g.to} g={g} />)}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/play/")({
  head: () => ({
    meta: [
      { title: "Play — DICE Game Lobby" },
      { name: "description", content: "DICE game lobby: blackjack, roulette, dice, coin flip, slots, split-or-steal, poker, rocket, wheel of fortune — all virtual-currency, 18+." },
      { property: "og:title", content: "Play — DICE Game Lobby" },
      { property: "og:description", content: "Solo and PvP games on DICE, all using virtual DICE currency. 18+ only." },
      { property: "og:url", content: "https://yungdice.com/play" },
    ],
    links: [{ rel: "canonical", href: "https://yungdice.com/play" }],
  }),
  component: () => <AppShell><PlayHub /></AppShell>,
});
