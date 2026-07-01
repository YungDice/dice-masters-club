import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Check, Lock, Send, Users, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/dice/TopNav";
import { PageHeader } from "@/components/dice/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  acceptFriendTradeOffer,
  cancelFriendTradeOffer,
  createFriendTradeOffer,
  listTradeableFriendBaddies,
} from "@/lib/trade.functions";

export const Route = createFileRoute("/trades")({
  head: () => ({ meta: [{ title: "Baddie Trade Desk — DICE" }] }),
  component: () => <AppShell><TradeDesk /></AppShell>,
});

function TradeDesk() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const listFriendBaddies = useServerFn(listTradeableFriendBaddies);
  const createOffer = useServerFn(createFriendTradeOffer);
  const acceptOffer = useServerFn(acceptFriendTradeOffer);
  const cancelOffer = useServerFn(cancelFriendTradeOffer);
  const [friendId, setFriendId] = useState("");
  const [offeredId, setOfferedId] = useState("");
  const [requestedId, setRequestedId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const friendsQ = useQuery({
    queryKey: ["trade-friends", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("friendships" as any)
        .select("requester_id, addressee_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${user!.id},addressee_id.eq.${user!.id}`);
      if (error) throw error;
      const ids = (rows ?? []).map((row: any) => row.requester_id === user!.id ? row.addressee_id : row.requester_id);
      if (!ids.length) return [];
      const { data: profiles, error: profileError } = await supabase
        .from("profiles" as any)
        .select("id, username, display_name")
        .in("id", ids);
      if (profileError) throw profileError;
      return profiles ?? [];
    },
  });

  const myBaddiesQ = useQuery({
    queryKey: ["trade-my-baddies", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_baddies" as any)
        .select("*, template:baddie_templates(*)")
        .eq("user_id", user!.id)
        .is("listing_id", null)
        .eq("is_protected", false);
      if (error) throw error;
      return data ?? [];
    },
  });

  const friendBaddiesQ = useQuery({
    queryKey: ["trade-friend-baddies", friendId],
    enabled: !!friendId,
    queryFn: async () => listFriendBaddies({ data: { friendId } }) as Promise<any[]>,
  });

  const offersQ = useQuery({
    queryKey: ["trade-offers", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baddie_trade_offers" as any)
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    setRequestedId("");
  }, [friendId]);

  const myBaddies = useMemo(() => (myBaddiesQ.data ?? []) as any[], [myBaddiesQ.data]);
  const friendBaddies = (friendBaddiesQ.data ?? []) as any[];
  const incoming = (offersQ.data ?? []).filter((offer: any) => offer.offered_to === user?.id);
  const outgoing = (offersQ.data ?? []).filter((offer: any) => offer.offered_by === user?.id);

  const invalidate = () => {
    ["trade-friend-baddies", "trade-my-baddies", "trade-offers", "my-baddies", "club-baddies", "club-trades"].forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
  };

  const run = async (key: string, work: () => Promise<unknown>, message: string) => {
    if (busy) return;
    setBusy(key);
    try {
      await work();
      toast.success(message);
      invalidate();
    } catch (error: any) {
      toast.error(error?.message ?? "Trade action failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader icon={ArrowLeftRight} title="Baddie Trade Desk" subtitle="Offer one tradeable Baddie for one tradeable Baddie from an accepted friend. Safe Mode and marketplace listings are always blocked." />

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="glass p-5">
          <div className="flex items-start gap-3">
            <div className="grid size-9 place-items-center rounded-lg border border-amber-300/20 bg-amber-300/[0.07] text-amber-200"><Send className="size-4" /></div>
            <div><h2 className="font-display text-lg font-bold">Create an offer</h2><p className="mt-1 text-xs text-muted-foreground">The server rechecks friendship, ownership, listing status and Safe Mode when the offer is created and accepted.</p></div>
          </div>

          {(friendsQ.data ?? []).length ? <div className="mt-5 grid gap-3">
            <label className="text-xs font-semibold text-muted-foreground">Friend
              <select value={friendId} onChange={(event) => setFriendId(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm">
                <option value="">Choose an accepted friend</option>
                {(friendsQ.data ?? []).map((friend: any) => <option key={friend.id} value={friend.id}>{friend.display_name} @{friend.username}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-muted-foreground">Your offered Baddie
              <select value={offeredId} onChange={(event) => setOfferedId(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm">
                <option value="">Choose your Baddie</option>
                {myBaddies.map((baddie: any) => <option key={baddie.id} value={baddie.id}>{baddie.template?.name ?? baddie.name} · {baddie.template?.rarity} · {baddie.template?.income_per_hour}/h</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-muted-foreground">Requested Baddie
              <select value={requestedId} disabled={!friendId || friendBaddiesQ.isLoading} onChange={(event) => setRequestedId(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm disabled:opacity-50">
                <option value="">{friendBaddiesQ.isLoading ? "Loading friend collection…" : "Choose friend Baddie"}</option>
                {friendBaddies.map((baddie: any) => <option key={baddie.id} value={baddie.id}>{baddie.name} · {baddie.rarity} · {baddie.income_per_hour}/h</option>)}
              </select>
            </label>
            {!friendBaddiesQ.isLoading && friendId && friendBaddies.length === 0 && <div className="rounded-lg border border-dashed border-white/15 p-3 text-xs text-muted-foreground">This friend has no currently tradeable Baddies.</div>}
            <Button disabled={!friendId || !offeredId || !requestedId || busy === "create"} onClick={() => run("create", () => createOffer({ data: { friendId, offeredBaddieId: offeredId, requestedBaddieId: requestedId } }), "Trade offer sent")}>Send trade offer</Button>
          </div> : <div className="mt-5 rounded-xl border border-dashed border-white/15 p-5 text-sm text-muted-foreground">Add an accepted friend first. The Friends page is where you build your trade circle.</div>}
        </Card>

        <Card className="glass p-5">
          <div className="flex items-start gap-3"><div className="grid size-9 place-items-center rounded-lg border border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-200"><Lock className="size-4" /></div><div><h2 className="font-display text-lg font-bold">Trade protection</h2><p className="mt-1 text-xs text-muted-foreground">Trades are Baddie-for-Baddie only. There is no DICE component and no client-side ownership transfer.</p></div></div>
          <ul className="mt-5 space-y-2 text-sm text-muted-foreground"><li className="flex gap-2"><Check className="mt-0.5 size-4 text-emerald-200" />Both Baddies are locked and verified on accept.</li><li className="flex gap-2"><Check className="mt-0.5 size-4 text-emerald-200" />Protected and marketplace-listed Baddies cannot move.</li><li className="flex gap-2"><Check className="mt-0.5 size-4 text-emerald-200" />Base slots reset after a successful swap.</li></ul>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="glass p-5"><h2 className="font-display text-lg font-bold">Incoming offers</h2><div className="mt-3 space-y-2">{incoming.length ? incoming.map((offer: any) => <div key={offer.id} className="flex items-center justify-between rounded-xl border border-emerald-300/20 bg-emerald-300/[0.05] p-3"><div><div className="text-sm font-semibold">Baddie swap offer</div><div className="mt-0.5 text-xs text-muted-foreground">Review your friend’s offer, then accept for an atomic transfer.</div></div><Button size="sm" disabled={busy === `accept-${offer.id}`} onClick={() => run(`accept-${offer.id}`, () => acceptOffer({ data: { offerId: offer.id } }), "Trade completed")}>Accept <Check className="ml-1 size-3.5" /></Button></div>) : <div className="rounded-lg border border-dashed border-white/15 p-4 text-sm text-muted-foreground">No offers waiting for you.</div>}</div></Card>
        <Card className="glass p-5"><h2 className="font-display text-lg font-bold">Outgoing offers</h2><div className="mt-3 space-y-2">{outgoing.length ? outgoing.map((offer: any) => <div key={offer.id} className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-black/10 p-3"><div><div className="text-sm font-semibold">Waiting for your friend</div><div className="mt-0.5 text-xs text-muted-foreground">The offer expires if either Baddie becomes unavailable.</div></div><Button size="sm" variant="outline" disabled={busy === `cancel-${offer.id}`} onClick={() => run(`cancel-${offer.id}`, () => cancelOffer({ data: { offerId: offer.id } }), "Offer cancelled")}><X className="mr-1 size-3.5" />Cancel</Button></div>) : <div className="rounded-lg border border-dashed border-white/15 p-4 text-sm text-muted-foreground">You have not sent any open offers.</div>}</div></Card>
      </div>
    </div>
  );
}
