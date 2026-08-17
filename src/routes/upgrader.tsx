import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/dice/TopNav";
import { PageHeader } from "@/components/dice/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  ChevronRight,
  Lock,
  RotateCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { upgradeBaddies } from "@/lib/dice.functions";
import eliasAsset from "@/assets/baddies/elias.png.asset.json";

export const Route = createFileRoute("/upgrader")({
  head: () => ({
    meta: [
      { title: "Baddie Upgrader — DICE" },
      { name: "description", content: "Fuse duplicate Baddies into higher rarities in the DICE Upgrader. Pick materials, spin the upgrade wheel, and chase Legendary, Unreal, and Elias pulls." },
      { property: "og:title", content: "Baddie Upgrader — DICE" },
      { property: "og:description", content: "Combine duplicate Baddies and gamble on the upgrade wheel for higher rarities on DICE." },
      { property: "og:url", content: "https://yungdice.com/upgrader" },
    ],
    links: [{ rel: "canonical", href: "https://yungdice.com/upgrader" }],
  }),
  component: () => <AppShell><Page /></AppShell>,
});

const MAX_MATERIALS = 20;
const WHEEL_SUCCESS_START_DEGREES = -90;
const WHEEL_SUCCESS_START_ROTATION = (WHEEL_SUCCESS_START_DEGREES + 360) % 360;
const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary", "unreal", "elias"];
const RARITY_LABELS: Record<string, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
  unreal: "Unreal",
  elias: "Elias",
};
const RARITY_STYLE: Record<string, string> = {
  common: "border-zinc-400/35 text-zinc-200",
  uncommon: "border-emerald-400/45 text-emerald-200",
  rare: "border-white/10 text-white",
  epic: "border-white/10 text-white",
  legendary: "border-white/10 text-foreground",
  unreal: "border-white/10 text-white",
  elias: "border-white/10 text-foreground",
};

type UpgradePhase = "idle" | "securing" | "spinning" | "success" | "failure";
type UpgradeOutcome = {
  success: boolean;
  chancePct: number;
  rollPct: number;
  target: any;
  materialIds: string[];
};

