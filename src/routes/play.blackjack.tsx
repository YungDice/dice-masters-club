import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Spade, Users, Plus, Play, LogOut } from "lucide-react";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { bjDeal, bjAction } from "@/lib/bj-vp.functions";
import { mbjCreate, mbjJoin, mbjLeave, mbjStart, mbjAction, mbjView } from "@/lib/bj-vp.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWallet } from "@/hooks/use-profile";
import { fmt } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/play/blackjack")({
  head: () => ({
    meta: [
      { title: "Blackjack — DICE" },
      { name: "description", content: "Blackjack on DICE — hit, stand, double, split. Play solo vs the house or live multiplayer tables." },
      { property: "og:title", content: "Blackjack — DICE" },
      { property: "og:description", content: "Solo or live multiplayer blackjack on DICE." },
      { property: "og:url", content: "https://yungdice.com/play/blackjack" },
    ],
    links: [{ rel: "canonical", href: "https://yungdice.com/play/blackjack" }],
  }),
  component: () => <AppShell><BJPage /></AppShell>,
});

type CardT = { r: string; s: string };

function PlayingCard({ r, s, hidden, index }: { r: string; s: string; hidden?: boolean; index: number }) {
  const red = s === "♥" || s === "♦";
  return (
    <motion.div
      initial={{ y: -160, x: 40, opacity: 0, rotateY: 180, rotateZ: -8 }}
      animate={{ y: 0, x: 0, opacity: 1, rotateY: hidden ? 180 : 0, rotateZ: 0 }}
      transition={{ delay: index * 0.12, type: "spring", stiffness: 180, damping: 20 }}
      className="relative w-20 h-28 [perspective:1000px]"
      style={{ filter: "drop-shadow(0 8px 14px rgba(0,0,0,0.55))" }}
    >
      <div className="absolute inset-0 rounded-xl" style={{ transformStyle: "preserve-3d" as any }}>
        {/* Face */}
        <div className="absolute inset-0 rounded-xl [backface-visibility:hidden] overflow-hidden"
          style={{
            background: "linear-gradient(160deg, #ffffff 0%, #f3f4f6 100%)",
            border: "1px solid rgba(0,0,0,0.15)",
            boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.6)",
          }}>
          <div className={`absolute top-1.5 left-2 text-left leading-none font-display font-bold ${red ? "text-red-600" : "text-neutral-900"}`}>
            <div className="text-base">{r}</div>
            <div className="text-base">{s}</div>
          </div>
          <div className={`absolute inset-0 grid place-items-center text-4xl ${red ? "text-red-600" : "text-neutral-900"}`}>{s}</div>
          <div className={`absolute bottom-1.5 right-2 text-right leading-none font-display font-bold rotate-180 ${red ? "text-red-600" : "text-neutral-900"}`}>
            <div className="text-base">{r}</div>
            <div className="text-base">{s}</div>
          </div>
        </div>
        {/* Back */}
        <div className="absolute inset-0 rounded-xl [transform:rotateY(180deg)] [backface-visibility:hidden] grid place-items-center overflow-hidden"
          style={{
            background: "repeating-linear-gradient(45deg, #7f1d1d 0 8px, #991b1b 8px 16px)",
            border: "1px solid rgba(255,255,255,0.2)",
            boxShadow: "inset 0 0 0 3px #fbbf24, inset 0 0 0 4px #7f1d1d",
          }}>
          <Spade className="size-8 text-foreground" />
        </div>
      </div>
    </motion.div>
  );
}

