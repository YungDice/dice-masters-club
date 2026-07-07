// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

const MAX_MEDIA_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * Makes the UI's media-size check authoritative at selection time. A cached
 * owner query can still be loading when a file picker returns, so large files
 * are rechecked against the current user's user_roles row before rejection.
 */
function ownerRoleMediaUploadPlugin() {
  const ownerRoleHelper = `
const MAX_MEDIA_UPLOAD_BYTES = ${MAX_MEDIA_UPLOAD_BYTES};

async function userHasOwnerRole(userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "owner")
    .maybeSingle();

  return !error && Boolean(data);
}
`;

  const profileMediaFormatHelper = `
function profileMediaUploadFormat(blob: Blob) {
  const isAnimatedGif = blob.type === "image/gif";
  return {
    extension: isAnimatedGif ? "gif" : "jpg",
    contentType: isAnimatedGif ? "image/gif" : "image/jpeg",
  };
}
`;

  return {
    name: "owner-role-media-upload-limit",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      const sourcePath = id.split("?", 1)[0].replaceAll("\\", "/");

      if (sourcePath.endsWith("/src/routes/settings.tsx")) {
        const withHelpers = code.replace(
          "const BIO_MAX = 200;",
          `const BIO_MAX = 200;${ownerRoleHelper}${profileMediaFormatHelper}`,
        );

        const updated = withHelpers
          .replace(
            'if (!isOwner && file.size > 8 * 1024 * 1024) return toast.error("Max 8MB");',
            'if (file.size > MAX_MEDIA_UPLOAD_BYTES && !(isOwner || await userHasOwnerRole(user.id))) return toast.error("Max 8MB");',
          )
          .replaceAll(
            'if (!isOwner && f.size > 8 * 1024 * 1024) return toast.error("Max 8MB");',
            'if (f.size > MAX_MEDIA_UPLOAD_BYTES && !(isOwner || await userHasOwnerRole(user.id))) return toast.error("Max 8MB");',
          )
          .replace(
            'const path = `${user.id}/avatar-${Date.now()}.jpg`;\n    const up = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType: "image/jpeg" });',
            'const media = profileMediaUploadFormat(blob);\n    const path = `${user.id}/avatar-${Date.now()}.${media.extension}`;\n    const up = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType: media.contentType });',
          )
          .replace(
            'const path = `${user.id}/banner-${Date.now()}.jpg`;\n    const up = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType: "image/jpeg" });',
            'const media = profileMediaUploadFormat(blob);\n    const path = `${user.id}/banner-${Date.now()}.${media.extension}`;\n    const up = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType: media.contentType });',
          )
          .replace(
            'const path = `${user.id}/profile-bg-${Date.now()}.jpg`;\n    const up = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType: "image/jpeg" });',
            'const media = profileMediaUploadFormat(blob);\n    const path = `${user.id}/profile-bg-${Date.now()}.${media.extension}`;\n    const up = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType: media.contentType });',
          );

        return updated === code ? null : { code: updated, map: null };
      }

      if (sourcePath.endsWith("/src/components/dice/ChatPopover.tsx")) {
        const withHelper = code.replace(
          'const LAST_SEEN_KEY = "dice:chat:last_seen_at";',
          `const LAST_SEEN_KEY = "dice:chat:last_seen_at";${ownerRoleHelper}`,
        );

        const updated = withHelper.replace(
          'if (file.size > 8 * 1024 * 1024) { toast.error("Max 8MB"); return; }',
          'if (file.size > MAX_MEDIA_UPLOAD_BYTES && !(await userHasOwnerRole(user.id))) { toast.error("Max 8MB"); return; }',
        );

        return updated === code ? null : { code: updated, map: null };
      }

      return null;
    },
  };
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [mcpPlugin(), ownerRoleMediaUploadPlugin()],
  },
});
