import Constants from "expo-constants";
import { AppState, type AppStateStatus } from "react-native";

import { loadSettings, saveMonitoringStatus } from "./settings";
import type { AppSettings, HeartbeatDiagnostic, MonitoringStatus } from "./types";

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

export interface HeartbeatResult {
  status: MonitoringStatus;
  diagnostic: HeartbeatDiagnostic | null;
}

export async function sendHeartbeat(settings: AppSettings): Promise<HeartbeatResult> {
  if (!isConfigured(settings)) {
    return {
      status: {
        configured: false,
        lastHeartbeatAt: null,
        lastHeartbeatOk: null,
        lastHeartbeatError: null,
      },
      diagnostic: null,
    };
  }

  if (heartbeatInFlight) {
    return {
      status: {
        configured: true,
        lastHeartbeatAt: null,
        lastHeartbeatOk: null,
        lastHeartbeatError: "Envio anterior ainda em andamento.",
      },
      diagnostic: null,
    };
  }

  if (!BASE) {
    return {
      status: {
        configured: true,
        lastHeartbeatAt: new Date().toISOString(),
        lastHeartbeatOk: false,
        lastHeartbeatError: "EXPO_PUBLIC_BACKEND_URL não configurada.",
      },
      diagnostic: null,
    };
  }

  heartbeatInFlight = true;
  const timestamp = new Date().toISOString();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    // Heartbeat goes through the backend proxy so it works identically on the
    // web preview (browser CORS) and on native devices. The backend performs a
    // GET request to `<server_url>?codigo=<tv_code>`, matching the API
    // documented at https://falacom.com.br/tv-monitor/api/heartbeat.php.
    const response = await fetch(`${BASE}/api/monitor/heartbeat`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        server_url: settings.monitorServerUrl.trim(),
        tv_code: settings.monitorTvCode,
        status: "online",
        timestamp,
        app_version: appVersion(),
      }),
      signal: controller.signal,
    });
    let body: {
      ok?: boolean;
      error?: string;
      status_code?: number;
      response_snippet?: string;
      method?: string;
      request_url?: string;
      codigo_sent?: string;
      codigo_raw_length?: number;
      codigo_clean_length?: number;
    } | null = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const diagnostic: HeartbeatDiagnostic = {
      method: body?.method ?? "GET",
      requestUrl: body?.request_url ?? null,
      codigoSent: body?.codigo_sent ?? null,
      codigoRawLength: body?.codigo_raw_length ?? null,
      codigoCleanLength: body?.codigo_clean_length ?? null,
      responseStatus: body?.status_code ?? response.status,
      responseSnippet: body?.response_snippet ?? null,
    };
    if (!response.ok) {
      throw new Error(body?.error ?? `Servidor respondeu HTTP ${response.status}.`);
    }
    if (body?.ok === false) {
      const err = new Error(
        body.error ?? `Servidor de monitoramento respondeu HTTP ${body.status_code ?? "?"}.`,
      );
      (err as Error & { diagnostic?: HeartbeatDiagnostic }).diagnostic = diagnostic;
      throw err;
    }
    const status: MonitoringStatus = {
      configured: true,
      lastHeartbeatAt: timestamp,
      lastHeartbeatOk: true,
      lastHeartbeatError: null,
    };
    await saveMonitoringStatus(status);
    return { status, diagnostic };
  } catch (error) {
    const attached = (error as Error & { diagnostic?: HeartbeatDiagnostic }).diagnostic ?? null;
    const status: MonitoringStatus = {
      configured: true,
      lastHeartbeatAt: timestamp,
      lastHeartbeatOk: false,
      lastHeartbeatError: error instanceof Error ? error.message : "Falha ao enviar heartbeat.",
    };
    await saveMonitoringStatus(status);
    return { status, diagnostic: attached };
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

export async function sendTestHeartbeat(): Promise<HeartbeatResult> {
  const settings = await loadSettings();
  return sendHeartbeat(settings);
}
