import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Castle,
  Check,
  ChevronRight,
  CircleDollarSign,
  Copy,
  Crown,
  Eye,
  Gamepad2,
  Gem,
  Gift,
  Lock,
  PackageOpen,
  ShieldCheck,
  Sparkles,
  Swords,
  Target,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/dice/TopNav";
import { PageHeader } from "@/components/dice/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/format";
import { createCoinFlip } from "@/lib/dice.functions";
import {
  acceptBaddieTradeOffer,
  claimAchievement,
  claimDailyMission,
  claimSeasonReward,
  contributeToCrew,
  createCrew,
  equipCosmetic,
  joinCrew,
  joinTournament,
  playRiskRoom,
  prepareClubDashboard,
  prestigeBaddies,
  setBaddieBaseSlot,
  setBaddieProtection,
} from "@/lib/club.functions";
import eliasAsset from "@/assets/baddies/elias.png.asset.json";

export const Route = createFileRoute("/club")({
  head: () => ({ meta: [{ title: "DICE Club — Progress, Collection & Social" }] }),
  component: () => <AppShell><ClubPage /></AppShell>,
});

type Tab = "progress" | "base" | "social" | "events";

const TABS: { id: Tab; label: string; icon: typeof Trophy }[] = [
  { id: "progress", label: "Progress", icon: Trophy },
  { id: "base", label: "Base & Collection", icon: Castle },
  { id: "social", label: "Social", icon: Users },
  { id: "events", label: "Events & History", icon: Zap },
];

const rarityClass: Record<string, string> = {
  common: "border-zinc-400/30 text-zinc-200",
  uncommon: "border-emerald-400/40 text-emerald-200",
  rare: "border-sky-400/40 text-sky-200",
  epic: "border-fuchsia-400/40 text-fuchsia-200",
  legendary: "border-amber-300/60 text-amber-200",
  unreal: "border-cyan-300/60 text-cyan-100",
  elias: "border-amber-100/70 text-amber-100",
};

function imageOf(item: any) {
  return item?.image_url ?? (item?.id === "elias" || item?.template_id === "elias" ? eliasAsset.url : null);
}

function Section({ title, subtitle, icon: Icon, children, action }: {
  title: string; subtitle?: string; icon: typeof Trophy; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <Card className="glass overflow-hidden p-0">
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] bg-black/15 px-4 py-3">
        <div className="flex gap-2.5">
          <div className="grid size-8 place-items-center rounded-lg border border-amber-300/20 bg-amber-300/[0.07] text-amber-200"><Icon className="size-4" /></div>
          <div>
            <div className="font-display text-base font-bold">{title}</div>
            {subtitle && <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>}
          </div>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </Card>
  );
}

function BaddieTile({ item, selected, onClick, badge }: { item: any; selected?: boolean; onClick?: () => void; badge?: React.ReactNode }) {
  const template = item.template ?? item;
  const image = imageOf(template);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`relative min-w-0 overflow-hidden rounded-xl border p-2 text-left transition ${selected ? "border-primary bg-primary/10 ring-1 ring-primary/50" : `${rarityClass[template.rarity] ?? "border-white/10"} bg-black/20 hover:bg-white/[0.04]`} ${!onClick ? "cursor-default" : ""}`}
    >
      <div className="relative aspect-square overflow-hidden rounded-lg bg-black/40 ring-1 ring-white/10">
        {image ? <img src={image} alt={template.name} className="h-full w-full object-cover" loading="lazy" /> : <Sparkles className="m-auto mt-[35%] size-7 opacity-60" />}
        {badge && <div className="absolute right-1.5 top-1.5">{badge}</div>}
      </div>
      <div className="mt-2 truncate text-xs font-bold">{template.name ?? item.name}</div>
      <div className="mt-0.5 flex justify-between gap-1 text-[10px] opacity-75"><span className="capitalize">{template.rarity}</span><span>{template.income_per_hour ?? 0}/h</span></div>
      {item.prestige > 0 && <div className="mt-1 text-[10px] font-bold text-amber-200">✦ Prestige {item.prestige}</div>}
      {item.trait && <div className="mt-0.5 truncate text-[9px] text-cyan-100/70">{item.trait}</div>}
    </button>
  );
}

function ClubPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const prepare = useServerFn(prepareClubDashboard);
  const claimMission = useServerFn(claimDailyMission);
  const claimSeason = useServerFn(claimSeasonReward);
  const claimBadge = useServerFn(claimAchievement);
  const protectBaddie = useServerFn(setBaddieProtection);
  const moveToSlot = useServerFn(setBaddieBaseSlot);
  const prestige = useServerFn(prestigeBaddies);
  const makeCrew = useServerFn(createCrew);
  const enterCrew = useServerFn(joinCrew);
  const contribute = useServerFn(contributeToCrew);
  const enterTournament = useServerFn(joinTournament);
  const riskRoom = useServerFn(playRiskRoom);
  const equip = useServerFn(equipCosmetic);
  const challengeLink = useServerFn(createCoinFlip);

  const [tab, setTab] = useState<Tab>("progress");
  const [busy, setBusy] = useState<string | null>(null);
  const [primaryBaddieId, setPrimaryBaddieId] = useState<string | null>(null);
  const [materialBaddieId, setMaterialBaddieId] = useState<string | null>(null);
  const [crewName, setCrewName] = useState("");
  const [crewTag, setCrewTag] = useState("");
  const [crewCode, setCrewCode] = useState("");
  const [crewContribution, setCrewContribution] = useState("500");
  const [riskStake, setRiskStake] = useState("500");
  const [challengeStake, setChallengeStake] = useState("500");
  const [riskResult, setRiskResult] = useState<any>(null);

  const invalidateClub = () => {
    ["club-progress", "club-missions", "club-season", "club-achievements", "club-baddies", "club-crew", "club-tournaments", "club-trades", "club-cosmetics", "club-history", "wallet"].forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
  };

  useEffect(() => {
    if (!user?.id) return;
    prepare().then(invalidateClub).catch((error: any) => toast.error(error?.message ?? "Club data could not be prepared."));
  // prepare is stable from useServerFn for this route lifecycle
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const progressionQ = useQuery({
    queryKey: ["club-progress", user?.id], enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_progression" as any).select("*").eq("user_id", user!.id).maybeSingle();
      if (error) throw error; return data as any;
    },
  });
  const missionsQ = useQuery({
    queryKey: ["club-missions", user?.id], enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_daily_missions" as any).select("*, definition:daily_mission_definitions(*)").eq("user_id", user!.id).order("mission_id");
      if (error) throw error; return (data ?? []) as any[];
    },
  });
  const seasonQ = useQuery({
    queryKey: ["club-season"],
    queryFn: async () => {
      const { data, error } = await supabase.from("season_pass_rewards" as any).select("*").order("level");
      if (error) throw error; return (data ?? []) as any[];
    },
  });
  const seasonClaimsQ = useQuery({
    queryKey: ["club-season", "claims", user?.id], enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_season_reward_claims" as any).select("*").eq("user_id", user!.id);
      if (error) throw error; return (data ?? []) as any[];
    },
  });
  const achievementDefsQ = useQuery({
    queryKey: ["club-achievement-definitions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("achievement_definitions" as any).select("*").order("sort_order");
      if (error) throw error; return (data ?? []) as any[];
    },
  });
  const achievementsQ = useQuery({
    queryKey: ["club-achievements", user?.id], enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_achievements" as any).select("*").eq("user_id", user!.id);
      if (error) throw error; return (data ?? []) as any[];
    },
  });
  const baddiesQ = useQuery({
    queryKey: ["club-baddies", user?.id], enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_baddies" as any).select("*, template:baddie_templates(*)").eq("user_id", user!.id).order("acquired_at", { ascending: false });
      if (error) throw error; return (data ?? []) as any[];
    },
  });
  const crewQ = useQuery({
    queryKey: ["club-crew", user?.id], enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("crew_members" as any).select("*, crew:crews(*)").eq("user_id", user!.id).maybeSingle();
      if (error) throw error; return data as any;
    },
  });
  const crewsQ = useQuery({
    queryKey: ["club-crews"],
    queryFn: async () => {
      const { data, error } = await supabase.from("crews" as any).select("*").order("total_dice", { ascending: false }).limit(5);
      if (error) throw error; return (data ?? []) as any[];
    },
  });
  const tournamentsQ = useQuery({
    queryKey: ["club-tournaments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tournaments" as any).select("*").in("status", ["open", "live"]).order("ends_at");
      if (error) throw error; return (data ?? []) as any[];
    },
  });
  const entriesQ = useQuery({
    queryKey: ["club-tournaments", "entries", user?.id], enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("tournament_entries" as any).select("*").eq("user_id", user!.id);
      if (error) throw error; return (data ?? []) as any[];
    },
  });
  const tradesQ = useQuery({
    queryKey: ["club-trades", user?.id], enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("baddie_trade_offers" as any).select("*").eq("status", "open").order("created_at", { ascending: false });
      if (error) throw error; return (data ?? []) as any[];
    },
  });
  const cosmeticsQ = useQuery({
    queryKey: ["club-cosmetics", user?.id], enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_cosmetics" as any).select("*").eq("user_id", user!.id).order("acquired_at", { ascending: false });
      if (error) throw error; return (data ?? []) as any[];
    },
  });
  const equippedQ = useQuery({
    queryKey: ["club-cosmetics", "equipped", user?.id], enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_equipped_cosmetics" as any).select("*").eq("user_id", user!.id).maybeSingle();
      if (error) throw error; return data as any;
    },
  });
  const historyQ = useQuery({
    queryKey: ["club-history", user?.id], enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("game_results" as any).select("*").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(8);
      if (error) throw error; return (data ?? []) as any[];
    },
  });
  const feedQ = useQuery({
    queryKey: ["club-feed", user?.id], enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("activity_feed" as any).select("*").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(8);
      if (error) throw error; return (data ?? []) as any[];
    },
  });
  const spectatorQ = useQuery({
    queryKey: ["club-spectator"],
    queryFn: async () => {
      const { data, error } = await supabase.from("game_rooms" as any).select("id, kind, stake, status, host_id, created_at").eq("status", "active").eq("is_private", false).limit(8);
      if (error) throw error; return (data ?? []) as any[];
    },
  });

  const progression = progressionQ.data ?? { daily_streak: 0, season_xp: 0 };
  const baddies = baddiesQ.data ?? [];
  const safeBaddies = baddies.filter((item) => !item.listing_id && !item.is_protected);
  const baseBaddies = Array.from({ length: 10 }, (_, index) => baddies.find((item) => item.base_slot === index + 1) ?? null);
  const seasonClaims = new Set((seasonClaimsQ.data ?? []).map((item: any) => item.level));
  const achievementMap = new Map((achievementsQ.data ?? []).map((item: any) => [item.achievement_id, item]));
  const crew = crewQ.data?.crew;
  const myTournamentIds = new Set((entriesQ.data ?? []).map((item: any) => item.tournament_id));
  const incomingTrades = (tradesQ.data ?? []).filter((item: any) => item.offered_to === user?.id);
  const outgoingTrades = (tradesQ.data ?? []).filter((item: any) => item.offered_by === user?.id);
  const primary = baddies.find((item) => item.id === primaryBaddieId);
  const material = baddies.find((item) => item.id === materialBaddieId);
  const prestigeReady = !!primary && !!material && primary.id !== material.id && primary.template_id === material.template_id && !primary.listing_id && !material.listing_id && !primary.is_protected && !material.is_protected;

  const action = async (key: string, work: () => Promise<any>, message?: string) => {
    if (busy) return;
    setBusy(key);
    try {
      const result = await work();
      if (message) toast.success(message);
      invalidateClub();
      return result;
    } catch (error: any) {
      toast.error(error?.message ?? "Action failed.");
      return null;
    } finally {
      setBusy(null);
    }
  };

  const seasonLevel = useMemo(() => (seasonQ.data ?? []).filter((reward: any) => Number(reward.xp_required) <= Number(progression.season_xp ?? 0)).length, [seasonQ.data, progression.season_xp]);

  return (
    <div className="space-y-5">
      <PageHeader icon={Crown} title="DICE Club" subtitle="Your daily loop, Baddie Base, social squad, events and collection progress — all in one place." />

      <Card className="glass p-2">
        <div className="grid grid-cols-2 gap-1 sm:flex sm:flex-wrap">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${tab === id ? "bg-primary/15 text-primary ring-1 ring-primary/35" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"}`}>
              <Icon className="size-4" />{label}
            </button>
          ))}
        </div>
      </Card>

      {tab === "progress" && (
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5">
            <Section title="Daily Missions" subtitle={`${progression.daily_streak ?? 0}-day mission streak`} icon={Target} action={<div className="rounded-full border border-amber-300/25 bg-amber-300/[0.07] px-2 py-1 text-xs font-bold text-amber-200">🔥 {progression.daily_streak ?? 0}</div>}>
              <div className="space-y-3">
                {(missionsQ.data ?? []).map((mission: any) => {
                  const def = mission.definition ?? {};
                  const progress = Math.min(Number(mission.progress ?? 0), Number(def.target ?? 1));
                  const complete = progress >= Number(def.target ?? 1);
                  return (
                    <div key={mission.mission_id} className="rounded-xl border border-white/[0.08] bg-black/15 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div><div className="font-semibold">{def.title}</div><div className="mt-0.5 text-xs text-muted-foreground">{def.description}</div></div>
                        <Button size="sm" disabled={!complete || !!mission.claimed_at || busy === `mission-${mission.mission_id}`} onClick={() => action(`mission-${mission.mission_id}`, () => claimMission({ data: { missionId: mission.mission_id } }), `+${fmt(def.reward_dice)} DICE claimed`)}>
                          {mission.claimed_at ? <><Check className="mr-1 size-3.5" />Claimed</> : `Claim ${fmt(def.reward_dice)}`}
                        </Button>
                      </div>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-gradient-to-r from-primary to-amber-300" style={{ width: `${Math.min(100, progress / Number(def.target ?? 1) * 100)}%` }} /></div>
                      <div className="mt-1.5 text-[11px] text-muted-foreground">{progress.toLocaleString()} / {Number(def.target ?? 0).toLocaleString()} · +{def.reward_xp ?? 0} Season XP</div>
                    </div>
                  );
                })}
              </div>
            </Section>

            <Section title="Achievements" subtitle="Unlock milestones across games, collection and social play." icon={BadgeCheck}>
              <div className="grid gap-2 sm:grid-cols-2">
                {(achievementDefsQ.data ?? []).map((definition: any) => {
                  const achievement = achievementMap.get(definition.id);
                  const unlocked = !!achievement;
                  return <div key={definition.id} className={`rounded-xl border p-3 ${unlocked ? "border-amber-300/25 bg-amber-300/[0.05]" : "border-white/[0.08] bg-black/10 opacity-70"}`}>
                    <div className="flex items-start justify-between gap-2"><div><div className="font-semibold">{definition.title}</div><div className="mt-0.5 text-xs text-muted-foreground">{definition.description}</div></div>{unlocked ? <Trophy className="size-4 text-amber-200" /> : <Lock className="size-4" />}</div>
                    <Button className="mt-3 w-full" size="sm" variant={achievement?.claimed_at ? "outline" : "default"} disabled={!unlocked || !!achievement?.claimed_at || busy === `achievement-${definition.id}`} onClick={() => action(`achievement-${definition.id}`, () => claimBadge({ data: { achievementId: definition.id } }), `+${fmt(definition.reward_dice)} DICE claimed`)}>
                      {achievement?.claimed_at ? "Claimed" : unlocked ? `Claim ${fmt(definition.reward_dice)}` : "Locked"}
                    </Button>
                  </div>;
                })}
              </div>
            </Section>
          </div>

          <div className="space-y-5">
            <Section title="Season Pass" subtitle={`Level ${seasonLevel} · ${fmt(progression.season_xp ?? 0)} Season XP`} icon={Crown}>
              <div className="space-y-2">
                {(seasonQ.data ?? []).map((reward: any) => {
                  const reached = Number(progression.season_xp ?? 0) >= Number(reward.xp_required);
                  const claimed = seasonClaims.has(reward.level);
                  return <div key={reward.level} className={`flex items-center gap-3 rounded-xl border p-2.5 ${reached ? "border-emerald-300/25 bg-emerald-300/[0.04]" : "border-white/[0.07] bg-black/10"}`}>
                    <div className="grid size-8 place-items-center rounded-lg bg-black/30 text-xs font-black">{reward.level}</div>
                    <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{reward.label}</div><div className="text-[11px] text-muted-foreground">{fmt(reward.xp_required)} XP · {reward.cosmetic_id ? `Cosmetic: ${reward.cosmetic_id}` : `${fmt(reward.reward_dice)} DICE`}</div></div>
                    <Button size="sm" variant={claimed ? "outline" : "default"} disabled={!reached || claimed || busy === `season-${reward.level}`} onClick={() => action(`season-${reward.level}`, () => claimSeason({ data: { level: reward.level } }), "Season reward claimed")}>{claimed ? "✓" : "Claim"}</Button>
                  </div>;
                })}
              </div>
            </Section>

            <Section title="Cosmetics" subtitle="Equip rewards from the Season Pass to personalize your profile." icon={Gift}>
              {(cosmeticsQ.data ?? []).length ? <div className="flex flex-wrap gap-2">{(cosmeticsQ.data ?? []).map((cosmetic: any) => {
                const equipped = Object.values(equippedQ.data ?? {}).includes(cosmetic.cosmetic_id);
                return <Button key={cosmetic.cosmetic_id} size="sm" variant={equipped ? "default" : "outline"} disabled={busy === `cosmetic-${cosmetic.cosmetic_id}`} onClick={() => action(`cosmetic-${cosmetic.cosmetic_id}`, () => equip({ data: { cosmeticId: cosmetic.cosmetic_id } }), `${cosmetic.cosmetic_id} equipped`)}>{equipped ? <Check className="mr-1 size-3.5" /> : <Sparkles className="mr-1 size-3.5" />}{cosmetic.cosmetic_id}</Button>;
              })}</div> : <div className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-muted-foreground">Complete Season Pass levels to unlock dice skins, frames, banners and titles.</div>}
            </Section>
          </div>
        </div>
      )}

      {tab === "base" && (
        <div className="space-y-5">
          <Section title="Baddie Base" subtitle="Arrange up to 10 visual Base slots. Protected Baddies cannot be sold, listed, traded or consumed." icon={Castle}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {baseBaddies.map((baddie, index) => <div key={index} className="min-h-32 rounded-xl border border-white/[0.08] bg-black/15 p-2">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Slot {index + 1}</div>
                {baddie ? <><BaddieTile item={baddie} badge={baddie.is_protected ? <ShieldCheck className="size-4 text-emerald-200" /> : undefined} /><Button size="sm" variant="ghost" className="mt-2 w-full" onClick={() => action(`slot-clear-${baddie.id}`, () => moveToSlot({ data: { baddieId: baddie.id, slot: null } }))}>Remove</Button></> : <div className="grid h-20 place-items-center rounded-lg border border-dashed border-white/10 text-xs text-muted-foreground">Empty Base slot</div>}
              </div>)}
            </div>
          </Section>

          <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
            <Section title="Collection Book" subtitle={`${baddies.length} Baddies owned · traits, variants and Safe Mode included.`} icon={PackageOpen}>
              <div className="grid max-h-[38rem] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4" style={{ scrollbarWidth: "thin" }}>
                {baddies.map((baddie: any) => <div key={baddie.id} className="space-y-1.5"><BaddieTile item={baddie} badge={baddie.is_protected ? <ShieldCheck className="size-4 text-emerald-200" /> : undefined} /><div className="flex gap-1"><Button size="sm" variant="outline" className="h-7 flex-1 text-[10px]" onClick={() => action(`protect-${baddie.id}`, () => protectBaddie({ data: { baddieId: baddie.id, protected: !baddie.is_protected } }), baddie.is_protected ? "Safe Mode disabled" : "Safe Mode enabled")}>{baddie.is_protected ? "Unprotect" : "Safe Mode"}</Button><Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" disabled={!!baddie.listing_id} onClick={() => action(`slot-${baddie.id}`, () => moveToSlot({ data: { baddieId: baddie.id, slot: 1 } }))}>Base</Button></div></div>)}
              </div>
            </Section>

            <Section title="Fusion / Prestige" subtitle="Combine two matching unprotected Baddies. The material is consumed; the survivor gets a Prestige badge." icon={Gem}>
              <div className="space-y-3">
                <select className="h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm" value={primaryBaddieId ?? ""} onChange={(event) => setPrimaryBaddieId(event.target.value || null)}><option value="">Choose the Baddie to keep</option>{safeBaddies.map((item: any) => <option key={item.id} value={item.id}>{item.template?.name} · {item.template?.rarity} · P{item.prestige ?? 0}</option>)}</select>
                <select className="h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm" value={materialBaddieId ?? ""} onChange={(event) => setMaterialBaddieId(event.target.value || null)}><option value="">Choose matching material</option>{safeBaddies.filter((item: any) => item.id !== primaryBaddieId).map((item: any) => <option key={item.id} value={item.id}>{item.template?.name} · {item.template?.rarity}</option>)}</select>
                {primary && material && primary.template_id !== material.template_id && <div className="rounded-lg border border-rose-400/20 bg-rose-400/[0.06] p-2 text-xs text-rose-100">Prestige requires two Baddies with the same template.</div>}
                <Button className="w-full" disabled={!prestigeReady || busy === "prestige"} onClick={() => action("prestige", () => prestige({ data: { primaryId: primaryBaddieId!, materialId: materialBaddieId! } }), "Prestige created — your material was consumed.").then(() => { setPrimaryBaddieId(null); setMaterialBaddieId(null); })}><Gem className="mr-2 size-4" />Create Prestige</Button>
                <div className="text-xs text-muted-foreground">Traits are cosmetic collector metadata. Prestige does not let the client alter income or rarity data.</div>
              </div>
            </Section>
          </div>
        </div>
      )}

      {tab === "social" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Section title="Crews" subtitle="Build a squad, share an invite code and climb the contribution board." icon={Users}>
            {crew ? <div className="space-y-4"><div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-4"><div className="flex items-center justify-between"><div><div className="font-display text-xl font-bold">[{crew.tag}] {crew.name}</div><div className="mt-1 text-xs text-muted-foreground">Crew pot: {fmt(crew.total_dice ?? 0)} DICE</div></div><Crown className="size-7 text-amber-200" /></div><div className="mt-3 rounded-lg bg-black/20 px-3 py-2 text-xs">Invite code: <b className="ml-1 font-mono text-amber-200">{crew.invite_code}</b></div></div><div className="flex gap-2"><Input type="number" min="100" value={crewContribution} onChange={(event) => setCrewContribution(event.target.value)} /><Button disabled={busy === "contribute"} onClick={() => action("contribute", () => contribute({ data: { amount: Number(crewContribution) } }), "Contribution added to your Crew")}>Contribute</Button></div></div> : <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-white/[0.08] bg-black/10 p-3"><div className="mb-2 font-semibold">Create a Crew</div><Input placeholder="Crew name" value={crewName} onChange={(event) => setCrewName(event.target.value)} /><Input className="mt-2" placeholder="TAG" maxLength={5} value={crewTag} onChange={(event) => setCrewTag(event.target.value.toUpperCase())} /><Button className="mt-2 w-full" disabled={!crewName || crewTag.length < 2 || busy === "crew-create"} onClick={() => action("crew-create", () => makeCrew({ data: { name: crewName, tag: crewTag } }), "Crew created")}>Create Crew</Button></div><div className="rounded-xl border border-white/[0.08] bg-black/10 p-3"><div className="mb-2 font-semibold">Join with code</div><Input placeholder="Invite code" value={crewCode} onChange={(event) => setCrewCode(event.target.value.toUpperCase())} /><Button className="mt-2 w-full" variant="outline" disabled={!crewCode || busy === "crew-join"} onClick={() => action("crew-join", () => enterCrew({ data: { inviteCode: crewCode } }), "Welcome to the Crew")}>Join Crew</Button></div></div>}
            <div className="mt-4 space-y-1.5">{(crewsQ.data ?? []).map((item: any, index: number) => <div key={item.id} className="flex items-center justify-between rounded-lg border border-white/[0.07] bg-black/10 px-3 py-2 text-sm"><span><b className="mr-2 text-amber-200">#{index + 1}</b>[{item.tag}] {item.name}</span><span className="text-xs text-muted-foreground">{fmt(item.total_dice)} DICE</span></div>)}</div>
          </Section>

          <Section title="Direct Challenges & Spectator Lounge" subtitle="Private Coinflip links use the existing server-authoritative game room flow." icon={Swords}>
            <div className="rounded-xl border border-white/[0.08] bg-black/10 p-3"><div className="font-semibold">Create a 1v1 Challenge Link</div><div className="mt-1 text-xs text-muted-foreground">Send a private Coinflip link to a friend. Stakes and game results remain server-authoritative.</div><div className="mt-3 flex gap-2"><Input type="number" min="10" value={challengeStake} onChange={(event) => setChallengeStake(event.target.value)} /><Button disabled={busy === "challenge-link"} onClick={() => action("challenge-link", async () => { const room: any = await challengeLink({ data: { stake: Number(challengeStake), isPrivate: true } }); const link = `${window.location.origin}/play/coinflip?invite=${room.invite_code ?? ""}`; await navigator.clipboard?.writeText(link); toast.success("Challenge link copied."); return room; })}>Copy link <Copy className="ml-1 size-3.5" /></Button></div></div>
            <div className="mt-4"><div className="mb-2 text-sm font-semibold">Live public tables</div>{(spectatorQ.data ?? []).length ? <div className="space-y-2">{(spectatorQ.data ?? []).map((room: any) => <div key={room.id} className="flex items-center justify-between rounded-lg border border-white/[0.07] bg-black/10 px-3 py-2"><div><span className="capitalize font-semibold">{room.kind}</span><span className="ml-2 text-xs text-muted-foreground">{fmt(room.stake ?? 0)} DICE stake</span></div><a href={`/play/${room.kind}`} className="inline-flex items-center gap-1 text-xs text-cyan-200 hover:underline"><Eye className="size-3.5" />Watch</a></div>)}</div> : <div className="rounded-lg border border-dashed border-white/15 p-3 text-xs text-muted-foreground">No public matches are live. Start a table and your friends can join from Play.</div>}</div>
          </Section>

          <Section title="Safe Trade Desk" subtitle="Accept incoming offers and keep protected or listed Baddies out of every trade." icon={CircleDollarSign}>
            <div className="space-y-3"><div><div className="mb-2 text-sm font-semibold">Incoming offers</div>{incomingTrades.length ? incomingTrades.map((offer: any) => <div key={offer.id} className="mb-2 flex items-center justify-between rounded-lg border border-emerald-300/20 bg-emerald-300/[0.05] p-3"><span className="text-xs">A friend offered a direct Baddie swap.</span><Button size="sm" disabled={busy === `trade-${offer.id}`} onClick={() => action(`trade-${offer.id}`, () => acceptBaddieTradeOffer({ data: { offerId: offer.id } }), "Trade completed")}>Accept</Button></div>) : <div className="rounded-lg border border-dashed border-white/15 p-3 text-xs text-muted-foreground">No incoming offers yet.</div>}</div><div><div className="mb-2 text-sm font-semibold">Outgoing offers</div>{outgoingTrades.length ? outgoingTrades.map((offer: any) => <div key={offer.id} className="rounded-lg border border-white/[0.08] bg-black/10 p-3 text-xs">Offer waiting for your friend.</div>) : <div className="rounded-lg border border-dashed border-white/15 p-3 text-xs text-muted-foreground">Trade creation is available from a friend’s collection card after this migration is deployed.</div>}</div></div>
          </Section>

          <Section title="Social Collection" subtitle="Friend-facing collection sharing is restricted to tradeable Baddies; Safe Mode always wins." icon={ShieldCheck}><div className="rounded-xl border border-emerald-300/20 bg-emerald-300/[0.04] p-4 text-sm text-emerald-100/85">Protected, listed and active trade items are checked again on the database transaction, so an old offer cannot move a Baddie that changed status.</div></Section>
        </div>
      )}

      {tab === "events" && (
        <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-5">
            <Section title="Live Tournaments" subtitle="Enter the weekly Cup. Game-result points are counted by the server." icon={Trophy}>
              <div className="space-y-3">{(tournamentsQ.data ?? []).map((tournament: any) => <div key={tournament.id} className="rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-3"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{tournament.title}</div><div className="mt-1 text-xs text-muted-foreground">{tournament.description}</div><div className="mt-2 text-[11px] text-amber-200">Entry: {fmt(tournament.entry_fee)} · Prize pool: {fmt(tournament.prize_pool)}</div></div><Button size="sm" disabled={myTournamentIds.has(tournament.id) || busy === `tournament-${tournament.id}`} onClick={() => action(`tournament-${tournament.id}`, () => enterTournament({ data: { tournamentId: tournament.id } }), "Tournament entry confirmed")}>{myTournamentIds.has(tournament.id) ? "Entered" : "Enter"}</Button></div></div>)}{!(tournamentsQ.data ?? []).length && <div className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-muted-foreground">No tournament is open right now.</div>}</div>
            </Section>

            <Section title="Risk Room" subtitle="A server-resolved 42% high-risk run. Outcome and payout are never decided by the browser." icon={Zap}>
              <div className="rounded-xl border border-rose-300/20 bg-rose-500/[0.04] p-4"><div className="flex items-center justify-between"><div><div className="font-display text-xl font-bold">2.20× payout</div><div className="mt-1 text-xs text-muted-foreground">42% success chance · 100–100,000 DICE stake</div></div><Zap className="size-7 text-rose-200" /></div><div className="mt-4 flex gap-2"><Input type="number" min="100" max="100000" value={riskStake} onChange={(event) => setRiskStake(event.target.value)} /><Button className="glow-red" disabled={busy === "risk"} onClick={() => action("risk", async () => { const result = await riskRoom({ data: { stake: Number(riskStake) } }); setRiskResult(result); return result; }, "Risk Room resolved")}>Run it</Button></div>{riskResult && <div className={`mt-3 rounded-lg border p-3 text-sm ${riskResult.won ? "border-emerald-300/30 bg-emerald-300/[0.06] text-emerald-100" : "border-rose-300/30 bg-rose-500/[0.06] text-rose-100"}`}>{riskResult.won ? `Success: +${fmt(riskResult.payout)} DICE` : "The Risk Room took the stake. Better luck next run."}</div>}</div>
            </Section>
          </div>

          <div className="space-y-5">
            <Section title="Match History" subtitle="Your latest server-recorded game results." icon={Gamepad2}>
              {(historyQ.data ?? []).length ? <div className="space-y-2">{(historyQ.data ?? []).map((game: any) => <div key={game.id} className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-black/10 px-3 py-2"><div><div className="capitalize font-semibold">{game.kind}</div><div className="text-[11px] text-muted-foreground">{new Date(game.created_at).toLocaleString()}</div></div><div className={`text-sm font-bold ${game.outcome === "win" ? "text-emerald-200" : game.outcome === "loss" ? "text-rose-200" : "text-amber-100"}`}>{game.outcome} · {game.delta >= 0 ? "+" : ""}{fmt(game.delta)}</div></div>)}</div> : <div className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-muted-foreground">Play a game to build your history.</div>}
            </Section>

            <Section title="Activity Feed" subtitle="Your latest collection, mission and event moments." icon={Sparkles}>
              {(feedQ.data ?? []).length ? <div className="space-y-2">{(feedQ.data ?? []).map((event: any) => <div key={event.id} className="rounded-lg border border-white/[0.08] bg-black/10 px-3 py-2"><div className="flex items-center justify-between"><div className="capitalize text-sm font-semibold">{String(event.kind ?? "activity").replaceAll("_", " ")}</div><div className="text-[10px] text-muted-foreground">{new Date(event.created_at).toLocaleDateString()}</div></div>{event.payload && <div className="mt-1 truncate text-[11px] text-muted-foreground">{Object.entries(event.payload as Record<string, unknown>).map(([key, value]) => `${key}: ${String(value)}`).join(" · ")}</div>}</div>)}</div> : <div className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-muted-foreground">Your Club activity will appear here.</div>}
            </Section>
          </div>
        </div>
      )}

      <Card className="border border-amber-300/15 bg-amber-300/[0.04] p-4 text-sm text-amber-100/85">
        <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-200" /><div><b>Fair-play note:</b> upgrades, Risk Room results, trade transfers, mission claims, tournament entries and rewards are written and verified on the server. The client only displays the returned state.</div></div>
      </Card>
    </div>
  );
}
