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
  dominionTrain, dominionResearch, dominionListSectors, dominionAttack, dominionListBattles,
} from "@/lib/dominion.functions";
import { BUILDINGS, UNITS, RESEARCH, GRID_SIZE, type BuildingKind, type UnitKind, type ResearchNodeId } from "@/lib/dominion.config";

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
  const trainFn = useServerFn(dominionTrain);
  const researchFn = useServerFn(dominionResearch);
  const attackFn = useServerFn(dominionAttack);
  const listSectorsFn = useServerFn(dominionListSectors);
  const listBattlesFn = useServerFn(dominionListBattles);

  const sectorsQ = useQuery({ queryKey: ["dominion", "sectors"], queryFn: () => listSectorsFn() });
  const battlesQ = useQuery({ queryKey: ["dominion", "battles"], queryFn: () => listBattlesFn() });

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

  const train = useMutation({
    mutationFn: (v: { kind: UnitKind; qty: number }) => trainFn({ data: { client_action_id: cid(), ...v } }),
    onSuccess: () => { toast.success("Training started"); qc.invalidateQueries({ queryKey: ["dominion"] }); },
    onError: (e: any) => toast.error(e.message ?? "Training failed"),
  });

  const research = useMutation({
    mutationFn: (node: ResearchNodeId) => researchFn({ data: { client_action_id: cid(), node } }),
    onSuccess: () => { toast.success("Research started"); qc.invalidateQueries({ queryKey: ["dominion"] }); },
    onError: (e: any) => toast.error(e.message ?? "Research failed"),
  });

  const [battleResult, setBattleResult] = useState<any>(null);
  const attack = useMutation({
    mutationFn: (v: { sector_id: number; units: Record<string, number> }) => attackFn({ data: { client_action_id: cid(), ...v } }),
    onSuccess: (r: any) => {
      setBattleResult(r);
      setAttackTarget(null);
      qc.invalidateQueries({ queryKey: ["dominion"] });
      qc.invalidateQueries({ queryKey: ["dominion", "battles"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Attack failed"),
  });

  const [placing, setPlacing] = useState<{ x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [attackTarget, setAttackTarget] = useState<any>(null);

  if (q.isLoading) {
    return <div className="grid place-items-center py-20 text-amber-100/60"><RefreshCw className="size-5 animate-spin" /></div>;
  }
  if (!q.data?.initialized) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="relative overflow-hidden rounded-3xl border border-amber-400/30 bg-gradient-to-br from-amber-500/20 via-fuchsia-500/10 to-emerald-500/10 p-8 text-center">
          <div className="absolute -right-16 -top-16 size-64 rounded-full bg-amber-400/20 blur-3xl" />
          <div className="absolute -left-16 -bottom-16 size-64 rounded-full bg-fuchsia-500/20 blur-3xl" />
          <div className="relative">
            <div className="mx-auto mb-3 grid size-20 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-orange-500 text-black text-4xl shadow-lg shadow-amber-500/30">
              🏰
            </div>
            <h2 className="font-display text-4xl font-black text-amber-100">DICE Dominion</h2>
            <p className="mt-2 text-amber-100/80 max-w-md mx-auto">
              Build your own tiny city, train a crew, and conquer the map to stack up loot!
            </p>
            <Button onClick={() => init.mutate()} disabled={init.isPending} size="lg" className="mt-6 bg-amber-400 text-black hover:bg-amber-300 font-bold text-base">
              {init.isPending ? "Deploying…" : "🚀 Start My District"}
            </Button>
          </div>
        </div>
        <HowItWorks />
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
    <div className="space-y-4">
      <TipBanner />
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
            <UnitsPanel units={q.data.units} onTrain={(k, qty) => train.mutate({ kind: k, qty })} pending={train.isPending} />
          </TabsContent>
          <TabsContent value="research">
            <ResearchPanel research={q.data.research} onResearch={(n) => research.mutate(n)} pending={research.isPending} jobs={jobs} />
          </TabsContent>
          <TabsContent value="territory">
            <TerritoryPanel sectors={sectorsQ.data ?? []} battles={battlesQ.data ?? []} onAttack={(s) => setAttackTarget(s)} energy={derived.commandEnergy} />
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

      {/* Attack modal */}
      <Dialog open={!!attackTarget} onOpenChange={(v) => !v && setAttackTarget(null)}>
        {attackTarget && (
          <DialogContent className="max-w-md">
            <AttackPanel
              sector={attackTarget}
              units={q.data.units}
              onLaunch={(u) => attack.mutate({ sector_id: attackTarget.id, units: u })}
              pending={attack.isPending}
            />
          </DialogContent>
        )}
      </Dialog>

      {/* Battle result modal */}
      <Dialog open={!!battleResult} onOpenChange={(v) => !v && setBattleResult(null)}>
        {battleResult && (
          <DialogContent className="max-w-md">
            <BattleResultPanel result={battleResult} onClose={() => setBattleResult(null)} />
          </DialogContent>
        )}
      </Dialog>
    </div>
    </div>
  );
}

function TipBanner() {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div className="rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-500/15 via-fuchsia-500/10 to-emerald-500/10 p-3 flex items-start gap-3">
      <div className="text-2xl shrink-0">💡</div>
      <div className="flex-1 text-sm text-amber-100/90">
        <b className="text-amber-100">How to play:</b> Tap empty tiles to <b>build</b> · come back to <b>collect</b> resources · train units in <b>Units</b> · attack sectors on the <b>Map</b> to grab loot & DICE 🎲
      </div>
      <button onClick={() => setOpen(false)} className="text-amber-100/50 hover:text-amber-100 text-lg leading-none px-1">×</button>
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

// ============================================================
// Units panel
// ============================================================
function UnitsPanel({ units, onTrain, pending }: { units: any[]; onTrain: (k: UnitKind, qty: number) => void; pending: boolean }) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const counts: Record<string, number> = {};
  for (const u of units) counts[u.kind] = u.count;
  return (
    <div className="space-y-2">
      {(Object.keys(UNITS) as UnitKind[]).map((k) => {
        const u = UNITS[k];
        const own = counts[k] ?? 0;
        const n = qty[k] ?? 1;
        return (
          <div key={k} className="rounded-xl border border-amber-400/15 bg-black/30 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-amber-100">
                  <Swords className="size-4 text-amber-300" />
                  <span className="font-semibold">{u.label}</span>
                  <span className="text-xs text-amber-100/60">×{own}</span>
                </div>
                <p className="text-[11px] text-amber-100/60">{u.desc}</p>
                <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-amber-100/70">
                  <span className="rounded bg-white/5 px-1.5 py-0.5">ATK {u.attack}</span>
                  <span className="rounded bg-white/5 px-1.5 py-0.5">DEF {u.defense}</span>
                  <span className="rounded bg-white/5 px-1.5 py-0.5">Cap {u.capacity}</span>
                  <span className="rounded bg-white/5 px-1.5 py-0.5">{u.trainSeconds}s each</span>
                </div>
                <div className="mt-1 text-[10px] text-amber-100/60">
                  {Object.entries(u.cost).map(([r, v]) => `${v} ${r}`).join(" · ")}
                </div>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number" min={1} max={20} value={n}
                onChange={(e) => setQty({ ...qty, [k]: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })}
                className="w-16 rounded bg-black/40 px-2 py-1 text-sm text-amber-100 ring-1 ring-amber-400/20"
              />
              <Button size="sm" disabled={pending} onClick={() => onTrain(k, n)} className="h-8 flex-1 bg-amber-400 text-black hover:bg-amber-300">
                Train ×{n}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Research panel
// ============================================================
function ResearchPanel({ research, onResearch, pending, jobs }: { research: any[]; onResearch: (n: ResearchNodeId) => void; pending: boolean; jobs: any[] }) {
  const activeResearch = jobs.find((j: any) => j.kind === "research");
  const levels = new Map<string, number>();
  for (const r of research) levels.set(r.node, r.level);
  const groups: Record<string, ResearchNodeId[]> = { industry: [], tactics: [], logistics: [] };
  for (const [k, v] of Object.entries(RESEARCH)) groups[v.branch].push(k as ResearchNodeId);
  return (
    <div className="space-y-3">
      {activeResearch && (
        <div className="flex items-center justify-between rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-amber-200">
          <span className="flex items-center gap-1"><Timer className="size-3" />Research in progress</span>
          <CountdownPill endsAt={activeResearch.ends_at} />
        </div>
      )}
      {(Object.entries(groups) as [string, ResearchNodeId[]][]).map(([branch, nodes]) => (
        <div key={branch}>
          <div className="mb-1 text-[10px] uppercase tracking-widest text-amber-300/80">{branch}</div>
          <div className="space-y-1.5">
            {nodes.map((n) => {
              const spec = RESEARCH[n];
              const lv = levels.get(n) ?? 0;
              const atMax = lv >= spec.maxLevel;
              const nxt = lv + 1;
              return (
                <div key={n} className="rounded-lg border border-amber-400/15 bg-black/30 p-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-amber-100">{spec.label}</span>
                    <span className="text-xs text-amber-200/70">L{lv}{atMax ? " · MAX" : ""}</span>
                  </div>
                  <p className="text-[11px] text-amber-100/60">{spec.desc}</p>
                  {!atMax && (
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-[10px] text-amber-100/60">{spec.cost(nxt)} RC · {spec.seconds(nxt)}s</span>
                      <Button size="sm" disabled={pending || !!activeResearch} onClick={() => onResearch(n)} className="h-6 bg-amber-400 text-black hover:bg-amber-300">→ L{nxt}</Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Territory panel
// ============================================================
const SECTOR_TONE: Record<string, string> = {
  neutral: "border-amber-400/30 bg-emerald-900/40",
  dice_vault: "border-amber-300 bg-amber-500/20",
  fortified: "border-red-400/60 bg-red-950/40",
  event: "border-fuchsia-400/60 bg-fuchsia-900/30",
};

function TerritoryPanel({ sectors, battles, onAttack, energy }: { sectors: any[]; battles: any[]; onAttack: (s: any) => void; energy: number }) {
  return (
    <div className="space-y-3">
      <div className="text-[11px] text-amber-100/70">Command Energy: <span className="font-semibold text-amber-200">{energy}</span></div>
      <div className="grid grid-cols-4 gap-1.5">
        {sectors.map((s) => (
          <button
            key={s.id}
            onClick={() => onAttack(s)}
            className={`aspect-square rounded-lg border p-1 text-left transition hover:scale-[1.03] ${SECTOR_TONE[s.kind] ?? "border-white/10"}`}
          >
            <div className="text-[9px] font-bold uppercase tracking-wide text-amber-200">{s.kind === "dice_vault" ? "Vault" : s.kind}</div>
            <div className="mt-0.5 truncate text-[10px] text-amber-50/90">{s.name}</div>
            <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-100/70"><Swords className="size-2.5" />{s.strength}</div>
          </button>
        ))}
      </div>
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-widest text-amber-300/70">Recent battles</div>
        {battles.length === 0 ? (
          <div className="rounded-lg border border-white/5 bg-black/30 p-3 text-center text-xs text-amber-100/50">No battles yet.</div>
        ) : (
          <ul className="space-y-1">
            {battles.slice(0, 5).map((b: any) => (
              <li key={b.id} className="flex items-center justify-between rounded-md bg-black/30 px-2 py-1 text-[11px] text-amber-100/80">
                <span>#{b.sector_id}</span>
                <span className={b.outcome === "victory" ? "text-emerald-300" : "text-red-300"}>{b.outcome}</span>
                <span className="text-amber-100/50">{b.attack_power} vs {b.defense_power}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Attack modal
// ============================================================
function AttackPanel({ sector, units, onLaunch, pending }: { sector: any; units: any[]; onLaunch: (u: Record<string, number>) => void; pending: boolean }) {
  const [sel, setSel] = useState<Record<string, number>>({});
  const counts: Record<string, number> = {};
  for (const u of units) counts[u.kind] = u.count;
  const power = Object.entries(sel).reduce((s, [k, q]) => s + (UNITS[k as UnitKind]?.attack ?? 0) * q, 0);
  const total = Object.values(sel).reduce((s, q) => s + q, 0);
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Swords className="size-4 text-amber-300" />{sector.name}</DialogTitle>
        <DialogDescription>Type: {sector.kind} · Strength {sector.strength}</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        {(Object.keys(UNITS) as UnitKind[]).map((k) => {
          const own = counts[k] ?? 0;
          const chosen = sel[k] ?? 0;
          return (
            <div key={k} className="flex items-center gap-2 rounded-lg bg-black/30 p-2">
              <div className="flex-1">
                <div className="text-sm text-amber-100">{UNITS[k].label}</div>
                <div className="text-[10px] text-amber-100/60">Own {own} · ATK {UNITS[k].attack}</div>
              </div>
              <input
                type="number" min={0} max={own} value={chosen}
                onChange={(e) => setSel({ ...sel, [k]: Math.max(0, Math.min(own, Number(e.target.value) || 0)) })}
                className="w-16 rounded bg-black/40 px-2 py-1 text-sm text-amber-100 ring-1 ring-amber-400/20"
              />
            </div>
          );
        })}
      </div>
      <div className="rounded-lg border border-amber-400/20 bg-black/40 p-2 text-xs text-amber-100/80">
        Force sent: {total} · Attack power: {power} · Reward on win: {sector.reward_scrap} scrap / {sector.reward_power} pwr / {sector.reward_roll_credits} RC
      </div>
      <DialogFooter>
        <Button disabled={total === 0 || pending} onClick={() => onLaunch(sel)} className="bg-amber-400 text-black hover:bg-amber-300">
          <Swords className="mr-1 size-4" />Launch attack
        </Button>
      </DialogFooter>
    </>
  );
}

// ============================================================
// Battle result modal
// ============================================================
function BattleResultPanel({ result, onClose }: { result: any; onClose: () => void }) {
  const win = result.win;
  return (
    <>
      <DialogHeader>
        <DialogTitle className={win ? "text-emerald-300" : "text-red-300"}>
          {win ? "Victory" : "Defeat"}
        </DialogTitle>
        <DialogDescription>Attack {result.effectiveAttack} vs Defense {result.defense}</DialogDescription>
      </DialogHeader>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="space-y-2">
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-widest text-amber-200/60">Survivors returned</div>
          <div className="flex flex-wrap gap-1 text-xs">
            {Object.entries(result.survivors).map(([k, v]: any) => (
              <span key={k} className="rounded bg-white/5 px-2 py-1 text-amber-100">{UNITS[k as UnitKind].label}: {v}</span>
            ))}
          </div>
        </div>
        {win && (
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-widest text-amber-200/60">Rewards</div>
            <div className="flex flex-wrap gap-1 text-xs text-amber-100">
              <span className="rounded bg-amber-400/10 px-2 py-1 ring-1 ring-amber-400/30">+{fmt(result.rewards.scrap)} Scrap</span>
              <span className="rounded bg-amber-400/10 px-2 py-1 ring-1 ring-amber-400/30">+{fmt(result.rewards.power)} Power</span>
              <span className="rounded bg-amber-400/10 px-2 py-1 ring-1 ring-amber-400/30">+{fmt(result.rewards.roll_credits)} RC</span>
            </div>
          </div>
        )}
      </motion.div>
      <DialogFooter>
        <Button onClick={onClose} className="bg-amber-400 text-black hover:bg-amber-300">Continue</Button>
      </DialogFooter>
    </>
  );
}

function HowItWorks() {
  const steps = [
    { emoji: "🏗️", title: "1. Build", text: "Tap empty tiles to place buildings like the Salvage Yard, Power Core & Dice Forge. They make resources for you 24/7." },
    { emoji: "💰", title: "2. Collect", text: "Come back and hit Collect to grab all the Scrap, Power and Roll Credits your buildings made while you were gone." },
    { emoji: "⚔️", title: "3. Conquer", text: "Train units, then attack sectors on the Map for big rewards. Stronger sectors drop bigger loot." },
    { emoji: "🎲", title: "4. Level up", text: "Upgrade your HQ and unlock Research to unlock stronger buildings, faster training and better payouts." },
  ];
  return (
    <div className="rounded-3xl border border-amber-400/20 bg-black/40 p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="grid size-8 place-items-center rounded-full bg-amber-400/20 ring-1 ring-amber-400/30">💡</div>
        <h3 className="font-display text-xl font-bold text-amber-100">How it works</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {steps.map((s) => (
          <div key={s.title} className="rounded-2xl border border-amber-400/15 bg-gradient-to-br from-white/[0.04] to-transparent p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">{s.emoji}</span>
              <div className="font-display font-bold text-amber-100">{s.title}</div>
            </div>
            <p className="text-sm text-amber-100/70 leading-snug">{s.text}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100/90 flex gap-3">
        <div className="text-2xl">🎁</div>
        <div>
          <div className="font-semibold text-amber-100">Earn free DICE from your district</div>
          <p className="text-amber-100/70 text-xs mt-0.5">Conquering sectors, finishing daily objectives and leveling up your HQ pay out DICE straight to your wallet. The bigger your district, the bigger the rewards!</p>
        </div>
      </div>
    </div>
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
