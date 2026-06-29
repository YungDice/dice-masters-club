import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Images, Upload, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/dice/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/dice/PageHeader";
import { toast } from "sonner";

export const Route = createFileRoute("/gallery")({
  head: () => ({ meta: [{ title: "Gallery — DICE" }] }),
  component: () => <AppShell><GalleryPage /></AppShell>,
});

type Item = { id: string; user_id: string; media_url: string; media_path: string; media_kind: string; caption: string | null; created_at: string };

async function signedUrl(path: string) {
  const { data } = await supabase.storage.from("gallery").createSignedUrl(path, 60 * 60 * 6);
  return data?.signedUrl ?? "";
}

function GalleryPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);

  const all = useQuery({
    queryKey: ["gallery", "all"],
    queryFn: async () => {
      const { data } = await supabase.from("gallery_items").select("*").eq("is_public", true).order("created_at", { ascending: false }).limit(60);
      const list = (data ?? []) as Item[];
      const withUrls = await Promise.all(list.map(async (i) => ({ ...i, _url: await signedUrl(i.media_path) })));
      const ids = list.map((i) => i.user_id);
      const { data: profs } = ids.length ? await supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", ids) : { data: [] };
      const m = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
      return withUrls.map((i) => ({ ...i, user: m[i.user_id] }));
    },
  });

  const mine = useQuery({
    queryKey: ["gallery", "mine", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("gallery_items").select("*").eq("user_id", user!.id).order("created_at", { ascending: false });
      const list = (data ?? []) as Item[];
      return await Promise.all(list.map(async (i) => ({ ...i, _url: await signedUrl(i.media_path) })));
    },
  });

  useEffect(() => {
    const ch = supabase.channel("gallery").on("postgres_changes", { event: "*", schema: "public", table: "gallery_items" }, () => qc.invalidateQueries({ queryKey: ["gallery"] })).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  async function upload(file: File) {
    if (!user) return;
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) return toast.error("Images and videos only");
    if (file.size > 50 * 1024 * 1024) return toast.error("Max 50 MB");
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || (file.type.startsWith("video") ? "mp4" : "jpg");
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("gallery").upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const url = await signedUrl(path);
      await supabase.from("gallery_items").insert({
        user_id: user.id, media_url: url, media_path: path, media_kind: file.type,
        caption: caption.trim() || null, is_public: true,
      });
      setCaption("");
      toast.success("Uploaded!");
      qc.invalidateQueries({ queryKey: ["gallery"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function remove(item: Item) {
    if (!confirm("Delete this upload?")) return;
    await supabase.storage.from("gallery").remove([item.media_path]);
    await supabase.from("gallery_items").delete().eq("id", item.id);
    qc.invalidateQueries({ queryKey: ["gallery"] });
    toast.success("Deleted");
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Images}
        title="Gallery"
        subtitle="Post photos and videos. They feed into DikDok too."
        accent="violet"
      />

      <Card className="glass p-5">
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <Input placeholder="Caption (optional)" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={200} className="flex-1" />
          <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="glow-red"><Upload className="size-4 mr-1" />{uploading ? "Uploading..." : "Upload"}</Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">Be respectful. No explicit, harassing, or illegal content. You can delete your uploads at any time.</p>
      </Card>

      <Tabs defaultValue="all">
        <TabsList><TabsTrigger value="all">Everyone</TabsTrigger><TabsTrigger value="mine">Mine</TabsTrigger></TabsList>
        <TabsContent value="all">
          <Grid items={all.data ?? []} />
        </TabsContent>
        <TabsContent value="mine">
          <Grid items={(mine.data ?? []).map((i) => ({ ...i, user: null }))} mine onRemove={remove} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Grid({ items, mine, onRemove }: { items: any[]; mine?: boolean; onRemove?: (i: any) => void }) {
  if (!items.length) return <p className="text-sm text-muted-foreground text-center py-10">Nothing here yet.</p>;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {items.map((i) => (
        <Card key={i.id} className="glass overflow-hidden">
          <div className="aspect-square bg-black grid place-items-center">
            {i.media_kind?.startsWith("video")
              ? <video src={i._url} className="w-full h-full object-cover" muted playsInline />
              : <img src={i._url} className="w-full h-full object-cover" alt={i.caption ?? ""} />}
          </div>
          <div className="p-2">
            {i.caption && <div className="text-xs line-clamp-2">{i.caption}</div>}
            {i.user && <div className="text-[10px] text-muted-foreground mt-1">@{i.user.username}</div>}
            {mine && onRemove && <Button size="sm" variant="ghost" className="mt-1 w-full" onClick={() => onRemove(i)}><Trash2 className="size-3 mr-1" />Delete</Button>}
          </div>
        </Card>
      ))}
    </div>
  );
}
