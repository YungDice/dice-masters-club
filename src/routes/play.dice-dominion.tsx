import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Swords, Sparkles, Wrench, FlaskConical, Map as MapIcon, Activity,
  Hammer, Zap, Coins, Cog, Building2, Cpu, Timer, Plus, ChevronUp, RefreshCw, Dices,
} from "lucide-react";
import { AppShell } from "@/components/dice/TopNav";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { fmt } from "@/lib/format";
import {
  dominionGetState, dominionInit, dominionBuild, dominionUpgrade, dominionCollect, dominionFinishJobs,
} from "@/lib/dominion.functions";
import { BUILDINGS, GRID_SIZE, type BuildingKind } from "@/lib/dominion.config";

type BuildableKind = Exclude<BuildingKind, "headquarters">;
const BUILDABLE: BuildableKind[] = ["salvage_yard","power_core","dice_forge","vault","command_center","workshop"];

const BUILDING_ICON: Record<BuildingKind, any> = {
  headquarters: Building2, salvage_yard: Wrench, power_core: Zap, dice_forge: Dices,
  vault: Sparkles, command_center: Swords, workshop: Cog,
};

function cid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`; }

function ResourceBar({ label, icon: Icon, value, cap, color }: { label: string; icon: any; value: number; cap?: number; color: string }) {
  const pct = cap ? Math.min(100, (value / cap) * 100) : 100;
  return (
    <div className="rounded-xl border border-amber-400/20 bg-black/30 p-3">
      <div className="flex items-center justify-between text-xs text-amber-100/70">
        <span className="flex items-center gap-1.5"><Icon className="size-3.5" />{label}</span>
        {cap ? <span>{fmt(value)}<span className="text-amber-100/40"> / {fmt(cap)}</span></span> : <span>{fmt(value)}</span>}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
        <div className="h-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function CountdownPill({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(i); }, []);
  const remaining = Math.max(0, new Date(endsAt).getTime() - now);
  const s = Math.ceil(remaining / 1000);
  return <span className="text-xs tabular-nums text-amber-200">{s > 60 ? `${Math.floor(s/60)}m ${s%60}s` : `${s}s`}</span>;
}

function Dominion() {
  const qc = useQueryClient();
  const getState = useServerFn(dominionGetState);
  const initFn = useServerFn(dominionInit);
  const buildFn = useServerFn(dominionBuild);
  const upgradeFn = useServerFn(dominionUpgrade);
  const collectFn = useServerFn(dominionCollect);
  const finishFn = useServerFn(dominionFinishJobs);

  const q = useQuery({ queryKey: ["dominion"], queryFn: () => getState(), refetchInterval: 15000 });

  // Auto-poll job completion when any job is due
  useEffect(() => {
    if (!q.data?.initialized) return;
    const jobs = q.data.jobs ?? [];
    if (!jobs.length) return;
    const nextEnd = Math.min(...jobs.map((j: any) => new Date(j.ends_at).getTime()));
    const wait = Math.max(500, nextEnd - Date.now() + 250);
    const t = setTimeout(async () => {
      await finishFn();
      qc.invalidateQueries({ queryKey: ["dominion"] });
    }, wait);
    return () => clearTimeout(t);
  }, [q.data, finishFn, qc]);

  const init = useMutation({
    mutationFn: () => initFn({ data: { client_action_id: cid() } }),
    onSuccess: () => { toast.success("District online"); qc.invalidateQueries({ queryKey: ["dominion"] }); },
    onError: (e: any) => toast.error(e.message ?? "Failed to initialize"),
  });

  const collect = useMutation({
    mutationFn: () => collectFn({ data: { client_action_id: cid() } }),
    onSuccess: (r: any) => {
      const g = r.gained;
      toast.success(`+${fmt(g.scrap)} Scrap · +${fmt(g.power)} Power · +${fmt(g.roll_credits)} RC`);
      qc.invalidateQueries({ queryKey: ["dominion"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Collect failed"),
  });

  const build = useMutation({
    mutationFn: (v: { kind: BuildableKind; slot_x: number; slot_y: number }) =>
      buildFn({ data: { client_action_id: cid(), ...v } }),
    onSuccess: () => { toast.success("Construction started"); setPlacing(null); qc.invalidateQueries({ queryKey: ["dominion"] }); },
    onError: (e: any) => toast.error(e.message ?? "Build failed"),
  });

  const upgrade = useMutation({
    mutationFn: (id: string) => upgradeFn({ data: { client_action_id: cid(), building_id: id } }),
    onSuccess: () => { toast.success("Upgrade queued"); qc.invalidateQueries({ queryKey: ["dominion"] }); },
    onError: (e: any) => toast.error(e.message ?? "Upgrade failed"),
  });

  const [placing, setPlacing] = useState<{ x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  if (q.isLoading) {
    return <div className="grid place-items-center py-20 text-amber-100/60"><RefreshCw className="size-5 animate-spin" /></div>;
  }
  if (!q.data?.initialized) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-amber-400/30 bg-black/40 p-8 text-center">
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-amber-400/10 ring-1 ring-amber-400/30">
          <Dices className="size-8 text-amber-300" />
        </div>
        <h2 className="font-display text-2xl font-bold text-amber-100">Claim your District</h2>
        <p className="mt-2 text-sm text-amber-100/70">
          Build production, forge Roll Credits, command a crew, and conquer the board.
        </p>
        <Button onClick={() => init.mutate()} disabled={init.isPending} className="mt-6 bg-amber-400 text-black hover:bg-amber-300">
          {init.isPending ? "Deploying…" : "Deploy District"}
        </Button>
      </div>
    );
  }

  const { profile, buildings, jobs, derived } = q.data;
  const jobByBuilding = new Map<string, any>();
  for (const j of jobs) if (j.ref_id) jobByBuilding.set(j.ref_id, j);
  const selectedBuilding = buildings.find((b: any) => b.id === selected);

  const grid: (any | null)[][] = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
  for (const b of buildings) if (b.slot_x < GRID_SIZE && b.slot_y < GRID_SIZE) grid[b.slot_y][b.slot_x] = b;

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr_320px]">
      {/* LEFT — profile & resources */}
      <aside className="space-y-3">
        <div className="rounded-2xl border border-amber-400/30 bg-gradient-to-br from-emerald-950/80 to-black/60 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-amber-200/60">HQ level</div>
              <div className="font-display text-3xl font-bold text-amber-100">{profile.hq_level}</div>
            </div>
            <div className="grid size-12 place-items-center rounded-xl bg-amber-400/10 ring-1 ring-amber-400/30">
              <Building2 className="size-6 text-amber-300" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-amber-100/60">
            <Cpu className="size-3.5" />Command Energy
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="font-display text-xl font-bold text-amber-100">{derived.commandEnergy}</span>
            <span className="text-xs text-amber-100/50">/ {derived.commandEnergyCap}</span>
          </div>
        </div>
        <ResourceBar label="Scrap"        icon={Hammer} value={profile.scrap}        cap={derived.capacity} color="#c9a84c" />
        <ResourceBar label="Power"        icon={Zap}    value={profile.power}        cap={derived.capacity} color="#3ee0a1" />
        <ResourceBar label="Roll Credits" icon={Coins}  value={profile.roll_credits} cap={derived.capacity} color="#f5d071" />

        <div className="rounded-xl border border-amber-400/20 bg-black/40 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-amber-100/70">Pending production</span>
            <Button size="sm" onClick={() => collect.mutate()} disabled={collect.isPending} className="h-7 bg-amber-400 text-black hover:bg-amber-300">
              Collect
            </Button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[11px] text-amber-100/80">
            <div><Hammer className="mx-auto size-3.5" />+{fmt(derived.pendingGains.scrap)}</div>
            <div><Zap className="mx-auto size-3.5" />+{fmt(derived.pendingGains.power)}</div>
            <div><Coins className="mx-auto size-3.5" />+{fmt(derived.pendingGains.roll_credits)}</div>
          </div>
        </div>
      </aside>

      {/* CENTER — district grid */}
      <section className="rounded-2xl border border-amber-400/30 bg-[radial-gradient(ellipse_at_center,_#083a2c_0%,_#04211a_65%,_#02120e_100%)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-amber-100">District</h2>
          <span className="text-xs text-amber-100/60">Tap an empty tile to build · tap a building to upgrade</span>
        </div>
        <div className="mx-auto grid aspect-square max-w-[520px] gap-2" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)` }}>
          {grid.flatMap((row, y) =>
            row.map((cell, x) => {
              const job = cell ? jobByBuilding.get(cell.id) : null;
              const Icon = cell ? BUILDING_ICON[cell.kind as BuildingKind] : Plus;
              return (
                <button
                  key={`${x}-${y}`}
                  onClick={() => cell ? setSelected(cell.id) : setPlacing({ x, y })}
                  className={`group relative aspect-square rounded-xl border transition-all ${
                    cell
                      ? "border-amber-400/40 bg-gradient-to-br from-emerald-800/40 to-black/40 hover:border-amber-400/70"
                      : "border-dashed border-amber-400/15 bg-black/20 hover:border-amber-400/40 hover:bg-amber-400/5"
                  }`}
                >
                  <Icon className={`absolute inset-0 m-auto size-8 ${cell ? "text-amber-200" : "text-amber-400/30 group-hover:text-amber-300/70"}`} />
                  {cell && (
                    <div className="absolute left-1 top-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-amber-200 ring-1 ring-amber-400/40">
                      L{cell.level}
                    </div>
                  )}
                  {job && (
                    <div className="absolute bottom-1 left-1 right-1 flex items-center justify-center gap-1 rounded-md bg-black/70 py-0.5 text-[10px] text-amber-200 ring-1 ring-amber-400/30">
                      <Timer className="size-3" /><CountdownPill endsAt={job.ends_at} />
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </section>

      {/* RIGHT — tabs */}
      <aside>
        <Tabs defaultValue="build">
          <TabsList className="w-full bg-black/30 ring-1 ring-amber-400/20">
            <TabsTrigger value="build" className="flex-1 gap-1"><Hammer className="size-3.5" />Build</TabsTrigger>
            <TabsTrigger value="units" className="flex-1 gap-1"><Swords className="size-3.5" />Units</TabsTrigger>
            <TabsTrigger value="research" className="flex-1 gap-1"><FlaskConical className="size-3.5" />R&amp;D</TabsTrigger>
            <TabsTrigger value="territory" className="flex-1 gap-1"><MapIcon className="size-3.5" />Map</TabsTrigger>
          </TabsList>

          <TabsContent value="build" className="space-y-2">
            {BUILDABLE.map((k) => {
              const s = BUILDINGS[k];
              const Icon = BUILDING_ICON[k];
              return (
                <div key={k} className="rounded-xl border border-amber-400/15 bg-black/30 p-3">
                  <div className="flex items-start gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/30">
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-amber-100">{s.label}</div>
                        <div className="text-[10px] text-amber-100/50">{s.buildSeconds(1)}s</div>
                      </div>
                      <p className="text-xs text-amber-100/60">{s.desc}</p>
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-amber-100/80">
                        {Object.entries(s.cost(1)).map(([res, v]) => (
                          <span key={res} className="rounded bg-white/5 px-1.5 py-0.5">{res}: {v}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <p className="pt-2 text-center text-xs text-amber-100/50">Click an empty grid tile to place.</p>
          </TabsContent>

          <TabsContent value="units">
            <div className="rounded-xl border border-amber-400/15 bg-black/30 p-6 text-center text-sm text-amber-100/60">
              Unit training unlocks in Phase 2.
            </div>
          </TabsContent>
          <TabsContent value="research">
            <div className="rounded-xl border border-amber-400/15 bg-black/30 p-6 text-center text-sm text-amber-100/60">
              Research tree unlocks in Phase 2.
            </div>
          </TabsContent>
          <TabsContent value="territory">
            <div className="rounded-xl border border-amber-400/15 bg-black/30 p-6 text-center text-sm text-amber-100/60">
              World map opens in Phase 3.
            </div>
          </TabsContent>
        </Tabs>
      </aside>

      {/* Place-building modal */}
      <Dialog open={!!placing} onOpenChange={(v) => !v && setPlacing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Build on ({placing?.x},{placing?.y})</DialogTitle>
            <DialogDescription>Choose a building to construct.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {BUILDABLE.map((k) => {
              const s = BUILDINGS[k]; const Icon = BUILDING_ICON[k];
              const cost = s.cost(1);
              const afford = (cost.scrap ?? 0) <= profile.scrap && (cost.power ?? 0) <= profile.power && (cost.roll_credits ?? 0) <= profile.roll_credits;
              return (
                <button
                  key={k}
                  disabled={!afford || build.isPending}
                  onClick={() => placing && build.mutate({ kind: k, slot_x: placing.x, slot_y: placing.y })}
                  className="flex flex-col items-center rounded-xl border border-amber-400/20 bg-black/40 p-3 text-center transition hover:border-amber-400/60 disabled:opacity-40"
                >
                  <Icon className="mb-1 size-6 text-amber-300" />
                  <div className="text-sm font-semibold text-amber-100">{s.label}</div>
                  <div className="mt-1 text-[10px] text-amber-100/60">
                    {Object.entries(cost).map(([r, v]) => `${v} ${r[0]}`).join(" · ")}
                  </div>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Upgrade modal */}
      <Dialog open={!!selectedBuilding} onOpenChange={(v) => !v && setSelected(null)}>
        {selectedBuilding && (
          <DialogContent className="max-w-md">
            <UpgradePanel building={selectedBuilding} profile={profile} onUpgrade={() => upgrade.mutate(selectedBuilding.id)} pending={upgrade.isPending} isJobActive={!!jobByBuilding.get(selectedBuilding.id)} />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function UpgradePanel({ building, profile, onUpgrade, pending, isJobActive }: any) {
  const spec = BUILDINGS[building.kind as BuildingKind];
  const nextLevel = building.level + 1;
  const atMax = nextLevel > spec.maxLevel;
  const cost = atMax ? {} : spec.cost(nextLevel);
  const afford = (cost.scrap ?? 0) <= profile.scrap && (cost.power ?? 0) <= profile.power && (cost.roll_credits ?? 0) <= profile.roll_credits;
  const Icon = BUILDING_ICON[building.kind as BuildingKind];
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Icon className="size-5 text-amber-300" />{spec.label} <span className="text-amber-300">L{building.level}</span></DialogTitle>
        <DialogDescription>{spec.desc}</DialogDescription>
      </DialogHeader>
      {spec.produces && (
        <div className="rounded-lg bg-black/40 p-3 text-xs text-amber-100/70">
          Current output / hour: {Object.entries(spec.produces(building.level)).map(([k, v]) => `${k}: ${v}`).join(" · ")}
        </div>
      )}
      {atMax ? (
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-center text-sm text-amber-200">Max level reached</div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-widest text-amber-200/60">Upgrade to L{nextLevel}</div>
          <div className="flex flex-wrap gap-2 text-sm text-amber-100/80">
            {Object.entries(cost).map(([r, v]) => (
              <span key={r} className="rounded bg-white/5 px-2 py-1 ring-1 ring-white/10">{v} {r}</span>
            ))}
          </div>
          <div className="text-xs text-amber-100/60">Time: {spec.buildSeconds(nextLevel)}s</div>
        </div>
      )}
      <DialogFooter>
        <Button onClick={onUpgrade} disabled={atMax || !afford || pending || isJobActive} className="bg-amber-400 text-black hover:bg-amber-300">
          <ChevronUp className="mr-1 size-4" />{isJobActive ? "In progress…" : atMax ? "Max" : `Upgrade`}
        </Button>
      </DialogFooter>
    </>
  );
}

export const Route = createFileRoute("/play/dice-dominion")({
  head: () => ({ meta: [
    { title: "DICE Dominion — Strategy" },
    { name: "description", content: "Build your district, command your crew, and conquer the board in DICE Dominion." },
    { property: "og:title", content: "DICE Dominion — Strategy" },
    { property: "og:description", content: "Build, forge, and conquer the DICE board." },
  ]}),
  component: () => <AppShell><Dominion /></AppShell>,
});
