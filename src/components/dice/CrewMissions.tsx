import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Target, Coins, Users as UsersIcon, Sparkles, Check, ChevronDown, Bot } from "lucide-react";
import { toast } from "sonner";
import { fmt } from "@/lib/format";
import { setCrewMission, autofillCrewMissions } from "@/lib/crew.functions";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

type Mission = {
  id: string;
  slot: number;
  template_id: string;
  code: string;
  name: string;
  description: string;
  metric: "donations" | "new_members";
  target: number;
  progress: number;
  reward_points: number;
  reward_dice: number;
  source: "admin" | "auto";
  completed_at: string | null;
};

type Template = {
  id: string;
  code: string;
  name: string;
  description: string;
  metric: "donations" | "new_members";
  target: number;
  reward_points: number;
  reward_dice: number;
};

export function CrewMissions({ crewId, canManage }: { crewId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const setMission = useServerFn(setCrewMission);
  const autofill = useServerFn(autofillCrewMissions);
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [autoTried, setAutoTried] = useState(false);

  const missions = useQuery({
    queryKey: ["crew-missions", crewId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("crew_missions_this_week", { _crew_id: crewId });
      if (error) throw error;
      return (data ?? []) as Mission[];
    },
  });

  const templates = useQuery({
    queryKey: ["crew-mission-templates"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("crew_mission_templates" as any)
        .select("*").eq("active", true).order("metric").order("target");
      return (data ?? []) as unknown as Template[];
    },
  });

  // Auto-fill empty slots on first load (one attempt per mount)
  useEffect(() => {
    if (autoTried) return;
    if (!missions.data) return;
    if (missions.data.length >= 3) return;
    setAutoTried(true);
    autofill({}).then(() => {
      qc.invalidateQueries({ queryKey: ["crew-missions", crewId] });
    }).catch(() => {});
  }, [autoTried, missions.data, autofill, qc, crewId]);

  async function pick(slot: number, templateId: string) {
    try {
      await setMission({ data: { slot, templateId } });
      toast.success("Mission updated");
      setPickerSlot(null);
      qc.invalidateQueries({ queryKey: ["crew-missions", crewId] });
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
  }

  const bySlot = useMemo(() => {
    const m: Record<number, Mission | undefined> = {};
    (missions.data ?? []).forEach((r) => { m[r.slot] = r; });
    return m;
  }, [missions.data]);

  const slots = [1, 2, 3] as const;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Target className="size-4 text-primary" />
        <h2 className="font-display text-lg font-medium">Weekly missions</h2>
        {canManage && <span className="text-[10px] text-muted-foreground ml-auto">Owner &amp; officers can curate</span>}
      </div>
      <p className="text-xs text-muted-foreground">
        Complete missions together as a crew. Rewards are shared between all members.
        Empty slots auto-generate every Monday.
      </p>

      <div className="grid gap-3 md:grid-cols-3">
        {slots.map((slot) => {
          const m = bySlot[slot];
          if (!m) {
            return (
              <Card key={slot} className="p-4 border-dashed border-white/10 text-center">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Slot {slot}</div>
                <p className="text-sm mt-2">Empty</p>
                {canManage && (
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => setPickerSlot(slot)}>
                    Pick a mission
                  </Button>
                )}
              </Card>
            );
          }
          const pct = Math.min(100, (m.progress / Math.max(1, m.target)) * 100);
          const done = !!m.completed_at;
          const Icon = m.metric === "donations" ? Coins : UsersIcon;
          return (
            <Card key={slot} className={`p-4 relative overflow-hidden ${done ? "border-emerald-400/50" : ""}`}>
              <div className="flex items-start gap-2">
                <div className={`size-8 rounded-md grid place-items-center ${done ? "bg-emerald-500/20 text-emerald-300" : "bg-primary/15 text-primary"}`}>
                  {done ? <Check className="size-4" /> : <Icon className="size-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate flex items-center gap-1.5">
                    {m.name}
                    {m.source === "auto"
                      ? <Bot className="size-3 text-muted-foreground" aria-label="Auto-generated" />
                      : <Sparkles className="size-3 text-primary" aria-label="Set by an officer" />}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{m.description}</p>
                </div>
              </div>
              <div className="mt-3">
                <Progress value={pct} className="h-2" />
                <div className="flex justify-between text-[11px] mt-1">
                  <span className="text-muted-foreground">{fmt(m.progress)} / {fmt(m.target)}</span>
                  <span className="text-foreground">
                    +{fmt(m.reward_dice)} <span className="text-muted-foreground">DICE</span>
                    {m.reward_points > 0 && <span className="text-muted-foreground"> · +{fmt(m.reward_points)} pts</span>}
                  </span>
                </div>
              </div>
              {canManage && !done && (
                <Button size="sm" variant="ghost" className="mt-2 w-full" onClick={() => setPickerSlot(slot)}>
                  <ChevronDown className="size-3 mr-1" /> Change mission
                </Button>
              )}
            </Card>
          );
        })}
      </div>

      <Dialog open={pickerSlot !== null} onOpenChange={(o) => !o && setPickerSlot(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Choose mission for slot {pickerSlot}</DialogTitle>
            <DialogDescription>Changing a mission resets that slot's progress.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {(templates.data ?? []).map((t) => {
              const Icon = t.metric === "donations" ? Coins : UsersIcon;
              return (
                <button
                  key={t.id}
                  onClick={() => pickerSlot && pick(pickerSlot, t.id)}
                  className="w-full text-left rounded-lg border border-white/10 hover:border-primary/50 hover:bg-primary/5 p-3 flex items-start gap-3 transition"
                >
                  <Icon className="size-4 text-primary shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.description}</div>
                  </div>
                  <div className="text-xs text-foreground shrink-0">
                    +{fmt(t.reward_dice)} DICE
                    <div className="text-[10px] text-muted-foreground">+{fmt(t.reward_points)} pts</div>
                  </div>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
