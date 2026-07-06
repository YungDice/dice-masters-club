import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Sparkles, Gamepad2, Trophy, Users, Image as ImageIcon } from "lucide-react";

const GAME_LABEL: Record<string, string> = {
  coinflip: "Coin Flip", dice: "Dice", blackjack: "Blackjack", poker: "Poker",
  slots: "Slots", roulette: "Roulette", upgrader: "Upgrader", obby: "Obby",
  flappy: "Flappy", "split-steal": "Split or Steal",
};

function Tile({ icon, label, children, empty }: { icon: React.ReactNode; label: string; children?: React.ReactNode; empty?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-black/25 p-3 min-h-[92px] flex flex-col">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}<span>{label}</span>
      </div>
      <div className="mt-1 flex-1 flex items-center">
        {children ?? <span className="text-xs text-muted-foreground/70 italic">{empty ?? "Not set"}</span>}
      </div>
    </div>
  );
}

export function LoadoutCard({ profile }: { profile: any }) {
  const favBaddie = useQuery({
    queryKey: ["fav-baddie", profile?.favorite_baddie_id],
    enabled: !!profile?.favorite_baddie_id,
    queryFn: async () => {
      const { data } = await supabase.from("user_baddies")
        .select("id,name,template_id,tier,baddie_templates(name,image_url,rarity)")
        .eq("id", profile.favorite_baddie_id).maybeSingle();
      return data as any;
    },
  });

  const favAch = useQuery({
    queryKey: ["fav-ach", profile?.favorite_achievement_id],
    enabled: !!profile?.favorite_achievement_id,
    queryFn: async () => {
      const { data } = await supabase.from("achievements")
        .select("id,name,description,icon").eq("id", profile.favorite_achievement_id).maybeSingle();
      return data as any;
    },
  });

  const crew = useQuery({
    queryKey: ["my-crew-badge", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data: cm } = await supabase.from("crew_members").select("crew_id,role,crews(id,name,tag,avatar_url)").eq("user_id", profile.id).maybeSingle();
      return cm as any;
    },
  });

  return (
    <Card className="glass p-5">
      <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />Loadout
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile icon={<Sparkles className="size-3" />} label="Favorite Baddie" empty="Pick a Baddie">
          {favBaddie.data && (
            <div className="flex items-center gap-2">
              {favBaddie.data.baddie_templates?.image_url && (
                <img src={favBaddie.data.baddie_templates.image_url} alt="" className="size-10 rounded object-cover" />
              )}
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">{favBaddie.data.name || favBaddie.data.baddie_templates?.name}</div>
                <div className="text-[10px] text-muted-foreground capitalize">{favBaddie.data.baddie_templates?.rarity}</div>
              </div>
            </div>
          )}
        </Tile>

        <Tile icon={<Gamepad2 className="size-3" />} label="Favorite Game" empty="Pick a game">
          {profile?.favorite_game && (
            <div className="text-sm font-semibold">{GAME_LABEL[profile.favorite_game] ?? profile.favorite_game}</div>
          )}
        </Tile>

        <Tile icon={<Trophy className="size-3" />} label="Best Achievement" empty="Pick one">
          {favAch.data && (
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate text-gold">{favAch.data.name}</div>
              <div className="text-[10px] text-muted-foreground line-clamp-2">{favAch.data.description}</div>
            </div>
          )}
        </Tile>

        <Tile icon={<Users className="size-3" />} label="Crew" empty="No crew">
          {crew.data?.crews && (
            <div className="flex items-center gap-2">
              {crew.data.crews.avatar_url ? (
                <img src={crew.data.crews.avatar_url} className="size-8 rounded object-cover" alt="" />
              ) : (
                <div className="size-8 rounded bg-primary/20 grid place-items-center text-[10px] font-bold">{crew.data.crews.tag}</div>
              )}
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">{crew.data.crews.name}</div>
                <div className="text-[10px] text-muted-foreground capitalize">{crew.data.role}</div>
              </div>
            </div>
          )}
        </Tile>

        <Tile icon={<ImageIcon className="size-3" />} label="Win Pose" empty="No sticker">
          {profile?.win_pose_url && (
            <img src={profile.win_pose_url} alt="win pose" className="max-h-14 rounded object-contain" />
          )}
        </Tile>
      </div>
    </Card>
  );
}
