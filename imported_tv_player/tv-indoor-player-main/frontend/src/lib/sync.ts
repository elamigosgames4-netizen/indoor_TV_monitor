import { Platform } from "react-native";

import { resolveFolder } from "./backend";
import { formatDateTimeBr } from "./format";
import { deleteMedia, downloadMedia, fileFor } from "./media";
import { loadSyncStatus, saveSyncStatus } from "./settings";
import type { AppSettings, LocalMedia, SyncStatus } from "./types";

export interface SyncOutcome {
  ok: boolean;
  changed: boolean;
  playlist: LocalMedia[] | null; // validated new playlist; null = keep the current one
  downloaded: number;
  removed: number;
  error: string | null;
}

function differs(a: LocalMedia[], b: LocalMedia[]): boolean {
  if (a.length !== b.length) return true;
  return a.some((m, i) => m.fileId !== b[i].fileId || m.name !== b[i].name);
}

// Diff is by (name -> fileId): Google Drive gives a replaced file a NEW file id,
// so content changes are detected even when the name stays the same.
export async function syncNow(
  settings: AppSettings,
  currentManifest: LocalMedia[],
): Promise<SyncOutcome> {
  const link = settings.folderLink.trim();
  if (!link) {
    return { ok: false, changed: false, playlist: null, downloaded: 0, removed: 0, error: "Nenhum link configurado" };
  }
  try {
    const resolved = await resolveFolder(link);
    if (resolved.items.length === 0) {
      return {
        ok: false,
        changed: false,
        playlist: null,
        downloaded: 0,
        removed: 0,
        error: "A pasta não contém arquivos MP4, JPG, JPEG ou PNG",
      };
    }

    if (Platform.OS === "web") {
      // Web preview has no persistent file downloads: the playlist streams straight from Drive.
      const playlist = resolved.items.map((i) => ({ fileId: i.fileId, name: i.name, type: i.type }));
      return { ok: true, changed: differs(currentManifest, playlist), playlist, downloaded: 0, removed: 0, error: null };
    }

    const byName = new Map(currentManifest.map((m) => [m.name, m]));
    const errors: string[] = [];
    let downloaded = 0;

    for (const item of resolved.items) {
      const local = fileFor(item.name);
      const hasLocal = Boolean(local) && local!.exists && local!.size > 0;
      if (!hasLocal || byName.get(item.name)?.fileId !== item.fileId) {
        const res = await downloadMedia(item);
        if (res.ok) downloaded += 1;
        else errors.push(`${item.name}: ${res.error ?? "falha no download"}`);
      }
    }

    const remoteNames = new Set(resolved.items.map((i) => i.name));
    let removed = 0;
    for (const m of currentManifest) {
      if (!remoteNames.has(m.name)) {
        await deleteMedia(m.name);
        removed += 1;
      }
    }

    // Only validated files (existing locally, with content) join the playlist
    const validItems: LocalMedia[] = [];
    for (const item of resolved.items) {
      const f = fileFor(item.name);
      if (f && f.exists && f.size > 0) validItems.push({ fileId: item.fileId, name: item.name, type: item.type });
    }
    if (validItems.length === 0) {
      return {
        ok: false,
        changed: false,
        playlist: null,
        downloaded,
        removed,
        error: errors[0] ?? "Nenhum arquivo válido após a sincronização",
      };
    }

    return {
      ok: true,
      changed: differs(currentManifest, validItems),
      playlist: validItems,
      downloaded,
      removed,
      error: errors.length > 0 ? `${errors.length} arquivo(s) com falha. ${errors[0]}` : null,
    };
  } catch (e) {
    return {
      ok: false,
      changed: false,
      playlist: null,
      downloaded: 0,
      removed: 0,
      error: e instanceof Error ? e.message : "Falha ao conectar ao servidor",
    };
  }
}

export async function recordSyncOutcome(outcome: SyncOutcome): Promise<SyncStatus> {
  const prev = await loadSyncStatus();
  const nowIso = new Date().toISOString();
  const newErrors = [...prev.errors];
  if (outcome.error) {
    newErrors.unshift(`${formatDateTimeBr(nowIso)} — ${outcome.error}`);
  }
  const st: SyncStatus = {
    lastSyncAt: nowIso,
    lastSyncOk: outcome.ok && !outcome.error,
    errors: newErrors.slice(0, 5),
  };
  await saveSyncStatus(st);
  return st;
}
