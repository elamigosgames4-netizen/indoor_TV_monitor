import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";

import type { PlaylistItem } from "./types";

export function driveDownloadUrl(fileId: string): string {
  // Direct download of a public Drive file, no API key, works for large videos
  return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
}

// The new expo-file-system API has no web implementation (constructors throw),
// so directories/files are only materialized on native platforms.
let MEDIA_DIR: Directory | null = null;
let TMP_DIR: Directory | null = null;

function getMediaDir(): Directory | null {
  if (Platform.OS === "web") return null;
  if (!MEDIA_DIR) {
    MEDIA_DIR = new Directory(Paths.document, "indoor-media");
  }
  try {
    if (!MEDIA_DIR.exists) MEDIA_DIR.create({ intermediates: true });
  } catch {
    // already exists / race
  }
  return MEDIA_DIR;
}

function getTmpDir(): Directory | null {
  if (Platform.OS === "web") return null;
  if (!TMP_DIR) {
    TMP_DIR = new Directory(Paths.cache, "indoor-tmp");
  }
  try {
    if (!TMP_DIR.exists) TMP_DIR.create({ intermediates: true });
  } catch {
    // already exists / race
  }
  return TMP_DIR;
}

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_");
}

export function fileFor(name: string): File | null {
  const dir = getMediaDir();
  if (!dir) return null;
  return new File(dir, safeName(name));
}

export async function downloadMedia(item: PlaylistItem): Promise<{ ok: boolean; error?: string }> {
  const mediaDir = getMediaDir();
  const tmpDir = getTmpDir();
  if (!mediaDir || !tmpDir) {
    return { ok: false, error: "downloads indisponíveis nesta plataforma" };
  }
  const dest = fileFor(item.name);
  const tmp = new File(tmpDir, safeName(item.name));
  try {
    if (tmp.exists) tmp.delete();
    await File.downloadFileAsync(driveDownloadUrl(item.fileId), tmp, { idempotent: true });
    if (!tmp.exists || tmp.size === 0) {
      return { ok: false, error: "download vazio" };
    }
    if (dest?.exists) dest.delete();
    await tmp.move(mediaDir);
    return { ok: true };
  } catch (e) {
    try {
      if (tmp.exists) tmp.delete();
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
