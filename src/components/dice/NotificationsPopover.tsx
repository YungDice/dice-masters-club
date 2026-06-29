import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/format";

export function NotificationsPopover() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ["notif-pop", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(30);
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`notif-pop-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["notif-pop", user.id] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);

  const unread = (q.data ?? []).filter((n: any) => !n.read).length;

  async function markAll() {
    if (!user) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    qc.invalidateQueries({ queryKey: ["notif-pop", user.id] });
  }

  async function markOne(id: string) {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["notif-pop", user?.id] });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative grid size-9 place-items-center rounded-md hover:bg-white/5" aria-label="Notifications">
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-primary text-[10px] font-bold text-primary-foreground grid place-items-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0 glass">
        <div className="border-b border-border/60 px-3 py-2 flex items-center gap-2">
          <Bell className="size-4 text-primary" />
          <div className="font-display text-sm font-semibold">Notifications</div>
          {unread > 0 && (
            <button onClick={markAll} className="ml-auto text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <CheckCheck className="size-3" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {q.isLoading && <p className="text-xs text-muted-foreground text-center py-6">Loading…</p>}
          {!q.isLoading && (q.data ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">All clear 🎉</p>
          )}
          <ul>
            {(q.data ?? []).map((n: any) => {
              const inner = (
                <div className={`px-3 py-2 border-b border-border/40 last:border-0 ${n.read ? "" : "bg-primary/5"}`}>
                  <div className="flex justify-between gap-2">
                    <div className="text-sm font-medium line-clamp-1">{n.title}</div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(n.created_at)}</span>
                  </div>
                  {n.body && <div className="text-xs text-muted-foreground line-clamp-2">{n.body}</div>}
                </div>
              );
              return (
                <li key={n.id} onClick={() => !n.read && markOne(n.id)}>
                  {n.link ? <Link to={n.link} onClick={() => setOpen(false)}>{inner}</Link> : inner}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="border-t border-border/60 p-2">
          <Link to="/notifications" onClick={() => setOpen(false)}>
            <Button variant="outline" size="sm" className="w-full">View all</Button>
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
