import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, MessageSquare, Send, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyRoles } from "@/hooks/use-profile";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { useEmoteMap, renderWithEmotes } from "@/lib/cosmetics";
import { NameBadges } from "@/components/dice/NameBadges";

const PAGE_SIZE = 40;
const NEAR_BOTTOM_PX = 80;

export const Route = createFileRoute("/chat")({
  head: () => ({ meta: [{ title: "Chat — DICE" }] }),
  component: () => <AppShell><Chat /></AppShell>,
});

type ChatRow = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  user?: { username?: string; display_name?: string; avatar_url?: string };
};

async function fetchProfilesFor(rows: ChatRow[]) {
  const ids = Array.from(new Set(rows.map((m) => m.user_id)));
  if (!ids.length) return {};
  const { data } = await supabase.from("profiles").select("id,username,display_name,avatar_url,tag,user_emoji").in("id", ids);
  return Object.fromEntries((data ?? []).map((p: any) => [p.id, p]));
}

function Chat() {
  const { user } = useAuth();
  const { data: roles } = useMyRoles(user?.id);
  const isStaff = roles?.some((r) => r === "admin" || r === "moderator");
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const { data: emoteMap } = useEmoteMap();

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const [unread, setUnread] = useState(0);
  const [showJump, setShowJump] = useState(false);
  const initialScrolledRef = useRef(false);

  // Paginated fetch: newest page first, older pages loaded on demand.
  const pages = useInfiniteQuery({
    queryKey: ["chat", "pages"],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      let q = supabase.from("chat_messages").select("*").order("created_at", { ascending: false }).limit(PAGE_SIZE);
      if (pageParam) q = q.lt("created_at", pageParam);
      const { data } = await q;
      const rows = (data ?? []) as ChatRow[];
      const profs = await fetchProfilesFor(rows);
      return rows.map((r) => ({ ...r, user: (profs as any)[r.user_id] }));
    },
    getNextPageParam: (last) => (last.length < PAGE_SIZE ? undefined : last[last.length - 1]?.created_at ?? undefined),
  });

  // Flattened chronological list (oldest → newest) for rendering.
  const messages = useMemo(() => {
    const all = (pages.data?.pages ?? []).flat();
    // Dedupe (realtime insertions may race) and sort ascending.
    const map = new Map<string, ChatRow>();
    for (const m of all) map.set(m.id, m);
    return Array.from(map.values()).sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [pages.data]);

  // Track scroll position → decide "near bottom" and toggle jump button.
  const onScroll = useCallback(() => {
    const el = scrollRef.current; if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distance < NEAR_BOTTOM_PX;
    isNearBottomRef.current = near;
    setShowJump(!near);
    if (near) setUnread(0);

    // Load older when hitting the top.
    if (el.scrollTop < 40 && pages.hasNextPage && !pages.isFetchingNextPage) {
      const prevHeight = el.scrollHeight;
      pages.fetchNextPage().then(() => {
        // Restore scroll position after older items are prepended.
        requestAnimationFrame(() => {
          const el2 = scrollRef.current; if (!el2) return;
          el2.scrollTop = el2.scrollHeight - prevHeight;
        });
      });
    }
  }, [pages]);

  // Initial mount → jump straight to newest message (no manual scrolling).
  // Re-scroll a few times to account for images/emotes settling their heights.
  useLayoutEffect(() => {
    if (initialScrolledRef.current) return;
    if (!messages.length) return;
    const el = scrollRef.current; if (!el) return;
    const jump = () => { const e = scrollRef.current; if (e) e.scrollTop = e.scrollHeight; };
    jump();
    // Belt-and-braces: re-jump after paint + after content likely settles.
    requestAnimationFrame(jump);
    const t1 = setTimeout(jump, 120);
    const t2 = setTimeout(jump, 400);
    initialScrolledRef.current = true;
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [messages.length]);

  // Auto-follow newest messages if the user is already near bottom.
  useEffect(() => {
    if (!initialScrolledRef.current) return;
    if (isNearBottomRef.current) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages.length]);

  // Realtime — refetch newest page on any change.
  useEffect(() => {
    const ch = supabase
      .channel("chat_messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, async (payload) => {
        const newRow = payload.new as ChatRow;
        const profs = await fetchProfilesFor([newRow]);
        const enriched = { ...newRow, user: (profs as any)[newRow.user_id] };
        qc.setQueryData<any>(["chat", "pages"], (old: any) => {
          if (!old) return old;
          const pagesArr = [...old.pages];
          pagesArr[0] = [enriched, ...pagesArr[0]];
          return { ...old, pages: pagesArr };
        });
        if (!isNearBottomRef.current && newRow.user_id !== user?.id) {
          setUnread((n) => n + 1);
        }
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_messages" }, (payload) => {
        const oldId = (payload.old as any)?.id;
        qc.setQueryData<any>(["chat", "pages"], (old: any) => {
          if (!old) return old;
          return { ...old, pages: old.pages.map((p: ChatRow[]) => p.filter((m) => m.id !== oldId)) };
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, user?.id]);

  function jumpToBottom() {
    const el = scrollRef.current; if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setUnread(0);
    setShowJump(false);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const text = body.trim();
    if (!text) return;
    if (text.length > 500) { toast.error("Messages over 500 characters are VIP-only."); return; }
    setBody("");
    isNearBottomRef.current = true; // sending should jump us to bottom
    const { error } = await supabase.from("chat_messages").insert({ user_id: user.id, body: text });
    if (error) toast.error("Couldn't send message. VIP is required for longer messages or media.");
  }

  async function remove(id: string) {
    await supabase.from("chat_messages").delete().eq("id", id);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="font-display text-3xl font-bold flex items-center gap-2"><MessageSquare className="text-primary" /> Global Chat</h1>
      <Card className="glass p-0 overflow-hidden flex flex-col h-[70vh] relative">
        <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-4 space-y-3">
          {pages.isFetchingNextPage && (
            <div className="text-center text-xs text-muted-foreground py-2">Loading older messages…</div>
          )}
          {!pages.hasNextPage && messages.length >= PAGE_SIZE && (
            <div className="text-center text-[10px] uppercase tracking-wider text-muted-foreground/60 py-2">Start of chat</div>
          )}
          {messages.map((m) => {
            const mine = m.user_id === user?.id;
            return (
              <div key={m.id} className={`group flex gap-2 ${mine ? "justify-end" : ""}`}>
                {!mine && (
                  <Avatar className="size-7 shrink-0">
                    <AvatarImage src={m.user?.avatar_url} />
                    <AvatarFallback>{m.user?.display_name?.[0] ?? "?"}</AvatarFallback>
                  </Avatar>
                )}
                <div className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-white/5"}`}>
                  {!mine && (
                    <div className="text-[10px] opacity-70 mb-0.5 flex items-center gap-1 flex-wrap">
                      <span>@{m.user?.username ?? "user"}</span>
                      {(m.user as any)?.tag && <span className="text-primary font-mono">#{(m.user as any).tag}</span>}
                      <NameBadges userId={m.user_id} emoji={(m.user as any)?.user_emoji} />
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words">{renderWithEmotes(m.body, emoteMap)}</div>
                </div>
                {(mine || isStaff) && (
                  <button
                    onClick={() => remove(m.id)}
                    className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity self-center"
                    aria-label="Delete message"
                  >
                    <Trash2 className="size-3" />
                  </button>
                )}
              </div>
            );
          })}
          {!pages.isLoading && !messages.length && (
            <p className="text-sm text-muted-foreground text-center py-10">Say hi 👋</p>
          )}
          <div ref={bottomAnchorRef} />
        </div>

        {showJump && (
          <button
            onClick={jumpToBottom}
            className="absolute right-4 bottom-20 z-10 rounded-full bg-primary text-primary-foreground shadow-lg px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 hover:opacity-90"
          >
            <ArrowDown className="size-3.5" />
            {unread > 0 ? `${unread} new message${unread > 1 ? "s" : ""}` : "Jump to latest"}
          </button>
        )}

        <form onSubmit={send} className="border-t border-border/60 p-3 flex gap-2">
          <Input value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} placeholder={user ? "Message everyone…" : "Sign in to chat"} disabled={!user} />
          <Button type="submit" disabled={!user || !body.trim()}><Send className="size-4" /></Button>
        </form>
      </Card>
      <p className="text-xs text-muted-foreground">Be kind. No harassment, spam, or unsafe content. Moderators can remove messages.</p>
    </div>
  );
}