function BJPage() {
  const [tab, setTab] = useState("solo");
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <h1 className="font-display text-3xl font-medium text-center flex items-center justify-center gap-2"><Spade />Blackjack</h1>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mx-auto"><TabsTrigger value="solo">Solo vs House</TabsTrigger><TabsTrigger value="mp">Multiplayer</TabsTrigger></TabsList>
        <TabsContent value="solo"><Solo /></TabsContent>
        <TabsContent value="mp"><Multi /></TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------- Solo (single-player) ----------------
function Solo() {
  const { user } = useAuth();
  const { data: wallet } = useWallet(user?.id);
  const qc = useQueryClient();
  const [bet, setBet] = useState(100);
  const [hand, setHand] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const deal = useServerFn(bjDeal);
  const act = useServerFn(bjAction);

  async function newHand() {
    if (!wallet || wallet.balance < bet) return toast.error("Not enough DICE");
    setBusy(true);
    try { const r = await deal({ data: { bet } }); setHand(r); qc.invalidateQueries({ queryKey: ["wallet"] }); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }
  async function action(a: "hit" | "stand" | "double") {
    if (!hand?.roomId) return;
    setBusy(true);
    try {
      const r = await act({ data: { roomId: hand.roomId, action: a } });
      setHand(r);
      if (r.status === "finished") qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }
  const playing = hand && hand.status === "player_turn";
  const finished = hand && hand.status === "finished";

  return (
    <div className="space-y-4 mt-3">
      <Card className="p-10 felt-bg relative overflow-hidden border-0"
        style={{
          borderRadius: 24,
          boxShadow: "inset 0 0 80px rgba(0,0,0,0.6), 0 0 0 6px #3a1f0a, 0 0 0 8px #c9a84c, 0 24px 60px -10px rgba(0,0,0,0.7)",
        }}>
        {/* Gold arc trim */}
        <div aria-hidden className="absolute inset-x-10 top-6 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)" }} />
        <div aria-hidden className="absolute inset-x-10 bottom-6 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)" }} />
        {/* Stake badge */}
        {hand && (
          <div className="absolute top-4 left-4 text-[10px] tracking-widest uppercase text-muted-foreground font-display">
            Stake · {fmt(hand.bet)} DICE
          </div>
        )}
        <div className="absolute top-4 right-4 text-[10px] tracking-widest uppercase text-muted-foreground font-display">Blackjack pays 3:2</div>

        <div className="space-y-10 relative">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-3 text-center font-display">
              Dealer {hand ? `· ${hand.dealerScore}${playing ? " + ?" : ""}` : ""}
            </div>
            <div className="flex justify-center gap-3 min-h-28">
              <AnimatePresence>
                {(hand?.dealer ?? []).map((c: CardT, i: number) => (
                  <PlayingCard key={`d-${i}-${c.r}${c.s}`} r={c.r} s={c.s} hidden={c.r === "?"} index={i} />
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Center divider with logo */}
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-x-12 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            <div className="relative px-4 py-1 rounded-full bg-black/40 border border-white/10 text-[10px] tracking-[0.4em] uppercase text-muted-foreground font-display">
              Dice · 21
            </div>
          </div>

          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-3 text-center font-display">
              You {hand ? `· ${hand.playerScore}` : ""}
            </div>
            <div className="flex justify-center gap-3 min-h-28">
              <AnimatePresence>
                {(hand?.player ?? []).map((c: CardT, i: number) => (
                  <PlayingCard key={`p-${i}-${c.r}${c.s}`} r={c.r} s={c.s} index={i} />
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {finished && (
          <motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 240, damping: 16 }}
            className={`mt-8 text-center font-display text-4xl tracking-wider ${
              hand.outcome === "win" || hand.outcome === "blackjack" ? "text-emerald-400"
                : hand.outcome === "push" ? "text-muted-foreground" : "text-destructive"}`}
            style={{ textShadow: "0 0 24px currentColor" }}>
            {(hand.outcome ?? "").toUpperCase()} {hand.delta !== 0 && (hand.delta > 0 ? `+${fmt(hand.delta)}` : fmt(hand.delta))} DICE
          </motion.div>
        )}
      </Card>
      <Card className="glass p-5">
        {!hand || finished ? (
          <>
            <div className="flex justify-between text-sm"><span>Bet</span><span className="font-semibold">{fmt(bet)} DICE</span></div>
            <Slider min={10} max={Math.min(2000, Number(wallet?.balance ?? 100))} step={10} value={[bet]} onValueChange={(v) => setBet(v[0])} className="mt-2" />
            <Button onClick={newHand} disabled={busy} className="mt-4 w-full glow-red">{busy ? "Dealing..." : finished ? "Deal again" : "Deal"}</Button>
          </>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <Button onClick={() => action("hit")} disabled={busy} className="glow-red">Hit</Button>
            <Button onClick={() => action("stand")} disabled={busy} variant="outline">Stand</Button>
            <Button onClick={() => action("double")} disabled={busy || !hand?.canDouble || (wallet?.balance ?? 0) < hand?.bet} variant="outline">Double</Button>
          </div>
        )}
        <div className="text-xs text-muted-foreground mt-3">Dealer stands on 17. Blackjack pays 3:2. Double doubles your stake and draws one card.</div>
      </Card>
    </div>
  );
}

// ---------------- Multiplayer ----------------
function Multi() {
  const { user } = useAuth();
  const [roomId, setRoomId] = useState<string | null>(null);
  if (!roomId) return <Lobbies onEnter={setRoomId} />;
  return <Room roomId={roomId} onLeave={() => setRoomId(null)} userId={user?.id ?? null} />;
}

function Lobbies({ onEnter }: { onEnter: (id: string) => void }) {
  const { user } = useAuth();
  const { data: wallet } = useWallet(user?.id);
  const qc = useQueryClient();
  const [bet, setBet] = useState(100);
  const [seats, setSeats] = useState(2);
  const [busy, setBusy] = useState(false);
  const create = useServerFn(mbjCreate);
  const join = useServerFn(mbjJoin);

  const rooms = useQuery({
    queryKey: ["mbj-rooms"],
    queryFn: async () => {
      const { data } = await supabase.from("game_rooms").select("*").eq("kind", "blackjack").eq("is_private", false).eq("status", "waiting").order("created_at", { ascending: false }).limit(30);
      return data ?? [];
    },
    refetchInterval: 4000,
  });

  useEffect(() => {
    const ch = supabase.channel("mbj-rooms-list").on("postgres_changes", { event: "*", schema: "public", table: "game_rooms" }, () => qc.invalidateQueries({ queryKey: ["mbj-rooms"] })).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  async function makeRoom() {
    if (!wallet || wallet.balance < bet) return toast.error("Not enough DICE");
    setBusy(true);
    try { const r = await create({ data: { bet, maxPlayers: seats } }); onEnter(r.roomId); qc.invalidateQueries({ queryKey: ["wallet"] }); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }
  async function joinRoom(id: string, stake: number) {
    if (!wallet || wallet.balance < stake) return toast.error("Not enough DICE");
    setBusy(true);
    try { await join({ data: { roomId: id } }); onEnter(id); qc.invalidateQueries({ queryKey: ["wallet"] }); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4 mt-3">
      <Card className="glass p-5 space-y-3">
        <h2 className="font-display text-lg font-medium flex items-center gap-2"><Plus className="size-4" />Create a table</h2>
        <div className="grid grid-cols-2 gap-3">
          <div><div className="text-xs text-muted-foreground">Bet per seat</div>
            <div className="text-sm font-semibold">{fmt(bet)} DICE</div>
            <Slider min={10} max={Math.min(2000, Number(wallet?.balance ?? 100))} step={10} value={[bet]} onValueChange={(v) => setBet(v[0])} />
          </div>
          <div><div className="text-xs text-muted-foreground">Max seats</div>
            <div className="text-sm font-semibold">{seats} players</div>
            <Slider min={2} max={4} step={1} value={[seats]} onValueChange={(v) => setSeats(v[0])} />
          </div>
        </div>
        <Button onClick={makeRoom} disabled={busy} className="w-full glow-red">{busy ? "..." : `Create — pay ${fmt(bet)} DICE`}</Button>
      </Card>
      <Card className="glass p-5 space-y-2">
        <h2 className="font-display text-lg font-medium flex items-center gap-2"><Users className="size-4" />Open tables</h2>
        {(rooms.data ?? []).length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No tables — create one.</p>}
        {(rooms.data ?? []).map((r: any) => {
          const seatsTaken = (r.state?.seats ?? []).length;
          const mine = r.host_id === user?.id || (r.state?.seats ?? []).some((s: any) => s.userId === user?.id);
          return (
            <div key={r.id} className="rounded-lg border border-border/60 p-3 flex items-center justify-between">
              <div className="text-sm">
                <div className="font-medium">Table · {fmt(r.stake)} DICE</div>
                <div className="text-xs text-muted-foreground">{seatsTaken}/{r.max_players} players</div>
              </div>
              <Button size="sm" onClick={() => mine ? onEnter(r.id) : joinRoom(r.id, r.stake)} disabled={busy || (!mine && seatsTaken >= r.max_players)}>
                {mine ? "Re-enter" : "Join"}
              </Button>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

function Room({ roomId, onLeave, userId }: { roomId: string; onLeave: () => void; userId: string | null }) {
  const qc = useQueryClient();
  const startFn = useServerFn(mbjStart);
  const leaveFn = useServerFn(mbjLeave);
  const actFn = useServerFn(mbjAction);
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["mbj-room", roomId],
    queryFn: async () => {
      const { data } = await supabase.from("game_rooms").select("*").eq("id", roomId).single();
      return data;
    },
    refetchInterval: 1500,
  });

  useEffect(() => {
    const ch = supabase.channel(`mbj-room-${roomId}`).on("postgres_changes", { event: "*", schema: "public", table: "game_rooms", filter: `id=eq.${roomId}` }, () => qc.invalidateQueries({ queryKey: ["mbj-room", roomId] })).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [roomId, qc]);

  const room = q.data;
  if (!room) return <p className="text-sm text-muted-foreground p-6">Loading…</p>;
  const view = mbjView(room.state ?? { phase: "lobby", turn: 0, bet: room.stake, seats: [], dealer: [] });
  const isHost = room.host_id === userId;
  const mySeatIdx = view.seats.findIndex((s: any) => s.userId === userId);
  const isMyTurn = view.phase === "playing" && view.turn === mySeatIdx;
  const mySeat = view.seats[mySeatIdx];

  const [confirmForfeit, setConfirmForfeit] = useState(false);
  async function doStart() { setBusy(true); try { await startFn({ data: { roomId } }); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); } }
  async function doLeave() {
    setBusy(true);
    try {
      const res: any = await leaveFn({ data: { roomId } });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      if (res?.mode === "refunded") toast.success("Left lobby — stake refunded");
      else if (res?.mode === "forfeit") toast("Forfeited — the game continues for other players");
      else if (res?.mode === "forfeit_resolved") toast("Forfeited — round resolved");
      onLeave();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); setConfirmForfeit(false); }
  }
  async function doAct(a: "hit" | "stand" | "double") { setBusy(true); try { await actFn({ data: { roomId, action: a } }); qc.invalidateQueries({ queryKey: ["wallet"] }); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); } }

  return (
    <div className="space-y-4 mt-3">
      <Card className="glass p-6 felt-bg">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-muted-foreground">Table · {fmt(room.stake)} DICE/seat · {view.phase}</div>
          <Button size="sm" variant="outline" onClick={onLeave}>Back to lobbies</Button>
        </div>
        <div className="text-center mb-4">
          <div className="text-xs uppercase text-muted-foreground mb-2">Dealer ({view.dealerScore || "?"})</div>
          <div className="flex justify-center gap-2 min-h-20">
            <AnimatePresence>
              {view.dealer.map((c: any, i: number) => <PlayingCard key={`d-${i}-${c.r}${c.s}`} r={c.r} s={c.s} hidden={c.r === "?"} index={i} />)}
            </AnimatePresence>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {view.seats.map((s: any, i: number) => {
            const active = view.phase === "playing" && view.turn === i;
            const isMe = s.userId === userId;
            return (
              <div key={s.userId} className={`rounded-lg p-3 border ${active ? "border-primary glow-red" : "border-border/60"} ${isMe ? "bg-primary/5" : "bg-black/20"}`}>
                <div className="flex justify-between text-xs">
                  <span>{isMe ? "You" : s.displayName} {s.doubled && "·2x"}</span>
                  <span className="text-muted-foreground">{s.status} · {s.score}</span>
                </div>
                <div className="flex gap-1 mt-2 min-h-20">
                  <AnimatePresence>
                    {s.hand.map((c: any, j: number) => <PlayingCard key={`${s.userId}-${j}-${c.r}${c.s}`} r={c.r} s={c.s} index={j} />)}
                  </AnimatePresence>
                </div>
                {view.phase === "finished" && s.outcome && (
                  <div className={`mt-2 text-sm font-display ${s.outcome === "win" || s.outcome === "blackjack" ? "text-emerald-400" : s.outcome === "push" ? "text-muted-foreground" : "text-destructive"}`}>
                    {s.outcome.toUpperCase()} {s.delta !== 0 && (s.delta > 0 ? `+${fmt(s.delta)}` : fmt(s.delta))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="glass p-5">
        {view.phase === "lobby" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{view.seats.length}/{room.max_players} players. Waiting for more or start now.</p>
            <div className="flex gap-2">
              {isHost && <Button onClick={doStart} disabled={busy || view.seats.length < 1} className="glow-red"><Play className="size-4 mr-1" />Start hand</Button>}
              <Button variant="outline" onClick={doLeave} disabled={busy}><LogOut className="size-4 mr-1" />Leave & refund</Button>
            </div>
          </div>
        )}
        {view.phase === "playing" && mySeat && !mySeat.leftEarly && !mySeat.outcome && (
          <div className="space-y-3">
            {isMyTurn ? (
              <div className="grid grid-cols-3 gap-2">
                <Button onClick={() => doAct("hit")} disabled={busy} className="glow-red">Hit</Button>
                <Button onClick={() => doAct("stand")} disabled={busy} variant="outline">Stand</Button>
                <Button onClick={() => doAct("double")} disabled={busy || !mySeat || mySeat.hand.length !== 2 || mySeat.doubled} variant="outline">Double</Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center">Waiting for <b>{view.seats[view.turn]?.displayName ?? "..."}</b> to act…</p>
            )}
            {!confirmForfeit ? (
              <Button variant="ghost" size="sm" onClick={() => setConfirmForfeit(true)} disabled={busy} className="w-full text-muted-foreground">
                <LogOut className="size-4 mr-1" />Forfeit hand
              </Button>
            ) : (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 space-y-2">
                <p className="text-xs">Forfeit forfeits your stake and lets the other players finish the round. Continue?</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" onClick={doLeave} disabled={busy}>Yes, forfeit</Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmForfeit(false)} disabled={busy}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        )}
        {view.phase === "playing" && mySeat && (mySeat.leftEarly || mySeat.outcome) && (
          <p className="text-sm text-muted-foreground text-center">You forfeited. Waiting for the round to finish…</p>
        )}
        {view.phase === "finished" && (
          <Button onClick={onLeave} className="w-full">Back to lobbies</Button>
        )}
      </Card>
    </div>
  );
}
