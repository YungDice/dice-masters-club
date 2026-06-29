import { createFileRoute, Link } from "@tanstack/react-router";
import { Dices, Coins, Spade, Cherry, HandHelping, Layers, CircleDot } from "lucide-react";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";

const games = [
  { to: "/play/roulette", title: "Roulette", icon: CircleDot, desc: "American 0/00 wheel. Place chips, spin, settle." },
  { to: "/play/dice", title: "Dice", icon: Dices, desc: "Roll two dice. Solo vs house or live PvP." },
  { to: "/play/coinflip", title: "Coin Flip", icon: Coins, desc: "Heads or tails. Equal-stake PvP escrow." },
  { to: "/play/blackjack", title: "Blackjack", icon: Spade, desc: "Single-player vs dealer." },
  { to: "/play/slots", title: "Slots", icon: Cherry, desc: "Spin the reels. Daily free spin." },
  { to: "/play/split-steal", title: "Split or Steal", icon: HandHelping, desc: "Trust game. Both stake. Both choose." },
  { to: "/play/poker", title: "Video Poker", icon: Layers, desc: "Jacks or Better. Hold the cards you want, draw the rest." },
];

export const Route = createFileRoute("/play/")({
  head: () => ({ meta: [{ title: "Play — DICE" }, { name: "description", content: "Game lobby. Dice, coin flip, blackjack, slots, split-or-steal, poker rooms." }] }),
  component: () => (
    <AppShell>
      <div className="space-y-4">
        <div><h1 className="font-display text-3xl font-bold">Play</h1><p className="text-sm text-muted-foreground">All games are virtual-currency only. Stakes use DICE — never real money.</p></div>
        <div className="grid gap-4 md:grid-cols-3">
          {games.map((g) => (
            <Link key={g.to} to={g.to as any}>
              <Card className="glass p-6 hover:border-primary/40 transition group">
                <div className="grid size-12 place-items-center rounded-md bg-primary/15 text-primary group-hover:scale-110 transition"><g.icon className="size-6" /></div>
                <h3 className="mt-3 font-display text-lg font-semibold">{g.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{g.desc}</p>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  ),
});
