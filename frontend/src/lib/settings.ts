import { storage } from "@/src/utils/storage";

import type { AppSettings, LocalMedia, Rotation, SyncStatus } from "./types";

const K = {
  deviceName: "@indoor/deviceName",
  folderLink: "@indoor/folderLink",
  photoDurationSec: "@indoor/photoDurationSec",
  rotation: "@indoor/rotation",
  autostart: "@indoor/autostart",
  manifest: "@indoor/manifest",
  lastSyncAt: "@indoor/lastSyncAt",
  lastSyncOk: "@indoor/lastSyncOk",
  errors: "@indoor/errors",
};

export const defaultSettings: AppSettings = {
  deviceName: "Player 1",
  folderLink: "",
  photoDurationSec: 10,
  rotation: "0",
  autostart: true,
};

const ROTATION_VALUES: Rotation[] = ["0", "90", "-90", "180"];

function isLocalMedia(m: unknown): m is LocalMedia {
  if (!m || typeof m !== "object") return false;
  const item = m as Partial<LocalMedia>;
  return (
    typeof item.fileId === "string" &&
    typeof item.name === "string" &&
    (item.type === "video" || item.type === "photo")
  );
}

export async function loadSettings(): Promise<AppSettings> {
  const deviceName = await storage.getItem<string>(K.deviceName, defaultSettings.deviceName);
  const folderLink = await storage.getItem<string>(K.folderLink, "");
  const storedDuration = await storage.getItem<number>(K.photoDurationSec, defaultSettings.photoDurationSec);
  const storedRotation = await storage.getItem<string>(K.rotation, defaultSettings.rotation);
  const autostart = await storage.getItem<boolean>(K.autostart, defaultSettings.autostart);
  return {
    deviceName: typeof deviceName === "string" && deviceName ? deviceName : "Player 1",
    folderLink: typeof folderLink === "string" ? folderLink : "",
    photoDurationSec:
      typeof storedDuration === "number" && storedDuration >= 1 ? Math.round(storedDuration) : 10,
    rotation: ROTATION_VALUES.includes(storedRotation as Rotation) ? (storedRotation as Rotation) : "0",
    autostart: autostart !== false,
  };
}

export async function saveSettings(s: AppSettings): Promise<void> {
  await Promise.all([
    storage.setItem(K.deviceName, s.deviceName.trim() || "Player 1"),
    storage.setItem(K.folderLink, s.folderLink.trim()),
    storage.setItem(K.photoDurationSec, s.photoDurationSec),
    storage.setItem(K.rotation, s.rotation),
    storage.setItem(K.autostart, s.autostart),
  ]);
}

export async function loadManifest(): Promise<LocalMedia[]> {
  try {
    const raw = await storage.getItem<string>(K.manifest, "");
    if (raw === "" || raw === null) return [];
    // storage.retrieve always JSON.parses, so arrays come back already parsed at runtime
    const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLocalMedia);
  } catch {
    return [];
  }
}

export async function saveManifest(items: LocalMedia[]): Promise<void> {
  await storage.setItem(K.manifest, JSON.stringify(items));
}

export async function loadSyncStatus(): Promise<SyncStatus> {
  const lastSyncAt = await storage.getItem<string>(K.lastSyncAt, "");
  const lastSyncOk = await storage.getItem<boolean>(K.lastSyncOk, true);
  const errorsRaw = await storage.getItem<string>(K.errors, "");
  return {
    lastSyncAt: lastSyncAt || null,
    lastSyncOk: lastSyncOk !== false,
    errors: errorsRaw ? errorsRaw.split("\n").filter(Boolean) : [],
  };
}

export async function saveSyncStatus(st: SyncStatus): Promise<void> {
  await Promise.all([
    storage.setItem(K.lastSyncAt, st.lastSyncAt ?? ""),
    storage.setItem(K.lastSyncOk, st.lastSyncOk),
    storage.setItem(K.errors, st.errors.slice(0, 5).join("\n")),
  ]);
}
