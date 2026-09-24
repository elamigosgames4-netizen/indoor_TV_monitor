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
  syncIntervalMin: number;
  rotation: Rotation;
  autostart: boolean;
  monitorTvCode: string;
  monitorServerUrl: string;
  monitorIntervalSec: number;
}

export interface MonitoringStatus {
  configured: boolean;
  lastHeartbeatAt: string | null;
  lastHeartbeatOk: boolean | null;
  lastHeartbeatError: string | null;
}

export interface HeartbeatDiagnostic {
  method: string;
  requestUrl: string | null;
  codigoSent: string | null;
  codigoRawLength: number | null;
  codigoCleanLength: number | null;
  responseStatus: number | null;
  responseSnippet: string | null;
}

export interface SyncStatus {
  lastSyncAt: string | null;
  lastSyncOk: boolean;
  errors: string[];
}
