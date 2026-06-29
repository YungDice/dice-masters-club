import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Shield, Sparkles, FileWarning } from "lucide-react";
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
      <Card className="glass p-8 text-center max-w-xl mx-auto">
        <Shield className="size-10 mx-auto text-muted-foreground" />
        <h1 className="mt-3 font-display text-2xl font-bold">Admin panel</h1>
        <p className="text-sm text-muted-foreground mt-2">You don't have staff access. Ask an owner to grant you a role.</p>
      </Card>
    );
  }


  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold flex items-center gap-2"><Shield className="text-primary" />Admin {isAdmin ? "(admin)" : "(moderator)"}</h1>
      <Stats />
      <Tabs defaultValue="proofs">
        <TabsList>
          <TabsTrigger value="proofs">Proof queue</TabsTrigger>
          <TabsTrigger value="challenges">Challenge queue</TabsTrigger>
          <TabsTrigger value="listings">Listings queue</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          {isAdmin && <TabsTrigger value="users">Users</TabsTrigger>}
        </TabsList>
        <TabsContent value="proofs"><ProofQueue /></TabsContent>
        <TabsContent value="challenges"><ChallengeQueue /></TabsContent>
        <TabsContent value="listings"><ListingsQueue /></TabsContent>
        <TabsContent value="reports"><ReportsQueue /></TabsContent>
        {isAdmin && <TabsContent value="users"><UsersAdmin /></TabsContent>}
      </Tabs>
    </div>
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
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[
        { l: "Users", v: stats.data?.users }, { l: "Challenges", v: stats.data?.chals },
        { l: "Listings", v: stats.data?.listings }, { l: "Transactions", v: stats.data?.txs },
      ].map((s) => (
        <Card key={s.l} className="glass p-5"><div className="text-xs uppercase text-muted-foreground">{s.l}</div><div className="font-display text-3xl font-bold">{s.v ?? "—"}</div></Card>
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
