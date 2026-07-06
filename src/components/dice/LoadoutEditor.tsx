import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

const GAMES = [
  { v: "coinflip", n: "Coin Flip" }, { v: "dice", n: "Dice" }, { v: "blackjack", n: "Blackjack" },
  { v: "poker", n: "Poker" }, { v: "slots", n: "Slots" }, { v: "roulette", n: "Roulette" },
  { v: "upgrader", n: "Upgrader" }, { v: "obby", n: "Obby" }, { v: "flappy", n: "Flappy" },
  { v: "split-steal", n: "Split or Steal" },
];

export function LoadoutEditor({ user, profile, refetch }: any) {
  const qc = useQueryClient();
  const [baddieId, setBaddieId] = useState<string>("");
  const [game, setGame] = useState<string>("");
  const [achId, setAchId] = useState<string>("");
  const [poseUrl, setPoseUrl] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setBaddieId(profile.favorite_baddie_id ?? "");
    setGame(profile.favorite_game ?? "");
    setAchId(profile.favorite_achievement_id ?? "");
    setPoseUrl(profile.win_pose_url ?? "");
  }, [profile]);

  const baddies = useQuery({
    queryKey: ["my-baddies-list", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("user_baddies")
        .select("id,name,tier,baddie_templates(name,rarity)")
        .eq("user_id", user.id).order("acquired_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const achievements = useQuery({
    queryKey: ["my-unlocked-ach", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("user_achievements")
        .select("achievement_id,achievements(id,name,description)")
        .eq("user_id", user.id);
      return (data ?? []).map((r: any) => r.achievements).filter(Boolean);
    },
  });

  async function save() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      favorite_baddie_id: baddieId || null,
      favorite_game: game || null,
      favorite_achievement_id: achId || null,
      win_pose_url: poseUrl || null,
    } as any).eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Loadout saved");
    refetch?.();
    qc.invalidateQueries({ queryKey: ["profile", user.id] });
  }

  async function uploadPose(file: File) {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Max 5MB");
    const ext = file.name.split(".").pop() || "png";
    const path = `${user.id}/win-pose-${Date.now()}.${ext}`;
    const up = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (up.error) return toast.error(up.error.message);
    const signed = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
    if (signed.error || !signed.data) return toast.error("Could not load image");
    setPoseUrl(signed.data.signedUrl);
    toast.success("Sticker uploaded — click Save loadout");
  }

  return (
    <Card className="glass p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <h2 className="font-display text-lg font-semibold">Loadout</h2>
      </div>
      <p className="text-xs text-muted-foreground">Show off your identity on your profile. Frame, banner and title come from the Cosmetics shop.</p>

      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <Label>Favorite Baddie</Label>
          <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={baddieId} onChange={(e) => setBaddieId(e.target.value)}>
            <option value="">— None —</option>
            {(baddies.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {(b.name || b.baddie_templates?.name) ?? "Baddie"} · {b.baddie_templates?.rarity}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label>Favorite Game</Label>
          <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={game} onChange={(e) => setGame(e.target.value)}>
            <option value="">— None —</option>
            {GAMES.map((g) => <option key={g.v} value={g.v}>{g.n}</option>)}
          </select>
        </div>

        <div className="md:col-span-2">
          <Label>Best Achievement</Label>
          <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={achId} onChange={(e) => setAchId(e.target.value)}>
            <option value="">— None —</option>
            {(achievements.data ?? []).map((a: any) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          {!achievements.data?.length && (
            <p className="text-[11px] text-muted-foreground mt-1">Unlock achievements to feature one here.</p>
          )}
        </div>

        <div className="md:col-span-2">
          <Label>Win Pose / Sticker</Label>
          <div className="flex items-center gap-3">
            {poseUrl && <img src={poseUrl} className="size-16 rounded object-contain bg-black/30" alt="pose" />}
            <div className="flex-1 space-y-2">
              <Input type="file" accept="image/*,image/gif" onChange={(e) => {
                const f = e.target.files?.[0]; if (f) uploadPose(f);
              }} />
              <p className="text-[11px] text-muted-foreground">PNG, GIF or WebP — up to 5MB. Animated stickers welcome.</p>
              {poseUrl && <Button size="sm" variant="ghost" onClick={() => setPoseUrl("")}>Remove sticker</Button>}
            </div>
          </div>
        </div>
      </div>

      <Button onClick={save} disabled={saving} className="glow-red">
        {saving ? "Saving..." : "Save loadout"}
      </Button>
    </Card>
  );
}
