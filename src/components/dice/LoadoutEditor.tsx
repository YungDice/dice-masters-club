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

const EMOJI_QUICK = ["🔥", "😎", "👑", "💎", "🎲", "🃏", "⚡", "💰", "🚀", "🌟", "😈", "🦄", "🐉", "🍀", "🎯", "💀"];

// Roughly detects a single grapheme emoji. Keeps it simple & permissive.
function isSingleEmoji(s: string): boolean {
  if (!s) return true;
  try {
    const Seg = (Intl as any).Segmenter;
    if (typeof Seg === "function") {
      const seg = new Seg(undefined, { granularity: "grapheme" });
      const count = [...seg.segment(s)].length;
      return count === 1 && s.length <= 12;
    }
    return s.length <= 8;
  } catch {
    return s.length <= 8;
  }
}

export function LoadoutEditor({ user, profile, refetch }: any) {
  const qc = useQueryClient();
  const [baddieId, setBaddieId] = useState<string>("");
  const [game, setGame] = useState<string>("");
  const [achId, setAchId] = useState<string>("");
  const [emoji, setEmoji] = useState<string>("");
  const [saving, setSaving] = useState(false);

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

  async function save() {
    if (!user) return;
    if (emoji && !isSingleEmoji(emoji)) {
      return toast.error("Pick a single emoji");
    }
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
          <Label>Your Emoji</Label>
          <p className="text-[11px] text-muted-foreground mb-2">
            Shown next to your nickname in global chat, games and the profile card. Pick one emoji.
          </p>
          <div className="flex items-center gap-3">
            <div className="text-3xl w-12 h-12 grid place-items-center rounded-md bg-black/30 border border-border/60">
              {emoji || <span className="text-xs text-muted-foreground">—</span>}
            </div>
            <Input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="🔥"
              maxLength={12}
              className="max-w-[140px]"
            />
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
        </div>

      </div>

      <Button onClick={save} disabled={saving} className="glow-red">
        {saving ? "Saving..." : "Save loadout"}
      </Button>
    </Card>
  );
}
