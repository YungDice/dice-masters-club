import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Palette, Coins, Check, Sparkles, Crown } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyProfile, useWallet } from "@/hooks/use-profile";
import {
  useCatalog, useMyCosmetics, RARITY_COLOR, TitleBadge, frameClasses, bannerStyle,
  type Cosmetic,
} from "@/lib/cosmetics";
import { fmt } from "@/lib/format";

export const Route = createFileRoute("/cosmetics")({
  head: () => ({
    meta: [
      { title: "Cosmetics — DICE" },
      { name: "description", content: "Unlock titles, avatar frames, profile banners, chat emotes and dice skins." },
    ],
  }),
  component: () => <AppShell><CosmeticsPage /></AppShell>,
});

const KIND_LABEL: Record<Cosmetic["kind"], string> = {
  title: "Titles", frame: "Avatar Frames", banner: "Profile Banners", emote: "Chat Emotes", dice_skin: "Dice Skins",
};
const KIND_ORDER: Cosmetic["kind"][] = ["title", "frame", "banner", "emote", "dice_skin"];

function CosmeticsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: profile } = useMyProfile(user?.id);
  const { data: wallet } = useWallet(user?.id);
  const catalog = useCatalog();
  const owned = useMyCosmetics(user?.id);
  const [tab, setTab] = useState<Cosmetic["kind"]>("title");

  const balance = Number((wallet as any)?.balance ?? 0);
  const vipActive = profile?.vip_until && new Date(profile.vip_until as any) > new Date();

  const equippedIds: Record<Cosmetic["kind"], string | null> = {
    title:  (profile as any)?.equipped_title_id ?? null,
    frame:  (profile as any)?.equipped_frame_id ?? null,
    banner: (profile as any)?.equipped_banner_id ?? null,
    emote:  null,
    dice_skin: (profile as any)?.equipped_dice_skin_id ?? null,
  };

  const grouped = useMemo(() => {
    const m: Record<string, Cosmetic[]> = { title: [], frame: [], banner: [], emote: [], dice_skin: [] };
    for (const c of catalog.data ?? []) m[c.kind]?.push(c);
    return m;
  }, [catalog.data]);

  async function buy(c: Cosmetic) {
    try {
      const { error } = await supabase.rpc("buy_cosmetic_tx" as any, { _cosmetic_id: c.id });
      if (error) throw error;
      toast.success(`Unlocked ${c.name}`);
      qc.invalidateQueries({ queryKey: ["my-cosmetics"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e: any) {
      const msg = String(e.message ?? "");
      if (/insufficient/i.test(msg)) toast.error("Not enough DICE for this cosmetic.");
      else if (/vip only/i.test(msg)) toast.error("This item is VIP-only.");
      else if (/already owned/i.test(msg)) toast.error("You already own this item.");
      else toast.error(msg || "Purchase failed");
    }
  }

  async function equip(c: Cosmetic) {
    try {
      const { error } = await supabase.rpc("equip_cosmetic_tx" as any, { _cosmetic_id: c.id });
      if (error) throw error;
      toast.success(`Equipped ${c.name}`);
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["equipped-cosmetics"] });
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
  }

  async function unequip(kind: Cosmetic["kind"]) {
    try {
      const { error } = await supabase.rpc("unequip_cosmetic_tx" as any, { _kind: kind });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["equipped-cosmetics"] });
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
  }

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <Card className="glass p-5">
        <div className="flex items-center gap-3">
          <Palette className="size-8 text-primary" />
          <div className="flex-1">
            <h1 className="font-display text-3xl font-bold">Cosmetics</h1>
            <p className="text-sm text-muted-foreground">Titles, avatar frames, banners, chat emotes and dice skins. Purely visual — no gameplay advantage.</p>
          </div>
          <div className="text-right text-sm">
            <div className="text-xs text-muted-foreground">Balance</div>
            <div className="font-display text-xl flex items-center gap-1 justify-end"><Coins className="size-4 text-primary" />{fmt(balance)}</div>
          </div>
        </div>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Cosmetic["kind"])}>
        <TabsList className="w-full flex-wrap h-auto">
          {KIND_ORDER.map((k) => (
            <TabsTrigger key={k} value={k} className="flex-1 min-w-[110px]">{KIND_LABEL[k]}</TabsTrigger>
          ))}
        </TabsList>

        {KIND_ORDER.map((k) => (
          <TabsContent key={k} value={k} className="mt-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(grouped[k] ?? []).map((c) => {
                const isOwned = owned.data?.has(c.id) ?? false;
                const isEquipped = equippedIds[k] === c.id;
                const canAfford = balance >= c.price_dice;
                const vipBlocked = c.vip_only && !vipActive;
                return (
                  <Card key={c.id} className={`glass p-4 flex flex-col gap-3 border ${RARITY_COLOR[c.rarity]}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-display font-semibold flex items-center gap-1.5">
                          {c.name}
                          {c.vip_only && <Crown className="size-3.5 text-amber-300" />}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider opacity-70">{c.rarity}</div>
                      </div>
                      {isEquipped && <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/20 text-primary"><Check className="size-3" />Equipped</span>}
                    </div>

                    <CosmeticPreview c={c} />

                    <div className="flex items-center justify-between mt-auto pt-2">
                      <div className="text-sm inline-flex items-center gap-1">
                        <Coins className="size-3.5 text-primary" />
                        {c.price_dice > 0 ? fmt(c.price_dice) : (c.vip_only ? "VIP reward" : "Free")}
                      </div>
                      {isOwned ? (
                        c.kind === "emote" ? (
                          <span className="text-xs text-muted-foreground">Owned · use <code>{c.meta?.code}</code></span>
                        ) : isEquipped ? (
                          <Button size="sm" variant="outline" onClick={() => unequip(k)}>Unequip</Button>
                        ) : (
                          <Button size="sm" onClick={() => equip(c)}>Equip</Button>
                        )
                      ) : (
                        <Button size="sm" onClick={() => buy(c)} disabled={vipBlocked || !canAfford}>
                          {vipBlocked ? "VIP only" : !canAfford ? "Not enough" : "Unlock"}
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
              {catalog.isLoading && <div className="col-span-full text-sm text-muted-foreground py-6 text-center">Loading catalog…</div>}
              {!catalog.isLoading && !(grouped[k] ?? []).length && <div className="col-span-full text-sm text-muted-foreground py-6 text-center">No items yet.</div>}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <p className="text-xs text-muted-foreground">Cosmetics are purely visual and do not affect wagering, odds or payouts.</p>
    </div>
  );
}

function CosmeticPreview({ c }: { c: Cosmetic }) {
  if (c.kind === "title") return <div className="flex items-center gap-2"><TitleBadge title={c} /><span className="text-xs text-muted-foreground">appears next to your name</span></div>;
  if (c.kind === "banner") return <div className="h-16 rounded-md border border-white/10" style={bannerStyle(c)} />;
  if (c.kind === "frame") return (
    <div className={`size-16 rounded-full bg-gradient-to-br from-primary/40 to-fuchsia-500/30 grid place-items-center ${frameClasses(c)}`}>
      <Sparkles className="size-6 opacity-80" />
    </div>
  );
  if (c.kind === "emote") return (
    <div className="flex items-center gap-2">
      <span className="text-3xl">{c.meta?.emoji}</span>
      <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded">{c.meta?.code}</code>
    </div>
  );
  if (c.kind === "dice_skin") {
    const color = String(c.meta?.color ?? "#ef4444");
    const pip = String(c.meta?.pip ?? "#fff");
    const bg = color.startsWith("linear-gradient") ? color : color;
    return (
      <div className="size-16 rounded-lg grid place-items-center shadow-inner" style={{ background: bg }}>
        <span className="size-3 rounded-full" style={{ background: pip }} />
      </div>
    );
  }
  return null;
}
