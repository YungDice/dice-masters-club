import { createFileRoute } from "@tanstack/react-router";
import { Layers } from "lucide-react";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/play/poker")({
  head: () => ({ meta: [{ title: "Poker rooms — DICE" }] }),
  component: () => (
    <AppShell>
      <Card className="glass p-10 text-center max-w-2xl mx-auto">
        <Layers className="size-12 mx-auto text-primary mb-3" />
        <h1 className="font-display text-3xl font-bold">Poker rooms</h1>
        <p className="text-muted-foreground mt-2">
          Texas Hold'em with server-authoritative dealing, escrow, and turn timers is coming soon.
          We've already wired the lobby, escrow, and realtime infrastructure — full hand logic
          ships in the next release.
        </p>
      </Card>
    </AppShell>
  ),
});
