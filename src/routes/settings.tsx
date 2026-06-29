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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { changeUsername, buyVip, buyLevelUp, claimTag, listTagForSale } from "@/lib/dice.functions";
import { useWallet } from "@/hooks/use-profile";
import { Crown, Sparkles, Hash } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { fmt } from "@/lib/format";
import { toast } from "sonner";
import { BuyCoinsCard } from "@/components/dice/BuyCoins";
import { PaymentTestModeBanner } from "@/components/dice/PaymentTestModeBanner";
import { COUNTRIES } from "@/lib/countries";


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
        <h2 className="font-display text-lg font-semibold">Profile picture</h2>
        <div className="flex items-center gap-4">
          <Avatar className="size-20 ring-2 ring-primary/40">
            <AvatarImage src={profile?.avatar_url ?? undefined} />
            <AvatarFallback className="text-xl">{profile?.display_name?.[0] ?? "?"}</AvatarFallback>
          </Avatar>
          <p className="text-xs text-muted-foreground flex-1">
            Profile pictures can only be purchased on the <a href="/marketplace" className="text-primary underline">Marketplace</a>. Buy one from a curated avatar listing and set it as your profile picture from the listing page.
          </p>
        </div>
      </Card>

      <Card className="glass p-6 space-y-4">
        <div><Label>Display name</Label><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div>
        <div><Label>Bio</Label><Textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} /></div>
        <div><Label>Country</Label>
          <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">— Select country —</option>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Profile privacy</Label><select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={privacy} onChange={(e) => setPrivacy(e.target.value)}>{["public","friends","private"].map((p) => <option key={p}>{p}</option>)}</select></div>
          <div><Label>Activity feed privacy</Label><select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={activityPrivacy} onChange={(e) => setActivityPrivacy(e.target.value)}>{["public","friends","private"].map((p) => <option key={p}>{p}</option>)}</select></div>
        </div>
        <Button onClick={save}>Save</Button>
      </Card>

      <PaymentTestModeBanner />
      <BuyCoinsCard />

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

      <TagCard profile={profile} wallet={wallet} refetch={refetch} qc={qc} />


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

function TagCard({ profile, wallet, refetch, qc }: any) {
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [sellPrice, setSellPrice] = useState(1000);
  const [saleType, setSaleType] = useState<"fixed" | "auction">("fixed");
  const [hours, setHours] = useState(24);
  const claim = useServerFn(claimTag);
  const listFn = useServerFn(listTagForSale);
  const currentTag: string | null = profile?.tag ?? null;
  async function doClaim() {
    if ((wallet?.balance ?? 0) < 5000) { toast.error("Need 5,000 DICE"); return; }
    if (!/^[A-Za-z0-9]{2,6}$/.test(tag)) { toast.error("2–6 letters/numbers"); return; }
    setBusy(true);
    try { const r = await claim({ data: { tag } }); toast.success(`Tag #${r.tag} is yours!`); refetch(); qc.invalidateQueries({ queryKey: ["wallet"] }); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
    finally { setBusy(false); }
  }
  async function doList() {
    setBusy(true);
    try {
      const r = await listFn({ data: { price: sellPrice, sale_type: saleType, duration_hours: hours } });
      toast.success("Tag listed on marketplace");
      refetch(); qc.invalidateQueries({ queryKey: ["listings"] });
      setSellOpen(false);
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
    finally { setBusy(false); }
  }
  return (
    <Card className="glass p-6 space-y-3 border-primary/40">
      <h2 className="font-display text-lg font-semibold flex items-center gap-2"><Hash className="text-primary" /> Your tag</h2>
      <p className="text-xs text-muted-foreground">Discord-style identity: <b>@{profile?.username ?? "you"}#TAG</b>. Costs <b>5,000 DICE</b> to claim. Each tag is unique — if taken, buy it on the marketplace from its owner.</p>
      {currentTag ? (
        <div className="space-y-3">
          <div className="text-2xl font-mono font-bold text-primary">@{profile?.username}#{currentTag}</div>
          {!sellOpen ? (
            <Button variant="outline" onClick={() => setSellOpen(true)}>Sell tag on marketplace</Button>
          ) : (
            <div className="rounded-md bg-white/5 p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Sale type</Label>
                  <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={saleType} onChange={(e) => setSaleType(e.target.value as any)}>
                    <option value="fixed">Fixed price</option>
                    <option value="auction">Auction</option>
                  </select>
                </div>
                <div><Label>{saleType === "auction" ? "Starting bid (DICE)" : "Price (DICE)"}</Label>
                  <Input type="number" min={100} max={1000000} value={sellPrice} onChange={(e) => setSellPrice(+e.target.value)} />
                </div>
              </div>
              {saleType === "auction" && (
                <div><Label>Duration: {hours} hour{hours !== 1 ? "s" : ""} (1–48)</Label>
                  <input type="range" min={1} max={48} value={hours} onChange={(e) => setHours(+e.target.value)} className="w-full" />
                </div>
              )}
              <div className="flex gap-2">
                <Button onClick={doList} disabled={busy} className="glow-red">{busy ? "Listing..." : "List for sale"}</Button>
                <Button variant="outline" onClick={() => setSellOpen(false)}>Cancel</Button>
              </div>
              <p className="text-xs text-muted-foreground">While listed, the tag is removed from your profile and shown next to your username only when the auction ends with no bids.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-lg">#</span>
          <Input value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())} maxLength={6} placeholder="EG. WOLF" />
          <Button onClick={doClaim} disabled={busy || tag.length < 2} className="glow-red">{busy ? "Claiming..." : "Claim — 5,000 DICE"}</Button>
        </div>
      )}
    </Card>
  );
}
