import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Shield, Sparkles, FileWarning, Users, ListChecks, Store, Palette, Flag, ScrollText, Activity, Coins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyRoles } from "@/hooks/use-profile";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { reviewProof, reviewChallenge, adminAdjustDice, grantRole } from "@/lib/dice.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — DICE" }] }),
  component: () => <AppShell><Admin /></AppShell>,
});

function Admin() {
  const { user } = useAuth();
  const { data: roles } = useMyRoles(user?.id);
  const isStaff = roles?.some((r) => r === "admin" || r === "moderator" || r === "owner");
  const isAdmin = roles?.some((r) => r === "admin" || r === "owner");

  if (!isStaff) {
    return (
      <Card className="glass p-10 text-center max-w-xl mx-auto">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 ring-1 ring-primary/30">
          <Shield className="size-7 text-primary" />
        </div>
        <h1 className="mt-4 font-display text-2xl font-bold">Admin panel</h1>
        <p className="text-sm text-muted-foreground mt-2">You don't have staff access. Ask an owner to grant you a role.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/20 via-fuchsia-500/10 to-transparent p-6">
        <div className="absolute -right-16 -top-16 size-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="grid size-14 place-items-center rounded-2xl bg-primary/20 ring-1 ring-primary/40">
              <Shield className="size-7 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold">Admin Console</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Signed in as <b className="text-foreground">@{(user?.email ?? "").split("@")[0]}</b> · Role:{" "}
                <span className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary uppercase tracking-wider">
                  {isAdmin ? "Admin" : "Moderator"}
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Activity className="size-3.5" /> Live queue
          </div>
        </div>
      </div>

      <Stats />

      <Tabs defaultValue="proofs">
        <TabsList className="w-full flex-wrap h-auto gap-1 bg-white/5 p-1 rounded-xl">
          <TabsTrigger value="proofs" className="gap-1.5"><ListChecks className="size-3.5" />Proofs<QueueBadge kind="proofs" /></TabsTrigger>
          <TabsTrigger value="challenges" className="gap-1.5"><Sparkles className="size-3.5" />Challenges<QueueBadge kind="challenges" /></TabsTrigger>
          <TabsTrigger value="listings" className="gap-1.5"><Store className="size-3.5" />Listings<QueueBadge kind="listings" /></TabsTrigger>
          <TabsTrigger value="cosmetics" className="gap-1.5"><Palette className="size-3.5" />Cosmetics<QueueBadge kind="cosmetics" /></TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5"><Flag className="size-3.5" />Reports<QueueBadge kind="reports" /></TabsTrigger>
          {isAdmin && <TabsTrigger value="users" className="gap-1.5"><Users className="size-3.5" />Users</TabsTrigger>}
          {isAdmin && <TabsTrigger value="mod-log" className="gap-1.5"><ScrollText className="size-3.5" />Mod log</TabsTrigger>}
        </TabsList>
        <TabsContent value="proofs"><ProofQueue /></TabsContent>
        <TabsContent value="challenges"><ChallengeQueue /></TabsContent>
        <TabsContent value="listings"><ListingsQueue /></TabsContent>
        <TabsContent value="cosmetics"><CosmeticsQueue /></TabsContent>
        <TabsContent value="reports"><ReportsQueue /></TabsContent>
        {isAdmin && <TabsContent value="users"><UsersAdmin /></TabsContent>}
        {isAdmin && <TabsContent value="mod-log"><ModLog /></TabsContent>}
      </Tabs>
    </div>
  );
}

function QueueBadge({ kind }: { kind: "proofs" | "challenges" | "listings" | "cosmetics" | "reports" }) {
  const { data } = useQuery({
    queryKey: ["admin-queue-count", kind],
    refetchInterval: 30_000,
    queryFn: async () => {
      const map: Record<string, any> = {
        proofs: { table: "challenge_proofs", filter: (q: any) => q.eq("status", "pending") },
        challenges: { table: "challenges", filter: (q: any) => q.eq("status", "pending_review") },
        listings: { table: "marketplace_listings", filter: (q: any) => q.eq("status", "pending_review") },
        cosmetics: { table: "cosmetic_submissions", filter: (q: any) => q.eq("status", "pending") },
        reports: { table: "reports", filter: (q: any) => q.in("status", ["open", "reviewing"]) },
      };
      const cfg = map[kind];
      const { count } = await cfg.filter(supabase.from(cfg.table).select("id", { count: "exact", head: true }));
      return count ?? 0;
    },
  });
  if (!data) return null;
  return <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] px-1.5 min-w-[18px] h-[18px]">{data}</span>;
}

