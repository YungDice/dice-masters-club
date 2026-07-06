import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  BUILDINGS, UNITS, RESEARCH, GRID_SIZE, PRODUCTION_CAP_SECONDS,
  COMMAND_ENERGY_REGEN_PER_SEC, BASE_UNIT_CAP, BASE_ATTACK_COST,
  baseCapacity, baseCommandEnergyCap, workshopSpeedMultiplier,
  type BuildingKind, type UnitKind, type ResearchNodeId,
} from "./dominion.config";

const CID = z.string().min(8).max(80);

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type ProfileRow = {
  user_id: string; hq_level: number;
  roll_credits: number; scrap: number; power: number;
  command_energy: number; command_energy_updated_at: string;
  workers: number; xp: number; initialized_at: string;
};

type BuildingRow = {
  id: string; user_id: string; kind: BuildingKind; level: number;
  slot_x: number; slot_y: number; last_collected_at: string;
};

function secondsSince(iso: string): number {
  return Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
}

function cappedResources(profile: ProfileRow, buildings: BuildingRow[]) {
  const vault = buildings.find((b) => b.kind === "vault");
  const cap = baseCapacity(vault?.level ?? 0);
  return { cap };
}

function projectResourceGain(buildings: BuildingRow[]) {
  // Returns per-building projected gains {scrap, power, roll_credits} based on last_collected_at.
  const gains = { scrap: 0, power: 0, roll_credits: 0 };
  for (const b of buildings) {
    const spec = BUILDINGS[b.kind];
    if (!spec.produces) continue;
    const rate = spec.produces(b.level); // per hour
    const seconds = Math.min(PRODUCTION_CAP_SECONDS, secondsSince(b.last_collected_at));
    if (rate.scrap) gains.scrap += Math.floor((rate.scrap * seconds) / 3600);
    if (rate.power) gains.power += Math.floor((rate.power * seconds) / 3600);
    if (rate.roll_credits) gains.roll_credits += Math.floor((rate.roll_credits * seconds) / 3600);
  }
  return gains;
}

function projectCommandEnergy(profile: ProfileRow, cmdLevel: number) {
  const cap = baseCommandEnergyCap(cmdLevel);
  const regen = COMMAND_ENERGY_REGEN_PER_SEC;
  const elapsed = secondsSince(profile.command_energy_updated_at);
  return Math.min(cap, Math.floor(profile.command_energy + elapsed * regen));
}

// ============================================================
// GET STATE
// ============================================================
export const dominionGetState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const uid = context.userId;
    const admin = await getAdmin();
    const [{ data: profile }, { data: buildings }, { data: units }, { data: research }, { data: jobs }] = await Promise.all([
      admin.from("dominion_profiles").select("*").eq("user_id", uid).maybeSingle(),
      admin.from("dominion_buildings").select("*").eq("user_id", uid),
      admin.from("dominion_units").select("*").eq("user_id", uid),
      admin.from("dominion_research").select("*").eq("user_id", uid),
      admin.from("dominion_jobs").select("*").eq("user_id", uid).eq("finished", false).order("ends_at"),
    ]);
    if (!profile) return { initialized: false as const };
    const b = (buildings ?? []) as BuildingRow[];
    const p = profile as ProfileRow;
    const cmd = b.find((x) => x.kind === "command_center");
    return {
      initialized: true as const,
      profile: p,
      buildings: b,
      units: units ?? [],
      research: research ?? [],
      jobs: jobs ?? [],
      derived: {
        capacity: cappedResources(p, b).cap,
        pendingGains: projectResourceGain(b),
        commandEnergy: projectCommandEnergy(p, cmd?.level ?? 0),
        commandEnergyCap: baseCommandEnergyCap(cmd?.level ?? 0),
        now: new Date().toISOString(),
      },
    };
  });

