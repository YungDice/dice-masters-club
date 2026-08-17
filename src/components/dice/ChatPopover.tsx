import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Send, Image as ImageIcon, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyProfile } from "@/hooks/use-profile";
import { useServerFn } from "@tanstack/react-start";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { sendChatMessage } from "@/lib/dice.functions";
import { toast } from "sonner";
import { NameBadges } from "@/components/dice/NameBadges";

const LAST_SEEN_KEY = "dice:chat:last_seen_at";

export function ChatPopover() {
  const { user } = useAuth();
  const { data: profile } = useMyProfile(user?.id);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [unread, setUnread] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const send = useServerFn(sendChatMessage);
  const isVip = !!(profile as any)?.vip_until && new Date((profile as any).vip_until) > new Date();
  const maxLen = isVip ? 4000 : 500;

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
        ? await supabase.from("profiles").select("id,username,display_name,avatar_url,vip_until,user_emoji").in("id", ids)
        : { data: [] };
      const m = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
      return list.map((row: any) => ({ ...row, user: m[row.user_id] }));
    },
  });

  // Refs so the realtime handler always sees the latest values (no stale closure)
  const openRef = useRef(open);
  const lastSeenRef = useRef<string>(
    typeof window !== "undefined" ? (localStorage.getItem(LAST_SEEN_KEY) ?? new Date(0).toISOString()) : new Date(0).toISOString(),
  );
  useEffect(() => { openRef.current = open; }, [open]);

  const markRead = useCallback(() => {
    const now = new Date().toISOString();
    lastSeenRef.current = now;
    localStorage.setItem(LAST_SEEN_KEY, now);
    setUnread(0);
  }, []);

  // Initial unread count from last-seen timestamp
  useEffect(() => {
    (async () => {
      const { count } = await supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .gt("created_at", lastSeenRef.current);
      setUnread(count ?? 0);
    })();
  }, []);

  // Always-on realtime: only count messages newer than last-seen AND not while open
  useEffect(() => {
    const ch = supabase.channel("chat_messages_badge").on("postgres_changes",
      { event: "INSERT", schema: "public", table: "chat_messages" },
      (payload: any) => {
        const row = payload.new;
        if (!row) return;
        if (openRef.current) {
          // Popover visible: keep last-seen current and refresh list, don't badge
          markRead();
          qc.invalidateQueries({ queryKey: ["chat-popover"] });
          return;
        }
        if (row.user_id === user?.id) return; // own message
        if (row.created_at && row.created_at <= lastSeenRef.current) return; // already read
        setUnread((n) => Math.min(n + 1, 99));
      },
    ).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, user?.id, markRead]);

  // Mark as read when opening AND when closing
  useEffect(() => { if (open) markRead(); }, [open, markRead]);
  useEffect(() => () => { markRead(); }, [markRead]);

  // Always scroll to latest when the popover opens or new messages arrive
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    // Defer to next frame so the list has rendered
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [open, q.data]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const text = body.trim();
    if (!text) return;
    setBody("");
    try { await send({ data: { body: text } }); }
    catch (err: any) { toast.error(err.message ?? "Failed"); }
  }

  async function pickImage(file: File) {
    if (!user) return;
    if (!isVip) { toast.error("VIP only — buy VIP in Settings"); return; }
    if (!file.type.startsWith("image/")) { toast.error("Images only"); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error("Max 8MB"); return; }
    const path = `${user.id}/${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("gallery").upload(path, file, { contentType: file.type });
    if (error) { toast.error(error.message); return; }
    const { data } = await supabase.storage.from("gallery").createSignedUrl(path, 60 * 60 * 24 * 30);
    if (!data?.signedUrl) { toast.error("Upload failed"); return; }
    try {
      await send({ data: { body: "", mediaUrl: data.signedUrl, mediaKind: file.type } });
    } catch (err: any) { toast.error(err.message ?? "Failed"); }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative grid size-9 place-items-center rounded-md hover:bg-white/5" aria-label="Open global chat">
          <MessageSquare className="size-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center leading-none shadow-[0_0_8px_rgba(239,68,68,0.6)]">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0 glass">
        <div className="border-b border-border/60 px-3 py-2 flex items-center gap-2">
          <MessageSquare className="size-4 text-primary" />
          <div className="font-display text-sm font-medium">Global Chat</div>
          {isVip && <span className="ml-auto flex items-center gap-1 text-xs text-foreground"><Crown className="size-3" />VIP</span>}
        </div>
        <div ref={scrollRef} className="h-80 overflow-y-auto p-3 space-y-2">
          {q.isLoading && <p className="text-xs text-muted-foreground text-center py-6">Loading…</p>}
          {!q.isLoading && !(q.data ?? []).length && (
            <p className="text-xs text-muted-foreground text-center py-6">Say hi 👋</p>
          )}
          {(q.data ?? []).map((m: any) => {
            const mine = m.user_id === user?.id;
            const senderVip = m.user?.vip_until && new Date(m.user.vip_until) > new Date();
            return (
              <div key={m.id} className={`flex gap-2 ${mine ? "justify-end" : ""}`}>
                {!mine && (
                  <Avatar className="size-6 shrink-0">
                    <AvatarImage src={m.user?.avatar_url} />
                    <AvatarFallback>{m.user?.display_name?.[0] ?? "?"}</AvatarFallback>
                  </Avatar>
                )}
                <div className={`max-w-[75%] rounded-lg px-2.5 py-1.5 text-xs ${mine ? "bg-primary text-primary-foreground" : "bg-white/5"}`}>
                  {!mine && (
                    <div className="text-[10px] opacity-70 mb-0.5 flex items-center gap-1">
                      @{m.user?.username ?? "user"}
                      {senderVip && <Crown className="size-2.5 text-foreground" />}
                      <NameBadges userId={m.user_id} emoji={m.user?.user_emoji} />
                    </div>
                  )}
                  {m.body && <div className="whitespace-pre-wrap break-words">{m.body}</div>}
                  {m.media_url && (
                    <img src={m.media_url} alt={`Image shared by ${m.display_name ?? "chat user"}`} className="mt-1 rounded max-h-48 max-w-full" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <form onSubmit={submit} className="border-t border-border/60 p-2 flex gap-1.5 items-center">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) pickImage(f); if (fileRef.current) fileRef.current.value=""; }} />
          <Button type="button" size="icon" variant="ghost" className="size-8 shrink-0"
            disabled={!user || !isVip}
            aria-label={isVip ? "Upload image" : "Upload image (VIP only)"}
            title={isVip ? "Send image" : "VIP only"}
            onClick={() => fileRef.current?.click()}>
            <ImageIcon className="size-4" />
          </Button>
          <Input value={body} onChange={(e) => setBody(e.target.value)}
            maxLength={maxLen}
            placeholder={user ? (isVip ? "VIP — bigger messages…" : "Message everyone…") : "Sign in to chat"}
            disabled={!user} className="h-8 text-sm" />
          <Button type="submit" size="sm" disabled={!user || !body.trim()}>
            <Send className="size-3.5" />
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
