import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { useWallet, useMyRoles } from "@/hooks/use-profile";
import { AppShell } from "@/components/dice/TopNav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createChallengePaid } from "@/lib/dice.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/challenges/new")({
  head: () => ({ meta: [{ title: "Create challenge — DICE" }] }),
  component: () => <AppShell><Create /></AppShell>,
});

function Create() {
  const { user } = useAuth();
  const { data: wallet } = useWallet(user?.id);
  const { data: roles } = useMyRoles(user?.id);
  const isStaff = roles?.some((r) => r === "admin" || r === "moderator");
  const fee = isStaff ? 0 : 500;
  const nav = useNavigate();
  const create = useServerFn(createChallengePaid);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", rules: "",
    category: "creativity" as any, difficulty: "easy" as any,
    proof_type: "photo" as any, dice_reward: 50, xp_reward: 20,
    tags: "",
  });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (fee > 0 && (wallet?.balance ?? 0) < fee) { toast.error(`Need ${fee} DICE to create a challenge`); return; }
    setBusy(true);
    try {
      await create({ data: {
        title: form.title, description: form.description, rules: form.rules || null,
        category: form.category, difficulty: form.difficulty, proof_type: form.proof_type,
        dice_reward: Number(form.dice_reward), xp_reward: Number(form.xp_reward),
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      } });
      toast.success(fee > 0 ? `Submitted! ${fee} DICE charged.` : "Submitted!");
      nav({ to: "/challenges" });
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
    finally { setBusy(false); }
  }
  return (
    <Card className="glass p-6 max-w-2xl mx-auto">
      <h1 className="font-display text-2xl font-bold">Create a challenge</h1>
      <p className="text-sm text-muted-foreground mt-1">
        All challenges are moderated. Don't post anything unsafe — no alcohol, no self-harm,
        no harassment, nothing explicit. Keep it fun.
      </p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <div className="space-y-2"><Label>Title</Label><Input required maxLength={100} value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} /></div>
        <div className="space-y-2"><Label>Description</Label><Textarea required maxLength={1000} value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} /></div>
        <div className="space-y-2"><Label>Rules (optional)</Label><Textarea maxLength={1000} value={form.rules} onChange={(e) => setForm({...form, rules: e.target.value})} /></div>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm({...form, category: v as any})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
              {["fitness","creativity","gaming","social","photography","video","skill","funny","custom"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent></Select>
          </div>
          <div><Label>Difficulty</Label>
            <Select value={form.difficulty} onValueChange={(v) => setForm({...form, difficulty: v as any})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
              {["easy","medium","hard","extreme"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent></Select>
          </div>
          <div><Label>Proof type</Label>
            <Select value={form.proof_type} onValueChange={(v) => setForm({...form, proof_type: v as any})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
              {["photo","video","gif","text","camera","admin_review","community_vote","auto_timer"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent></Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>DICE reward (max 500)</Label><Input type="number" min={0} max={500} value={form.dice_reward} onChange={(e) => setForm({...form, dice_reward: +e.target.value})} /></div>
          <div><Label>XP reward (max 200)</Label><Input type="number" min={0} max={200} value={form.xp_reward} onChange={(e) => setForm({...form, xp_reward: +e.target.value})} /></div>
        </div>
        <div><Label>Tags (comma-separated)</Label><Input value={form.tags} onChange={(e) => setForm({...form, tags: e.target.value})} placeholder="fitness, fun" /></div>
        <Button disabled={busy} className="w-full glow-red">{busy ? "Submitting..." : "Submit for review"}</Button>
      </form>
    </Card>
  );
}
