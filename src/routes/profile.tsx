import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useMyProfile } from "@/hooks/use-profile";
import { AppShell } from "@/components/dice/TopNav";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile — DICE" }] }),
  component: () => <AppShell><Redirect /></AppShell>,
});

function Redirect() {
  const { user } = useAuth();
  const { data } = useMyProfile(user?.id);
  const nav = useNavigate();
  if (data?.username) {
    nav({ to: "/u/$username", params: { username: data.username } });
    return null;
  }
  return <div className="text-center text-muted-foreground py-10">Loading profile…</div>;
}
