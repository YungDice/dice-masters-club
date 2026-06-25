import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { HandHelping } from "lucide-react";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { createSplitSteal, joinSplitSteal, choiceSplitSteal } from "@/lib/dice.functions";
import { useAuth } from "@/hooks/use-auth";
import { useWallet } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/play/split-steal")({
  head: () => ({ meta: [{ title: "Split or Steal — DICE" }] }),
  component: () => <AppShell><SS /></AppShell>,
});

function SS() {
  const { user } = useAuth();
  const { data: wallet } = useWallet(user?.id);
  const qc = useQueryClient();
  const [stake, setStake] = useState(100);
  const [isPrivate, setIsPrivate] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const create = useServerFn(createSplitSteal);
  const join = useServerFn(joinSplitSteal);
  const choose = useServerFn(choiceSplitSteal);

  const rooms = useQuery({
    queryKey: ["ss-rooms"],
    queryFn: async () => {
      const { data } = await supabase.from("game_rooms").select("*").eq("kind", "split_steal").in("status", ["waiting", "active"]).eq("is_private", false).order("created_at", { ascending: false }).limit(20);
      return data ?? [];
    },
  });
  useEffect(() => {
    const ch = supabase.channel("ss-rooms").on("postgres_changes", { event: "*", schema: "public", table: "game_rooms", filter: "kind=eq.split_steal" }, () => qc.invalidateQueries({ queryKey: ["ss-rooms"] })).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  async function host() { try { const r = await create({ data: { stake, isPrivate } }); setActive(r!.id); qc.invalidateQueries(); } catch (e: any) { toast.error(e.message); } }
  async function accept(id: string) { try { await join({ data: { roomId: id } }); setActive(id); qc.invalidateQueries(); } catch (e: any) { toast.error(e.message); } }
  async function pick(c: "split" | "steal") {
    if (!active) return;
    try { const r = await choose({ data: { roomId: active, choice: c } }); if (!r.waiting) toast(`Result: ${r.outcome}. Payouts settled.`); qc.invalidateQueries(); } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Card className="glass p-6">
        <h1 className="font-display text-2xl font-bold flex items-center gap-2"><HandHelping />Split or Steal</h1>
        <p className="text-sm text-muted-foreground">Both stake DICE. Each secretly chooses SPLIT or STEAL. Split/split → divide pot. Steal/split → stealer takes all. Steal/steal → both lose stake.</p>
        <div className="mt-4 grid md:grid-cols-2 gap-4">
          <div>
            <div className="flex justify-between text-sm"><span>Stake</span><span className="font-semibold">{fmt(stake)} DICE</span></div>
            <Slider min={10} max={Math.min(2000, Number(wallet?.balance ?? 100))} step={10} value={[stake]} onValueChange={(v) => setStake(v[0])} className="mt-2" />
            <label className="flex items-center gap-2 mt-3 text-sm"><Switch checked={isPrivate} onCheckedChange={setIsPrivate} /> Private</label>
            <Button className="mt-3 glow-red" onClick={host}>Create room</Button>
          </div>
          {active && (
            <div className="rounded-lg border border-border/60 p-4 text-center">
              <div className="text-xs text-muted-foreground">In room. Make your choice:</div>
              <div className="mt-3 flex gap-2 justify-center">
                <Button variant="outline" className="flex-1" onClick={() => pick("split")}>SPLIT</Button>
                <Button variant="destructive" className="flex-1" onClick={() => pick("steal")}>STEAL</Button>
              </div>
            </div>
          )}
        </div>
      </Card>
      <Card className="glass p-5">
        <h2 className="font-display text-lg font-semibold">Open rooms</h2>
        <div className="mt-3 space-y-2">
          {(rooms.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No public rooms.</p>}
          {(rooms.data ?? []).map((r: any) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
              <div className="text-sm">Stake: {fmt(r.stake)} DICE</div>
              <Button size="sm" onClick={() => accept(r.id)} disabled={r.host_id === user?.id || r.status !== "waiting"}>{r.host_id === user?.id ? "Yours" : r.status === "waiting" ? "Join" : "Active"}</Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
