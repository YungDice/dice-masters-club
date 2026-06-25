import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dice/EmptyState";
import { Bell } from "lucide-react";
import { timeAgo } from "@/lib/format";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "Notifications — DICE" }] }),
  component: () => <AppShell><Notif /></AppShell>,
});

function Notif() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["notif", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("notifications").select("*").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(100);
      return data ?? [];
    },
  });
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`notif-${user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => qc.invalidateQueries({ queryKey: ["notif", user.id] })).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);
  async function markAll() {
    if (!user) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    qc.invalidateQueries();
  }
  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex justify-between items-center"><h1 className="font-display text-3xl font-bold">Notifications</h1><Button variant="outline" onClick={markAll}>Mark all read</Button></div>
      {(q.data ?? []).length === 0 ? <EmptyState icon={Bell} title="All clear" description="No notifications yet." />
        : <Card className="glass p-2"><ul>{(q.data ?? []).map((n) => (
            <li key={n.id} className={`rounded-md p-3 ${n.read ? "" : "bg-primary/5"}`}>
              <div className="flex justify-between"><div className="font-medium">{n.title}</div><span className="text-xs text-muted-foreground">{timeAgo(n.created_at)}</span></div>
              {n.body && <div className="text-sm text-muted-foreground">{n.body}</div>}
            </li>
          ))}</ul></Card>}
    </div>
  );
}
