import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ArrowLeftRight, Check, X, Clock, Sparkles, Coins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/dice/TopNav";
import { PageHeader } from "@/components/dice/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EmptyState } from "@/components/dice/EmptyState";
import { DiceBadge } from "@/components/dice/DiceBadge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { fmt } from "@/lib/format";
import { toast } from "sonner";
import { createTrade, respondTrade, cancelTrade } from "@/lib/trade.functions";

export const Route = createFileRoute("/trades")({
  head: () => ({
    meta: [
      { title: "Trades — DICE" },
      { name: "description", content: "Secure Baddie and DICE trades between friends." },
    ],
  }),
  component: () => <AppShell><TradesPage /></AppShell>,
});

const RARITY_STYLE: Record<string, string> = {
  common: "border-zinc-400/30 text-zinc-200",
  uncommon: "border-emerald-400/40 text-emerald-200",
  rare: "border-sky-400/40 text-sky-200",
  epic: "border-fuchsia-400/40 text-fuchsia-200",
  legendary: "border-amber-300/60 text-amber-200",
  unreal: "border-cyan-300/60 text-cyan-100",
  elias: "border-amber-200 text-amber-50",
};

function TradesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"incoming" | "sent" | "history">("incoming");
  const [newOpen, setNewOpen] = useState(false);

  const trades = useQuery({
    queryKey: ["trades", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trades" as any)
        .select("*")
        .or(`from_user.eq.${user!.id},to_user.eq.${user!.id}`)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const otherIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of trades.data ?? []) {
      ids.add(t.from_user === user?.id ? t.to_user : t.from_user);
    }
    return Array.from(ids);
  }, [trades.data, user?.id]);

  const profs = useQuery({
    queryKey: ["trade-profiles", otherIds.join(",")],
    enabled: otherIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,username,display_name,avatar_url")
        .in("id", otherIds);
      return Object.fromEntries((data ?? []).map((p: any) => [p.id, p]));
    },
  });

  const baddieIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of trades.data ?? []) {
      for (const id of t.from_baddies ?? []) ids.add(id);
      for (const id of t.to_baddies ?? []) ids.add(id);
    }
    return Array.from(ids);
  }, [trades.data]);

  const baddies = useQuery({
    queryKey: ["trade-baddies", baddieIds.join(",")],
    enabled: baddieIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_baddies" as any)
        .select("id, template:baddie_templates(id,name,rarity,image_url,income_per_hour)")
        .in("id", baddieIds);
      return Object.fromEntries((data ?? []).map((b: any) => [b.id, b]));
    },
  });

  const respondFn = useServerFn(respondTrade);
  const cancelFn = useServerFn(cancelTrade);

  async function onRespond(id: string, accept: boolean) {
    try {
      const res: any = await respondFn({ data: { tradeId: id, accept } });
      if (res?.reason === "expired") toast.error("Trade expired");
      else toast.success(accept ? "Trade accepted!" : "Trade declined");
      qc.invalidateQueries({ queryKey: ["trades"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["my-baddies"] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  }
  async function onCancel(id: string) {
    try {
      await cancelFn({ data: { tradeId: id } });
      toast.success("Trade cancelled");
      qc.invalidateQueries({ queryKey: ["trades"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["my-baddies"] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  }

  const rows = trades.data ?? [];
  const incoming = rows.filter((t) => t.to_user === user?.id && t.status === "pending");
  const sent = rows.filter((t) => t.from_user === user?.id && t.status === "pending");
  const history = rows.filter((t) => t.status !== "pending");

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ArrowLeftRight}
        title="Trades"
        subtitle="Trade Baddies and DICE with your friends. Offers auto-expire after 24 hours."
        actions={
          <Button onClick={() => setNewOpen(true)} className="glow-red">
            <ArrowLeftRight className="size-4 mr-1" /> New Trade
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid grid-cols-3 max-w-md">
          <TabsTrigger value="incoming">
            Incoming{incoming.length > 0 ? ` (${incoming.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="sent">
            Sent{sent.length > 0 ? ` (${sent.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="incoming" className="mt-4 space-y-3">
          {incoming.length === 0 ? (
            <EmptyState icon={ArrowLeftRight} title="No incoming offers" description="When friends send you trade offers, they appear here." />
          ) : incoming.map((t) => (
            <TradeCard
              key={t.id} trade={t} me={user!.id}
              otherProfile={profs.data?.[t.from_user]}
              baddieMap={baddies.data ?? {}}
              onAccept={() => onRespond(t.id, true)}
              onDecline={() => onRespond(t.id, false)}
            />
          ))}
        </TabsContent>

        <TabsContent value="sent" className="mt-4 space-y-3">
          {sent.length === 0 ? (
            <EmptyState icon={ArrowLeftRight} title="No sent offers" description="Send a trade offer to a friend to see it here." />
          ) : sent.map((t) => (
            <TradeCard
              key={t.id} trade={t} me={user!.id}
              otherProfile={profs.data?.[t.to_user]}
              baddieMap={baddies.data ?? {}}
              onCancel={() => onCancel(t.id)}
            />
          ))}
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-3">
          {history.length === 0 ? (
            <EmptyState icon={Clock} title="No past trades" description="Completed, declined, cancelled, and expired trades appear here." />
          ) : history.map((t) => (
            <TradeCard
              key={t.id} trade={t} me={user!.id}
              otherProfile={profs.data?.[t.from_user === user!.id ? t.to_user : t.from_user]}
              baddieMap={baddies.data ?? {}}
            />
          ))}
        </TabsContent>
      </Tabs>

      <NewTradeDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}

function TradeCard({
  trade, me, otherProfile, baddieMap, onAccept, onDecline, onCancel,
}: {
  trade: any; me: string; otherProfile: any; baddieMap: Record<string, any>;
  onAccept?: () => void; onDecline?: () => void; onCancel?: () => void;
}) {
  const iAmSender = trade.from_user === me;
  const myBaddies = (iAmSender ? trade.from_baddies : trade.to_baddies) ?? [];
  const theirBaddies = (iAmSender ? trade.to_baddies : trade.from_baddies) ?? [];
  const myDice = iAmSender ? trade.from_dice : trade.to_dice;
  const theirDice = iAmSender ? trade.to_dice : trade.from_dice;
  const statusColor: Record<string, string> = {
    pending: "text-amber-300",
    completed: "text-emerald-300",
    declined: "text-rose-300",
    cancelled: "text-zinc-400",
    expired: "text-zinc-400",
  };

  return (
    <Card className="glass p-4">
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar className="size-9">
            <AvatarImage src={otherProfile?.avatar_url ?? undefined} />
            <AvatarFallback>{(otherProfile?.display_name ?? "?")[0]}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">
              {iAmSender ? "To " : "From "}
              {otherProfile ? (
                <Link to="/u/$username" params={{ username: otherProfile.username }} className="hover:underline">
                  {otherProfile.display_name ?? otherProfile.username}
                </Link>
              ) : "…"}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {new Date(trade.created_at).toLocaleString()}
            </div>
          </div>
        </div>
        <div className={`text-xs font-bold uppercase tracking-wide ${statusColor[trade.status] ?? "text-muted-foreground"}`}>
          {trade.status}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <TradeSide label="You offer" baddieIds={myBaddies} dice={myDice} baddieMap={baddieMap} />
        <TradeSide label="You receive" baddieIds={theirBaddies} dice={theirDice} baddieMap={baddieMap} />
      </div>

      {trade.note && <div className="mt-3 text-xs text-muted-foreground italic">"{trade.note}"</div>}

      {(onAccept || onDecline || onCancel) && (
        <div className="flex gap-2 mt-3 flex-wrap">
          {onAccept && <Button size="sm" onClick={onAccept} className="glow-red"><Check className="size-4 mr-1" />Accept</Button>}
          {onDecline && <Button size="sm" variant="outline" onClick={onDecline}><X className="size-4 mr-1" />Decline</Button>}
          {onCancel && <Button size="sm" variant="outline" onClick={onCancel}><X className="size-4 mr-1" />Cancel offer</Button>}
        </div>
      )}
    </Card>
  );
}

function TradeSide({
  label, baddieIds, dice, baddieMap,
}: {
  label: string; baddieIds: string[]; dice: number; baddieMap: Record<string, any>;
}) {
  const empty = baddieIds.length === 0 && !dice;
  return (
    <div className="rounded-lg border border-border/60 bg-white/5 p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{label}</div>
      {empty ? <div className="text-xs text-muted-foreground">Nothing</div> : (
        <div className="space-y-1.5">
          {baddieIds.map((id) => {
            const b = baddieMap[id];
            const t = b?.template;
            if (!t) return <div key={id} className="text-xs text-muted-foreground">· Baddie</div>;
            return (
              <div key={id} className={`flex items-center gap-2 text-xs border rounded px-2 py-1 ${RARITY_STYLE[t.rarity] ?? RARITY_STYLE.common}`}>
                {t.image_url && <img src={t.image_url} alt="" className="size-6 rounded object-cover" />}
                <span className="font-semibold truncate">{t.name}</span>
                <span className="capitalize opacity-70">· {t.rarity}</span>
              </div>
            );
          })}
          {dice > 0 && (
            <div className="flex items-center gap-1 text-xs font-semibold text-amber-300">
              <Coins className="size-3.5" /> {fmt(dice)} DICE
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NewTradeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const createFn = useServerFn(createTrade);
  const [step, setStep] = useState<"friend" | "compose">("friend");
  const [friend, setFriend] = useState<any>(null);
  const [myPicked, setMyPicked] = useState<Record<string, boolean>>({});
  const [theirPicked, setTheirPicked] = useState<Record<string, boolean>>({});
  const [myDice, setMyDice] = useState<number>(0);
  const [theirDice, setTheirDice] = useState<number>(0);
  const [note, setNote] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const friends = useQuery({
    queryKey: ["trade-friends", user?.id],
    enabled: !!user?.id && open,
    queryFn: async () => {
      const { data } = await supabase.from("friendships").select("*")
        .or(`requester_id.eq.${user!.id},addressee_id.eq.${user!.id}`).eq("status", "accepted");
      const ids = (data ?? []).map((f: any) => f.requester_id === user!.id ? f.addressee_id : f.requester_id);
      if (ids.length === 0) return [];
      const { data: profs } = await supabase.from("profiles")
        .select("id,username,display_name,avatar_url").in("id", ids);
      return profs ?? [];
    },
  });

  const myBaddies = useQuery({
    queryKey: ["my-baddies-trade", user?.id],
    enabled: !!user?.id && open,
    queryFn: async () => {
      const { data } = await supabase.from("user_baddies" as any)
        .select("*, template:baddie_templates(*)")
        .eq("user_id", user!.id)
        .is("listing_id", null)
        .is("trade_id", null);
      return (data ?? []) as any[];
    },
  });

  const theirBaddies = useQuery({
    queryKey: ["their-baddies-trade", friend?.id],
    enabled: !!friend?.id,
    queryFn: async () => {
      const { data } = await supabase.from("user_baddies" as any)
        .select("*, template:baddie_templates(*)")
        .eq("user_id", friend.id)
        .is("listing_id", null)
        .is("trade_id", null);
      return (data ?? []) as any[];
    },
  });

  function reset() {
    setStep("friend"); setFriend(null); setMyPicked({}); setTheirPicked({});
    setMyDice(0); setTheirDice(0); setNote("");
  }
  function close() { onOpenChange(false); setTimeout(reset, 200); }

  async function submit() {
    if (!friend) return;
    const fromBaddies = Object.keys(myPicked).filter((k) => myPicked[k]);
    const toBaddies = Object.keys(theirPicked).filter((k) => theirPicked[k]);
    if (fromBaddies.length === 0 && toBaddies.length === 0 && !myDice && !theirDice) {
      toast.error("Add at least one baddie or DICE amount");
      return;
    }
    setSubmitting(true);
    try {
      await createFn({ data: {
        toUser: friend.id,
        fromBaddies, toBaddies,
        fromDice: myDice || 0,
        toDice: theirDice || 0,
        note: note || undefined,
      }});
      toast.success("Trade offer sent!");
      qc.invalidateQueries({ queryKey: ["trades"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["my-baddies"] });
      close();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create trade");
    } finally { setSubmitting(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => o ? onOpenChange(true) : close()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{step === "friend" ? "Choose a friend" : `Trade with ${friend?.display_name ?? friend?.username}`}</DialogTitle>
          <DialogDescription>
            Trades are irreversible once accepted. Offered items and DICE are locked until the trade resolves.
          </DialogDescription>
        </DialogHeader>

        {step === "friend" ? (
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {(friends.data ?? []).length === 0 ? (
              <EmptyState icon={ArrowLeftRight} title="No friends yet" description="Add friends to start trading." />
            ) : (friends.data ?? []).map((f: any) => (
              <button
                key={f.id}
                onClick={() => { setFriend(f); setStep("compose"); }}
                className="w-full flex items-center gap-3 p-2 rounded-lg border border-border/60 bg-white/5 hover:border-primary/40 text-left"
              >
                <Avatar className="size-9">
                  <AvatarImage src={f.avatar_url ?? undefined} />
                  <AvatarFallback>{(f.display_name ?? "?")[0]}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-sm font-semibold">{f.display_name ?? f.username}</div>
                  <div className="text-[11px] text-muted-foreground">@{f.username}</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <BaddiePicker label="You offer" list={myBaddies.data ?? []} picked={myPicked} setPicked={setMyPicked} />
              <BaddiePicker label="You want" list={theirBaddies.data ?? []} picked={theirPicked} setPicked={setTheirPicked} />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">You pay (DICE)</label>
                <Input type="number" min={0} value={myDice} onChange={(e) => setMyDice(Math.max(0, +e.target.value || 0))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">You request (DICE)</label>
                <Input type="number" min={0} value={theirDice} onChange={(e) => setTheirDice(Math.max(0, +e.target.value || 0))} />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Message (optional)</label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} placeholder="Add a short note…" rows={2} />
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "compose" && (
            <Button variant="ghost" onClick={() => setStep("friend")}>Back</Button>
          )}
          <Button variant="outline" onClick={close}>Cancel</Button>
          {step === "compose" && (
            <Button onClick={submit} disabled={submitting} className="glow-red">
              {submitting ? "Sending…" : "Send trade offer"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BaddiePicker({
  label, list, picked, setPicked,
}: {
  label: string; list: any[]; picked: Record<string, boolean>;
  setPicked: (v: Record<string, boolean>) => void;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-white/5 p-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{label}</div>
      {list.length === 0 ? (
        <div className="text-xs text-muted-foreground p-2">No available baddies</div>
      ) : (
        <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
          {list.map((b) => {
            const t = b.template;
            const on = !!picked[b.id];
            return (
              <label key={b.id} className={`flex items-center gap-2 p-1.5 rounded border cursor-pointer text-xs ${on ? "border-primary bg-primary/10" : "border-border/60 bg-white/5"}`}>
                <Checkbox checked={on} onCheckedChange={(v) => setPicked({ ...picked, [b.id]: !!v })} />
                {t?.image_url && <img src={t.image_url} alt="" className="size-7 rounded object-cover" />}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{t?.name ?? "Baddie"}</div>
                  <div className="text-[10px] capitalize opacity-70">{t?.rarity} · {t?.income_per_hour}/h</div>
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
