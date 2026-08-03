import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { Music2, ChevronUp, ChevronDown, Heart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/dice/TopNav";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dice/PageHeader";
import { toggleGalleryLike } from "@/lib/dice.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/dikdok")({
  head: () => ({
    meta: [
      { title: "DikDok — DICE" },
      { name: "description", content: "Scroll DikDok, the DICE short-video feed: watch community clips, like posts, and earn DICE coins for engaging with creators." },
      { property: "og:title", content: "DikDok — DICE" },
      { property: "og:description", content: "The DICE short-video feed — watch, like, and earn DICE coins." },
      { property: "og:url", content: "https://yungdice.com/dikdok" },
    ],
    links: [{ rel: "canonical", href: "https://yungdice.com/dikdok" }],
  }),
  component: () => <AppShell><DikDok /></AppShell>,
});

async function signedUrl(path: string) {
  const { data } = await supabase.storage.from("gallery").createSignedUrl(path, 60 * 60 * 6);
  return data?.signedUrl ?? "";
}

function DikDok() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const like = useServerFn(toggleGalleryLike);
  const [idx, setIdx] = useState(0);
  const [ratio, setRatio] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const q = useQuery({
    queryKey: ["dikdok-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("gallery_items")
        .select("*")
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .limit(120);
      const list = data ?? [];
      const withUrls = await Promise.all(list.map(async (i: any) => ({ ...i, _url: await signedUrl(i.media_path) })));
      const ids = list.map((i: any) => i.user_id);
      const { data: profs } = ids.length ? await supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", ids) : { data: [] };
      const m = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
      return withUrls.map((i: any) => ({ ...i, user: m[i.user_id] }));
    },
  });

  const likesQ = useQuery({
    queryKey: ["dikdok-likes"],
    queryFn: async () => {
      const { data } = await supabase.from("gallery_likes").select("item_id,user_id");
      const counts: Record<string, number> = {};
      const mine: Record<string, boolean> = {};
      for (const r of data ?? []) {
        counts[r.item_id] = (counts[r.item_id] ?? 0) + 1;
        if (user && r.user_id === user.id) mine[r.item_id] = true;
      }
      return { counts, mine };
    },
  });

  useEffect(() => {
    const ch = supabase.channel("gallery_likes_feed").on("postgres_changes", { event: "*", schema: "public", table: "gallery_likes" }, () => qc.invalidateQueries({ queryKey: ["dikdok-likes"] })).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const feed = useMemo(() => {
    const arr = [...(q.data ?? [])];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [q.data]);

  useEffect(() => { setIdx(0); }, [feed.length]);
  useEffect(() => { setRatio(null); videoRef.current?.play().catch(() => {}); }, [idx]);

  function next() { setIdx((i) => Math.min(feed.length - 1, i + 1)); }
  function prev() { setIdx((i) => Math.max(0, i - 1)); }

  const cur = feed[idx];

  async function onLike() {
    if (!user || !cur) { toast.error("Sign in to like"); return; }
    try { await like({ data: { itemId: cur.id } }); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
  }

  if (q.isLoading) return <div className="text-center text-muted-foreground py-10">Loading…</div>;
  if (!feed.length) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <Music2 className="mx-auto text-primary size-10" />
        <h1 className="mt-3 font-display text-2xl font-bold">DikDok is empty</h1>
        <p className="mt-2 text-sm text-muted-foreground">Upload an image or video to the Gallery to start the feed.</p>
      </div>
    );
  }

  const isVideo = (cur.media_kind ?? "").startsWith("video/");
  const isImage = (cur.media_kind ?? "").startsWith("image/");
  const isWide = ratio !== null && ratio > 1;
  const count = likesQ.data?.counts[cur.id] ?? 0;
  const liked = !!likesQ.data?.mine[cur.id];

  return (
    <div className="space-y-4">
      <div className={`${isWide ? "max-w-4xl" : "max-w-md"} mx-auto transition-all`}>
      <div className={`relative mx-auto rounded-2xl overflow-hidden bg-black border border-border/60 glow-red w-full ${isWide ? "aspect-video" : "aspect-[9/16]"}`}>
        {isVideo && (
          <video
            key={cur.id}
            ref={videoRef}
            src={cur._url}
            className={`absolute inset-0 w-full h-full ${isWide ? "object-contain" : "object-cover"}`}
            autoPlay loop playsInline controls={false}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth && v.videoHeight) setRatio(v.videoWidth / v.videoHeight);
            }}
            onEnded={next}
            onClick={(e) => { const v = e.currentTarget; if (v.paused) v.play(); else v.pause(); }}
          />
        )}
        {isImage && (
          <img
            key={cur.id}
            src={cur._url}
            alt={cur.caption ?? "post"}
            className={`absolute inset-0 w-full h-full ${isWide ? "object-contain" : "object-cover"}`}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth && img.naturalHeight) setRatio(img.naturalWidth / img.naturalHeight);
            }}
          />
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 text-white pr-16">
          <div className="text-sm font-semibold">@{cur.user?.username ?? "user"}</div>
          {cur.caption && <div className="text-xs mt-1 line-clamp-3">{cur.caption}</div>}
        </div>
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-2 items-center">
          <Button size="icon" variant="secondary" onClick={prev} disabled={idx === 0}><ChevronUp /></Button>
          <Button size="icon" variant={liked ? "default" : "secondary"} onClick={onLike} className={liked ? "glow-red" : ""}>
            <Heart className={`size-4 ${liked ? "fill-current" : ""}`} />
          </Button>
          <span className="text-xs text-white bg-black/60 rounded px-1.5">{count}</span>
          <Button size="icon" variant="secondary" onClick={next} disabled={idx === feed.length - 1}><ChevronDown /></Button>
        </div>
        <div className="absolute left-2 top-2 text-xs rounded bg-black/40 px-2 py-0.5 text-white">{idx + 1} / {feed.length}</div>
      </div>
      <p className="text-center text-xs text-muted-foreground mt-3">Tap video to play/pause</p>
      </div>
    </div>
  );
}
