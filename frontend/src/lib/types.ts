export type MediaType = "video" | "photo";

export type Rotation = "0" | "90" | "-90" | "180";

export interface PlaylistItem {
  fileId: string;
  name: string;
  ext: string;
  type: MediaType;
}

export interface ResolvedFolder {
  folderId: string;
  items: PlaylistItem[];
  source: string;
  cached: boolean;
}

export interface LocalMedia {
  fileId: string;
  name: string;
  type: MediaType;
}

export interface AppSettings {
  deviceName: string;
  folderLink: string;
  photoDurationSec: number;
  rotation: Rotation;
  autostart: boolean;
}

export interface SyncStatus {
  lastSyncAt: string | null;
  lastSyncOk: boolean;
  errors: string[];
}
