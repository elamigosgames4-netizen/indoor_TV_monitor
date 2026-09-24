import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";

import type { PlaylistItem } from "./types";

export function driveDownloadUrl(fileId: string): string {
  // Direct download of a public Drive file, no API key, works for large videos
  return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
}

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_");
}

// The new expo-file-system API has no web implementation (constructors throw),
// so files are only materialized on native platforms.
// Media is stored in the persistent document directory (survives reboots and
// system cache cleanups). The directory is (re)created on every access with
// idempotent+intermediates so a missing folder can never cause an ENOENT.
function ensureMediaDir(): Directory | null {
  if (Platform.OS === "web") return null;
  const dir = new Directory(Paths.document, "indoor-media");
  try {
    dir.create({ intermediates: true, idempotent: true });
  } catch {
    // idempotent should not throw; ignore any residual race
  }
  return dir;
}

export function fileFor(name: string): File | null {
  const dir = ensureMediaDir();
  if (!dir) return null;
  return new File(dir, safeName(name));
}

export async function downloadMedia(item: PlaylistItem): Promise<{ ok: boolean; error?: string }> {
  const dir = ensureMediaDir();
  if (!dir) {
    return { ok: false, error: "downloads indisponíveis nesta plataforma" };
  }
  const dest = new File(dir, safeName(item.name));
  try {
    if (dest.exists) dest.delete();
    // Downloads straight into the persistent media directory (which we just ensured exists)
    await File.downloadFileAsync(driveDownloadUrl(item.fileId), dest, { idempotent: true });
    if (!dest.exists || dest.size === 0) {
      if (dest.exists) dest.delete();
      return { ok: false, error: "download vazio" };
    }
    return { ok: true };
  } catch (e) {
    try {
      if (dest.exists) dest.delete();
    } catch {
      // ignore cleanup errors
    }
    return { ok: false, error: e instanceof Error ? e.message : "falha no download" };
  }
}

export async function deleteMedia(name: string): Promise<void> {
  try {
    const f = fileFor(name);
    if (f?.exists) f.delete();
  } catch {
    // ignore
  }
}

export function localUriFor(name: string): string | null {
  try {
    const f = fileFor(name);
    return f && f.exists && f.size > 0 ? f.uri : null;
  } catch {
    return null;
  }
}