function imgOf(t: any) {
  if (!t) return null;
  return t.image_url ?? (t.id === "elias" ? eliasAsset.url : null);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** Mirrors public.baddie_upgrade_chance exactly for display only.
 * The server still calculates, saves, and decides every upgrade result. */
function previewChance(materialValue: number, target: any) {
  if (!target || materialValue <= 0) return 0;
  const targetValue = Number(target.income_per_hour ?? 0);
  if (targetValue <= 0) return 0;

  const cap = target.rarity === "elias"
    ? 0.10
    : target.rarity === "unreal"
      ? 0.25
      : target.rarity === "legendary"
        ? 0.75
        : target.rarity === "epic"
          ? 0.85
          : 0.95;

  return Math.min(materialValue / (materialValue + targetValue * 2), cap);
}

function materialUnavailableReason(baddie: any) {
  if (baddie.listing_id) return "Listed on Marketplace";
  // These fields are optional so the UI remains compatible if protected Base slots are enabled.
  if (baddie.is_protected || baddie.active_protected || baddie.is_active) return "Protected active Baddie";
  return null;
}

/**
 * The conic gradient starts at -90deg (the left edge of the wheel), whereas
 * a rotated needle starts at 0deg (the top edge). Keep the two coordinate
 * systems explicitly aligned so the visual landing zone always matches the
 * already-secured server result.
 */
function calculateStopAngle(outcome: UpgradeOutcome) {
  const successArc = clamp(outcome.chancePct, 0, 100) * 3.6;
  const successStart = WHEEL_SUCCESS_START_ROTATION;
  const successEnd = successStart + successArc;
  const roll = clamp(outcome.rollPct, 0, 100);

  if (outcome.success) {
    // Use the server roll to choose a stable position safely inside green.
    if (successArc <= 0.75) return successStart + successArc / 2;
    const rollProgress = outcome.chancePct > 0
      ? clamp(roll / outcome.chancePct, 0.08, 0.92)
      : 0.5;
    const inset = Math.min(9, Math.max(1.25, successArc * 0.15));
    const usableArc = Math.max(0, successArc - inset * 2);
    return successStart + inset + usableArc * rollProgress;
  }

  // A failed server result must visibly land in the non-green segment.
  const failureArc = 360 - successArc;
  const rollProgress = outcome.chancePct < 100
    ? clamp((roll - outcome.chancePct) / (100 - outcome.chancePct), 0.03, 0.97)
    : 0.5;
  const inset = Math.min(9, Math.max(1.25, failureArc * 0.035));
  const usableArc = Math.max(0, failureArc - inset * 2);
  return successEnd + inset + usableArc * rollProgress;
}

function chanceText(chance: number) {
  return `${Math.round(clamp(chance, 0, 100) * 10) / 10}%`;
}

function BaddieCard({
  baddie,
  selected,
  disabled,
  reason,
  onClick,
  kind,
}: {
  baddie: any;
  selected: boolean;
  disabled?: boolean;
  reason?: string | null;
  onClick: () => void;
  kind: "material" | "target";
}) {
  const template = kind === "material" ? baddie.template : baddie;
  const image = imgOf(template);

  return (
    <motion.button
      layout
      type="button"
      disabled={disabled}
      onClick={onClick}
      whileHover={!disabled ? { y: -2 } : undefined}
      whileTap={!disabled ? { scale: 0.98 } : undefined}
      className={`group relative min-w-0 overflow-hidden rounded-xl border p-2 text-left transition-all duration-200 ${
        selected
          ? "border-primary bg-primary/10 shadow-[0_0_0_1px_rgba(255,75,75,0.4),0_0_20px_-10px_rgba(255,75,75,0.85)]"
          : `bg-black/15 hover:bg-white/[0.045] ${RARITY_STYLE[template?.rarity] ?? "border-border/60 text-foreground"}`
      } ${disabled ? "cursor-not-allowed opacity-45 grayscale-[0.35]" : "cursor-pointer"}`}
      aria-pressed={selected}
    >
      <div className="relative aspect-[1.05] overflow-hidden rounded-lg bg-black/40 ring-1 ring-white/10">
        {image ? (
          <img src={image} alt={template?.name ?? "Baddie"} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" loading="lazy" />
        ) : (
          <div className="grid h-full place-items-center"><Sparkles className="size-7 opacity-60" /></div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/75 to-transparent" />
        {selected && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">
            <Check className="size-3.5 stroke-[3]" />
          </motion.span>
        )}
        {reason && (
          <span className="absolute inset-x-1.5 bottom-1.5 truncate rounded bg-black/75 px-1.5 py-1 text-[9px] font-semibold text-foreground">
            {reason}
          </span>
        )}
      </div>
      <div className="mt-2 min-w-0">
        <div className="truncate text-xs font-bold text-foreground">{template?.name ?? "Unknown Baddie"}</div>
        <div className="mt-0.5 flex items-center justify-between gap-1 text-[10px]">
          <span className="truncate capitalize opacity-75">{RARITY_LABELS[template?.rarity] ?? template?.rarity}</span>
          <span className="shrink-0 font-semibold text-foreground">{template?.income_per_hour ?? 0}/h</span>
        </div>
      </div>
    </motion.button>
  );
}

function UpgradeWheel({
  chancePct,
  needleAngle,
  phase,
  onSpinComplete,
}: {
  chancePct: number;
  needleAngle: number;
  phase: UpgradePhase;
  onSpinComplete: () => void;
}) {
  const successDegrees = clamp(chancePct, 0, 100) * 3.6;
  const visibleSuccessDegrees = successDegrees > 0 ? Math.max(successDegrees, 1.25) : 0;
  const wheelBackground = visibleSuccessDegrees > 0
    ? `conic-gradient(from ${WHEEL_SUCCESS_START_DEGREES}deg, rgba(52,211,153,0.98) 0deg ${visibleSuccessDegrees}deg, rgba(255,255,255,0.075) ${visibleSuccessDegrees}deg 360deg)`
    : "conic-gradient(from -90deg, rgba(255,255,255,0.075) 0deg 360deg)";
  const spinning = phase === "spinning";
  const success = phase === "success";
  const failure = phase === "failure";

  return (
    <motion.div
      className="relative mx-auto aspect-square w-full max-w-[19rem]"
      animate={success
        ? { scale: [1, 1.035, 1], filter: ["brightness(1)", "brightness(1.16)", "brightness(1)"] }
        : failure
          ? { x: [0, -5, 5, -3, 3, 0], scale: [1, 0.985, 1] }
          : { scale: 1, x: 0, filter: "brightness(1)" }}
      transition={{ duration: success ? 0.7 : failure ? 0.45 : 0.2 }}
    >
      <div className={`absolute inset-0 rounded-full p-[11px] ${
        success ? "shadow-[0_0_45px_-7px_rgba(52,211,153,0.9)]" : failure ? "shadow-[0_0_32px_-10px_rgba(244,63,94,0.68)]" : "shadow-[0_0_36px_-16px_rgba(250,204,21,0.6)]"
      }`} style={{ background: wheelBackground }}>
        <div className="relative h-full w-full rounded-full bg-[#101014] ring-1 ring-white/10">
          <div className="absolute inset-[8%] rounded-full border border-white/10" />
          <div className="absolute inset-[16%] rounded-full border border-white/[0.06]" />
          <div className="absolute left-1/2 top-0 h-3 w-px -translate-x-1/2 bg-emerald-200/90 shadow-[0_0_8px_rgba(167,243,208,0.9)]" />

          <motion.div
            className="absolute inset-0 z-20"
            animate={{ rotate: needleAngle }}
            transition={spinning
              ? { duration: 4.9, ease: [0.08, 0.78, 0.18, 1] }
              : { duration: 0 }}
            onAnimationComplete={onSpinComplete}
          >
            <div className="absolute left-1/2 top-[11%] h-[40%] w-[3px] -translate-x-1/2 rounded-full bg-gradient-to-t from-white/10 via-white/10 to-primary shadow-[0_0_12px_rgba(250,204,21,0.8)]" />
            <div className="absolute left-1/2 top-[8%] size-0 -translate-x-1/2 border-x-[7px] border-b-[14px] border-x-transparent border-b-white drop-shadow-[0_0_5px_rgba(253,230,138,0.95)]" />
          </motion.div>

          <div className="absolute inset-[31%] z-30 grid place-items-center rounded-full border border-white/10 bg-[#141419] shadow-[inset_0_0_30px_rgba(0,0,0,0.65)]">
            <div className="text-center">
              <div className={`font-display text-4xl font-black tracking-tight ${success ? "text-emerald-300" : failure ? "text-white" : "bg-gradient-to-br from-white/10 via-white/10 to-emerald-300 bg-clip-text text-transparent"}`}>
                {chanceText(chancePct)}
              </div>
              <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {phase === "securing" ? "locking outcome" : phase === "spinning" ? "upgrade rolling" : success ? "success" : failure ? "failed" : "success chance"}
              </div>
            </div>
          </div>

          <div className="absolute bottom-[13%] left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-200/70">
            success zone
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const upgrade = useServerFn(upgradeBaddies);
  const revealTimer = useRef<number | null>(null);

  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState<string | null>(null);
  const [targetSearch, setTargetSearch] = useState("");
  const [rarityFilter, setRarityFilter] = useState("all");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [phase, setPhase] = useState<UpgradePhase>("idle");
  const [needleAngle, setNeedleAngle] = useState(0);
  const [queuedOutcome, setQueuedOutcome] = useState<UpgradeOutcome | null>(null);
  const [result, setResult] = useState<UpgradeOutcome | null>(null);
  const [consumedIds, setConsumedIds] = useState<string[]>([]);

  useEffect(() => () => {
    if (revealTimer.current !== null) window.clearTimeout(revealTimer.current);
  }, []);

  const templates = useQuery({
    queryKey: ["baddie-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("baddie_templates" as any).select("*");
      if (error) throw error;
      return ((data ?? []) as any[]).sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
    },
  });

  const baddies = useQuery({
    queryKey: ["my-baddies", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_baddies" as any)
        .select("*, template:baddie_templates(*)")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const owned = (baddies.data ?? []) as any[];
  const tmpls = (templates.data ?? []) as any[];
  const targetTpl = tmpls.find((item) => item.id === target);
  const selectedMaterials = owned.filter((baddie) => selected.includes(baddie.id));
  const materialValue = useMemo(
    () => selectedMaterials.reduce((sum, baddie) => sum + Number(baddie.template?.income_per_hour ?? 0), 0),
    [selectedMaterials],
  );
  const previewChancePct = Math.round(previewChance(materialValue, targetTpl) * 1000) / 10;
  const shownChancePct = queuedOutcome?.chancePct ?? result?.chancePct ?? previewChancePct;
  const isLocked = phase !== "idle";

  const materialCards = useMemo(
    () => owned
      .filter((baddie) => !consumedIds.includes(baddie.id))
      .slice()
      .sort((a, b) => Number(!!materialUnavailableReason(a)) - Number(!!materialUnavailableReason(b))),
    [owned, consumedIds],
  );

  const filteredTargets = useMemo(() => {
    const query = targetSearch.trim().toLowerCase();
    return tmpls.filter((item) => {
      const rarityMatches = rarityFilter === "all" || item.rarity === rarityFilter;
      const textMatches = !query || `${item.name} ${item.rarity}`.toLowerCase().includes(query);
      return rarityMatches && textMatches;
    });
  }, [tmpls, rarityFilter, targetSearch]);

  function toggleMaterial(id: string) {
    if (isLocked) return;
    const baddie = owned.find((item) => item.id === id);
    if (!baddie || materialUnavailableReason(baddie)) return;

    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= MAX_MATERIALS) {
        toast.error(`You can use at most ${MAX_MATERIALS} materials per upgrade.`);
        return current;
      }
      return [...current, id];
    });
  }

  function selectTarget(templateId: string) {
    if (!isLocked) setTarget(templateId);
  }

  async function runUpgrade() {
    if (!target || selected.length === 0 || isLocked) return;

    const materialIds = [...selected];
    setConfirmOpen(false);
    setQueuedOutcome(null);
    setResult(null);
    setPhase("securing");

    try {
      // The server atomically calculates chance, consumes materials, and persists success/failure first.
      // The wheel below only visualizes the response that was already committed by the server.
      const response: any = await upgrade({ data: { targetTemplateId: target, materialBaddieIds: materialIds } });
      const row = Array.isArray(response) ? response[0] : response;
      const chancePct = Number(row?.chance);
      const rollPct = Number(row?.roll);

      if (typeof row?.success !== "boolean" || !Number.isFinite(chancePct) || !Number.isFinite(rollPct)) {
        throw new Error("The server returned an invalid upgrade result.");
      }

      const outcome: UpgradeOutcome = {
        success: row.success,
        chancePct: Math.round(chancePct * 10) / 10,
        rollPct,
        target: row.target ?? targetTpl,
        materialIds,
      };

      setQueuedOutcome(outcome);
      setPhase("spinning");
      const stopAngle = calculateStopAngle(outcome);
      setNeedleAngle((current) => {
        const currentNormalized = ((current % 360) + 360) % 360;
        const delta = (stopAngle - currentNormalized + 360) % 360;
        return current + 6 * 360 + delta;
      });
    } catch (error: any) {
      setPhase("idle");
      toast.error(error?.message ?? "Upgrade error");
    }
  }

  function finishWheel() {
    if (phase !== "spinning" || !queuedOutcome) return;

    const outcome = queuedOutcome;
    setPhase(outcome.success ? "success" : "failure");
    setConsumedIds((current) => Array.from(new Set([...current, ...outcome.materialIds])));
    setSelected([]);
    qc.invalidateQueries({ queryKey: ["my-baddies"] });

    if (outcome.success) toast.success("Upgrade succeeded!");
    else toast.error("Upgrade failed — materials were consumed.");

    revealTimer.current = window.setTimeout(() => {
      setResult(outcome);
      setQueuedOutcome(null);
    }, outcome.success ? 520 : 700);
  }

  function closeResult() {
    setResult(null);
    setQueuedOutcome(null);
    setPhase("idle");
  }

  const canUpgrade = !isLocked && !!target && selected.length > 0;
  const selectedValueText = materialValue > 0 ? `${materialValue}/h total` : "No materials selected";

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ArrowLeftRight}
        title="Baddie Upgrader"
        subtitle="Choose materials, lock a target, and let the wheel reveal the already-secured server result. Materials are consumed on every attempt."
      />

      <Card className="glass overflow-hidden p-0">
        <div className="border-b border-white/[0.07] bg-black/15 px-5 py-3 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Upgrade flow</span>
          <span className="mx-2 text-primary/80">Materials</span><ChevronRight className="inline size-3" />
          <span className="mx-2 text-foreground">Secure roll</span><ChevronRight className="inline size-3" />
          <span className="ml-2 text-emerald-200">Target</span>
        </div>

        <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,0.8fr)_minmax(0,1fr)] lg:p-5">
          <section className="flex min-w-0 flex-col rounded-2xl border border-white/10 bg-black/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-2xl border-b border-white/[0.07] bg-[#121217]/95 px-4 py-3 backdrop-blur">
              <div>
                <div className="text-sm font-display font-medium">Materials</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{selected.length} / {MAX_MATERIALS} selected · {selectedValueText}</div>
              </div>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={isLocked || selected.length === 0} onClick={() => setSelected([])}>
                Clear
              </Button>
            </div>

            <div className="p-3">
              <div className="mb-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-2.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Selected tray</span>
                  <span className="text-[10px] font-semibold text-foreground">{selected.length ? `${selected.length} Baddie${selected.length === 1 ? "" : "s"}` : "Empty"}</span>
                </div>
                {selectedMaterials.length ? (
                  <div className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.18) transparent" }}>
                    {selectedMaterials.map((baddie) => (
                      <button key={baddie.id} type="button" disabled={isLocked} onClick={() => toggleMaterial(baddie.id)} className="inline-flex max-w-full items-center gap-1 rounded-md border border-primary/35 bg-primary/10 px-1.5 py-1 text-[10px] font-semibold text-primary-foreground transition hover:bg-primary/20 disabled:cursor-not-allowed">
                        <span className="truncate">{baddie.template?.name ?? baddie.name}</span><X className="size-3 shrink-0" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">Select owned Baddies to use as upgrade material.</div>
                )}
              </div>

              {baddies.isLoading ? (
                <div className="grid min-h-48 place-items-center text-sm text-muted-foreground"><RotateCw className="mr-2 size-4 animate-spin" />Loading inventory…</div>
              ) : materialCards.length === 0 ? (
                <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-white/15 p-5 text-center text-sm text-muted-foreground">Open Baddie Cases to get upgrade materials.</div>
              ) : (
                <div className="max-h-[28rem] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.18) transparent" }}>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                    <AnimatePresence initial={false}>
                      {materialCards.map((baddie) => {
                        const selectedNow = selected.includes(baddie.id);
                        const reason = materialUnavailableReason(baddie);
                        const atLimit = selected.length >= MAX_MATERIALS && !selectedNow;
                        return (
                          <BaddieCard
                            key={baddie.id}
                            baddie={baddie}
                            kind="material"
                            selected={selectedNow}
                            reason={reason ?? (atLimit ? `Max ${MAX_MATERIALS} materials` : null)}
                            disabled={isLocked || !!reason || atLimit}
                            onClick={() => toggleMaterial(baddie.id)}
                          />
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="flex min-w-0 flex-col items-center justify-between rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_50%_20%,rgba(250,204,21,0.12),transparent_38%),rgba(0,0,0,0.2)] p-4 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-5">
            <div className="mb-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Secure upgrade roll</div>
              <div className="mt-1 text-sm text-muted-foreground">{targetTpl ? `Target: ${targetTpl.name}` : "Choose a target to begin"}</div>
            </div>

            <UpgradeWheel chancePct={shownChancePct} needleAngle={needleAngle} phase={phase} onSpinComplete={finishWheel} />

            <div className="mt-3 w-full">
              <Button className="glow-red h-11 w-full text-sm font-bold" disabled={!canUpgrade} onClick={() => setConfirmOpen(true)}>
                {phase === "securing" ? <><RotateCw className="mr-2 size-4 animate-spin" />Securing result…</> : phase === "spinning" ? <><RotateCw className="mr-2 size-4 animate-spin" />Wheel spinning…</> : "Upgrade Baddies"}
              </Button>
              <div className="mt-2.5 flex items-start justify-center gap-1.5 text-[11px] leading-relaxed text-foreground">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>Selected materials are consumed on both success and failure.</span>
              </div>
              {!canUpgrade && !isLocked && (
                <div className="mt-2 text-[11px] text-muted-foreground">{!selected.length ? "Select at least one material." : "Choose one target Baddie."}</div>
              )}
            </div>
          </section>

          <section className="flex min-w-0 flex-col rounded-2xl border border-white/10 bg-black/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="sticky top-0 z-10 rounded-t-2xl border-b border-white/[0.07] bg-[#121217]/95 px-4 py-3 backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-display font-medium">Target Baddie</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">Choose exactly one target template.</div>
                </div>
                {targetTpl && <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">Selected</span>}
              </div>
              <div className="relative mt-3">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input value={targetSearch} disabled={isLocked} onChange={(event) => setTargetSearch(event.target.value)} placeholder="Search Baddies" className="h-8 w-full rounded-lg border border-white/10 bg-black/25 pl-8 pr-3 text-xs outline-none transition placeholder:text-muted-foreground focus:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50" />
              </div>
              <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.18) transparent" }}>
                {["all", ...RARITY_ORDER].map((rarity) => (
                  <button key={rarity} type="button" disabled={isLocked} onClick={() => setRarityFilter(rarity)} className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold transition ${rarityFilter === rarity ? "border-primary/50 bg-primary/15 text-primary" : "border-white/10 bg-white/[0.025] text-muted-foreground hover:border-white/20"} disabled:cursor-not-allowed disabled:opacity-50`}>
                    {rarity === "all" ? "All" : RARITY_LABELS[rarity]}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3">
              {templates.isLoading ? (
                <div className="grid min-h-48 place-items-center text-sm text-muted-foreground"><RotateCw className="mr-2 size-4 animate-spin" />Loading targets…</div>
              ) : filteredTargets.length === 0 ? (
                <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-white/15 p-5 text-center text-sm text-muted-foreground">No target matches this filter.</div>
              ) : (
                <div className="max-h-[31.75rem] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.18) transparent" }}>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                    {filteredTargets.map((template) => (
                      <BaddieCard key={template.id} baddie={template} kind="target" selected={target === template.id} disabled={isLocked} onClick={() => selectTarget(template.id)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </Card>

      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onClick={closeResult}>
            <motion.div initial={result.success ? { opacity: 0, scale: 0.7, y: 20 } : { opacity: 0, scale: 0.92, x: -12 }} animate={result.success ? { opacity: 1, scale: 1, y: 0 } : { opacity: 1, scale: 1, x: [0, -5, 5, -2, 2, 0] }} exit={{ opacity: 0, scale: 0.94 }} transition={result.success ? { type: "spring", stiffness: 220, damping: 17 } : { duration: 0.38 }} onClick={(event) => event.stopPropagation()} className={`w-full max-w-sm rounded-2xl border-2 bg-[#121217] p-6 text-center ${result.success ? "border-emerald-400 shadow-[0_0_55px_-8px_rgba(52,211,153,0.75)]" : "border-white/10 shadow-[0_0_45px_-10px_rgba(244,63,94,0.7)]"}`}>
              {result.success ? (
                <>
                  <div className="mx-auto mb-3 grid size-14 place-items-center rounded-full border border-emerald-300/40 bg-emerald-400/10 text-emerald-300 shadow-[0_0_25px_-4px_rgba(52,211,153,0.9)]"><Check className="size-8 stroke-[3]" /></div>
                  <div className="font-display text-3xl font-black text-emerald-200">Upgrade Success!</div>
                  <div className="mt-1 text-sm text-muted-foreground">The wheel landed in the {chanceText(result.chancePct)} success zone.</div>
                  {result.target?.name && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }} className="mt-5 rounded-xl border border-emerald-300/25 bg-emerald-400/[0.06] p-3">
                      {imgOf(result.target) ? <img src={imgOf(result.target)!} alt={result.target.name} className="mx-auto mb-3 size-32 rounded-lg object-cover ring-1 ring-emerald-200/30" /> : <Sparkles className="mx-auto mb-3 size-12 text-emerald-200" />}
                      <div className="font-display text-xl font-medium">{result.target.name}</div>
                      <div className="mt-1 text-xs capitalize text-emerald-100/75">{RARITY_LABELS[result.target.rarity] ?? result.target.rarity} · {result.target.income_per_hour ?? 0} DICE/hour</div>
                    </motion.div>
                  )}
                </>
              ) : (
                <>
                  <div className="mx-auto mb-3 grid size-14 place-items-center rounded-full border border-white/10 bg-white/5 text-white"><X className="size-8 stroke-[3]" /></div>
                  <div className="font-display text-3xl font-black text-white">Upgrade Failed</div>
                  <div className="mt-2 text-sm leading-relaxed text-muted-foreground">The result was secured before the wheel spun. Your selected materials have been consumed.</div>
                  <div className="mt-4 rounded-lg border border-white/10 bg-graphite/[0.05] px-3 py-2 text-xs text-fog">Try a higher-value material set to improve your next chance.</div>
                </>
              )}
              <Button className="mt-5 w-full" onClick={closeResult}>Continue</Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={confirmOpen} onOpenChange={(open) => !isLocked && setConfirmOpen(open)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm upgrade</DialogTitle>
            <DialogDescription>
              You will permanently consume <b>{selected.length}</b> Baddie{selected.length === 1 ? "" : "s"} for a displayed <b>{chanceText(previewChancePct)}</b> chance at <b>{targetTpl?.name}</b>. The server locks the actual chance and result before the wheel starts.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-white/10 bg-primary/[0.06] p-3 text-xs text-foreground/85">
            <div className="flex gap-2"><Lock className="mt-0.5 size-3.5 shrink-0" /><span>Materials are consumed whether the upgrade succeeds or fails.</span></div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={isLocked} onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button disabled={!canUpgrade} onClick={runUpgrade} className="glow-red">Lock in upgrade · {chanceText(previewChancePct)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
