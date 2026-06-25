import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyProfile } from "@/hooks/use-profile";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { changeUsername } from "@/lib/dice.functions";
import { toast } from "sonner";


export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — DICE" }] }),
  component: () => <AppShell><Settings /></AppShell>,
});

function Settings() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { data: profile, refetch } = useMyProfile(user?.id);
  const [bio, setBio] = useState(""); const [country, setCountry] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [privacy, setPrivacy] = useState<string>("public");
  const [activityPrivacy, setActivityPrivacy] = useState<string>("friends");
  useEffect(() => {
    if (profile) { setBio(profile.bio ?? ""); setCountry(profile.country ?? ""); setDisplayName(profile.display_name); setPrivacy(profile.privacy_profile); setActivityPrivacy(profile.privacy_activity); }
  }, [profile]);

  async function save() {
    if (!user) return;
    await supabase.from("profiles").update({
      bio, country, display_name: displayName,
      privacy_profile: privacy, privacy_activity: activityPrivacy,
    }).eq("id", user.id);
    toast.success("Saved");
    refetch();
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f || !user) return;
    const path = `${user.id}/avatar-${Date.now()}.${f.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("avatars").upload(path, f, { upsert: true });
    if (error) return toast.error(error.message);
    const { data } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
    if (data) {
      await supabase.from("profiles").update({ avatar_url: data.signedUrl }).eq("id", user.id);
      toast.success("Avatar updated"); refetch();
    }
  }

  async function deleteAccount() {
    if (!user) return;
    if (!confirm("Delete account? This permanently removes your profile, wallet, listings, and proofs. This cannot be undone.")) return;
    // Soft strategy: anonymise profile + sign out (full auth delete needs server fn; not exposed)
    await supabase.from("profiles").update({ bio: null, display_name: "deleted_user", avatar_url: null }).eq("id", user.id);
    await supabase.auth.signOut();
    nav({ to: "/" });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="font-display text-3xl font-bold">Settings</h1>
      <Card className="glass p-6 space-y-4">
        <div><Label>Avatar</Label><Input type="file" accept="image/*" onChange={uploadAvatar} /></div>
        <div><Label>Display name</Label><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div>
        <div><Label>Bio</Label><Textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} /></div>
        <div><Label>Country</Label><Input value={country} onChange={(e) => setCountry(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Profile privacy</Label><select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={privacy} onChange={(e) => setPrivacy(e.target.value)}>{["public","friends","private"].map((p) => <option key={p}>{p}</option>)}</select></div>
          <div><Label>Activity feed privacy</Label><select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={activityPrivacy} onChange={(e) => setActivityPrivacy(e.target.value)}>{["public","friends","private"].map((p) => <option key={p}>{p}</option>)}</select></div>
        </div>
        <Button onClick={save}>Save</Button>
      </Card>
      <Card className="glass p-6 space-y-3">
        <h2 className="font-display text-lg font-semibold">Responsible play</h2>
        <p className="text-sm text-muted-foreground">DICE is meant to be fun. Long sessions get a reminder to take a break. Need to stop for now? Sign out and come back tomorrow.</p>
        <Button variant="outline" onClick={() => { supabase.auth.signOut(); nav({ to: "/auth" }); }}>Sign out</Button>
      </Card>
      <Card className="glass p-6 space-y-3 border-destructive/40">
        <h2 className="font-display text-lg font-semibold text-destructive">Danger zone</h2>
        <p className="text-sm text-muted-foreground">Delete your account. This anonymises your profile and signs you out. Your historical proofs and listings remain attributed to "deleted_user".</p>
        <Button variant="destructive" onClick={deleteAccount}>Delete account</Button>
      </Card>
    </div>
  );
}
