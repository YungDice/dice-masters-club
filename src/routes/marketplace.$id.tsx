import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Heart, Flag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DiceBadge } from "@/components/dice/DiceBadge";
import { buyListing } from "@/lib/dice.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/marketplace/$id")({
  head: () => ({ meta: [{ title: "Listing — DICE" }] }),
  component: () => <AppShell><Detail /></AppShell>,
});

function Detail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const buy = useServerFn(buyListing);
  const q = useQuery({
    queryKey: ["listing", id],
    queryFn: async () => {
      const { data } = await supabase.from("marketplace_listings").select("*, profiles!marketplace_listings_seller_id_fkey(*)").eq("id", id).maybeSingle();
      return data;
    },
  });
  if (!q.data) return <div className="text-center text-muted-foreground py-20">Loading…</div>;
  const l: any = q.data;
  async function purchase() { try { await buy({ data: { listingId: id } }); toast.success("Purchased!"); qc.invalidateQueries(); } catch (e: any) { toast.error(e.message); } }
  async function fav() { if (!user) return; await supabase.from("marketplace_favorites").upsert({ user_id: user.id, listing_id: id }); toast.success("Saved"); }
  async function report() { if (!user) return; await supabase.from("reports").insert({ reporter_id: user.id, target_kind: "listing", target_id: id, reason: "review" }); toast.success("Reported"); }
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Link to="/marketplace" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4 mr-1" />Marketplace</Link>
      <Card className="glass p-6">
        <div className="grid md:grid-cols-2 gap-6">
          <div className="aspect-square rounded-lg bg-black/30 grid place-items-center overflow-hidden">{l.preview_url ? <img src={l.preview_url} className="w-full h-full object-cover" /> : <div className="text-muted-foreground">No preview</div>}</div>
          <div className="space-y-3">
            <div className="text-xs uppercase text-muted-foreground">{l.category}</div>
            <h1 className="font-display text-2xl font-bold">{l.title}</h1>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{l.description}</p>
            {l.license_notes && <div className="text-xs"><span className="font-semibold">License:</span> {l.license_notes}</div>}
            <div><DiceBadge size="lg" amount={l.price} /></div>
            <div className="flex gap-2"><Button onClick={purchase} disabled={l.seller_id === user?.id} className="glow-red">{l.seller_id === user?.id ? "Your listing" : "Buy now"}</Button><Button variant="outline" onClick={fav}><Heart className="size-4" /></Button><Button variant="outline" onClick={report}><Flag className="size-4" /></Button></div>
            <div className="text-xs text-muted-foreground">Sold by @{l.profiles?.username}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
