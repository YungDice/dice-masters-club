import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyProfile, useWallet } from "@/hooks/use-profile";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  changeUsername,
  buyVip,
  claimTag,
  listTagForSale,
  buyLevelUp,
  setActiveTag,
  deleteTag,
} from "@/lib/dice.functions";
import { Crown, Sparkles, Hash, User, Coins, ShieldAlert, Camera } from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { fmt } from "@/lib/format";
import { toast } from "sonner";
import { BuyCoinsCard } from "@/components/dice/BuyCoins";
import { PaymentTestModeBanner } from "@/components/dice/PaymentTestModeBanner";
import { COUNTRIES } from "@/lib/countries";
import { LoadoutEditor } from "@/components/dice/LoadoutEditor";
import { ImageCropper, readFileAsDataURL } from "@/components/dice/ImageCropper";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — DICE" },
      { name: "description", content: "Manage your DICE account: profile, privacy, notifications, security, and connected accounts." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Settings — DICE" },
      { property: "og:url", content: "https://yungdice.com/settings" },
    ],
    links: [{ rel: "canonical", href: "https://yungdice.com/settings" }],
  }),
  component: () => (
    <AppShell>
      <Settings />
    </AppShell>
  ),
});

const DISPLAY_MAX = 15;
const BIO_MAX = 200;

function useIsOwner(userId?: string) {
  return useQuery({
    queryKey: ["is-owner", userId],
    queryFn: async () => {
      if (!userId) return false;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "owner")
        .maybeSingle();
      if (error) return false;
      return !!data;
    },
    enabled: !!userId,
  });
}

