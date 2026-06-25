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

  const friends = useQuery({
    queryKey: ["friends", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("friendships").select("*").or(`requester_id.eq.${user!.id},addressee_id.eq.${user!.id}`).eq("status", "accepted");
      if (!data) return [];
      const ids = data.map((f) => (f.requester_id === user!.id ? f.addressee_id : f.requester_id));
      if (ids.length === 0) return [];
      const { data: profs } = await supabase.from("profiles").select("*").in("id", ids);
      return profs ?? [];
    },
  });
  const pending = useQuery({
    queryKey: ["friend-requests", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("friendships").select("*, profiles!friendships_requester_id_fkey(*)").eq("addressee_id", user!.id).eq("status", "pending");
      return data ?? [];
    },
  });
  const search = useQuery({
    queryKey: ["search-users", q],
    enabled: q.length >= 2,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").or(`username.ilike.%${q}%,display_name.ilike.%${q}%`).neq("id", user?.id ?? "").limit(15);
      return data ?? [];
    },
  });

  async function sendReq(id: string) {
    if (!user) return;
    const { error } = await supabase.from("friendships").insert({ requester_id: user.id, addressee_id: id, status: "pending" });
    if (error) toast.error(error.message); else toast.success("Friend request sent");
    qc.invalidateQueries();
  }
  async function respond(fid: string, accept: boolean) {
    await supabase.from("friendships").update({ status: accept ? "accepted" : "blocked" }).eq("id", fid);
    qc.invalidateQueries();
  }

  return (
    <div className="space-y-4">
      <div><h1 className="font-display text-3xl font-bold">Friends</h1></div>
      <Card className="glass p-3">
        <div className="relative"><Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" placeholder="Search by username..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {q.length >= 2 && (
          <div className="mt-2 space-y-1">
            {(search.data ?? []).map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-md hover:bg-white/5 p-2">
                <Link to="/u/$username" params={{ username: p.username }} className="flex items-center gap-2 flex-1"><Avatar className="size-7"><AvatarImage src={p.avatar_url ?? undefined} /><AvatarFallback>{p.display_name[0]}</AvatarFallback></Avatar><span className="text-sm">{p.display_name} <span className="text-muted-foreground text-xs">@{p.username}</span></span></Link>
                <Button size="sm" onClick={() => sendReq(p.id)}><UserPlus className="size-4 mr-1" />Add</Button>
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
          : <div className="grid gap-2 md:grid-cols-2">{(friends.data ?? []).map((p) => (
              <Link key={p.id} to="/u/$username" params={{ username: p.username }} className="flex items-center gap-3 rounded-md bg-white/5 p-3 hover:bg-white/10">
                <Avatar className="size-9"><AvatarImage src={p.avatar_url ?? undefined} /><AvatarFallback>{p.display_name[0]}</AvatarFallback></Avatar>
                <div><div className="text-sm font-medium">{p.display_name}</div><div className="text-xs text-muted-foreground">Lvl {p.level} · @{p.username}</div></div>
              </Link>
            ))}</div>}
      </Card>
    </div>
  );
}
