import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Heart, Flag, Gavel, AtSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DiceBadge } from "@/components/dice/DiceBadge";
import { buyListing, placeBid, settleAuction } from "@/lib/dice.functions";
import { fmt } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/marketplace/$id")({
  head: () => ({ meta: [{ title: "Listing — DICE" }] }),
  component: () => <AppShell><Detail /></AppShell>,
});

function useCountdown(target: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!target) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [target]);
  if (!target) return null;
  const ms = new Date(target).getTime() - now;
  if (ms <= 0) return "ended";
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

function Detail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const buy = useServerFn(buyListing);
  const bid = useServerFn(placeBid);
  const settle = useServerFn(settleAuction);
  const [bidAmount, setBidAmount] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["listing", id],
    queryFn: async () => {
      const { data } = await supabase.from("marketplace_listings").select("*").eq("id", id).maybeSingle();
      if (!data) return null;
      const { data: prof } = await supabase.from("profiles").select("id,username,display_name,avatar_url,tag").eq("id", data.seller_id).maybeSingle();
      const { data: bids } = await supabase.from("marketplace_bids").select("*").eq("listing_id", id).order("created_at", { ascending: false }).limit(10);
      let purchased = false;
      if (user?.id) {
        const { data: p } = await supabase.from("marketplace_purchases").select("id").eq("listing_id", id).eq("buyer_id", user.id).maybeSingle();
        purchased = !!p;
      }
      return { ...data, seller: prof, bids: bids ?? [], purchasedByMe: purchased };
    },
    refetchInterval: 5000,
  });

  useEffect(() => {
    const ch = supabase.channel(`listing-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "marketplace_bids", filter: `listing_id=eq.${id}` }, () => qc.invalidateQueries({ queryKey: ["listing", id] }))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "marketplace_listings", filter: `id=eq.${id}` }, () => qc.invalidateQueries({ queryKey: ["listing", id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, qc]);

  const l: any = q.data;
  const ended = useCountdown(l?.sale_type === "auction" ? l?.auction_ends_at : null);

  // Lazy settle when auction is past end and still active
  useEffect(() => {
    if (!l || l.sale_type !== "auction" || l.status !== "active") return;
    if (new Date(l.auction_ends_at).getTime() <= Date.now()) {
      settle({ data: { listingId: id } }).then(() => qc.invalidateQueries({ queryKey: ["listing", id] })).catch(() => {});
    }
  }, [l?.auction_ends_at, l?.status, l?.sale_type, id, qc, settle]);

  if (!q.data) return <div className="text-center text-muted-foreground py-20">Loading…</div>;

  const isAuction = l.sale_type === "auction";
  const isOwn = l.seller_id === user?.id;
  const isTag = l.category === "tag";
  const curBid = Number(l.current_bid ?? 0);
  const minRequired = curBid > 0 ? curBid + Math.max(10, Math.ceil(curBid * 0.05)) : Number(l.min_bid ?? l.price);

  async function purchase() {
    setBusy(true);
    try { await buy({ data: { listingId: id } }); toast.success("Purchased!"); qc.invalidateQueries(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function placeBidNow() {
    if (!bidAmount || bidAmount < minRequired) return toast.error(`Min bid: ${minRequired} DICE`);
    setBusy(true);
    try { await bid({ data: { listingId: id, amount: bidAmount } }); toast.success("Bid placed!"); qc.invalidateQueries(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function fav() { if (!user) return; await supabase.from("marketplace_favorites").upsert({ user_id: user.id, listing_id: id }); toast.success("Saved"); }
  async function report() { if (!user) return; await supabase.from("reports").insert({ reporter_id: user.id, target_kind: "listing", target_id: id, reason: "review" }); toast.success("Reported"); }
  async function setAsAvatar() {
    if (!user) return;
    const url = l.file_url ?? l.preview_url;
    if (!url) return toast.error("No image on this listing");
    const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
    if (error) return toast.error(error.message);
    toast.success("Profile picture updated!");
    qc.invalidateQueries({ queryKey: ["profile"] });
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Link to="/marketplace" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4 mr-1" />Marketplace</Link>
      <Card className="glass p-6">
        <div className="grid md:grid-cols-2 gap-6">
          <div className="aspect-square rounded-lg bg-black/30 grid place-items-center overflow-hidden">
            {isTag ? (
              <div className="text-5xl font-mono font-bold text-primary">#{l.tag_value}</div>
            ) : l.category === "username" ? (
              <div className="text-4xl md:text-5xl font-mono font-bold text-primary flex items-center"><AtSign className="size-8 md:size-10" />{l.username_value}</div>
            ) : l.preview_url ? <img src={l.preview_url} className="w-full h-full object-cover" /> : <div className="text-muted-foreground">No preview</div>}
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
              <span>{l.category}</span>
              {isAuction && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/20 text-primary"><Gavel className="size-3" /> Auction</span>}
            </div>
            <h1 className="font-display text-2xl font-bold">{l.title}</h1>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{l.description}</p>
            {l.license_notes && <div className="text-xs"><span className="font-semibold">License:</span> {l.license_notes}</div>}

            {isAuction ? (
              <div className="rounded-md bg-white/5 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">Current bid</div>
                  <DiceBadge size="lg" amount={curBid || Number(l.min_bid ?? l.price)} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Ends in</span>
                  <span className="font-mono">{ended ?? "—"}</span>
                </div>
                {l.status === "active" && ended !== "ended" && !isOwn && (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">Min next bid: <b>{fmt(minRequired)} DICE</b></div>
                    <div className="flex gap-2">
                      <Input type="number" min={minRequired} value={bidAmount || ""} onChange={(e) => setBidAmount(+e.target.value)} placeholder={`${minRequired}`} />
                      <Button onClick={placeBidNow} disabled={busy} className="glow-red"><Gavel className="size-4 mr-1" />Bid</Button>
                    </div>
                  </div>
                )}
                {l.status === "sold" && <div className="text-sm text-emerald-400">Sold to winner for {fmt(curBid)} DICE</div>}
                {l.status === "expired" && <div className="text-sm text-amber-400">Auction ended with no bids</div>}
                {l.bids?.length > 0 && (
                  <div className="pt-2 border-t border-white/10">
                    <div className="text-xs text-muted-foreground mb-1">Recent bids</div>
                    <ul className="text-xs space-y-1 max-h-32 overflow-auto">
                      {l.bids.map((b: any) => (
                        <li key={b.id} className="flex justify-between"><span className="font-mono">{fmt(b.amount)} DICE</span><span className="text-muted-foreground">{new Date(b.created_at).toLocaleTimeString()}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div><DiceBadge size="lg" amount={l.price} /></div>
                <div className="flex gap-2">
                  <Button onClick={purchase} disabled={busy || isOwn || l.status !== "active"} className="glow-red">
                    {isOwn ? "Your listing" : l.status === "sold" ? "Sold" : "Buy now"}
                  </Button>
                  <Button variant="outline" onClick={fav}><Heart className="size-4" /></Button>
                  <Button variant="outline" onClick={report}><Flag className="size-4" /></Button>
                </div>
              </>
            )}
            {l.category === "avatar" && l.purchasedByMe && (
              <Button onClick={setAsAvatar} variant="secondary" className="w-full">Set as profile picture</Button>
            )}
            <div className="text-xs text-muted-foreground">Sold by @{l.seller?.username}{l.seller?.tag ? `#${l.seller.tag}` : ""}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