// ============================================================
// INIT
// ============================================================
export const dominionInit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { client_action_id: string }) => z.object({ client_action_id: CID }).parse(d))
  .handler(async ({ context }) => {
    const uid = context.userId;
    const admin = await getAdmin();
    const { data: existing } = await admin.from("dominion_profiles").select("user_id").eq("user_id", uid).maybeSingle();
    if (existing) return { ok: true, existed: true };
    const { error } = await admin.from("dominion_profiles").insert({ user_id: uid });
    if (error) throw new Error(error.message);
    const starter = [
      { kind: "headquarters", slot_x: 1, slot_y: 1 },
      { kind: "salvage_yard", slot_x: 0, slot_y: 0 },
      { kind: "dice_forge",   slot_x: 2, slot_y: 1 },
    ] as const;
    const rows = starter.map((s) => ({ user_id: uid, kind: s.kind, level: 1, slot_x: s.slot_x, slot_y: s.slot_y }));
    await admin.from("dominion_buildings").insert(rows);
    return { ok: true, existed: false };
  });

// ============================================================
// BUILD (place new)
// ============================================================
const BuildSchema = z.object({
  client_action_id: CID,
  kind: z.enum(["salvage_yard","power_core","dice_forge","vault","command_center","workshop"]),
  slot_x: z.number().int().min(0).max(GRID_SIZE - 1),
  slot_y: z.number().int().min(0).max(GRID_SIZE - 1),
});

export const dominionBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof BuildSchema>) => BuildSchema.parse(d))
  .handler(async ({ data, context }) => {
    const uid = context.userId;
    const admin = await getAdmin();

    // idempotency check by client_action_id in jobs
    const { data: dupe } = await admin.from("dominion_jobs").select("id").eq("user_id", uid).eq("client_action_id", data.client_action_id).maybeSingle();
    if (dupe) return { ok: true, jobId: dupe.id, dedup: true };

    const [{ data: profile }, { data: buildings }] = await Promise.all([
      admin.from("dominion_profiles").select("*").eq("user_id", uid).maybeSingle(),
      admin.from("dominion_buildings").select("*").eq("user_id", uid),
    ]);
    if (!profile) throw new Error("District not initialized");
    const b = (buildings ?? []) as BuildingRow[];
    if (b.some((x) => x.slot_x === data.slot_x && x.slot_y === data.slot_y)) throw new Error("Slot occupied");

    const spec = BUILDINGS[data.kind];
    const cost = spec.cost(1);
    if ((cost.scrap ?? 0) > profile.scrap) throw new Error("Not enough Scrap");
    if ((cost.power ?? 0) > profile.power) throw new Error("Not enough Power");
    if ((cost.roll_credits ?? 0) > profile.roll_credits) throw new Error("Not enough Roll Credits");

    const workshop = b.find((x) => x.kind === "workshop");
    const secs = Math.round(spec.buildSeconds(1) * workshopSpeedMultiplier(workshop?.level ?? 0));
    const endsAt = new Date(Date.now() + secs * 1000).toISOString();

    // Debit
    await admin.from("dominion_profiles").update({
      scrap: profile.scrap - (cost.scrap ?? 0),
      power: profile.power - (cost.power ?? 0),
      roll_credits: profile.roll_credits - (cost.roll_credits ?? 0),
    }).eq("user_id", uid);

    // Insert placeholder building (level 0) and job to finalize
    const { data: bIns, error: bErr } = await admin.from("dominion_buildings").insert({
      user_id: uid, kind: data.kind, level: 0, slot_x: data.slot_x, slot_y: data.slot_y,
    }).select("id").single();
    if (bErr) throw new Error(bErr.message);

    const { data: jIns, error: jErr } = await admin.from("dominion_jobs").insert({
      user_id: uid, kind: "build", ref_id: bIns.id, ends_at: endsAt, payload: { kind: data.kind, level: 1 },
      client_action_id: data.client_action_id,
    }).select("id").single();
    if (jErr) throw new Error(jErr.message);

    return { ok: true, jobId: jIns.id, endsAt };
  });

