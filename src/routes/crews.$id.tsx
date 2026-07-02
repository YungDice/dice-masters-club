import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  Users, Crown, Shield, LogOut, Coins, Sparkles, Check, X, UserMinus, ArrowUp, ArrowDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/dice/TopNav";
import { PageHeader } from "@/components/dice/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/dice/EmptyState";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { fmt, handle } from "@/lib/format";
import { toast } from "sonner";
import {
  donateToCrew, leaveCrew, kickCrewMember, setCrewRole, respondCrewJoin,
} from "@/lib/crew.functions";

export const Route = createFileRoute("/crews/$id")({
  head: ({ params }) => ({ meta: [{ title: `Crew — DICE` }] }),
  component: () => <AppShell><CrewPage /></AppShell>,
});

function CrewPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const donate = useServerFn(donateToCrew);
  const leave = useServerFn(leaveCrew);
  const kick = useServerFn(kickCrewMember);
  const setRole = useServerFn(setCrewRole);
  const respond = useServerFn(respondCrewJoin);
  const [donateOpen, setDonateOpen] = useState(false);
  const [amount, setAmount] = useState(500);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [cAvatar, setCAvatar] = useState("");
  const [cBanner, setCBanner] = useState("");
  const [cDesc, setCDesc] = useState("");

  const crew = useQuery({
    queryKey: ["crew", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("crews" as any).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const members = useQuery({
    queryKey: ["crew-members", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("crew_members" as any)
        .select("*, profile:profiles(id,username,display_name,tag,avatar_url,level)")
        .eq("crew_id", id)
        .order("role", { ascending: true })
        .order("contribution_weekly", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const me = (members.data ?? []).find((m: any) => m.user_id === user?.id);
  const canManage = me?.role === "owner" || me?.role === "officer";
  const isOwner = me?.role === "owner";

  const requests = useQuery({
    queryKey: ["crew-requests", id, canManage],
    enabled: !!canManage,
    queryFn: async () => {
      const { data } = await supabase
        .from("crew_join_requests" as any)
        .select("*, profile:profiles(id,username,display_name,tag,avatar_url,level)")
        .eq("crew_id", id)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      return (data ?? []) as any[];
    },
  });

  const recentDonations = useQuery({
    queryKey: ["crew-donations", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("crew_donations" as any)
        .select("*, profile:profiles(id,username,display_name,tag,avatar_url)")
        .eq("crew_id", id)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data ?? []) as any[];
    },
  });

  if (crew.isLoading) return <div className="p-8 text-center text-muted-foreground">Loading crew…</div>;
  if (!crew.data) return <EmptyState icon={Users} title="Crew not found" description="This crew may have been disbanded." />;

  const c = crew.data;

  async function onDonate() {
    if (amount < 100) return toast.error("Minimum 100 DICE");
    try {
      await donate({ data: { amount } });
      toast.success(`Donated ${fmt(amount)} DICE`);
      setDonateOpen(false);
      qc.invalidateQueries({ queryKey: ["crew", id] });
      qc.invalidateQueries({ queryKey: ["crew-members", id] });
      qc.invalidateQueries({ queryKey: ["crew-donations", id] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e: any) { toast.error(e.message); }
  }

  async function onLeave() {
    try {
      await leave({});
      toast.success(isOwner ? "Crew disbanded" : "Left the crew");
      navigate({ to: "/crews" });
    } catch (e: any) { toast.error(e.message); }
  }

  async function onKick(userId: string) {
    if (!confirm("Kick this member?")) return;
    try {
      await kick({ data: { userId } });
      toast.success("Member removed");
      qc.invalidateQueries({ queryKey: ["crew-members", id] });
      qc.invalidateQueries({ queryKey: ["crew", id] });
    } catch (e: any) { toast.error(e.message); }
  }

  async function onSetRole(userId: string, role: "officer" | "member") {
    try {
      await setRole({ data: { userId, role } });
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["crew-members", id] });
    } catch (e: any) { toast.error(e.message); }
  }

  async function onRespond(requestId: string, accept: boolean) {
    try {
      await respond({ data: { requestId, accept } });
      toast.success(accept ? "Member added" : "Request declined");
      qc.invalidateQueries({ queryKey: ["crew-requests", id] });
      qc.invalidateQueries({ queryKey: ["crew-members", id] });
      qc.invalidateQueries({ queryKey: ["crew", id] });
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-6">
      <Card
        className="p-6 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, rgba(201,168,76,0.10), rgba(0,0,0,0.4))",
          borderColor: "rgba(201,168,76,0.35)",
        }}
      >
        <div className="flex flex-col sm:flex-row items-start gap-5">
          <Avatar className="size-20 ring-2 ring-amber-400/50">
            <AvatarImage src={c.avatar_url ?? undefined} />
            <AvatarFallback className="text-lg font-mono">{c.tag}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-2xl font-bold flex flex-wrap items-center gap-2">
              {c.name}
              <span className="font-mono text-primary text-lg">[{c.tag}]</span>
              {c.is_open
                ? <span className="text-[10px] uppercase tracking-widest text-emerald-300/80 border border-emerald-400/30 rounded px-1.5 py-0.5">Open</span>
                : <span className="text-[10px] uppercase tracking-widest text-amber-200/80 border border-amber-400/30 rounded px-1.5 py-0.5">Approval</span>}
            </div>
            {c.description && <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{c.description}</p>}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
              <Stat label="Members" value={`${c.member_count}/${c.max_members}`} />
              <Stat label="Weekly pts" value={fmt(c.weekly_score)} accent />
              <Stat label="Total pts" value={fmt(c.total_score)} />
              <Stat label="Level" value={c.level} />
            </div>
          </div>
          <div className="flex flex-col gap-2 w-full sm:w-auto">
            {me ? (
              <>
                <Button onClick={() => setDonateOpen(true)}>
                  <Coins className="size-4 mr-1.5" /> Donate DICE
                </Button>
                <Button variant="outline" onClick={() => setLeaveOpen(true)}>
                  <LogOut className="size-4 mr-1.5" /> {isOwner ? "Disband" : "Leave"}
                </Button>
              </>
            ) : (
              <Button asChild variant="outline"><Link to="/crews">Back to crews</Link></Button>
            )}
          </div>
        </div>
      </Card>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members"><Users className="size-4 mr-1.5" /> Members ({c.member_count})</TabsTrigger>
          <TabsTrigger value="donations"><Coins className="size-4 mr-1.5" /> Donations</TabsTrigger>
          {canManage && (
            <TabsTrigger value="requests">
              <Sparkles className="size-4 mr-1.5" /> Requests ({requests.data?.length ?? 0})
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="members" className="mt-4">
          <Card className="p-0 overflow-hidden">
            <div className="divide-y divide-white/5">
              {(members.data ?? []).map((m: any) => (
                <div key={m.user_id} className="flex items-center gap-3 p-3">
                  <Avatar className="size-10">
                    <AvatarImage src={m.profile?.avatar_url ?? undefined} />
                    <AvatarFallback>{m.profile?.display_name?.[0] ?? "?"}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <Link
                      to="/u/$username"
                      params={{ username: m.profile?.username ?? "" }}
                      className="font-semibold hover:underline truncate block"
                    >
                      {m.profile?.display_name ?? m.profile?.username}
                      {m.profile?.tag && <span className="text-primary font-mono ml-0.5">#{m.profile.tag}</span>}
                    </Link>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      {m.role === "owner" && <span className="text-amber-300 inline-flex items-center gap-1"><Crown className="size-3" /> Owner</span>}
                      {m.role === "officer" && <span className="text-sky-300 inline-flex items-center gap-1"><Shield className="size-3" /> Officer</span>}
                      {m.role === "member" && <span>Member</span>}
                      · Lvl {m.profile?.level ?? 1}
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="font-semibold text-amber-200">{fmt(m.contribution_weekly)}</div>
                    <div className="text-muted-foreground">weekly · total {fmt(m.contribution_total)}</div>
                  </div>
                  {isOwner && m.role !== "owner" && (
                    <div className="flex gap-1">
                      {m.role === "member" ? (
                        <Button size="icon" variant="ghost" title="Promote to officer" onClick={() => onSetRole(m.user_id, "officer")}>
                          <ArrowUp className="size-4" />
                        </Button>
                      ) : (
                        <Button size="icon" variant="ghost" title="Demote to member" onClick={() => onSetRole(m.user_id, "member")}>
                          <ArrowDown className="size-4" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="text-destructive" title="Kick" onClick={() => onKick(m.user_id)}>
                        <UserMinus className="size-4" />
                      </Button>
                    </div>
                  )}
                  {!isOwner && canManage && m.role === "member" && (
                    <Button size="icon" variant="ghost" className="text-destructive" title="Kick" onClick={() => onKick(m.user_id)}>
                      <UserMinus className="size-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="donations" className="mt-4">
          {(recentDonations.data ?? []).length === 0 ? (
            <EmptyState icon={Coins} title="No donations yet" description="Members' donations show up here." />
          ) : (
            <Card className="p-0 overflow-hidden">
              <div className="divide-y divide-white/5">
                {recentDonations.data!.map((d: any) => (
                  <div key={d.id} className="flex items-center gap-3 p-3 text-sm">
                    <Avatar className="size-8">
                      <AvatarImage src={d.profile?.avatar_url ?? undefined} />
                      <AvatarFallback>{d.profile?.display_name?.[0] ?? "?"}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 truncate">
                      <b>{d.profile?.display_name ?? d.profile?.username ?? "Someone"}</b>
                      <span className="text-muted-foreground"> donated </span>
                      <b className="text-amber-200">{fmt(d.amount)} DICE</b>
                    </div>
                    <div className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </TabsContent>

        {canManage && (
          <TabsContent value="requests" className="mt-4">
            {(requests.data ?? []).length === 0 ? (
              <EmptyState icon={Sparkles} title="No pending requests" description="Approvals will appear here." />
            ) : (
              <Card className="p-0 overflow-hidden">
                <div className="divide-y divide-white/5">
                  {requests.data!.map((r: any) => (
                    <div key={r.id} className="flex items-center gap-3 p-3">
                      <Avatar className="size-9">
                        <AvatarImage src={r.profile?.avatar_url ?? undefined} />
                        <AvatarFallback>{r.profile?.display_name?.[0] ?? "?"}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {r.profile?.display_name ?? r.profile?.username}
                          {r.profile?.tag && <span className="text-primary font-mono ml-0.5">#{r.profile.tag}</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">Lvl {r.profile?.level ?? 1}</div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => onRespond(r.id, true)}>
                        <Check className="size-4 mr-1" /> Accept
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onRespond(r.id, false)}>
                        <X className="size-4 mr-1" /> Reject
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Donate dialog */}
      <Dialog open={donateOpen} onOpenChange={setDonateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Donate to {c.name}</DialogTitle>
            <DialogDescription>
              Donations add to the crew's weekly score. Weekly rewards are split between contributors on Monday.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="number"
              min={100}
              max={1_000_000}
              value={amount}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
            />
            <div className="flex flex-wrap gap-2">
              {[100, 500, 1000, 5000, 25000].map((v) => (
                <Button key={v} size="sm" variant="outline" onClick={() => setAmount(v)}>{fmt(v)}</Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDonateOpen(false)}>Cancel</Button>
            <Button onClick={onDonate}>Donate {fmt(amount)} DICE</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave/disband */}
      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isOwner ? "Disband crew?" : "Leave crew?"}</DialogTitle>
            <DialogDescription>
              {isOwner
                ? "As owner, leaving disbands the whole crew. This cannot be undone."
                : "You can rejoin later if the crew has space."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={onLeave}>
              {isOwner ? "Disband forever" : "Leave crew"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: any; accent?: boolean }) {
  return (
    <div className="rounded-md bg-white/[0.04] px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`font-semibold ${accent ? "text-amber-200" : ""}`}>{value}</div>
    </div>
  );
}
