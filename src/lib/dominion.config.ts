// DICE Dominion — shared config. Numbers picked so early loops feel snappy.

export type BuildingKind =
  | "headquarters" | "salvage_yard" | "power_core" | "dice_forge"
  | "vault" | "command_center" | "workshop";

export type UnitKind = "scout_roller" | "shield_guard" | "crusher_tank" | "sky_drone";

export type ResourceBundle = { scrap?: number; power?: number; roll_credits?: number };

export const GRID_SIZE = 4; // 4x4 district
export const PRODUCTION_CAP_SECONDS = 8 * 3600;
export const COMMAND_ENERGY_REGEN_PER_SEC = 1 / 30; // 1 per 30s

export const BUILDINGS: Record<BuildingKind, {
  label: string;
  desc: string;
  maxLevel: number;
  buildSeconds: (level: number) => number; // to reach level
  cost: (level: number) => ResourceBundle; // to reach level (level=1 for initial build)
  produces?: (level: number) => { scrap?: number; power?: number; roll_credits?: number }; // per hour
  bonus?: string;
}> = {
  headquarters: {
    label: "Headquarters",
    desc: "District command hub. Higher levels unlock content.",
    maxLevel: 10,
    buildSeconds: (l) => 30 + l * 15,
    cost: (l) => ({ scrap: 200 * l, power: 100 * l, roll_credits: 150 * l }),
    bonus: "Unlocks buildings and research tiers.",
  },
  salvage_yard: {
    label: "Salvage Yard",
    desc: "Produces Scrap from surrounding wastes.",
    maxLevel: 20,
    buildSeconds: (l) => 15 + l * 8,
    cost: (l) => ({ scrap: 60 * l, roll_credits: 20 * l }),
    produces: (l) => ({ scrap: 120 * l }),
  },
  power_core: {
    label: "Power Core",
    desc: "Glowing dice-lattice reactor. Generates Power.",
    maxLevel: 20,
    buildSeconds: (l) => 20 + l * 10,
    cost: (l) => ({ scrap: 80 * l, roll_credits: 30 * l }),
    produces: (l) => ({ power: 80 * l }),
  },
  dice_forge: {
    label: "Dice Forge",
    desc: "Fuses Scrap and Power into Roll Credits.",
    maxLevel: 15,
    buildSeconds: (l) => 25 + l * 12,
    cost: (l) => ({ scrap: 150 * l, power: 100 * l, roll_credits: 40 * l }),
    produces: (l) => ({ roll_credits: 90 * l }),
  },
  vault: {
    label: "Vault",
    desc: "Reinforced dice-plating vault. Raises resource capacity.",
    maxLevel: 15,
    buildSeconds: (l) => 30 + l * 10,
    cost: (l) => ({ scrap: 200 * l, power: 100 * l, roll_credits: 100 * l }),
    bonus: "+5,000 capacity per level per resource.",
  },
  command_center: {
    label: "Command Center",
    desc: "Coordinates attacks. Raises Command Energy cap and attack power.",
    maxLevel: 10,
    buildSeconds: (l) => 45 + l * 12,
    cost: (l) => ({ scrap: 300 * l, power: 200 * l, roll_credits: 200 * l }),
    bonus: "+10 Command Energy cap and +5% attack per level.",
  },
  workshop: {
    label: "Workshop",
    desc: "Automation cranes. Cuts construction and training time.",
    maxLevel: 10,
    buildSeconds: (l) => 40 + l * 12,
    cost: (l) => ({ scrap: 250 * l, power: 150 * l, roll_credits: 150 * l }),
    bonus: "-3% build/train time per level.",
  },
};

export const UNITS: Record<UnitKind, {
  label: string;
  desc: string;
  cost: ResourceBundle;
  trainSeconds: number;
  attack: number;
  defense: number;
  capacity: number; // unit-limit weight
}> = {
  scout_roller: { label: "Scout Roller",  desc: "Cheap, fast, weak neutrals.", cost: { scrap: 40, roll_credits: 20 }, trainSeconds: 20, attack: 3, defense: 2, capacity: 1 },
  shield_guard: { label: "Shield Guard",  desc: "Defensive wall.",             cost: { scrap: 80, power: 40, roll_credits: 30 }, trainSeconds: 40, attack: 2, defense: 6, capacity: 2 },
  crusher_tank: { label: "Crusher Tank",  desc: "Heavy ground breaker.",       cost: { scrap: 200, power: 120, roll_credits: 80 }, trainSeconds: 70, attack: 10, defense: 5, capacity: 3 },
  sky_drone:    { label: "Sky Drone",     desc: "Strong vs fortified.",        cost: { scrap: 150, power: 200, roll_credits: 100 }, trainSeconds: 60, attack: 8, defense: 3, capacity: 2 },
};

export function baseCapacity(vaultLevel: number) {
  return 2000 + 5000 * vaultLevel;
}
export function baseCommandEnergyCap(cmdLevel: number) {
  return 20 + 10 * cmdLevel;
}
export function workshopSpeedMultiplier(workshopLevel: number) {
  return Math.max(0.5, 1 - 0.03 * workshopLevel);
}
