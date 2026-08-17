import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Sparkles, Upload, ImageIcon } from "lucide-react";

const GAMES = [
  { v: "coinflip", n: "Coin Flip" }, { v: "dice", n: "Dice" }, { v: "blackjack", n: "Blackjack" },
  { v: "poker", n: "Poker" }, { v: "slots", n: "Slots" }, { v: "roulette", n: "Roulette" },
  { v: "upgrader", n: "Upgrader" }, { v: "obby", n: "Obby" }, { v: "flappy", n: "Flappy" },
  { v: "split-steal", n: "Split or Steal" },
];

const EMOJI_QUICK = ["🔥", "😎", "👑", "💎", "🎲", "🃏", "⚡", "💰", "🚀", "🌟", "😈", "🦄", "🐉", "🍀", "🎯", "💀"];

function isImageValue(s: string) {
  return /^(https?:|data:|\/)/i.test(s);
}

export function LoadoutEditor({ user, profile, refetch }: any) {
  const qc = useQueryClient();
  const [baddieId, setBaddieId] = useState<string>("");
  const [game, setGame] = useState<string>("");
  const [achId, setAchId] = useState<string>("");
  const [emoji, setEmoji] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!profile) return;
    setBaddieId(profile.favorite_baddie_id ?? "");
    setGame(profile.favorite_game ?? "");
    setAchId(profile.favorite_achievement_id ?? "");
    setEmoji(profile.user_emoji ?? "");
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

  async function uploadEmoji(file: File) {
    if (!user?.id) return toast.error("Sign in first");
    if (file.size > 2 * 1024 * 1024) return toast.error("Max 2 MB");
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${user.id}/emoji-${Date.now()}.${ext}`;
      const up = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
      if (up.error) throw up.error;
      const signed = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (signed.data?.signedUrl) setEmoji(signed.data.signedUrl);
      toast.success("Image ready — click Save to apply");
    } catch (e: any) { toast.error(e.message ?? "Upload failed"); }
    finally { setUploading(false); }
  }

  async function save() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      favorite_baddie_id: baddieId || null,
      favorite_game: game || null,
      favorite_achievement_id: achId || null,
      user_emoji: emoji || null,
    } as any).eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Loadout saved");
    refetch?.();
    qc.invalidateQueries({ queryKey: ["profile", user.id] });
  }

  return (
    <Card className="glass p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <h2 className="font-display text-lg font-medium">Loadout</h2>
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
          <Label>Your Emoji / Image</Label>
          <p className="text-[11px] text-muted-foreground mb-2">
            Shown next to your nickname in global chat, games and the profile card. Pick a single emoji or upload an image/GIF.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-14 h-14 grid place-items-center rounded-md bg-black/30 border border-border/60 overflow-hidden">
              {emoji ? (
                isImageValue(emoji)
                  ? <img src={emoji} alt="preview" className="w-full h-full object-cover" />
                  : <span className="text-3xl">{emoji}</span>
              ) : <span className="text-xs text-muted-foreground">—</span>}
            </div>
            <Input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="🔥 or paste image URL"
              className="max-w-[280px]"
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*,image/gif"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadEmoji(f); e.currentTarget.value = ""; }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Uploading…" : <><Upload className="size-3.5 mr-1" /> Upload</>}
            </Button>
            {emoji && <Button size="sm" variant="ghost" onClick={() => setEmoji("")}>Clear</Button>}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {EMOJI_QUICK.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={`text-xl w-9 h-9 rounded-md grid place-items-center border transition ${
                  emoji === e ? "border-primary bg-primary/10" : "border-border/60 bg-black/20 hover:bg-white/5"
                }`}
                aria-label={`Pick ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
            <ImageIcon className="size-3" /> Tip: GIFs work too — great for animated flair.
          </p>
        </div>

      </div>

      <Button onClick={save} disabled={saving} className="glow-red">
        {saving ? "Saving..." : "Save loadout"}
      </Button>
    </Card>
  );
}
