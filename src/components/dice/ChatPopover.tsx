import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";

export function ChatPopover() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const q = useQuery({
    queryKey: ["chat-popover"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(60);
      const list = (data ?? []).reverse();
      const ids = Array.from(new Set(list.map((m: any) => m.user_id)));
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", ids)
        : { data: [] };
      const m = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
      return list.map((row: any) => ({ ...row, user: m[row.user_id] }));
    },
  });

  useEffect(() => {
    if (!open) return;
    const ch = supabase
      .channel("chat_messages_popover")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages" },
        () => qc.invalidateQueries({ queryKey: ["chat-popover"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [open, qc]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      });
    }
  }, [q.data, open]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const text = body.trim();
    if (!text) return;
    setBody("");
    const { error } = await supabase.from("chat_messages").insert({ user_id: user.id, body: text });
    if (error) toast.error(error.message);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="grid size-9 place-items-center rounded-md hover:bg-white/5"
          aria-label="Open global chat"
        >
          <MessageSquare className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0 glass">
        <div className="border-b border-border/60 px-3 py-2 flex items-center gap-2">
          <MessageSquare className="size-4 text-primary" />
          <div className="font-display text-sm font-semibold">Global Chat</div>
        </div>
        <div ref={scrollRef} className="h-80 overflow-y-auto p-3 space-y-2">
          {q.isLoading && <p className="text-xs text-muted-foreground text-center py-6">Loading…</p>}
          {!q.isLoading && !(q.data ?? []).length && (
            <p className="text-xs text-muted-foreground text-center py-6">Say hi 👋</p>
          )}
          {(q.data ?? []).map((m: any) => {
            const mine = m.user_id === user?.id;
            return (
              <div key={m.id} className={`flex gap-2 ${mine ? "justify-end" : ""}`}>
                {!mine && (
                  <Avatar className="size-6 shrink-0">
                    <AvatarImage src={m.user?.avatar_url} />
                    <AvatarFallback>{m.user?.display_name?.[0] ?? "?"}</AvatarFallback>
                  </Avatar>
                )}
                <div className={`max-w-[75%] rounded-lg px-2.5 py-1.5 text-xs ${mine ? "bg-primary text-primary-foreground" : "bg-white/5"}`}>
                  {!mine && <div className="text-[10px] opacity-70 mb-0.5">@{m.user?.username ?? "user"}</div>}
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                </div>
              </div>
            );
          })}
        </div>
        <form onSubmit={send} className="border-t border-border/60 p-2 flex gap-2">
          <Input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={500}
            placeholder={user ? "Message everyone…" : "Sign in to chat"}
            disabled={!user}
            className="h-8 text-sm"
          />
          <Button type="submit" size="sm" disabled={!user || !body.trim()}>
            <Send className="size-3.5" />
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
