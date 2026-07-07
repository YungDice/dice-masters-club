import { useQuery } from "@tanstack/react-query";
import { Shield, Swords } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { fmt } from "@/lib/format";
import { tierFor } from "@/lib/rank";

export type CompetitiveStats = {
  wins: number;
  losses: number;
  draws: number;
  total: number;
  wagered: number;
  net: number;
  ratio: number;
};

export function useCompetitiveStats(userId: string | null | undefined) {
  return useQuery<CompetitiveStats>({
    queryKey: ["competitive-stats", userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await (supabase.rpc as any)("get_user_profile_stats", { _uid: userId! });
      const row: any = (Array.isArray(data) ? data[0] : data) ?? {};
      const wins = Number(row.wins ?? 0);
      const losses = Number(row.losses ?? 0);
      const draws = Number(row.draws ?? 0);
      const total = Number(row.games_played ?? (wins + losses + draws));
      const wagered = Number(row.wagered ?? 0);
      const net = Number(row.net ?? 0);
      const ratio = Number(
        row.win_loss_ratio ?? (losses === 0 ? (wins > 0 ? wins : 0) : wins / losses),
      );
      return { wins, losses, draws, total, wagered, net, ratio };
    },
  });
}

export function CompetitiveStatsCard({ stats }: { stats?: CompetitiveStats | null }) {
  const s: CompetitiveStats = stats ?? { wins: 0, losses: 0, draws: 0, total: 0, wagered: 0, net: 0, ratio: 0 };
  const tier = tierFor(s.wins, s.ratio);
  const ratioLabel = s.losses === 0 ? (s.wins ? "∞" : "—") : s.ratio.toFixed(2);
  return (
    <Card className={`glass p-5 ${tier.glow ? `shadow-lg ${tier.glow}` : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`grid size-12 place-items-center rounded-xl bg-white/5 ring-1 ring-white/10 ${tier.color}`}>
            <Shield className="size-6" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Competitive rank</div>
            <div className={`font-display text-2xl font-bold ${tier.color}`}>{tier.name}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 md:gap-6 text-sm">
          <Stat label="Wins" value={s.wins} valueClass="text-emerald-400" />
          <Stat label="Losses" value={s.losses} valueClass="text-rose-400" />
          <Stat label="Draws" value={s.draws} />
          <Stat label="W/L" value={ratioLabel} icon={<Swords className="size-4 text-primary" />} />
          <Stat label="Games" value={fmt(s.total)} />
          <Stat label="Wagered" value={fmt(s.wagered)} />
        </div>
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  valueClass = "",
  icon,
}: {
  label: string;
  value: string | number;
  valueClass?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="text-center min-w-[3rem]">
      <div className={`font-bold text-lg flex items-center justify-center gap-1 ${valueClass}`}>
        {icon}
        {value}
      </div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
    </div>
  );
}
