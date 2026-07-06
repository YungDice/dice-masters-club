import { createFileRoute, Link } from "@tanstack/react-router";
import { Users, Trophy } from "lucide-react";
import { AppShell } from "@/components/dice/TopNav";
import { PageHeader } from "@/components/dice/PageHeader";
import { CrewsSection } from "./leaderboard";

export const Route = createFileRoute("/leaderboard/crews")({
  head: () => ({ meta: [{ title: "Crews Leaderboard — DICE" }] }),
  component: () => (
    <AppShell>
      <div className="space-y-4">
        <PageHeader
          icon={Users}
          title="Crews Leaderboard"
          subtitle="Top crews by total points, weekly points, and level."
          accent="gold"
        />
        <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm flex items-center justify-between flex-wrap gap-2">
          <span className="font-semibold text-amber-300 inline-flex items-center gap-1">
            <Users className="size-4" /> Crew rankings
          </span>
          <Link to="/leaderboard" className="text-amber-300 hover:underline inline-flex items-center gap-1">
            <Trophy className="size-4" /> Players leaderboard →
          </Link>
        </div>
        <CrewsSection />
      </div>
    </AppShell>
  ),
});
