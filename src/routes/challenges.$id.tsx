import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Heart, MessageSquare, Camera, Flag, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/dice/TopNav";
import { DiceBadge } from "@/components/dice/DiceBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/challenges/$id")({
  head: ({ params }) => ({ meta: [{ title: `Challenge — DICE` }, { name: "description", content: "Challenge details, comments, leaderboard. Submit your proof on DICE." }] }),
  component: () => <AppShell><Detail /></AppShell>,
});

function Detail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const chal = useQuery({
    queryKey: ["challenge", id],
    queryFn: async () => {
      const { data } = await supabase.from("challenges").select("*, profiles!challenges_creator_id_fkey(username,display_name,avatar_url)").eq("id", id).maybeSingle();
      return data;
    },
  });
  const proofs = useQuery({
    queryKey: ["challenge-proofs", id],
    queryFn: async () => {
      const { data } = await supabase.from("challenge_proofs").select("*, profiles!challenge_proofs_user_id_fkey(username,display_name,avatar_url)").eq("challenge_id", id).eq("status", "approved").order("created_at", { ascending: false }).limit(20);
      return data ?? [];
    },
  });
  const comments = useQuery({
    queryKey: ["challenge-comments", id],
    queryFn: async () => {
      const { data } = await supabase.from("challenge_comments").select("*, profiles!challenge_comments_user_id_fkey(username,display_name,avatar_url)").eq("challenge_id", id).order("created_at", { ascending: false }).limit(40);
      return data ?? [];
    },
  });

  async function like() {
    if (!user) return;
    await supabase.from("challenge_likes").upsert({ challenge_id: id, user_id: user.id } as any);
    toast.success("Liked");
  }
  async function postComment() {
    if (!user || !comment.trim()) return;
    await supabase.from("challenge_comments").insert({ challenge_id: id, user_id: user.id, body: comment.trim() });
    setComment(""); qc.invalidateQueries({ queryKey: ["challenge-comments", id] });
  }
  async function report() {
    if (!user) return;
    await supabase.from("reports").insert({ reporter_id: user.id, target_kind: "challenge", target_id: id, reason: "unsafe_or_inappropriate" });
    toast.success("Report submitted to moderators");
  }
  async function joinAndOpenCamera() {
    if (!user) return;
    await supabase.from("challenge_participants").upsert({ challenge_id: id, user_id: user.id } as any, { onConflict: "challenge_id,user_id" });
  }

  if (!chal.data) return <div className="text-center text-muted-foreground py-20">Loading…</div>;
  const c = chal.data as any;
  return (
    <div className="space-y-4">
      <Link to="/challenges" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4 mr-1" /> All challenges</Link>
      <Card className="glass p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">{c.category} · {c.difficulty}</div>
            <h1 className="mt-1 font-display text-3xl font-bold">{c.title}</h1>
            <p className="mt-2 text-muted-foreground max-w-2xl">{c.description}</p>
            {c.rules && <div className="mt-3 text-sm"><span className="font-semibold">Rules:</span> {c.rules}</div>}
            <div className="mt-3 flex flex-wrap gap-2">{(c.tags ?? []).map((t: string) => <span key={t} className="text-[10px] rounded-full bg-white/5 px-2 py-0.5">#{t}</span>)}</div>
          </div>
          <div className="text-right space-y-2">
            <DiceBadge size="lg" amount={c.dice_reward} />
            <div className="text-xs text-muted-foreground">{c.xp_reward} XP</div>
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <Link to="/challenges/$id/submit" params={{ id }} onClick={joinAndOpenCamera}><Button className="glow-red"><Camera className="size-4 mr-1" />Record proof</Button></Link>
          <Button variant="outline" onClick={like}><Heart className="size-4 mr-1" />Like</Button>
          <Button variant="outline" onClick={report}><Flag className="size-4 mr-1" />Report</Button>
        </div>
        {c.profiles && <div className="mt-4 text-xs text-muted-foreground">Created by @{c.profiles.username}</div>}
      </Card>

      <Card className="glass p-5">
        <h2 className="font-display text-lg font-semibold mb-3">Approved submissions</h2>
        {proofs.data?.length ? (
          <div className="grid gap-3 md:grid-cols-3">
            {proofs.data.map((p: any) => (
              <div key={p.id} className="rounded-lg border border-border/60 overflow-hidden">
                {p.media_url && p.media_kind?.startsWith("image") && <img src={p.media_url} className="w-full h-40 object-cover" alt="" />}
                {p.media_url && p.media_kind?.startsWith("video") && <video src={p.media_url} controls className="w-full h-40 object-cover" />}
                <div className="p-3 flex items-center gap-2"><Avatar className="size-6"><AvatarImage src={p.profiles?.avatar_url} /><AvatarFallback>{p.profiles?.display_name?.[0]}</AvatarFallback></Avatar><span className="text-sm">{p.profiles?.display_name}</span></div>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">Be the first to submit proof.</p>}
      </Card>

      <Card className="glass p-5">
        <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2"><MessageSquare className="size-4" /> Comments</h2>
        {user && (
          <div className="flex gap-2 mb-3">
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment..." className="min-h-10" maxLength={500} />
            <Button onClick={postComment}>Post</Button>
          </div>
        )}
        <ul className="space-y-2">
          {(comments.data ?? []).map((cm: any) => (
            <li key={cm.id} className="flex gap-3 rounded-md bg-white/5 p-3">
              <Avatar className="size-7"><AvatarImage src={cm.profiles?.avatar_url} /><AvatarFallback>{cm.profiles?.display_name?.[0]}</AvatarFallback></Avatar>
              <div><div className="text-sm font-medium">{cm.profiles?.display_name}</div><div className="text-sm text-muted-foreground">{cm.body}</div></div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
