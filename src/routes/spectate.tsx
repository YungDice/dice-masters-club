import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/dice/TopNav";
import { PageHeader } from "@/components/dice/PageHeader";
import { Eye } from "lucide-react";

export const Route = createFileRoute("/spectate")({
  component: () => <AppShell><Spectate /></AppShell>,
});

function Spectate() {
  return <div className="space-y-5"><PageHeader icon={Eye} title="Table Lounge" subtitle="Public tables appear here." /></div>;
}
