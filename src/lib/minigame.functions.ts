// Minigame server functions: Flappy DICE and DICE Obby.
// Server holds the authoritative session (seed, start time, last gate/checkpoint).
// Anti-abuse: per-session caps, monotonic progress, min time between events,
// max payout per session, hourly rate limit on session creation.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes, randomInt } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function rateLimit(
  admin: any, userId: string, key: string, windowSeconds: number, maxHits: number, label = "rate_limited",
) {
  const { data } = await admin.rpc("rate_limit_hit", {
    _user: userId, _key: key, _window_seconds: windowSeconds, _max_hits: maxHits,
  });
  if (data === false) throw new Error(`Slow down (${label}) — try again later`);
}

// ============================================================
// FLAPPY DICE
// ============================================================
const FLAPPY_REWARD_PER_GATE = 50;
const FLAPPY_MIN_MS_PER_GATE = 600;   // physical floor (well below human play)
const FLAPPY_MAX_GATES_PER_SESSION = 200; // hard cap so a session can't print infinite
const FLAPPY_MAX_SESSIONS_PER_HOUR = 30;

export const flappyStart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await rateLimit(supabaseAdmin, context.userId, "flappy_start", 3600, FLAPPY_MAX_SESSIONS_PER_HOUR, "new runs");
    const seed = randomBytes(8).toString("hex");
    const startedAt = Date.now();
    const state = {
      seed,
      startedAt,
      lastGate: 0,
      lastEventAt: startedAt,
      gates: 0,
      finished: false,
      reward: 0,
    };
    const { data: room, error } = await supabaseAdmin.from("game_rooms").insert({
      kind: "flappy",
      host_id: context.userId,
      stake: 0,
      max_players: 1,
      is_private: true,
      status: "active",
      state,
    } as any).select("id").single();
    if (error) throw error;
    return { roomId: room.id, seed, startedAt };
  });

export const flappyGate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { roomId: string; gate: number }) =>
    z.object({ roomId: z.string().uuid(), gate: z.number().int().min(1).max(FLAPPY_MAX_GATES_PER_SESSION) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: room } = await supabaseAdmin.from("game_rooms").select("*")
      .eq("id", data.roomId).eq("host_id", context.userId).eq("kind", "flappy").single();
    if (!room) throw new Error("Session not found");
    if (room.status !== "active") throw new Error("Session ended");
    const s: any = room.state ?? {};
    if (s.finished) throw new Error("Session ended");
    if (data.gate !== (s.lastGate ?? 0) + 1) throw new Error("Bad gate sequence");
    const now = Date.now();
    if (now - (s.lastEventAt ?? s.startedAt ?? now) < FLAPPY_MIN_MS_PER_GATE) {
      throw new Error("Too fast");
    }
    if (data.gate > FLAPPY_MAX_GATES_PER_SESSION) throw new Error("Session cap reached");

    // Award DICE for this gate
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: context.userId, _delta: FLAPPY_REWARD_PER_GATE, _type: "game_payout",
      _source: "flappy", _ref_kind: "flappy", _ref_id: room.id, _note: `Gate ${data.gate}`,
    });
    const newState = {
      ...s,
      lastGate: data.gate,
      lastEventAt: now,
      gates: data.gate,
      reward: (s.reward ?? 0) + FLAPPY_REWARD_PER_GATE,
    };
    await supabaseAdmin.from("game_rooms").update({ state: newState }).eq("id", room.id);
    return { gate: data.gate, reward: FLAPPY_REWARD_PER_GATE, total: newState.reward };
  });

export const flappyEnd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { roomId: string }) => z.object({ roomId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: room } = await supabaseAdmin.from("game_rooms").select("*")
      .eq("id", data.roomId).eq("host_id", context.userId).eq("kind", "flappy").single();
    if (!room) throw new Error("Session not found");
    const s: any = room.state ?? {};
    if (room.status !== "active") return { gates: s.gates ?? 0, reward: s.reward ?? 0 };
    const finalState = { ...s, finished: true };
    await supabaseAdmin.from("game_rooms").update({
      state: finalState, status: "finished", finished_at: new Date().toISOString(),
    }).eq("id", room.id);
    const totalGates = s.gates ?? 0;
    await supabaseAdmin.rpc("record_game_result" as any, {
      _uid: context.userId, _kind: "flappy", _delta: s.reward ?? 0,
      _outcome: totalGates > 0 ? "win" : "loss",
      _room_id: room.id, _details: { gates: totalGates } as any,
      _wagered: 0, _payout: s.reward ?? 0,
    });
    return { gates: totalGates, reward: s.reward ?? 0 };
  });

// ============================================================
// DICE OBBY
// ============================================================
const OBBY_REWARD = 150;
const OBBY_MIN_MS = 8_000;        // can't beat a level faster than 8 seconds
const OBBY_MAX_SESSIONS_PER_HOUR = 20;
const OBBY_CHUNKS = 8;            // procedurally generated chunks per level

