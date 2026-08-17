import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { MessageSquare, Camera, ArrowLeft, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyRoles } from "@/hooks/use-profile";
import { adminDeleteChallenge } from "@/lib/dice.functions";
import { AppShell } from "@/components/dice/TopNav";
import { DiceBadge } from "@/components/dice/DiceBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";


export const Route = createFileRoute("/challenges/$id")({
  loader: async ({ params }) => {
    const { data } = await supabase
      .from("challenges")
      .select("title,description,dice_reward,category")
      .eq("id", params.id)
      .maybeSingle();
    return { challenge: data };
  },
  head: ({ params, loaderData }) => {
    const c = loaderData?.challenge as { title?: string; description?: string; dice_reward?: number; category?: string } | null | undefined;
    const rawTitle = c?.title?.trim();
    const title = rawTitle ? `${rawTitle.slice(0, 45)} — DICE Challenge` : "Challenge — DICE";
    const rawDesc = c?.description?.trim();
    const description = rawDesc
      ? rawDesc.slice(0, 155)
      : "View challenge details, submissions, and comments on DICE. Complete it to earn DICE and XP.";
    const url = `https://yungdice.com/challenges/${params.id}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: rawTitle ?? "DICE Challenge",
            description,
            url,
            articleSection: c?.category ?? "Challenge",
          }),
        },
      ],
    };
  },
  component: () => <AppShell><Detail /></AppShell>,
});

async function fetchProfiles(ids: (string | null | undefined)[]) {
  const unique = Array.from(new Set(ids.filter((x): x is string => !!x)));
  if (!unique.length) return {} as Record<string, any>;
  const { data } = await supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", unique);
  return Object.fromEntries((data ?? []).map((p: any) => [p.id, p]));
}

function Detail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const roles = useMyRoles(user?.id);
  const isMod = (roles.data ?? []).some((r) => r === "admin" || r === "owner");
  const modDelete = useServerFn(adminDeleteChallenge);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [comment, setComment] = useState("");
  const [opening, setOpening] = useState(false);

  const chal = useQuery({
    queryKey: ["challenge", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("challenges").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const profiles = await fetchProfiles([data.creator_id]);
      return { ...data, creator: data.creator_id ? profiles[data.creator_id] ?? null : null };
    },
  });

  const proofs = useQuery({
    queryKey: ["challenge-proofs", id],
    queryFn: async () => {
      const { data } = await supabase.from("challenge_proofs").select("*")
        .eq("challenge_id", id).eq("status", "approved")
        .order("created_at", { ascending: false }).limit(20);
      const list = data ?? [];
      const profiles = await fetchProfiles(list.map((p: any) => p.user_id));
      return list.map((p: any) => ({ ...p, user: profiles[p.user_id] ?? null }));
    },
  });

  const comments = useQuery({
    queryKey: ["challenge-comments", id],
    queryFn: async () => {
      const { data } = await supabase.from("challenge_comments").select("*")
        .eq("challenge_id", id).order("created_at", { ascending: false }).limit(40);
      const list = data ?? [];
      const profiles = await fetchProfiles(list.map((c: any) => c.user_id));
      return list.map((c: any) => ({ ...c, user: profiles[c.user_id] ?? null }));
    },
  });

  async function postComment() {
    if (!user || !comment.trim()) return;
    await supabase.from("challenge_comments").insert({ challenge_id: id, user_id: user.id, body: comment.trim() });
    setComment(""); qc.invalidateQueries({ queryKey: ["challenge-comments", id] });
  }
  async function openRecord() {
    if (!user) { toast.error("Sign in to record proof"); return; }
    setOpening(true);
    try {
      await supabase.from("challenge_participants").upsert(
        { challenge_id: id, user_id: user.id } as any,
        { onConflict: "challenge_id,user_id" },
      );
    } catch { /* ignore — navigate anyway */ }
    navigate({ to: "/challenges/$id/submit", params: { id } });
  }


  if (chal.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-32" />
        <Card className="glass p-6 space-y-3">
          <Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-2/3" /><Skeleton className="h-16 w-full" />
        </Card>
      </div>
    );
  }
  if (chal.isError) {
    return (
      <Card className="glass p-8 text-center">
        <p className="text-destructive font-semibold">Couldn't load this challenge</p>
        <p className="text-sm text-muted-foreground mt-1">{(chal.error as any)?.message}</p>
        <Link to="/challenges" className="inline-block mt-4"><Button variant="outline">Back to challenges</Button></Link>
      </Card>
    );
  }
  if (!chal.data) {
    return (
      <Card className="glass p-8 text-center">
        <p className="font-semibold">Challenge not found</p>
        <p className="text-sm text-muted-foreground mt-1">It may have been removed or is awaiting review.</p>
        <Link to="/challenges" className="inline-block mt-4"><Button variant="outline">Back to challenges</Button></Link>
      </Card>
    );
  }

  const c = chal.data as any;
  return (
    <div className="space-y-4">
      <Link to="/challenges" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4 mr-1" /> All challenges</Link>
      <Card className="glass p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">{c.category} · {c.difficulty}</div>
            <h1 className="mt-1 font-display text-3xl font-medium">{c.title}</h1>
            <p className="mt-2 text-muted-foreground max-w-2xl whitespace-pre-wrap">{c.description}</p>
            {c.rules && <div className="mt-3 text-sm"><span className="font-semibold">Rules:</span> {c.rules}</div>}
            <div className="mt-3 flex flex-wrap gap-2">{(c.tags ?? []).map((t: string) => <span key={t} className="text-[10px] rounded-full bg-white/5 px-2 py-0.5">#{t}</span>)}</div>
          </div>
          <div className="text-right space-y-2">
            <DiceBadge size="lg" amount={c.dice_reward} />
            <div className="text-xs text-muted-foreground">{c.xp_reward} XP</div>
          </div>
        </div>

        <div className="mt-5 flex gap-2 flex-wrap">
          <Button asChild className="glow-red"><Link to="/challenges/$id/submit" params={{ id }}><Camera className="size-4 mr-1" />Record proof</Link></Button>
          {isMod && (
            <Button variant="destructive" onClick={async () => {
              const reason = window.prompt("Reason for removing this challenge? (creator will be refunded)") ?? "";
              if (reason === null) return;
              try { await modDelete({ data: { challengeId: id, reason } }); toast.success("Challenge removed and refunded"); navigate({ to: "/challenges" }); }
              catch (e: any) { toast.error(e.message); }
            }}><ShieldAlert className="size-4 mr-1" />Remove (mod)</Button>
          )}
        </div>

        {c.creator && <div className="mt-4 text-xs text-muted-foreground">Created by @{c.creator.username}</div>}
      </Card>

      <Card className="glass p-5">
        <h2 className="font-display text-lg font-medium mb-3">Approved submissions</h2>
        {proofs.isLoading ? <div className="grid gap-3 md:grid-cols-3">{Array.from({length:3}).map((_,i) => <Skeleton key={i} className="h-40" />)}</div>
          : proofs.data?.length ? (
          <div className="grid gap-3 md:grid-cols-3">
            {proofs.data.map((p: any) => (
              <div key={p.id} className="rounded-lg border border-border/60 overflow-hidden">
                {p.media_url && p.media_kind?.startsWith("image") && <img src={p.media_url} className="w-full h-40 object-cover" alt={`Challenge submission by ${p.user?.display_name ?? "player"}`} />}
                {p.media_url && p.media_kind?.startsWith("video") && <video src={p.media_url} controls className="w-full h-40 object-cover" />}
                <div className="p-3 flex items-center gap-2">
                  <Avatar className="size-6"><AvatarImage src={p.user?.avatar_url} /><AvatarFallback>{p.user?.display_name?.[0] ?? "?"}</AvatarFallback></Avatar>
                  <span className="text-sm">{p.user?.display_name ?? "User"}</span>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">Be the first to submit proof.</p>}
      </Card>

      <Card className="glass p-5">
        <h2 className="font-display text-lg font-medium mb-3 flex items-center gap-2"><MessageSquare className="size-4" /> Comments</h2>
        {user && (
          <div className="flex gap-2 mb-3">
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment..." className="min-h-10" maxLength={500} />
            <Button onClick={postComment}>Post</Button>
          </div>
        )}
        <ul className="space-y-2">
          {(comments.data ?? []).map((cm: any) => (
            <li key={cm.id} className="flex gap-3 rounded-md bg-white/5 p-3">
              <Avatar className="size-7"><AvatarImage src={cm.user?.avatar_url} /><AvatarFallback>{cm.user?.display_name?.[0] ?? "?"}</AvatarFallback></Avatar>
              <div><div className="text-sm font-medium">{cm.user?.display_name ?? "User"}</div><div className="text-sm text-muted-foreground">{cm.body}</div></div>
            </li>
          ))}
          {!comments.isLoading && !(comments.data ?? []).length && <p className="text-sm text-muted-foreground">No comments yet.</p>}
        </ul>
      </Card>
    </div>
  );
}