// ============================================================
// UPGRADE
// ============================================================
const UpgradeSchema = z.object({ client_action_id: CID, building_id: z.string().uuid() });
export const dominionUpgrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof UpgradeSchema>) => UpgradeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const uid = context.userId;
    const admin = await getAdmin();
    const { data: dupe } = await admin.from("dominion_jobs").select("id").eq("user_id", uid).eq("client_action_id", data.client_action_id).maybeSingle();
    if (dupe) return { ok: true, jobId: dupe.id, dedup: true };

    const [{ data: profile }, { data: bld }, { data: buildings }] = await Promise.all([
      admin.from("dominion_profiles").select("*").eq("user_id", uid).maybeSingle(),
      admin.from("dominion_buildings").select("*").eq("id", data.building_id).eq("user_id", uid).maybeSingle(),
      admin.from("dominion_buildings").select("*").eq("user_id", uid),
    ]);
    if (!profile || !bld) throw new Error("Not found");
    const spec = BUILDINGS[bld.kind as BuildingKind];
    const nextLevel = bld.level + 1;
    if (nextLevel > spec.maxLevel) throw new Error("Max level");
    if (bld.kind !== "headquarters" && nextLevel > profile.hq_level) throw new Error("Upgrade HQ first");
    const cost = spec.cost(nextLevel);
    if ((cost.scrap ?? 0) > profile.scrap) throw new Error("Not enough Scrap");
    if ((cost.power ?? 0) > profile.power) throw new Error("Not enough Power");
    if ((cost.roll_credits ?? 0) > profile.roll_credits) throw new Error("Not enough Roll Credits");

    const workshop = (buildings ?? []).find((x: any) => x.kind === "workshop");
    const secs = Math.round(spec.buildSeconds(nextLevel) * workshopSpeedMultiplier(workshop?.level ?? 0));
    const endsAt = new Date(Date.now() + secs * 1000).toISOString();

    await admin.from("dominion_profiles").update({
      scrap: profile.scrap - (cost.scrap ?? 0),
      power: profile.power - (cost.power ?? 0),
      roll_credits: profile.roll_credits - (cost.roll_credits ?? 0),
    }).eq("user_id", uid);

    const { data: jIns, error: jErr } = await admin.from("dominion_jobs").insert({
      user_id: uid, kind: "upgrade", ref_id: bld.id, ends_at: endsAt,
      payload: { kind: bld.kind, level: nextLevel }, client_action_id: data.client_action_id,
    }).select("id").single();
    if (jErr) throw new Error(jErr.message);
    return { ok: true, jobId: jIns.id, endsAt };
  });

// ============================================================
// COLLECT (materialize accrued production)
// ============================================================
export const dominionCollect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { client_action_id: string }) => z.object({ client_action_id: CID }).parse(d))
  .handler(async ({ context }) => {
    const uid = context.userId;
    const admin = await getAdmin();
    const [{ data: profile }, { data: buildings }] = await Promise.all([
      admin.from("dominion_profiles").select("*").eq("user_id", uid).maybeSingle(),
      admin.from("dominion_buildings").select("*").eq("user_id", uid).gt("level", 0),
    ]);
    if (!profile) throw new Error("District not initialized");
    const b = (buildings ?? []) as BuildingRow[];
    const gains = projectResourceGain(b);
    const { cap } = cappedResources(profile as ProfileRow, b);
    const nowIso = new Date().toISOString();

    const newScrap = Math.min(cap, profile.scrap + gains.scrap);
    const newPower = Math.min(cap, profile.power + gains.power);
    const newRC = Math.min(cap, profile.roll_credits + gains.roll_credits);

    await admin.from("dominion_profiles").update({
      scrap: newScrap, power: newPower, roll_credits: newRC,
    }).eq("user_id", uid);

    // Reset all producing buildings' last_collected_at
    const producing = b.filter((x) => BUILDINGS[x.kind].produces);
    if (producing.length) {
      await admin.from("dominion_buildings").update({ last_collected_at: nowIso })
        .in("id", producing.map((x) => x.id));
    }

    return { ok: true, gained: gains, totals: { scrap: newScrap, power: newPower, roll_credits: newRC } };
  });