function ModLog() {
  const q = useQuery({
    queryKey: ["admin-mod-log"],
    queryFn: async () => {
      const { data } = await supabase.from("moderation_actions").select("*").order("created_at", { ascending: false }).limit(50);
      const ids = Array.from(new Set((data ?? []).map((r: any) => r.moderator_id).filter(Boolean)));
      let map: Record<string, any> = {};
      if (ids.length) {
        const { data: p } = await supabase.from("profiles").select("id,username,display_name").in("id", ids as any);
        map = Object.fromEntries((p ?? []).map((r: any) => [r.id, r]));
      }
      return (data ?? []).map((r: any) => ({ ...r, moderator: map[r.moderator_id] }));
    },
  });
  return (
    <Card className="glass p-4 mt-3 space-y-2">
      {q.data?.length === 0 && <p className="text-sm text-muted-foreground p-4">No recent actions.</p>}
      {(q.data ?? []).map((r: any) => (
        <div key={r.id} className="rounded-md border border-border/60 p-3 text-sm flex items-center justify-between gap-3">
          <div>
            <div><span className="text-primary font-mono">{r.action}</span> · {r.target_kind}</div>
            <div className="text-xs text-muted-foreground">by @{r.moderator?.username ?? "?"} {r.reason ? `— ${r.reason}` : ""}</div>
          </div>
          <div className="text-xs text-muted-foreground shrink-0">{new Date(r.created_at).toLocaleString()}</div>
        </div>
      ))}
    </Card>
  );
}


function Stats() {
  const stats = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [users, chals, listings, txs] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("challenges").select("id", { count: "exact", head: true }),
        supabase.from("marketplace_listings").select("id", { count: "exact", head: true }),
        supabase.from("dice_transactions").select("id", { count: "exact", head: true }),
      ]);
      return { users: users.count, chals: chals.count, listings: listings.count, txs: txs.count };
    },
  });
  const items = [
    { l: "Users",        v: stats.data?.users,    icon: Users,      tone: "from-sky-500/20 to-sky-500/5 text-sky-300 ring-sky-400/30" },
    { l: "Challenges",   v: stats.data?.chals,    icon: Sparkles,   tone: "from-fuchsia-500/20 to-fuchsia-500/5 text-fuchsia-300 ring-fuchsia-400/30" },
    { l: "Listings",     v: stats.data?.listings, icon: Store,      tone: "from-emerald-500/20 to-emerald-500/5 text-emerald-300 ring-emerald-400/30" },
    { l: "Transactions", v: stats.data?.txs,      icon: Coins,      tone: "from-amber-500/20 to-amber-500/5 text-amber-300 ring-amber-400/30" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((s) => (
        <Card key={s.l} className={`p-5 border-0 bg-gradient-to-br ${s.tone} ring-1`}>
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-widest font-semibold opacity-80">{s.l}</div>
            <s.icon className="size-4 opacity-80" />
          </div>
          <div className="font-display text-3xl font-bold mt-2 text-foreground">{s.v?.toLocaleString() ?? "—"}</div>
        </Card>
      ))}
    </div>
  );
}

