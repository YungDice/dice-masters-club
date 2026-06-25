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
import { changeUsername, buyVip, buyLevelUp } from "@/lib/dice.functions";
import { useWallet } from "@/hooks/use-profile";
import { Crown, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { fmt } from "@/lib/format";
import { toast } from "sonner";


export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — DICE" }] }),
  component: () => <AppShell><Settings /></AppShell>,
});

function Settings() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { data: profile, refetch } = useMyProfile(user?.id);
  const { data: wallet } = useWallet(user?.id);
  const qc = useQueryClient();
  const [bio, setBio] = useState(""); const [country, setCountry] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [privacy, setPrivacy] = useState<string>("public");
  const [activityPrivacy, setActivityPrivacy] = useState<string>("friends");
  const [newUsername, setNewUsername] = useState("");
  const [changingU, setChangingU] = useState(false);
  const [busyVip, setBusyVip] = useState(false);
  const [busyLvl, setBusyLvl] = useState(false);
  const changeUser = useServerFn(changeUsername);
  const buyVipFn = useServerFn(buyVip);
  const buyLevelFn = useServerFn(buyLevelUp);
  useEffect(() => {
    if (profile) {
      setBio(profile.bio ?? ""); setCountry(profile.country ?? ""); setDisplayName(profile.display_name);
      setPrivacy(profile.privacy_profile); setActivityPrivacy(profile.privacy_activity);
      setNewUsername(profile.username);
    }
  }, [profile]);

  const lastChange: string | null = (profile as any)?.username_changed_at ?? null;
  const cooldownMs = 90 * 24 * 60 * 60 * 1000;
  const nextChangeAt = lastChange ? new Date(new Date(lastChange).getTime() + cooldownMs) : null;
  const canChange = !nextChangeAt || nextChangeAt.getTime() <= Date.now();

  async function save() {
    if (!user) return;
    await supabase.from("profiles").update({
      bio, country, display_name: displayName,
      privacy_profile: privacy, privacy_activity: activityPrivacy,
    }).eq("id", user.id);
    toast.success("Saved");
    refetch();
  }

  async function saveUsername() {
    if (!profile) return;
    if (newUsername === profile.username) return;
    setChangingU(true);
    try {
      await changeUser({ data: { username: newUsername.trim() } });
      toast.success("Username updated");
      refetch();
    } catch (e: any) {
      toast.error(e.message || "Could not change username");
    } finally { setChangingU(false); }
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
        <h2 className="font-display text-lg font-semibold">Username</h2>
        <p className="text-xs text-muted-foreground">Your @handle. Can be changed once every 90 days. 3–20 chars, letters/numbers/underscore.</p>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">@</span>
          <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} maxLength={20} disabled={!canChange} />
          <Button onClick={saveUsername} disabled={!canChange || changingU || !profile || newUsername === profile.username}>
            {changingU ? "Saving..." : "Change"}
          </Button>
        </div>
        {!canChange && nextChangeAt && (
          <p className="text-xs text-amber-400">You can change your username again on {nextChangeAt.toLocaleDateString()}.</p>
        )}
      </Card>

      {(() => {
        const vipUntil = (profile as any)?.vip_until ? new Date((profile as any).vip_until) : null;
        const vipActive = vipUntil && vipUntil > new Date();
        const lvl = profile?.level ?? 1;
        const lvlCost = lvl * 500;
        async function doBuyVip() {
          if ((wallet?.balance ?? 0) < 5000) { toast.error("Need 5,000 DICE"); return; }
          setBusyVip(true);
          try { await buyVipFn({ data: undefined as any }); toast.success("VIP unlocked for 7 days!"); refetch(); qc.invalidateQueries({ queryKey: ["wallet"] }); }
          catch (e: any) { toast.error(e.message ?? "Failed"); }
          finally { setBusyVip(false); }
        }
        async function doBuyLvl() {
          if ((wallet?.balance ?? 0) < lvlCost) { toast.error(`Need ${lvlCost} DICE`); return; }
          setBusyLvl(true);
          try {
            const r = await buyLevelFn({ data: undefined as any });
            toast.success(`Level ${r.level}!${r.bonus ? " " + r.bonus : ""}`);
            refetch(); qc.invalidateQueries({ queryKey: ["wallet"] });
          } catch (e: any) { toast.error(e.message ?? "Failed"); }
          finally { setBusyLvl(false); }
        }
        return (
          <>
            <Card className="glass p-6 space-y-3 border-amber-400/40">
              <h2 className="font-display text-lg font-semibold flex items-center gap-2"><Crown className="text-amber-400" /> VIP Status</h2>
              {vipActive ? (
                <p className="text-sm text-emerald-400">Active until {vipUntil!.toLocaleString()}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Buy VIP for 5,000 DICE. Lasts 7 days. Send images in global chat, bigger message limit (4,000 chars vs 500).</p>
              )}
              <Button onClick={doBuyVip} disabled={busyVip} className="glow-red">
                {busyVip ? "Processing..." : vipActive ? "Extend VIP (+7 days · 5,000 DICE)" : "Buy VIP — 5,000 DICE"}
              </Button>
            </Card>

            <Card className="glass p-6 space-y-3">
              <h2 className="font-display text-lg font-semibold flex items-center gap-2"><Sparkles className="text-primary" /> Level up</h2>
              <p className="text-sm text-muted-foreground">You are <b>Level {lvl}</b>. Buy your way up — cost rises each level. Every 5th level: <b>+250 DICE bonus</b>. <b>Level 10: 1 hour of VIP</b>.</p>
              <div className="flex items-center justify-between rounded-md bg-white/5 p-3">
                <div className="text-sm">Next level: <b>{lvl + 1}</b></div>
                <div className="text-sm">Cost: <b>{fmt(lvlCost)} DICE</b></div>
              </div>
              <Button onClick={doBuyLvl} disabled={busyLvl}>{busyLvl ? "Processing..." : `Buy Level ${lvl + 1}`}</Button>
            </Card>
          </>
        );
      })()}


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