function Settings() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { data: profile, refetch } = useMyProfile(user?.id);
  const { data: wallet } = useWallet(user?.id);
  const qc = useQueryClient();

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="font-display text-3xl font-medium">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile, identity, currency, and account.</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile">
            <User className="size-4 mr-1.5" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="identity">
            <Hash className="size-4 mr-1.5" />
            Identity
          </TabsTrigger>
          <TabsTrigger value="coins">
            <Coins className="size-4 mr-1.5" />
            Coins & VIP
          </TabsTrigger>
          <TabsTrigger value="account">
            <ShieldAlert className="size-4 mr-1.5" />
            Account
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4">
          <ProfileTab user={user} profile={profile} refetch={refetch} qc={qc} />
        </TabsContent>

        <TabsContent value="identity" className="space-y-4">
          <UsernameCard profile={profile} refetch={refetch} />
          <TagCard profile={profile} wallet={wallet} refetch={refetch} qc={qc} />
        </TabsContent>

        <TabsContent value="coins" className="space-y-4">
          <PaymentTestModeBanner />
          <BuyCoinsCard />
          <VipLevelCards profile={profile} wallet={wallet} refetch={refetch} qc={qc} />
        </TabsContent>

        <TabsContent value="account" className="space-y-4">
          <AccountTab user={user} nav={nav} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProfileTab({ user, profile, refetch, qc }: any) {
  const { data: isOwner } = useIsOwner(user?.id);
  const [bio, setBio] = useState("");
  const [country, setCountry] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [privacy, setPrivacy] = useState<string>("public");
  const [activityPrivacy, setActivityPrivacy] = useState<string>("friends");

  useEffect(() => {
    if (profile) {
      setBio(profile.bio ?? "");
      setCountry(profile.country ?? "");
      setDisplayName(profile.display_name);
      setPrivacy(profile.privacy_profile);
      setActivityPrivacy(profile.privacy_activity);
    }
  }, [profile]);

  async function save() {
    if (!user) return;
    const dn = displayName.trim();
    if (dn.length < 1 || dn.length > DISPLAY_MAX) {
      toast.error(`Display name must be 1–${DISPLAY_MAX} characters`);
      return;
    }
    if ((bio ?? "").length > BIO_MAX) {
      toast.error(`Bio must be ${BIO_MAX} characters or less`);
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({
        bio,
        country,
        display_name: dn,
        privacy_profile: privacy,
        privacy_activity: activityPrivacy,
      })
      .eq("id", user.id);
    if (error) return toast.error(error.message);
    toast.success("Profile saved");
    refetch();
  }

  const [avatarSrc, setAvatarSrc] = useState<string>("");
  const [avatarOpen, setAvatarOpen] = useState(false);

  async function saveCroppedAvatar(blob: Blob) {
    if (!user) return;
    const path = `${user.id}/avatar-${Date.now()}.jpg`;
    const up = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
    if (up.error) {
      toast.error(up.error.message);
      return;
    }
    const signed = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
    if (signed.error || !signed.data) {
      toast.error("Could not load image");
      return;
    }
    const { error } = await supabase.from("profiles").update({ avatar_url: signed.data.signedUrl }).eq("id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Profile picture updated");
    refetch();
    qc.invalidateQueries({ queryKey: ["profile", user.id] });
  }

  return (
    <>
      <Card className="glass p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Camera className="size-4 text-primary" />
          <h2 className="font-display text-lg font-medium">Profile picture</h2>
        </div>
        <div className="flex items-center gap-4">
          <Avatar className="size-20 ring-2 ring-primary/40">
            <AvatarImage src={profile?.avatar_url ?? undefined} />
            <AvatarFallback className="text-xl">{profile?.display_name?.[0] ?? "?"}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-2">
            <Input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !user) return;
                if (!isOwner && file.size > 8 * 1024 * 1024) return toast.error("Max 8MB");
                setAvatarSrc(await readFileAsDataURL(file));
                setAvatarOpen(true);
                e.currentTarget.value = "";
              }}
            />
            <p className="text-xs text-muted-foreground">
              JPG/PNG/GIF{isOwner ? "" : ", up to 8MB"}. You'll be able to crop &amp; reposition it.
            </p>
          </div>
        </div>
        <ImageCropper
          open={avatarOpen}
          onOpenChange={setAvatarOpen}
          imageSrc={avatarSrc}
          aspect={1}
          cropShape="round"
          outputWidth={512}
          title="Crop profile picture"
          onCropped={saveCroppedAvatar}
        />
      </Card>

      <BannerCard user={user} profile={profile} refetch={refetch} qc={qc} />
      <ProfileBgCard user={user} profile={profile} refetch={refetch} qc={qc} />

      <LoadoutEditor user={user} profile={profile} refetch={refetch} />

      <Card className="glass p-6 space-y-4">
        <h2 className="font-display text-lg font-medium">About you</h2>
        <div>
          <div className="flex justify-between">
            <Label>Display name</Label>
            <span className="text-xs text-muted-foreground">
              {displayName.length}/{DISPLAY_MAX}
            </span>
          </div>
          <Input value={displayName} maxLength={DISPLAY_MAX} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div>
          <div className="flex justify-between">
            <Label>Bio</Label>
            <span className="text-xs text-muted-foreground">
              {(bio ?? "").length}/{BIO_MAX}
            </span>
          </div>
          <Textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
            maxLength={BIO_MAX}
            rows={3}
          />
        </div>
        <div>
          <Label>Country</Label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option value="">— Select country —</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Profile privacy</Label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value)}
            >
              {["public", "friends", "private"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Activity feed privacy</Label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={activityPrivacy}
              onChange={(e) => setActivityPrivacy(e.target.value)}
            >
              {["public", "friends", "private"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>
        <Button onClick={save} className="glow-red">
          Save changes
        </Button>
      </Card>
    </>
  );
}

function UsernameCard({ profile, refetch }: any) {
  const [newUsername, setNewUsername] = useState("");
  const [changingU, setChangingU] = useState(false);
  const changeUser = useServerFn(changeUsername);
  useEffect(() => {
    if (profile) setNewUsername(profile.username);
  }, [profile]);

  const lastChange: string | null = profile?.username_changed_at ?? null;
  const cooldownMs = 90 * 24 * 60 * 60 * 1000;
  const nextChangeAt = lastChange ? new Date(new Date(lastChange).getTime() + cooldownMs) : null;
  const canChange = !nextChangeAt || nextChangeAt.getTime() <= Date.now();

  async function saveUsername() {
    if (!profile || newUsername === profile.username) return;
    setChangingU(true);
    try {
      await changeUser({ data: { username: newUsername.trim() } });
      toast.success("Username updated");
      refetch();
    } catch (e: any) {
      toast.error(e.message || "Could not change username");
    } finally {
      setChangingU(false);
    }
  }

  return (
    <Card className="glass p-6 space-y-3">
      <h2 className="font-display text-lg font-medium">Username</h2>
      <p className="text-xs text-muted-foreground">
        Your @handle. Can be changed once every 90 days. 3–20 chars, letters/numbers/underscore.
      </p>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">@</span>
        <Input
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
          maxLength={20}
          disabled={!canChange}
        />
        <Button
          onClick={saveUsername}
          disabled={!canChange || changingU || !profile || newUsername === profile.username}
        >
          {changingU ? "Saving..." : "Change"}
        </Button>
      </div>
      {!canChange && nextChangeAt && (
        <p className="text-xs text-foreground">
          You can change your username again on {nextChangeAt.toLocaleDateString()}.
        </p>
      )}
    </Card>
  );
}

function VipLevelCards({ profile, wallet, refetch, qc }: any) {
  const [busyVip, setBusyVip] = useState(false);
  const buyVipFn = useServerFn(buyVip);
  const vipUntil = profile?.vip_until ? new Date(profile.vip_until) : null;
  const vipActive = vipUntil && vipUntil > new Date();
  const lvl = profile?.level ?? 1;

  async function doBuyVip() {
    if ((wallet?.balance ?? 0) < 5000) {
      toast.error("Need 5,000 DICE");
      return;
    }
    setBusyVip(true);
    try {
      await buyVipFn({ data: undefined as any });
      toast.success("VIP unlocked for 7 days!");
      refetch();
      qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setBusyVip(false);
    }
  }

  return (
    <>
      <Card className="glass p-6 space-y-3 border-white/10">
        <h2 className="font-display text-lg font-medium flex items-center gap-2">
          <Crown className="text-foreground" /> VIP Status
        </h2>
        {vipActive ? (
          <p className="text-sm text-emerald-400">Active until {vipUntil!.toLocaleString()}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Buy VIP for 5,000 DICE. Lasts 7 days. Send images in global chat, bigger message limit (4,000 chars vs 500),
            profile banner.
          </p>
        )}
        <Button onClick={doBuyVip} disabled={busyVip} className="glow-red">
          {busyVip ? "Processing..." : vipActive ? "Extend VIP (+7 days · 5,000 DICE)" : "Buy VIP — 5,000 DICE"}
        </Button>
      </Card>

      <Card className="glass p-6 space-y-3">
        <h2 className="font-display text-lg font-medium flex items-center gap-2">
          <Sparkles className="text-primary" /> Leveling
        </h2>
        <p className="text-sm text-muted-foreground">
          You are <b>Level {lvl}</b>. Stay on DICE to earn <b>+25 XP/min</b> automatically — each level grants{" "}
          <b>+500 DICE</b>. Impatient? You can also buy the next level instantly for <b>{fmt(lvl * 500)} DICE</b>.
        </p>
        <BuyLevelButton lvl={lvl} wallet={wallet} refetch={refetch} qc={qc} />
      </Card>
    </>
  );
}

function BuyLevelButton({ lvl, wallet, refetch, qc }: any) {
  const [busy, setBusy] = useState(false);
  const buy = useServerFn(buyLevelUp);
  const cost = lvl * 500;
  const canAfford = (wallet?.balance ?? 0) >= cost;
  async function doBuy() {
    setBusy(true);
    try {
      const r: any = await buy({ data: undefined as any });
      toast.success(`Level up! You are now Lvl ${r.level}${r.bonus ? ` · ${r.bonus}` : ""}`);
      refetch();
      qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button onClick={doBuy} disabled={busy || !canAfford} variant="outline" className="border-primary/40">
      {busy
        ? "Leveling up..."
        : canAfford
          ? `Buy Lvl ${lvl + 1} — ${fmt(cost)} DICE`
          : `Need ${fmt(cost)} DICE for next level`}
    </Button>
  );
}

function AccountTab({ user, nav }: any) {
  async function deleteAccount() {
    if (!user) return;
    if (
      !confirm(
        "Delete account? This permanently removes your profile, wallet, listings, and proofs. This cannot be undone.",
      )
    )
      return;
    await supabase
      .from("profiles")
      .update({ bio: null, display_name: "deleted_user", avatar_url: null })
      .eq("id", user.id);
    await supabase.auth.signOut();
    nav({ to: "/" });
  }
  return (
    <>
      <Card className="glass p-6 space-y-3">
        <h2 className="font-display text-lg font-medium">Responsible play</h2>
        <p className="text-sm text-muted-foreground">
          DICE is meant to be fun. Long sessions get a reminder to take a break. Need to stop for now? Sign out and come
          back tomorrow.
        </p>
        <Button
          variant="outline"
          onClick={() => {
            supabase.auth.signOut();
            nav({ to: "/auth" });
          }}
        >
          Sign out
        </Button>
      </Card>
      <Card className="glass p-6 space-y-3 border-destructive/40">
        <h2 className="font-display text-lg font-medium text-destructive">Danger zone</h2>
        <p className="text-sm text-muted-foreground">
          Delete your account. This anonymises your profile and signs you out. Your historical proofs and listings
          remain attributed to "deleted_user".
        </p>
        <Button variant="destructive" onClick={deleteAccount}>
          Delete account
        </Button>
      </Card>
    </>
  );
}

function TagCard({ profile, wallet, refetch, qc }: any) {
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [sellFor, setSellFor] = useState<string | null>(null);
  const [sellPrice, setSellPrice] = useState(1000);
  const [saleType, setSaleType] = useState<"fixed" | "auction">("fixed");
  const [hours, setHours] = useState(24);
  const claim = useServerFn(claimTag);
  const listFn = useServerFn(listTagForSale);
  const setActiveFn = useServerFn(setActiveTag);
  const deleteFn = useServerFn(deleteTag);
  const currentTag: string | null = profile?.tag ?? null;

  const ownedTags = useQuery({
    queryKey: ["my-tags", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profile_tags" as any)
        .select("tag,acquired_at")
        .eq("user_id", profile.id)
        .order("acquired_at");
      return (data ?? []) as unknown as Array<{ tag: string; acquired_at: string }>;
    },
  });

  const owned = ownedTags.data ?? [];
  const tagsForSale = useQuery({
    queryKey: ["my-tag-listings", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("marketplace_listings")
        .select("id,tag_value,status")
        .eq("seller_id", profile.id)
        .eq("category", "tag")
        .eq("status", "active");
      return Object.fromEntries((data ?? []).map((l: any) => [l.tag_value, l.id]));
    },
  });

  async function doClaim() {
    if ((wallet?.balance ?? 0) < 5000) {
      toast.error("Need 5,000 DICE");
      return;
    }
    if (!/^[A-Za-z0-9]{2,6}$/.test(tag)) {
      toast.error("2–6 letters/numbers");
      return;
    }
    if (owned.length >= 3) {
      toast.error("Tag limit reached (3/3)");
      return;
    }
    setBusy(true);
    try {
      const r = await claim({ data: { tag } });
      toast.success(`Tag #${r.tag} is yours!`);
      refetch();
      ownedTags.refetch();
      qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }
  async function doList(forTag: string) {
    setBusy(true);
    try {
      await listFn({ data: { tag: forTag, price: sellPrice, sale_type: saleType, duration_hours: hours } as any });
      toast.success("Tag listed on marketplace (still attached to you until sold)");
      refetch();
      ownedTags.refetch();
      tagsForSale.refetch();
      qc.invalidateQueries({ queryKey: ["listings"] });
      setSellFor(null);
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }
  async function makeActive(t: string) {
    try {
      await setActiveFn({ data: { tag: t } });
      toast.success(`#${t} is now your active tag`);
      refetch();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  }
  async function doDelete(t: string) {
    if (!confirm(`Delete tag #${t}? This frees up the slot but is permanent.`)) return;
    setBusy(true);
    try {
      await deleteFn({ data: { tag: t } });
      toast.success(`Tag #${t} deleted`);
      refetch();
      ownedTags.refetch();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="glass p-6 space-y-3 border-primary/40">
      <h2 className="font-display text-lg font-medium flex items-center gap-2">
        <Hash className="text-primary" /> Your tags ({owned.length}/3)
      </h2>
      <p className="text-xs text-muted-foreground">
        Discord-style identity: <b>@{profile?.username ?? "you"}#TAG</b>. Each tag costs <b>5,000 DICE</b>. You can own
        up to <b>3 tags</b> and switch any of them as your active tag. Listed tags stay attached to you until purchased.
      </p>

      {owned.length > 0 && (
        <div className="space-y-2">
          {owned.map((row) => {
            const t = row.tag;
            const isActive = t === currentTag;
            const listingId = tagsForSale.data?.[t];
            return (
              <div
                key={t}
                className={`rounded-md p-3 border ${isActive ? "bg-primary/10 border-primary/50 shadow-[0_0_18px_-6px_hsl(var(--primary)/0.6)]" : "bg-white/5 border-white/10"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="font-mono text-xl text-primary">
                      @{profile?.username}#{t}
                    </div>
                    {isActive && (
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-primary text-primary-foreground font-bold">
                        Equipped
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {isActive ? (
                      <span className="text-xs px-2 py-1 rounded bg-primary/20 text-primary">Active tag</span>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => makeActive(t)}>
                        Equip
                      </Button>
                    )}
                    {listingId ? (
                      <span className="text-xs px-2 py-1 rounded bg-white/5 text-foreground">For sale</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSellFor(t);
                          setSellPrice(1000);
                          setSaleType("fixed");
                          setHours(24);
                        }}
                      >
                        Sell
                      </Button>
                    )}
                    {!listingId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        disabled={busy}
                        onClick={() => doDelete(t)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
                {sellFor === t && (
                  <div className="mt-3 rounded-md bg-black/30 p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label>Sale type</Label>
                        <select
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={saleType}
                          onChange={(e) => setSaleType(e.target.value as any)}
                        >
                          <option value="fixed">Fixed price</option>
                          <option value="auction">Auction</option>
                        </select>
                      </div>
                      <div>
                        <Label>{saleType === "auction" ? "Starting bid (DICE)" : "Price (DICE)"}</Label>
                        <Input
                          type="number"
                          min={100}
                          max={1000000}
                          value={sellPrice}
                          onChange={(e) => setSellPrice(+e.target.value)}
                        />
                      </div>
                    </div>
                    {saleType === "auction" && (
                      <div>
                        <Label>
                          Duration: {hours} hour{hours !== 1 ? "s" : ""} (1h–7d)
                        </Label>
                        <input
                          type="range"
                          min={1}
                          max={168}
                          value={hours}
                          onChange={(e) => setHours(+e.target.value)}
                          className="w-full"
                        />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button onClick={() => doList(t)} disabled={busy} className="glow-red">
                        {busy ? "Listing..." : "List for sale"}
                      </Button>
                      <Button variant="outline" onClick={() => setSellFor(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {/* empty slot placeholders */}
          {Array.from({ length: Math.max(0, 3 - owned.length) }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="rounded-md p-3 border border-dashed border-white/15 bg-white/[0.02] text-xs text-muted-foreground flex items-center justify-between"
            >
              <span>Empty tag slot</span>
              <span className="opacity-60">Claim below or buy from the marketplace</span>
            </div>
          ))}
        </div>
      )}

      {owned.length === 0 && (
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-md p-3 border border-dashed border-white/15 bg-white/[0.02] text-xs text-muted-foreground text-center"
            >
              Empty tag slot
            </div>
          ))}
        </div>
      )}

      {owned.length < 3 ? (
        <div className="flex items-center gap-2 pt-2 border-t border-white/10">
          <span className="text-muted-foreground text-lg">#</span>
          <Input
            value={tag}
            onChange={(e) => setTag(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="EG. WOLF"
          />
          <Button onClick={doClaim} disabled={busy || tag.length < 2} className="glow-red">
            {busy ? "Claiming..." : "Claim — 5,000 DICE"}
          </Button>
        </div>
      ) : (
        <div className="pt-2 border-t border-white/10 text-xs text-foreground">
          All 3 tag slots are full. Delete or sell one to claim or buy another.
        </div>
      )}
    </Card>
  );
}

function BannerCard({ user, profile, refetch, qc }: any) {
  const { data: isOwner } = useIsOwner(user?.id);
  const vipUntil = profile?.vip_until ? new Date(profile.vip_until) : null;
  const vipActive = !!(vipUntil && vipUntil > new Date());
  const bannerUrl: string | null = profile?.banner_url ?? null;
  const [src, setSrc] = useState<string>("");
  const [open, setOpen] = useState(false);

  async function save(blob: Blob) {
    if (!user) return;
    const path = `${user.id}/banner-${Date.now()}.jpg`;
    const up = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
    if (up.error) {
      toast.error(up.error.message);
      return;
    }
    const signed = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
    if (signed.error || !signed.data) {
      toast.error("Could not load image");
      return;
    }
    const { error } = await supabase.from("profiles").update({ banner_url: signed.data.signedUrl }).eq("id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Banner updated");
    refetch();
    qc.invalidateQueries({ queryKey: ["profile", user.id] });
  }
  async function clear() {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ banner_url: null }).eq("id", user.id);
    if (error) return toast.error(error.message);
    toast.success("Banner cleared");
    refetch();
  }

  return (
    <Card className={`glass p-6 space-y-3 ${vipActive ? "border-white/10" : ""}`}>
      <div className="flex items-center gap-2">
        <Crown className="size-4 text-foreground" />
        <h2 className="font-display text-lg font-medium">Profile banner</h2>
        {!vipActive && <span className="text-xs text-muted-foreground ml-auto">VIP only</span>}
      </div>
      {bannerUrl ? (
        <div className="rounded-md overflow-hidden border border-border/60">
          <img src={bannerUrl} alt="Profile banner preview" className="w-full h-32 md:h-40 object-cover" />
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border/60 h-24 grid place-items-center text-xs text-muted-foreground">
          No banner yet
        </div>
      )}
      <div className="flex items-center gap-2">
        <Input
          type="file"
          accept="image/*"
          disabled={!vipActive}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (!vipActive) return toast.error("VIP only");
            if (!isOwner && f.size > 8 * 1024 * 1024) return toast.error("Max 8MB");
            setSrc(await readFileAsDataURL(f));
            setOpen(true);
            e.currentTarget.value = "";
          }}
        />
        {bannerUrl && (
          <Button variant="outline" size="sm" onClick={clear}>
            Remove
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {vipActive
          ? `Wide banner — you'll crop & reposition it.${isOwner ? "" : " Up to 8MB."}`
          : "Unlock VIP (5,000 DICE) in the Coins & VIP tab to upload a banner."}
      </p>
      <ImageCropper
        open={open}
        onOpenChange={setOpen}
        imageSrc={src}
        aspect={4}
        outputWidth={1600}
        title="Crop banner"
        onCropped={save}
      />
    </Card>
  );
}

function ProfileBgCard({ user, profile, refetch, qc }: any) {
  const { data: isOwner } = useIsOwner(user?.id);
  const vipUntil = profile?.vip_until ? new Date(profile.vip_until) : null;
  const vipActive = !!(vipUntil && vipUntil > new Date());
  const bgUrl: string | null = profile?.profile_bg_url ?? null;
  const [src, setSrc] = useState<string>("");
  const [open, setOpen] = useState(false);

  async function save(blob: Blob) {
    if (!user) return;
    const path = `${user.id}/profile-bg-${Date.now()}.jpg`;
    const up = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
    if (up.error) {
      toast.error(up.error.message);
      return;
    }
    const signed = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
    if (signed.error || !signed.data) {
      toast.error("Could not load image");
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({ profile_bg_url: signed.data.signedUrl })
      .eq("id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Profile background updated");
    refetch();
    qc.invalidateQueries({ queryKey: ["profile", user.id] });
  }
  async function clear() {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ profile_bg_url: null }).eq("id", user.id);
    if (error) return toast.error(error.message);
    toast.success("Background cleared");
    refetch();
  }

  return (
    <Card className={`glass p-6 space-y-3 ${vipActive ? "border-white/10" : ""}`}>
      <div className="flex items-center gap-2">
        <Crown className="size-4 text-foreground" />
        <h2 className="font-display text-lg font-medium">Profile background</h2>
        {!vipActive && <span className="text-xs text-muted-foreground ml-auto">VIP only</span>}
      </div>
      {bgUrl ? (
        <div className="rounded-md overflow-hidden border border-border/60 relative">
          <img src={bgUrl} alt="Profile background preview" className="w-full h-40 object-cover" />
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border/60 h-24 grid place-items-center text-xs text-muted-foreground">
          No background image yet
        </div>
      )}
      <div className="flex items-center gap-2">
        <Input
          type="file"
          accept="image/*"
          disabled={!vipActive}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (!vipActive) return toast.error("VIP only");
            if (!isOwner && f.size > 8 * 1024 * 1024) return toast.error("Max 8MB");
            setSrc(await readFileAsDataURL(f));
            setOpen(true);
            e.currentTarget.value = "";
          }}
        />
        {bgUrl && (
          <Button variant="outline" size="sm" onClick={clear}>
            Remove
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {vipActive
          ? `Used as a subtle background on your profile. You can crop & reposition it.${isOwner ? "" : " Up to 8MB."}`
          : "Unlock VIP to add a custom profile background."}
      </p>
      <ImageCropper
        open={open}
        onOpenChange={setOpen}
        imageSrc={src}
        aspect={16 / 9}
        outputWidth={1600}
        title="Crop background"
        onCropped={save}
      />
    </Card>
  );
}
