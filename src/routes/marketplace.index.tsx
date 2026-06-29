import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Plus, ShoppingBag, Heart, Gavel, Hash } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DiceBadge } from "@/components/dice/DiceBadge";
import { EmptyState } from "@/components/dice/EmptyState";
import { buyListing } from "@/lib/dice.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/marketplace/")({
  head: () => ({ meta: [{ title: "Marketplace — DICE" }, { name: "description", content: "Buy and sell digital items for DICE: avatars, stickers, art, templates." }] }),
  component: () => <AppShell><Mkt /></AppShell>,
});

function Mkt() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"newest" | "price">("newest");
  const buy = useServerFn(buyListing);

  const listings = useQuery({
    queryKey: ["listings", sort],
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketplace_listings")
        .select("*")
        .eq("status", "active")
        .is("winner_id", null)
        .order(sort === "newest" ? "created_at" : "price", { ascending: sort !== "newest" })
        .limit(40);
      if (error) throw error;
      const rows = (data ?? []).filter((r: any) => r.status === "active" && !r.winner_id);
      const ids = Array.from(new Set(rows.map((r: any) => r.seller_id)));
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", ids)
        : { data: [] };
      const m = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
      return rows.map((r: any) => ({ ...r, seller: m[r.seller_id] }));
    },
  });
  const filtered = (listings.data ?? []).filter((l: any) => !q || l.title.toLowerCase().includes(q.toLowerCase()));

  async function purchase(id: string) {
    try { await buy({ data: { listingId: id } }); toast.success("Purchased!"); qc.invalidateQueries(); }
    catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="font-display text-3xl font-bold">Marketplace</h1><p className="text-sm text-muted-foreground">Digital items only. No real-world goods, no copyrighted content without rights.</p></div>
        <Link to="/marketplace/new"><Button className="glow-red"><Plus className="size-4 mr-1" />List item</Button></Link>
      </div>
      <Card className="glass p-3 flex gap-2 items-center flex-wrap">
        <div className="flex-1 relative min-w-60"><Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" placeholder="Search..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="newest">Newest</option><option value="price">Price ↑</option></select>
      </Card>
      {filtered.length === 0
        ? <EmptyState icon={ShoppingBag} title="No listings yet" description="Be the first to list a digital item." />
        : <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">{filtered.map((l: any) => (
            <Card key={l.id} className="glass overflow-hidden relative">
              {l.sale_type === "auction" && <div className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/80 text-white text-xs"><Gavel className="size-3" />Auction</div>}
              <Link to="/marketplace/$id" params={{ id: l.id }}>
                <div className="aspect-square bg-black/30 grid place-items-center overflow-hidden">
                  {l.category === "tag"
                    ? <div className="text-4xl font-mono font-bold text-primary flex items-center"><Hash className="size-7" />{l.tag_value}</div>
                    : l.preview_url ? <img src={l.preview_url} className="w-full h-full object-cover" /> : <ShoppingBag className="size-12 text-muted-foreground" />}
                </div>
              </Link>
              <div className="p-3 space-y-2">
                <div className="text-xs text-muted-foreground">{l.category}</div>
                <div className="font-semibold line-clamp-1">{l.title}</div>
                <div className="flex items-center justify-between">
                  <DiceBadge size="sm" amount={l.sale_type === "auction" ? (l.current_bid ?? l.min_bid ?? l.price) : l.price} />
                  {l.sale_type === "auction"
                    ? <Link to="/marketplace/$id" params={{ id: l.id }}><Button size="sm" variant="outline"><Gavel className="size-3 mr-1" />Bid</Button></Link>
                    : <Button size="sm" disabled={l.seller_id === user?.id} onClick={() => purchase(l.id)}>{l.seller_id === user?.id ? "Yours" : "Buy"}</Button>}
                </div>
              </div>
            </Card>
          ))}</div>}
    </div>
  );
}
