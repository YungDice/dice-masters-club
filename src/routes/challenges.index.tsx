import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Trophy, Plus, Search } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/dice/TopNav";
import { DiceBadge } from "@/components/dice/DiceBadge";
import { EmptyState } from "@/components/dice/EmptyState";
import { PageHeader } from "@/components/dice/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/challenges/")({
  head: () => ({
    meta: [
      { title: "Challenges — DICE" },
      { name: "description", content: "Browse fitness, creativity, gaming, and photo challenges on DICE. Earn DICE virtual currency for completing approved tasks." },
      { property: "og:title", content: "Challenges — DICE" },
      { property: "og:description", content: "Browse and complete DICE challenges to earn virtual currency and XP." },
      { property: "og:url", content: "https://yungdice.com/challenges" },
    ],
    links: [{ rel: "canonical", href: "https://yungdice.com/challenges" }],
  }),
  component: () => <AppShell><Browse /></AppShell>,
});

function Browse() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const { data, isLoading } = useQuery({
    queryKey: ["challenges-browse", cat],
    queryFn: async () => {
      let query = supabase.from("challenges").select("*").in("status", ["active", "approved"]).order("created_at", { ascending: false }).limit(60);
      if (cat !== "all") query = query.eq("category", cat as any);
      const { data } = await query;
      return data ?? [];
    },
  });
  const filtered = (data ?? []).filter((c) => !q || c.title.toLowerCase().includes(q.toLowerCase()) || c.description.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Trophy}
        title="Challenges"
        subtitle="Earn DICE & XP by completing safe, creative tasks."
        actions={
          <Link to="/challenges/new">
            <Button className="glow-red"><Plus className="size-4 mr-1" />Create challenge</Button>
          </Link>
        }
      />
      <Card className="glass p-3 flex gap-2 flex-wrap items-center">
        <div className="flex-1 min-w-60 relative"><Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" placeholder="Search challenges..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {["fitness","creativity","gaming","social","photography","video","daily","community","skill","funny","custom"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>
      {isLoading ? <div className="grid gap-3 md:grid-cols-3">{Array.from({length:6}).map((_,i) => <Card key={i} className="glass p-5 h-40 animate-pulse" />)}</div>
        : filtered.length === 0 ? <EmptyState icon={Trophy} title="No challenges yet" description="Try changing filters or create a new challenge." />
        : <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{filtered.map((c, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Link to="/challenges/$id" params={{ id: c.id }}>
                <Card className="glass p-5 h-full hover:border-primary/50 hover:-translate-y-0.5 transition-all relative overflow-hidden group">
                  <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent opacity-0 group-hover:opacity-100 transition" />
                  <div className="flex items-start justify-between"><span className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.category} · {c.difficulty}</span><DiceBadge size="sm" amount={c.dice_reward} /></div>
                  <h3 className="mt-2 font-display font-semibold text-lg">{c.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-3">{c.description}</p>
                  <div className="mt-3 flex gap-1 flex-wrap">{(c.tags ?? []).slice(0,4).map((t) => <span key={t} className="text-[10px] rounded-full bg-white/5 px-2 py-0.5 border border-white/5">#{t}</span>)}</div>
                </Card>
              </Link>
            </motion.div>
          ))}</div>}
    </div>
  );
}
