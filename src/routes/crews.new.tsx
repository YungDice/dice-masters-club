import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Users, Sparkles } from "lucide-react";
import { AppShell } from "@/components/dice/TopNav";
import { PageHeader } from "@/components/dice/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { createCrew } from "@/lib/crew.functions";

export const Route = createFileRoute("/crews/new")({
  head: () => ({
    meta: [
      { title: "Found a Crew — DICE" },
      { name: "description", content: "Found your own DICE crew: pick a name and tag, set the minimum level, choose open or invite-only, and start climbing the crew leaderboard." },
      { property: "og:title", content: "Found a Crew — DICE" },
      { property: "og:description", content: "Create a DICE crew, recruit members, and compete on the crew leaderboard." },
      { property: "og:url", content: "https://yungdice.com/crews/new" },
    ],
    links: [{ rel: "canonical", href: "https://yungdice.com/crews/new" }],
  }),
  component: () => <AppShell><NewCrewPage /></AppShell>,
});

function NewCrewPage() {
  const navigate = useNavigate();
  const create = useServerFn(createCrew);
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [description, setDescription] = useState("");
  const [isOpen, setIsOpen] = useState(true);
  const [minLevel, setMinLevel] = useState(1);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await create({ data: { name: name.trim(), tag: tag.trim(), description, isOpen, minLevel } });
      toast.success("Crew founded! (−5,000 DICE)");
      navigate({ to: "/crews/$id", params: { id: (res as any).crew_id } });
    } catch (e: any) {
      toast.error(e.message ?? "Could not create crew");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Sparkles}
        title="Found your Crew"
        subtitle="Rally friends, donate DICE, and climb the weekly crew leaderboard."
      />
      <Card className="p-6 space-y-5 max-w-xl mx-auto">
        <div className="rounded-md border border-white/10 bg-white/5 p-3 text-xs text-muted-foreground">
          Founding a crew costs <b>5,000 DICE</b> and requires <b>Level 5+</b>. As owner you can invite,
          promote officers, kick members, or disband.
        </div>
        <div className="space-y-2">
          <Label>Crew name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="High Rollers" />
        </div>
        <div className="space-y-2">
          <Label>Tag (2–5 chars, A–Z / 0–9)</Label>
          <Input value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())} maxLength={5} placeholder="HIGH" className="font-mono" />
        </div>
        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} placeholder="What is your crew about?" />
        </div>
        <div className="flex items-center justify-between rounded-md bg-white/[0.03] p-3">
          <div>
            <div className="text-sm font-medium">Open crew</div>
            <div className="text-xs text-muted-foreground">Anyone at min level can join instantly. Off = requests to approve.</div>
          </div>
          <Switch checked={isOpen} onCheckedChange={setIsOpen} />
        </div>
        <div className="space-y-2">
          <Label>Minimum level to join: {minLevel}</Label>
          <input type="range" min={1} max={50} value={minLevel} onChange={(e) => setMinLevel(Number(e.target.value))} className="w-full" />
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={() => navigate({ to: "/crews" })}>Cancel</Button>
          <Button onClick={submit} disabled={busy || name.trim().length < 3 || tag.trim().length < 2}>
            <Users className="size-4 mr-1.5" /> Found crew (−5,000 DICE)
          </Button>
        </div>
      </Card>
    </div>
  );
}
