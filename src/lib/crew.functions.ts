import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function rpc(context: any, fn: string, args: Record<string, unknown>) {
  const { data, error } = await context.supabase.rpc(fn as any, args as any);
  if (error) throw new Error(error.message);
  return data;
}

export const createCrew = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; tag: string; description?: string; isOpen?: boolean; minLevel?: number }) =>
    z.object({
      name: z.string().min(3).max(30),
      tag: z.string().regex(/^[A-Za-z0-9]{2,5}$/),
      description: z.string().max(500).optional(),
      isOpen: z.boolean().optional().default(true),
      minLevel: z.number().int().min(1).max(100).optional().default(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) =>
    rpc(context, "create_crew_tx", {
      _name: data.name,
      _tag: data.tag.toUpperCase(),
      _description: data.description ?? null,
      _is_open: data.isOpen,
      _min_level: data.minLevel,
    }) as Promise<{ ok: boolean; crew_id: string }>,
  );

export const joinCrew = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { crewId: string }) => z.object({ crewId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) =>
    rpc(context, "join_crew_tx", { _crew_id: data.crewId }) as Promise<{
      ok: boolean; joined?: boolean; requested?: boolean;
    }>,
  );

export const respondCrewJoin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string; accept: boolean }) =>
    z.object({ requestId: z.string().uuid(), accept: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) =>
    rpc(context, "respond_crew_join_tx", { _request_id: data.requestId, _accept: data.accept }),
  );

export const leaveCrew = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => rpc(context, "leave_crew_tx", {}));

export const kickCrewMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => rpc(context, "kick_crew_member_tx", { _target: data.userId }));

export const setCrewRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; role: "officer" | "member" }) =>
    z.object({ userId: z.string().uuid(), role: z.enum(["officer", "member"]) }).parse(d),
  )
  .handler(async ({ data, context }) =>
    rpc(context, "set_crew_role_tx", { _target: data.userId, _role: data.role }),
  );

export const donateToCrew = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { amount: number }) =>
    z.object({ amount: z.number().int().min(100).max(1_000_000) }).parse(d),
  )
  .handler(async ({ data, context }) => rpc(context, "donate_to_crew_tx", { _amount: data.amount }));