function ProofQueue() {
  const qc = useQueryClient();
  const review = useServerFn(reviewProof);
  const q = useQuery({
    queryKey: ["admin-proofs"],
    queryFn: async () => {
      const { data } = await supabase.from("challenge_proofs").select("*, profiles!challenge_proofs_user_id_fkey(username,display_name), challenges(title,dice_reward)").eq("status", "pending").order("created_at", { ascending: true }).limit(50);
      return data ?? [];
    },
  });
  async function decide(id: string, approve: boolean) {
    try { await review({ data: { proofId: id, approve } }); toast.success(approve ? "Approved" : "Rejected"); qc.invalidateQueries(); }
    catch (e: any) { toast.error(e.message); }
  }
  return (
    <Card className="glass p-4 mt-3">
      {q.data?.length === 0 && <p className="text-sm text-muted-foreground p-4">Queue empty 🎉</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {(q.data ?? []).map((p: any) => (
          <div key={p.id} className="rounded-lg border border-border/60 p-3 space-y-2">
            <div className="text-xs text-muted-foreground">@{p.profiles?.username} · <span className="text-foreground">{p.challenges?.title}</span> · {p.challenges?.dice_reward} DICE</div>
            {p.media_url && p.media_kind?.startsWith("image") && <img src={p.media_url} className="w-full h-40 object-cover rounded" />}
            {p.media_url && p.media_kind?.startsWith("video") && <video src={p.media_url} controls className="w-full h-40 rounded" />}
            {p.caption && <div className="text-sm">{p.caption}</div>}
            <div className="flex gap-2"><Button size="sm" onClick={() => decide(p.id, true)}>Approve</Button><Button size="sm" variant="destructive" onClick={() => decide(p.id, false)}>Reject</Button></div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ChallengeQueue() {
  const qc = useQueryClient();
  const review = useServerFn(reviewChallenge);
  const q = useQuery({
    queryKey: ["admin-chal"],
    queryFn: async () => {
      const { data } = await supabase.from("challenges").select("*, profiles!challenges_creator_id_fkey(username)").eq("status", "pending_review").order("created_at", { ascending: true }).limit(50);
      return data ?? [];
    },
  });
  async function decide(id: string, approve: boolean) {
    try { await review({ data: { challengeId: id, approve } }); qc.invalidateQueries(); }
    catch (e: any) { toast.error(e.message); }
  }
  return (
    <Card className="glass p-4 mt-3 space-y-3">
      {q.data?.length === 0 && <p className="text-sm text-muted-foreground p-4">Queue empty</p>}
      {(q.data ?? []).map((c: any) => (
        <div key={c.id} className="rounded-lg border border-border/60 p-3">
          <div className="flex justify-between"><div className="font-semibold">{c.title}</div><div className="text-xs text-muted-foreground">@{c.profiles?.username}</div></div>
          <div className="text-sm text-muted-foreground mt-1">{c.description}</div>
          <div className="text-xs mt-1">{c.dice_reward} DICE · {c.category} · {c.difficulty}</div>
          <div className="flex gap-2 mt-2"><Button size="sm" onClick={() => decide(c.id, true)}>Approve</Button><Button size="sm" variant="destructive" onClick={() => decide(c.id, false)}>Reject</Button></div>
        </div>
      ))}
    </Card>
  );
}

function ListingsQueue() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-list"],
    queryFn: async () => {
      const { data } = await supabase.from("marketplace_listings").select("*").eq("status", "pending_review").order("created_at", { ascending: true });
      return data ?? [];
    },
  });
  async function decide(id: string, approve: boolean) {
    await supabase.from("marketplace_listings").update({ status: approve ? "active" : "rejected" }).eq("id", id);
    qc.invalidateQueries();
  }
  return (
    <Card className="glass p-4 mt-3 space-y-3">
      {q.data?.length === 0 && <p className="text-sm text-muted-foreground p-4">Queue empty</p>}
      {(q.data ?? []).map((l) => (
        <div key={l.id} className="rounded-lg border border-border/60 p-3 flex items-center gap-3">
          {l.preview_url && <img src={l.preview_url} className="size-16 object-cover rounded" />}
          <div className="flex-1"><div className="font-semibold">{l.title}</div><div className="text-xs text-muted-foreground">{l.price} DICE · {l.category}</div></div>
          <Button size="sm" onClick={() => decide(l.id, true)}>Approve</Button>
          <Button size="sm" variant="destructive" onClick={() => decide(l.id, false)}>Reject</Button>
        </div>
      ))}
    </Card>
  );
}

function ReportsQueue() {
  const q = useQuery({
    queryKey: ["admin-reports"],
    queryFn: async () => {
      const { data } = await supabase.from("reports").select("*").in("status", ["open", "reviewing"]).order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  const qc = useQueryClient();
  return (
    <Card className="glass p-4 mt-3 space-y-2">
      {q.data?.length === 0 && <p className="text-sm text-muted-foreground p-4">No open reports</p>}
      {(q.data ?? []).map((r) => (
        <div key={r.id} className="rounded-lg border border-border/60 p-3 flex items-center justify-between">
          <div><div className="font-medium">{r.target_kind} · {r.reason}</div>{r.details && <div className="text-xs text-muted-foreground">{r.details}</div>}</div>
          <div className="flex gap-2"><Button size="sm" onClick={async () => { await supabase.from("reports").update({ status: "resolved" }).eq("id", r.id); qc.invalidateQueries(); }}>Resolve</Button><Button size="sm" variant="outline" onClick={async () => { await supabase.from("reports").update({ status: "dismissed" }).eq("id", r.id); qc.invalidateQueries(); }}>Dismiss</Button></div>
        </div>
      ))}
    </Card>
  );
}

function UsersAdmin() {
  const adjust = useServerFn(adminAdjustDice);
  const grant = useServerFn(grantRole);
  const [q, setQ] = useState("");
  const search = useQuery({
    queryKey: ["admin-users", q],
    enabled: q.length >= 2,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").or(`username.ilike.%${q}%,display_name.ilike.%${q}%`).limit(20);
      return data ?? [];
    },
  });
  async function dice(id: string) {
    const a = prompt("Delta (positive or negative)?"); if (!a) return;
    const reason = prompt("Reason?"); if (!reason) return;
    try { await adjust({ data: { userId: id, delta: parseInt(a, 10), reason } }); toast.success("Adjusted"); }
    catch (e: any) { toast.error(e.message); }
  }
  async function setRole(id: string, role: "user" | "moderator" | "admin") {
    try { await grant({ data: { userId: id, role } }); toast.success("Role set"); }
    catch (e: any) { toast.error(e.message); }
  }
  return (
    <Card className="glass p-4 mt-3 space-y-3">
      <Input placeholder="Search users..." value={q} onChange={(e) => setQ(e.target.value)} />
      {(search.data ?? []).map((u) => (
        <div key={u.id} className="rounded-lg border border-border/60 p-3 flex items-center justify-between">
          <div className="text-sm"><b>{u.display_name}</b> @{u.username}</div>
          <div className="flex gap-2"><Button size="sm" onClick={() => dice(u.id)}>Adjust DICE</Button><Button size="sm" variant="outline" onClick={() => setRole(u.id, "moderator")}>Mod</Button><Button size="sm" variant="outline" onClick={() => setRole(u.id, "admin")}>Admin</Button></div>
        </div>
      ))}
    </Card>
  );
}

function CosmeticsQueue() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-cosmetics"],
    queryFn: async () => {
      const { data: subs, error } = await supabase.from("cosmetic_submissions" as any)
        .select("*")
        .eq("status", "pending").order("created_at", { ascending: true });
      if (error) throw error;
      const rows = (subs ?? []) as any[];
      const ids = Array.from(new Set(rows.map((r) => r.submitter_id).filter(Boolean)));
      let map: Record<string, any> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id,username,display_name").in("id", ids);
        map = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
      }
      return rows.map((r) => ({ ...r, profiles: map[r.submitter_id] ?? null }));
    },
  });
  async function decide(id: string, approve: boolean) {
    try {
      const { error } = await (supabase.rpc as any)("review_cosmetic_submission", { _submission_id: id, _approve: approve });
      if (error) throw error;
      toast.success(approve ? "Approved — cosmetic added to catalog" : "Rejected — fee refunded");
      qc.invalidateQueries({ queryKey: ["admin-cosmetics"] });
      qc.invalidateQueries({ queryKey: ["cosmetics-catalog"] });
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
  }
  return (
    <Card className="glass p-4 mt-3 space-y-3">
      {q.data?.length === 0 && <p className="text-sm text-muted-foreground p-4">Queue empty</p>}
      {(q.data ?? []).map((s: any) => (
        <div key={s.id} className="rounded-lg border border-border/60 p-3 space-y-2">
          <div className="flex justify-between flex-wrap gap-2">
            <div>
              <div className="font-semibold">{s.name} <span className="text-xs text-muted-foreground capitalize">· {s.kind} · {s.rarity}</span></div>
              <div className="text-xs text-muted-foreground">by @{s.profiles?.username ?? "?"} · fee {s.fee_paid} DICE · asking price {s.price_dice}</div>
            </div>
          </div>
          <pre className="text-[11px] bg-black/40 rounded p-2 overflow-x-auto">{JSON.stringify(s.meta, null, 2)}</pre>
          {s.kind === "banner" && s.meta?.gradient && <div className="h-10 rounded" style={{ background: s.meta.gradient }} />}
          {s.kind === "emote" && <div className="text-2xl">{s.meta?.emoji} <code className="text-xs">{s.meta?.code}</code></div>}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => decide(s.id, true)}>Approve</Button>
            <Button size="sm" variant="destructive" onClick={() => decide(s.id, false)}>Reject &amp; refund</Button>
          </div>
        </div>
      ))}
    </Card>
  );
}