// ============================================================
// FINISH JOB (poll from client when timer elapses)
// ============================================================
export const dominionFinishJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const uid = context.userId;
    const admin = await getAdmin();
    const nowIso = new Date().toISOString();
    const { data: due } = await admin.from("dominion_jobs")
      .select("*").eq("user_id", uid).eq("finished", false).lte("ends_at", nowIso);
    if (!due?.length) return { finished: 0 };

    for (const j of due) {
      if (j.kind === "build") {
        await admin.from("dominion_buildings")
          .update({ level: (j.payload as any).level ?? 1, last_collected_at: nowIso })
          .eq("id", j.ref_id!);
      } else if (j.kind === "upgrade") {
        const targetLevel = (j.payload as any).level;
        const targetKind = (j.payload as any).kind;
        await admin.from("dominion_buildings")
          .update({ level: targetLevel, last_collected_at: nowIso })
          .eq("id", j.ref_id!);
        if (targetKind === "headquarters") {
          await admin.from("dominion_profiles").update({ hq_level: targetLevel }).eq("user_id", uid);
        }
      } else if (j.kind === "train") {
        const kind = (j.payload as any).kind as UnitKind;
        const qty = (j.payload as any).qty ?? 1;
        const { data: row } = await admin.from("dominion_units")
          .select("count").eq("user_id", uid).eq("kind", kind).maybeSingle();
        await admin.from("dominion_units").upsert({
          user_id: uid, kind, count: (row?.count ?? 0) + qty,
        });
      } else if (j.kind === "research") {
        const branch = (j.payload as any).branch;
        const node = (j.payload as any).node;
        const level = (j.payload as any).level;
        await admin.from("dominion_research").upsert({
          user_id: uid, branch, node, level,
        });
      }
      await admin.from("dominion_jobs").update({ finished: true }).eq("id", j.id);
    }
    return { finished: due.length };
  });

// ============================================================
// RESEARCH multipliers helper
// ============================================================
function researchLevels(rows: any[]) {
  const m: Partial<Record<ResearchNodeId, number>> = {};
  for (const r of rows) m[r.node as ResearchNodeId] = r.level;
  return m;
}
function attackMultiplier(rows: any[], cmdLevel: number) {
  const lv = researchLevels(rows).attack ?? 0;
  return (1 + 0.04 * lv) * (1 + 0.05 * cmdLevel);
}
function unitCapacity(rows: any[]) {
  return BASE_UNIT_CAP + 10 * (researchLevels(rows).unit_cap ?? 0);
}
function attackEnergyCost(rows: any[]) {
  return Math.max(1, Math.round(BASE_ATTACK_COST * (1 - 0.05 * (researchLevels(rows).energy_efficiency ?? 0))));
}
function sectorRewardMultiplier(rows: any[]) {
  return 1 + 0.05 * (researchLevels(rows).sector_rewards ?? 0);
}
function trainSpeedMultiplier(rows: any[]) {
  return Math.max(0.5, 1 - 0.03 * (researchLevels(rows).train_speed ?? 0));
}

