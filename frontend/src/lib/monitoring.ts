import Constants from "expo-constants";
import { AppState, type AppStateStatus } from "react-native";

import { loadSettings, saveMonitoringStatus } from "./settings";
import type { AppSettings, MonitoringStatus } from "./types";

const REQUEST_TIMEOUT_MS = 20_000;
const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

let timer: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: { remove: () => void } | null = null;
let activeSettings: AppSettings | null = null;
let heartbeatInFlight = false;

export function appVersion(): string {
  return Constants.expoConfig?.version ?? "1.0.0";
}

function isConfigured(settings: AppSettings): boolean {
  return Boolean(settings.monitorTvCode.trim() && settings.monitorServerUrl.trim());
}

export async function sendHeartbeat(settings: AppSettings): Promise<MonitoringStatus> {
  if (!isConfigured(settings)) {
    return {
      configured: false,
      lastHeartbeatAt: null,
      lastHeartbeatOk: null,
      lastHeartbeatError: null,
    };
  }

  if (heartbeatInFlight) {
    return {
      configured: true,
      lastHeartbeatAt: null,
      lastHeartbeatOk: null,
      lastHeartbeatError: "Envio anterior ainda em andamento.",
    };
  }

  if (!BASE) {
    return {
      configured: true,
      lastHeartbeatAt: new Date().toISOString(),
      lastHeartbeatOk: false,
      lastHeartbeatError: "EXPO_PUBLIC_BACKEND_URL não configurada.",
    };
  }

  heartbeatInFlight = true;
  const timestamp = new Date().toISOString();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    // Heartbeat goes through the backend proxy so it works identically on the
    // web preview (browser CORS) and on native devices.
    const response = await fetch(`${BASE}/api/monitor/heartbeat`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        server_url: settings.monitorServerUrl.trim(),
        tv_code: settings.monitorTvCode.trim(),
        status: "online",
        timestamp,
        app_version: appVersion(),
      }),
      signal: controller.signal,
    });
    let body: { ok?: boolean; error?: string; status_code?: number } | null = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) {
      throw new Error(body?.error ?? `Servidor respondeu HTTP ${response.status}.`);
    }
    if (body?.ok === false) {
      throw new Error(body.error ?? `Servidor de monitoramento respondeu HTTP ${body.status_code ?? "?"}.`);
    }
    const status: MonitoringStatus = {
      configured: true,
      lastHeartbeatAt: timestamp,
      lastHeartbeatOk: true,
      lastHeartbeatError: null,
    };
    await saveMonitoringStatus(status);
    return status;
  } catch (error) {
    const status: MonitoringStatus = {
      configured: true,
      lastHeartbeatAt: timestamp,
      lastHeartbeatOk: false,
      lastHeartbeatError: error instanceof Error ? error.message : "Falha ao enviar heartbeat.",
    };
    await saveMonitoringStatus(status);
    return status;
  } finally {
    clearTimeout(timeoutId);
    heartbeatInFlight = false;
  }
}

function handleAppStateChange(nextState: AppStateStatus) {
  if (nextState === "active" && activeSettings) void sendHeartbeat(activeSettings);
}

export function startMonitoring(settings: AppSettings): void {
  stopMonitoring();
  activeSettings = settings;
  void sendHeartbeat(settings);
  timer = setInterval(() => {
    if (activeSettings) void sendHeartbeat(activeSettings);
  }, Math.max(5, settings.monitorIntervalSec) * 1000);
  appStateSubscription = AppState.addEventListener("change", handleAppStateChange);
}

export function restartMonitoring(settings: AppSettings): void {
  startMonitoring(settings);
}

export function stopMonitoring(): void {
  if (timer) clearInterval(timer);
  timer = null;
  appStateSubscription?.remove();
  appStateSubscription = null;
  activeSettings = null;
}

export async function sendTestHeartbeat(): Promise<MonitoringStatus> {
  const settings = await loadSettings();
  return sendHeartbeat(settings);
}