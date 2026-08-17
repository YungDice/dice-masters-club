export const RANK_TIERS = [
  { min: 100, name: "Legend",   color: "text-white", glow: "shadow-black/20" },
  { min: 50,  name: "Diamond",  color: "text-white",    glow: "shadow-black/20" },
  { min: 25,  name: "Platinum", color: "text-white",     glow: "shadow-black/20" },
  { min: 10,  name: "Gold",     color: "text-foreground",   glow: "shadow-black/20" },
  { min: 5,   name: "Silver",   color: "text-zinc-300",    glow: "shadow-zinc-400/20" },
  { min: 1,   name: "Bronze",   color: "text-white",  glow: "shadow-black/20" },
  { min: 0,   name: "Unranked", color: "text-muted-foreground", glow: "" },
];

export function tierFor(wins: number, ratio: number) {
  const score = wins * Math.max(ratio, 0.3);
  return RANK_TIERS.find((t) => score >= t.min) ?? RANK_TIERS[RANK_TIERS.length - 1];
}
