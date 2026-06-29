import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { MessageSquare, Send, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyRoles } from "@/hooks/use-profile";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";

export const Route = createFileRoute("/chat")({
  head: () => ({ meta: [{ title: "Chat — DICE" }] }),
  component: () => <AppShell><Chat /></AppShell>,
});

function Chat() {
  const { user } = useAuth();
  const { data: roles } = useMyRoles(user?.id);
  const isStaff = roles?.some((r) => r === "admin" || r === "moderator");
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const q = useQuery({
    queryKey: ["chat"],
    queryFn: async () => {
      const { data } = await supabase.from("chat_messages").select("*").order("created_at", { ascending: false }).limit(100);
      const list = (data ?? []).reverse();
      const ids = Array.from(new Set(list.map((m: any) => m.user_id)));
      const { data: profs } = ids.length ? await supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", ids) : { data: [] };
      const m = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
      return list.map((row: any) => ({ ...row, user: m[row.user_id] }));
    },
  });

  useEffect(() => {
    const ch = supabase.channel("chat_messages").on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, () => qc.invalidateQueries({ queryKey: ["chat"] })).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [q.data]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const text = body.trim();
    if (!text) return;
    if (text.length > 500) { toast.error("Messages over 500 characters are VIP-only."); return; }
    setBody("");
    const { error } = await supabase.from("chat_messages").insert({ user_id: user.id, body: text });
    if (error) toast.error("Couldn't send message. VIP is required for longer messages or media.");
  }

  async function remove(id: string) {
    await supabase.from("chat_messages").delete().eq("id", id);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="font-display text-3xl font-bold flex items-center gap-2"><MessageSquare className="text-primary" /> Global Chat</h1>
      <Card className="glass p-0 overflow-hidden flex flex-col h-[70vh]">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {(q.data ?? []).map((m: any) => {
            const mine = m.user_id === user?.id;
            return (
              <div key={m.id} className={`flex gap-2 ${mine ? "justify-end" : ""}`}>
                {!mine && <Avatar className="size-7 shrink-0"><AvatarImage src={m.user?.avatar_url} /><AvatarFallback>{m.user?.display_name?.[0] ?? "?"}</AvatarFallback></Avatar>}
                <div className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-white/5"}`}>
                  {!mine && <div className="text-[10px] opacity-70 mb-0.5">@{m.user?.username ?? "user"}</div>}
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                </div>
                {(mine || isStaff) && (
                  <button onClick={() => remove(m.id)} className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"><Trash2 className="size-3" /></button>
                )}
              </div>
            );
          })}
          {!q.isLoading && !(q.data ?? []).length && <p className="text-sm text-muted-foreground text-center py-10">Say hi 👋</p>}
        </div>
        <form onSubmit={send} className="border-t border-border/60 p-3 flex gap-2">
          <Input value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} placeholder={user ? "Message everyone…" : "Sign in to chat"} disabled={!user} />
          <Button type="submit" disabled={!user || !body.trim()}><Send className="size-4" /></Button>
        </form>
      </Card>
      <p className="text-xs text-muted-foreground">Be kind. No harassment, spam, or unsafe content. Moderators can remove messages.</p>
    </div>
  );
}