function generateLevel(seed: string) {
  // Deterministic-ish layout (server doesn't need to verify physics, only seed handoff).
  // Each chunk: { length: 8..14, gap: 1..3, hazards: 0..3, platforms: 2..5 }
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 33 + seed.charCodeAt(i)) >>> 0;
  function rnd() { h = (h * 1664525 + 1013904223) >>> 0; return h / 0xffffffff; }
  const chunks = [] as any[];
  for (let i = 0; i < OBBY_CHUNKS; i++) {
    chunks.push({
      length: 8 + Math.floor(rnd() * 7),
      gap: 1 + Math.floor(rnd() * 3),
      hazards: Math.floor(rnd() * 4),
      platforms: 2 + Math.floor(rnd() * 4),
      difficulty: i + 1,
    });
  }
  return { chunks, totalChunks: OBBY_CHUNKS };
}

export const obbyStart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await rateLimit(supabaseAdmin, context.userId, "obby_start", 3600, OBBY_MAX_SESSIONS_PER_HOUR, "new runs");
    const seed = randomBytes(8).toString("hex");
    const startedAt = Date.now();
    const level = generateLevel(seed);
    const state = {
      seed, startedAt, lastCheckpoint: 0,
      totalChunks: level.totalChunks,
      finished: false,
    };
    const { data: room, error } = await supabaseAdmin.from("game_rooms").insert({
      kind: "obby",
      host_id: context.userId,
      stake: 0,
      max_players: 1,
      is_private: true,
      status: "active",
      state,
    } as any).select("id").single();
    if (error) throw error;
    return { roomId: room.id, seed, level, startedAt };
  });

export const obbyCheckpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { roomId: string; checkpoint: number }) =>
    z.object({ roomId: z.string().uuid(), checkpoint: z.number().int().min(1).max(OBBY_CHUNKS) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: room } = await supabaseAdmin.from("game_rooms").select("*")
      .eq("id", data.roomId).eq("host_id", context.userId).eq("kind", "obby").single();
    if (!room) throw new Error("Session not found");
    if (room.status !== "active") throw new Error("Session ended");
    const s: any = room.state ?? {};
    if (s.finished) throw new Error("Session ended");
    if (data.checkpoint !== (s.lastCheckpoint ?? 0) + 1) throw new Error("Bad checkpoint sequence");
    const newState = { ...s, lastCheckpoint: data.checkpoint };
    await supabaseAdmin.from("game_rooms").update({ state: newState }).eq("id", room.id);
    return { checkpoint: data.checkpoint };
  });

export const obbyFinish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { roomId: string }) => z.object({ roomId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: room } = await supabaseAdmin.from("game_rooms").select("*")
      .eq("id", data.roomId).eq("host_id", context.userId).eq("kind", "obby").single();
    if (!room) throw new Error("Session not found");
    if (room.status !== "active") throw new Error("Already finished");
    const s: any = room.state ?? {};
    const now = Date.now();
    if (now - (s.startedAt ?? now) < OBBY_MIN_MS) throw new Error("Suspiciously fast");
    if ((s.lastCheckpoint ?? 0) < OBBY_CHUNKS) throw new Error("Did not reach the end");
    await supabaseAdmin.rpc("wallet_adjust", {
      _user: context.userId, _delta: OBBY_REWARD, _type: "game_payout",
      _source: "obby", _ref_kind: "obby", _ref_id: room.id, _note: "Level complete",
    });
    await supabaseAdmin.from("game_rooms").update({
      state: { ...s, finished: true, reward: OBBY_REWARD },
      status: "finished", finished_at: new Date().toISOString(),
    }).eq("id", room.id);
    await supabaseAdmin.rpc("record_game_result" as any, {
      _uid: context.userId, _kind: "obby", _delta: OBBY_REWARD, _outcome: "win",
      _room_id: room.id, _details: { seed: s.seed } as any,
      _wagered: 0, _payout: OBBY_REWARD,
    });
    return { reward: OBBY_REWARD };
  });

export const obbyAbandon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { roomId: string }) => z.object({ roomId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: room } = await supabaseAdmin.from("game_rooms").select("*")
      .eq("id", data.roomId).eq("host_id", context.userId).eq("kind", "obby").single();
    if (!room || room.status !== "active") return { ok: true };
    await supabaseAdmin.from("game_rooms").update({
      state: { ...(room.state as any), finished: true },
      status: "cancelled", finished_at: new Date().toISOString(),
    }).eq("id", room.id);
    await supabaseAdmin.rpc("record_game_result" as any, {
      _uid: context.userId, _kind: "obby", _delta: 0, _outcome: "loss",
      _room_id: room.id, _details: {} as any,
      _wagered: 0, _payout: 0,
    });
    return { ok: true };
  });
