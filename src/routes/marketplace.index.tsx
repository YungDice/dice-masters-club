import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Plus, ShoppingBag, Gavel, Hash, AtSign, Sparkles } from "lucide-react";
import eliasAsset from "@/assets/baddies/elias.png.asset.json";
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
import { PageHeader } from "@/components/dice/PageHeader";
import { motion } from "framer-motion";
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
  const [cat, setCat] = useState<"all" | "baddie" | "tag" | "username" | "item">("all");
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
        .limit(80);
      if (error) throw error;
      const rows = (data ?? []).filter((r: any) => r.status === "active" && !r.winner_id);
      const ids = Array.from(new Set(rows.map((r: any) => r.seller_id)));
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", ids)
        : { data: [] };
      const m = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
      const baddieIds = rows.map((r: any) => r.baddie_id).filter(Boolean);
      let bmap: Record<string, any> = {};
      if (baddieIds.length) {
        const { data: bs } = await supabase
          .from("user_baddies" as any)
          .select("id, name, template:baddie_templates(*)")
          .in("id", baddieIds);
        bmap = Object.fromEntries((bs ?? []).map((b: any) => [b.id, b]));
      }
      return rows.map((r: any) => ({ ...r, seller: m[r.seller_id], baddie: r.baddie_id ? bmap[r.baddie_id] : null }));
    },
  });
  const filtered = (listings.data ?? []).filter((l: any) => {
    if (q && !l.title.toLowerCase().includes(q.toLowerCase())) return false;
    if (cat === "all") return true;
    if (cat === "baddie") return !!l.baddie_id || l.category === "baddie";
    if (cat === "tag") return l.category === "tag";
    if (cat === "username") return l.category === "username";
    if (cat === "item") return !l.baddie_id && l.category !== "tag" && l.category !== "username";
    return true;
  });


  async function purchase(id: string) {
    try { await buy({ data: { listingId: id } }); toast.success("Purchased!"); qc.invalidateQueries(); }
    catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={ShoppingBag}
        title="Marketplace"
        subtitle="Digital items only — trade for DICE. No real-world goods."
        accent="violet"
        actions={
          <Link to="/marketplace/new">
            <Button className="glow-red"><Plus className="size-4 mr-1" />List item</Button>
          </Link>
        }
      />
      <Card className="glass p-3 flex gap-2 items-center flex-wrap">
        <div className="flex-1 relative min-w-60"><Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" placeholder="Search..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="flex gap-1 flex-wrap">
          {(["all","item","baddie","tag","username"] as const).map((c) => (
            <button key={c} onClick={() => setCat(c)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold border capitalize transition ${cat === c ? "border-primary bg-primary/15 text-primary" : "border-border/60 hover:border-border"}`}>{c}</button>
          ))}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="newest">Newest</option><option value="price">Price ↑</option></select>
      </Card>
      {filtered.length === 0
        ? <EmptyState icon={ShoppingBag} title="No listings yet" description="Be the first to list something for DICE." />
        : <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">{filtered.map((l: any, i: number) => {
            const baddieImg = l.baddie?.template
              ? (l.baddie.template.image_url ?? (l.baddie.template.id === "elias" ? eliasAsset.url : null))
              : null;
            return (
            <motion.div key={l.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
            <Card className="glass overflow-hidden relative group hover:border-primary/50 hover:-translate-y-0.5 transition-all">
              {l.sale_type === "auction" && <div className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/80 text-white text-xs"><Gavel className="size-3" />Auction</div>}
              {l.baddie_id && <div className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-fuchsia-500/80 text-white text-xs"><Sparkles className="size-3" />Baddie</div>}
              <Link to="/marketplace/$id" params={{ id: l.id }}>
                <div className="aspect-square bg-gradient-to-br from-black/60 to-black/20 grid place-items-center overflow-hidden">
                  {l.category === "tag"
                    ? <div className="text-4xl font-mono font-bold text-primary flex items-center"><Hash className="size-7" />{l.tag_value}</div>
                    : l.category === "username"
                    ? <div className="text-3xl font-mono font-bold text-primary flex items-center"><AtSign className="size-6" />{l.username_value}</div>
                    : baddieImg
                    ? <img src={baddieImg} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    : l.preview_url ? <img src={l.preview_url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /> : <ShoppingBag className="size-12 text-muted-foreground" />}
                </div>
              </Link>
              <div className="p-3 space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {l.baddie?.template ? `${l.baddie.template.rarity} · ${l.baddie.template.income_per_hour}/h` : l.category}
                </div>
                <div className="font-semibold line-clamp-1">{l.baddie?.name ?? l.baddie?.template?.name ?? l.title}</div>
                <div className="flex items-center justify-between">
                  <DiceBadge size="sm" amount={l.sale_type === "auction" ? (l.current_bid ?? l.min_bid ?? l.price) : l.price} />
                  {l.sale_type === "auction"
                    ? <Link to="/marketplace/$id" params={{ id: l.id }}><Button size="sm" variant="outline"><Gavel className="size-3 mr-1" />Bid</Button></Link>
                    : <Button size="sm" disabled={l.seller_id === user?.id} onClick={() => purchase(l.id)}>{l.seller_id === user?.id ? "Yours" : "Buy"}</Button>}
                </div>
              </div>
            </Card>
            </motion.div>
          );
          })}</div>}

    </div>
  );
}