// ============================================================
// TRAIN
// ============================================================
const TrainSchema = z.object({
  client_action_id: CID,
  kind: z.enum(["scout_roller","shield_guard","crusher_tank","sky_drone"]),
  qty: z.number().int().min(1).max(20),
});
export const dominionTrain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof TrainSchema>) => TrainSchema.parse(d))
  .handler(async ({ data, context }) => {
    const uid = context.userId;
    const admin = await getAdmin();
    const { data: dupe } = await admin.from("dominion_jobs").select("id").eq("user_id", uid).eq("client_action_id", data.client_action_id).maybeSingle();
    if (dupe) return { ok: true, jobId: dupe.id, dedup: true };

    const [{ data: profile }, { data: buildings }, { data: units }, { data: research }] = await Promise.all([
      admin.from("dominion_profiles").select("*").eq("user_id", uid).maybeSingle(),
      admin.from("dominion_buildings").select("*").eq("user_id", uid).gt("level", 0),
      admin.from("dominion_units").select("*").eq("user_id", uid),
      admin.from("dominion_research").select("*").eq("user_id", uid),
    ]);
    if (!profile) throw new Error("District not initialized");
    const spec = UNITS[data.kind];
    const cost = { scrap: (spec.cost.scrap ?? 0) * data.qty, power: (spec.cost.power ?? 0) * data.qty, roll_credits: (spec.cost.roll_credits ?? 0) * data.qty };
    if (cost.scrap > profile.scrap) throw new Error("Not enough Scrap");
    if (cost.power > profile.power) throw new Error("Not enough Power");
    if (cost.roll_credits > profile.roll_credits) throw new Error("Not enough Roll Credits");

    // capacity check
    const used = (units ?? []).reduce((s: number, u: any) => s + u.count * UNITS[u.kind as UnitKind].capacity, 0);
    const cap = unitCapacity(research ?? []);
    const need = spec.capacity * data.qty;
    if (used + need > cap) throw new Error(`Unit capacity exceeded (${used + need}/${cap})`);

    const workshop = (buildings ?? []).find((x: any) => x.kind === "workshop");
    const trainMult = trainSpeedMultiplier(research ?? []) * workshopSpeedMultiplier(workshop?.level ?? 0);
    const secs = Math.round(spec.trainSeconds * data.qty * trainMult);
    const endsAt = new Date(Date.now() + secs * 1000).toISOString();

    await admin.from("dominion_profiles").update({
      scrap: profile.scrap - cost.scrap, power: profile.power - cost.power, roll_credits: profile.roll_credits - cost.roll_credits,
    }).eq("user_id", uid);

    const { data: j, error } = await admin.from("dominion_jobs").insert({
      user_id: uid, kind: "train", ends_at: endsAt, payload: { kind: data.kind, qty: data.qty }, client_action_id: data.client_action_id,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, jobId: j.id, endsAt };
  });

// ============================================================
// RESEARCH START
// ============================================================
const ResearchSchema = z.object({
  client_action_id: CID,
  node: z.enum([
    "yield","capacity","conversion","attack","unit_cap","energy_efficiency",
    "build_speed","train_speed","sector_rewards",
  ]),
});
export const dominionResearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof ResearchSchema>) => ResearchSchema.parse(d))
  .handler(async ({ data, context }) => {
    const uid = context.userId;
    const admin = await getAdmin();
    const { data: dupe } = await admin.from("dominion_jobs").select("id").eq("user_id", uid).eq("client_action_id", data.client_action_id).maybeSingle();
    if (dupe) return { ok: true, jobId: dupe.id, dedup: true };

    const [{ data: profile }, { data: research }, { data: existingJob }] = await Promise.all([
      admin.from("dominion_profiles").select("*").eq("user_id", uid).maybeSingle(),
      admin.from("dominion_research").select("*").eq("user_id", uid),
      admin.from("dominion_jobs").select("id").eq("user_id", uid).eq("kind", "research").eq("finished", false),
    ]);
    if (!profile) throw new Error("District not initialized");
    if (existingJob && existingJob.length) throw new Error("Research already in progress");

    const spec = RESEARCH[data.node];
    const current = (research ?? []).find((r: any) => r.node === data.node)?.level ?? 0;
    const nextLevel = current + 1;
    if (nextLevel > spec.maxLevel) throw new Error("Max level");
    const cost = spec.cost(nextLevel);
    if (cost > profile.roll_credits) throw new Error("Not enough Roll Credits");
    const secs = spec.seconds(nextLevel);
    const endsAt = new Date(Date.now() + secs * 1000).toISOString();

    await admin.from("dominion_profiles").update({ roll_credits: profile.roll_credits - cost }).eq("user_id", uid);
    const { data: j, error } = await admin.from("dominion_jobs").insert({
      user_id: uid, kind: "research", ends_at: endsAt,
      payload: { branch: spec.branch, node: data.node, level: nextLevel },
      client_action_id: data.client_action_id,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, jobId: j.id, endsAt };
  });

// ============================================================
// LIST SECTORS
// ============================================================
export const dominionListSectors = createServerFn({ method: "GET" })
  .handler(async () => {
    const admin = await getAdmin();
    const { data } = await admin.from("dominion_sectors").select("*").order("id");
    return data ?? [];
  });

// ============================================================
// ATTACK (neutral sector)
// ============================================================
const AttackSchema = z.object({
  client_action_id: CID,
  sector_id: z.number().int().min(1),
  units: z.record(z.string(), z.number().int().min(0).max(500)),
});
export const dominionAttack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof AttackSchema>) => AttackSchema.parse(d))
  .handler(async ({ data, context }) => {
    const uid = context.userId;
    const admin = await getAdmin();
    const { data: dupe } = await admin.from("dominion_battles").select("id").eq("user_id", uid).eq("client_action_id", data.client_action_id).maybeSingle();
    if (dupe) return { ok: true, battleId: dupe.id, dedup: true };

    const [{ data: profile }, { data: buildings }, { data: units }, { data: research }, { data: sector }] = await Promise.all([
      admin.from("dominion_profiles").select("*").eq("user_id", uid).maybeSingle(),
      admin.from("dominion_buildings").select("*").eq("user_id", uid).gt("level", 0),
      admin.from("dominion_units").select("*").eq("user_id", uid),
      admin.from("dominion_research").select("*").eq("user_id", uid),
      admin.from("dominion_sectors").select("*").eq("id", data.sector_id).maybeSingle(),
    ]);
    if (!profile || !sector) throw new Error("Invalid target");

    // Validate units in inventory
    const inv = new Map<string, number>();
    for (const u of units ?? []) inv.set(u.kind, u.count);
    let attackPower = 0;
    const sent: Record<string, number> = {};
    for (const [k, qty] of Object.entries(data.units)) {
      if (!qty) continue;
      if (!(k in UNITS)) throw new Error("Bad unit");
      if ((inv.get(k) ?? 0) < qty) throw new Error(`Not enough ${k}`);
      sent[k] = qty;
      attackPower += UNITS[k as UnitKind].attack * qty;
    }
    if (attackPower === 0) throw new Error("No units sent");

    // Command Energy check + regen
    const cmd = (buildings ?? []).find((x: any) => x.kind === "command_center");
    const cap = baseCommandEnergyCap(cmd?.level ?? 0);
    const regen = COMMAND_ENERGY_REGEN_PER_SEC;
    const elapsed = Math.max(0, (Date.now() - new Date(profile.command_energy_updated_at).getTime()) / 1000);
    const currentEnergy = Math.min(cap, Math.floor(profile.command_energy + elapsed * regen));
    const energyCost = attackEnergyCost(research ?? []);
    if (currentEnergy < energyCost) throw new Error("Not enough Command Energy");

    // Resolve
    const mult = attackMultiplier(research ?? [], cmd?.level ?? 0);
    const effectiveAttack = attackPower * mult;
    const defense = sector.strength + (sector.kind === "fortified" ? 20 : 0);
    const ratio = effectiveAttack / defense;
    const win = ratio >= 1;
    // Losses: higher ratio = fewer losses; capped 20%-80%
    const lossFrac = win ? Math.max(0.05, Math.min(0.4, 1 / ratio * 0.4)) : Math.max(0.4, Math.min(0.85, 0.9 / ratio));
    const survivors: Record<string, number> = {};
    for (const [k, qty] of Object.entries(sent)) {
      survivors[k] = Math.max(0, Math.floor(qty * (1 - lossFrac)));
    }

    // Rewards on win
    const rewardMult = win ? sectorRewardMultiplier(research ?? []) : 0;
    const rewards = win ? {
      scrap: Math.floor(sector.reward_scrap * rewardMult),
      power: Math.floor(sector.reward_power * rewardMult),
      roll_credits: Math.floor(sector.reward_roll_credits * rewardMult),
    } : { scrap: 0, power: 0, roll_credits: 0 };

    // Apply: debit energy, credit rewards, update unit counts
    const vault = (buildings ?? []).find((x: any) => x.kind === "vault");
    const capRes = baseCapacity(vault?.level ?? 0);
    await admin.from("dominion_profiles").update({
      command_energy: currentEnergy - energyCost,
      command_energy_updated_at: new Date().toISOString(),
      scrap: Math.min(capRes, profile.scrap + rewards.scrap),
      power: Math.min(capRes, profile.power + rewards.power),
      roll_credits: Math.min(capRes, profile.roll_credits + rewards.roll_credits),
    }).eq("user_id", uid);

    // Update unit counts to survivors
    for (const [k, qty] of Object.entries(sent)) {
      const remaining = (inv.get(k) ?? 0) - qty + (survivors[k] ?? 0);
      await admin.from("dominion_units").upsert({ user_id: uid, kind: k as UnitKind, count: remaining });
    }

    const { data: battle } = await admin.from("dominion_battles").insert({
      user_id: uid, sector_id: data.sector_id, units_sent: sent, survivors,
      outcome: win ? "victory" : "defeat", attack_power: Math.round(effectiveAttack), defense_power: defense,
      rewards, client_action_id: data.client_action_id,
    }).select("id").single();

    return { ok: true, battleId: battle?.id, win, survivors, rewards, effectiveAttack: Math.round(effectiveAttack), defense };
  });

// ============================================================
// LIST BATTLES (recent)
// ============================================================
export const dominionListBattles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await getAdmin();
    const { data } = await admin.from("dominion_battles").select("*")
      .eq("user_id", context.userId).order("created_at", { ascending: false }).limit(20);
    return data ?? [];
  });

