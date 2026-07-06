import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import React from "react";

export type Cosmetic = {
  id: string;
  kind: "title" | "frame" | "emote" | "dice_skin";
  slug: string;
  name: string;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary" | "unreal";
  price_dice: number;
  vip_only: boolean;
  meta: any;
};

export const RARITY_COLOR: Record<string, string> = {
  common:    "border-slate-400/40 bg-slate-400/10 text-slate-200",
  uncommon:  "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  rare:      "border-sky-400/40 bg-sky-400/10 text-sky-200",
  epic:      "border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-200",
  legendary: "border-amber-400/50 bg-amber-400/10 text-amber-200",
  unreal:    "border-cyan-200/60 bg-cyan-200/10 text-cyan-100",
};

export function useCatalog() {
  return useQuery({
    queryKey: ["cosmetics-catalog"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("cosmetics").select("*").eq("active", true).order("kind").order("price_dice");
      if (error) throw error;
      return (data ?? []) as Cosmetic[];
    },
  });
}

export function useMyCosmetics(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["my-cosmetics", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_cosmetics").select("cosmetic_id").eq("user_id", userId!);
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => r.cosmetic_id as string));
    },
  });
}

/** Global cache of emote cosmetics — used to render :code: → emoji in chat. */
export function useEmoteMap() {
  return useQuery({
    queryKey: ["emote-map"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("cosmetics").select("meta").eq("kind", "emote").eq("active", true);
      const map: Record<string, string> = {};
      for (const row of (data ?? []) as any[]) {
        if (row.meta?.code && row.meta?.emoji) map[row.meta.code] = row.meta.emoji;
      }
      return map;
    },
  });
}

export function renderWithEmotes(text: string, map: Record<string, string> | undefined) {
  if (!map || !text) return text;
  return text.replace(/:[a-z0-9_]+:/gi, (m) => map[m.toLowerCase()] ?? m);
}

/** Fetch cosmetics referenced by a profile's equipped_*_id columns. */
export function useEquippedFor(profile: any) {
  const ids = [
    profile?.equipped_title_id,
    profile?.equipped_frame_id,
    profile?.equipped_banner_id,
    profile?.equipped_dice_skin_id,
  ].filter(Boolean) as string[];
  const key = ids.slice().sort().join(",");
  return useQuery({
    queryKey: ["equipped-cosmetics", key],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("cosmetics").select("*").in("id", ids);
      const map: Record<string, Cosmetic> = {};
      for (const c of (data ?? []) as Cosmetic[]) map[c.id] = c;
      return {
        title: profile?.equipped_title_id ? map[profile.equipped_title_id] : undefined,
        frame: profile?.equipped_frame_id ? map[profile.equipped_frame_id] : undefined,
        banner: profile?.equipped_banner_id ? map[profile.equipped_banner_id] : undefined,
        dice_skin: profile?.equipped_dice_skin_id ? map[profile.equipped_dice_skin_id] : undefined,
      };
    },
  });
}

export function TitleBadge({ title }: { title?: Cosmetic }) {
  if (!title) return null;
  const color = title.meta?.color ?? "#f472b6";
  return (
    <span
      className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{ color, borderColor: `${color}66`, backgroundColor: `${color}14` }}
      title={title.name}
    >
      {title.meta?.text ?? title.name}
    </span>
  );
}

/** Convenience — combine base classes with frame ring/glow. */
export function frameClasses(frame?: Cosmetic) {
  if (!frame) return "";
  return `${frame.meta?.ring ?? ""} ${frame.meta?.glow ?? ""}`;
}

export function bannerStyle(banner?: Cosmetic): React.CSSProperties | undefined {
  if (!banner?.meta?.gradient) return undefined;
  return { background: banner.meta.gradient };
}
