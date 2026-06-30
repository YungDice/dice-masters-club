import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Search, UserPlus, Check, X, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EmptyState } from "@/components/dice/EmptyState";
import { PageHeader } from "@/components/dice/PageHeader";
import { sendFriendRequest, respondFriendRequest } from "@/lib/dice.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/friends")({
  head: () => ({ meta: [{ title: "Friends — DICE" }] }),
  component: () => <AppShell><Friends /></AppShell>,
});

function Friends() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const sendReqFn = useServerFn(sendFriendRequest);
  const respondFn = useServerFn(respondFriendRequest);

  const friends = useQuery({
    queryKey: ["friends", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("friendships").select("*").or(`requester_id.eq.${user!.id},addressee_id.eq.${user!.id}`).eq("status", "accepted");
      if (!data) return [];
      const ids = data.map((f) => (f.requester_id === user!.id ? f.addressee_id : f.requester_id));
      if (ids.length === 0) return [];
      const { data: profs } = await supabase.from("profiles").select("id,username,display_name,avatar_url,level,last_seen_at").in("id", ids);
      return profs ?? [];
    },
  });
  const pending = useQuery({
    queryKey: ["friend-requests", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("friendships").select("*").eq("addressee_id", user!.id).eq("status", "pending");
      const rows = data ?? [];
      const ids = rows.map((r: any) => r.requester_id);
      const { data: profs } = ids.length ? await supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", ids) : { data: [] };
      const m = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
      return rows.map((r: any) => ({ ...r, profiles: m[r.requester_id] }));
    },
  });
  const search = useQuery({
    queryKey: ["search-users", q, user?.id],
    enabled: q.length >= 2,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").or(`username.ilike.%${q}%,display_name.ilike.%${q}%`).neq("id", user?.id ?? "").limit(15);
      const profs = data ?? [];
      const ids = profs.map((p: any) => p.id);
      if (ids.length === 0 || !user) return profs.map((p: any) => ({ ...p, _rel: "none" }));
      const { data: rels } = await supabase
        .from("friendships")
        .select("*")
        .or(`and(requester_id.eq.${user.id},addressee_id.in.(${ids.join(",")})),and(addressee_id.eq.${user.id},requester_id.in.(${ids.join(",")}))`);
      const relMap = new Map<string, string>();
      for (const r of rels ?? []) {
        const other = r.requester_id === user.id ? r.addressee_id : r.requester_id;
        if (r.status === "accepted") relMap.set(other, "friends");
        else if (r.status === "pending") relMap.set(other, r.requester_id === user.id ? "sent" : "incoming");
        else if (r.status === "blocked") relMap.set(other, "blocked");
      }
      return profs.map((p: any) => ({ ...p, _rel: relMap.get(p.id) ?? "none" }));
    },
  });

  async function sendReq(id: string) {
    if (!user) return;
    try { await sendReqFn({ data: { addresseeId: id } }); toast.success("Friend request sent"); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
    qc.invalidateQueries();
  }
  async function respond(fid: string, accept: boolean) {
    try { await respondFn({ data: { friendshipId: fid, accept } }); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
    qc.invalidateQueries();
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Users}
        title="Friends"
        subtitle={`${(friends.data ?? []).length} friend${(friends.data ?? []).length === 1 ? "" : "s"} · search anyone by @username`}
        accent="emerald"
      />
      <Card className="glass p-3">
        <div className="relative"><Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" placeholder="Search by username..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {q.length >= 2 && (
          <div className="mt-2 space-y-1">
            {(search.data ?? []).map((p: any) => (
              <div key={p.id} className="flex items-center justify-between rounded-md hover:bg-white/5 p-2">
                <Link to="/u/$username" params={{ username: p.username }} className="flex items-center gap-2 flex-1"><Avatar className="size-7"><AvatarImage src={p.avatar_url ?? undefined} /><AvatarFallback>{p.display_name[0]}</AvatarFallback></Avatar><span className="text-sm">{p.display_name} <span className="text-muted-foreground text-xs">@{p.username}</span></span></Link>
                {p._rel === "friends" ? (
                  <span className="text-xs text-emerald-400 px-2">✓ Friends</span>
                ) : p._rel === "sent" ? (
                  <span className="text-xs text-muted-foreground px-2">Requested</span>
                ) : p._rel === "incoming" ? (
                  <span className="text-xs text-amber-400 px-2">Wants to be friends</span>
                ) : p._rel === "blocked" ? (
                  <span className="text-xs text-destructive px-2">Blocked</span>
                ) : (
                  <Button size="sm" onClick={() => sendReq(p.id)}><UserPlus className="size-4 mr-1" />Add</Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {(pending.data ?? []).length > 0 && (
        <Card className="glass p-5">
          <h2 className="font-display font-semibold mb-3">Pending requests</h2>
          <div className="space-y-2">
            {(pending.data ?? []).map((r: any) => (
              <div key={r.id} className="flex items-center justify-between rounded-md bg-white/5 p-2">
                <div className="flex items-center gap-2"><Avatar className="size-7"><AvatarImage src={r.profiles?.avatar_url} /><AvatarFallback>{r.profiles?.display_name?.[0]}</AvatarFallback></Avatar><span className="text-sm">{r.profiles?.display_name}</span></div>
                <div className="flex gap-1"><Button size="sm" onClick={() => respond(r.id, true)}><Check className="size-4" /></Button><Button size="sm" variant="outline" onClick={() => respond(r.id, false)}><X className="size-4" /></Button></div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="glass p-5">
        <h2 className="font-display font-semibold mb-3">Your friends</h2>
        {(friends.data ?? []).length === 0
          ? <EmptyState icon={Users} title="No friends yet" description="Search above to find people on DICE." />
          : <div className="grid gap-2 md:grid-cols-2">{(friends.data ?? []).map((p: any) => {
              const onlineMs = p.last_seen_at ? Date.now() - new Date(p.last_seen_at).getTime() : Infinity;
              const online = onlineMs < 2 * 60 * 1000;
              return (
                <Link key={p.id} to="/u/$username" params={{ username: p.username }} className="flex items-center gap-3 rounded-md bg-white/5 p-3 hover:bg-white/10">
                  <div className="relative">
                    <Avatar className="size-9"><AvatarImage src={p.avatar_url ?? undefined} /><AvatarFallback>{p.display_name[0]}</AvatarFallback></Avatar>
                    <span className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-background ${online ? "bg-emerald-400" : "bg-zinc-500"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.display_name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {online ? <span className="text-emerald-400">Online</span> : (p.last_seen_at ? `Active ${new Date(p.last_seen_at).toLocaleDateString()}` : "Offline")} · Lvl {p.level}
                    </div>
                  </div>
                </Link>
              );
            })}</div>}
      </Card>
    </div>
  );
}
