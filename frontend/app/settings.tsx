import { useCallback, useState } from "react";
import { ActivityIndicator, Switch, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FocusablePressable } from "@/src/components/FocusablePressable";
import { resolveFolder } from "@/src/lib/backend";
import { formatDateTimeBr } from "@/src/lib/format";
import { appVersion, restartMonitoring, sendHeartbeat } from "@/src/lib/monitoring";
import {
  defaultSettings,
  loadManifest,
  loadMonitoringStatus,
  loadSettings,
  loadSyncStatus,
  saveManifest,
  saveSettings,
} from "@/src/lib/settings";
import { recordSyncOutcome, syncNow } from "@/src/lib/sync";
import type { AppSettings, LocalMedia, MonitoringStatus, Rotation, SyncStatus } from "@/src/lib/types";
import { makeStyles, useTheme } from "@/src/theme";

const ROTATIONS: { value: Rotation; label: string; id: string }[] = [
  { value: "0", label: "0°", id: "0" },
  { value: "90", label: "90°", id: "90" },
  { value: "-90", label: "−90°", id: "neg-90" },
  { value: "180", label: "180°", id: "180" },
];

type Message = { kind: "success" | "error"; text: string };

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();

  const [form, setForm] = useState<AppSettings>(defaultSettings);
  const [durationText, setDurationText] = useState("10");
  const [intervalText, setIntervalText] = useState("1");
  const [monitorIntervalText, setMonitorIntervalText] = useState("20");
  const [manifest, setManifest] = useState<LocalMedia[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ lastSyncAt: null, lastSyncOk: true, errors: [] });
  const [monitorStatus, setMonitorStatus] = useState<MonitoringStatus>({
    configured: false,
    lastHeartbeatAt: null,
    lastHeartbeatOk: null,
    lastHeartbeatError: null,
  });
  const [busy, setBusy] = useState<"save" | "sync" | "monitor" | "test" | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [s, m, st, monitor] = await Promise.all([
          loadSettings(),
          loadManifest(),
          loadSyncStatus(),
          loadMonitoringStatus(),
        ]);
        setForm(s);
        setDurationText(String(s.photoDurationSec));
        setIntervalText(String(s.syncIntervalMin));
        setMonitorIntervalText(String(s.monitorIntervalSec));
        setManifest(m);
        setSyncStatus(st);
        setMonitorStatus(monitor);
      })();
    }, []),
  );

  const handleSaveAndPlay = async () => {
    if (busy) return;
    setMessage(null);
    setBusy("save");
    const duration = Number.parseInt(durationText, 10);
    if (!Number.isFinite(duration) || duration < 1 || duration > 3600) {
      setMessage({ kind: "error", text: "Duração das fotos inválida: use um número entre 1 e 3600 segundos." });
      setBusy(null);
      return;
    }
    const interval = Number.parseInt(intervalText, 10);
    if (!Number.isFinite(interval) || interval < 1 || interval > 1440) {
      setMessage({ kind: "error", text: "Intervalo de verificação inválido: use um número entre 1 e 1440 minutos." });
      setBusy(null);
      return;
    }
    const link = form.folderLink.trim();
    if (link) {
      try {
        // validates the folder is really readable before saving
        await resolveFolder(link);
      } catch (e) {
        setMessage({ kind: "error", text: e instanceof Error ? e.message : "Falha ao ler a pasta." });
        setBusy(null);
        return;
      }
    }
    const monitorInterval = Number.parseInt(monitorIntervalText, 10);
    if (!Number.isFinite(monitorInterval) || monitorInterval < 5 || monitorInterval > 3600) {
      setMessage({ kind: "error", text: "Intervalo do monitor inválido: use um número entre 5 e 3600 segundos." });
      setBusy(null);
      return;
    }
    const monitorServerUrl = form.monitorServerUrl.trim() || defaultSettings.monitorServerUrl;
    if (!isValidHttpUrl(monitorServerUrl)) {
      setMessage({ kind: "error", text: "URL de monitoramento inválida: use uma URL http:// ou https:// completa." });
      setBusy(null);
      return;
    }
    const s: AppSettings = {
      ...form,
      folderLink: link,
      photoDurationSec: duration,
      syncIntervalMin: interval,
      monitorTvCode: form.monitorTvCode.trim(),
      monitorServerUrl,
      monitorIntervalSec: monitorInterval,
    };
    await saveSettings(s);
    restartMonitoring(s);

    const localManifest = await loadManifest();
    const outcome = await syncNow(s, localManifest);
    if (outcome.ok && outcome.playlist) {
      await saveManifest(outcome.playlist);
      await recordSyncOutcome(outcome);
      router.replace("/");
      return;
    }
    if (localManifest.length > 0) {
      // folder unreachable right now: keep the last valid local playlist playing
      await recordSyncOutcome(outcome);
      router.replace("/");
      return;
    }
    setMessage({
      kind: "error",
      text: outcome.error ?? "Não foi possível sincronizar. Verifique o link e a conexão.",
    });
    setBusy(null);
  };

  const handleSaveMonitoring = async () => {
    if (busy) return;
    setMessage(null);
    const monitorInterval = Number.parseInt(monitorIntervalText, 10);
    const serverUrl = form.monitorServerUrl.trim();
    if (!isValidHttpUrl(serverUrl)) {
      setMessage({ kind: "error", text: "Informe uma URL de monitoramento válida, começando com http:// ou https://." });
      return;
    }
    if (!Number.isFinite(monitorInterval) || monitorInterval < 5 || monitorInterval > 3600) {
      setMessage({ kind: "error", text: "Intervalo do monitor inválido: use um número entre 5 e 3600 segundos." });
      return;
    }
    setBusy("monitor");
    const nextSettings: AppSettings = {
      ...form,
      monitorTvCode: form.monitorTvCode.trim(),
      monitorServerUrl: serverUrl,
      monitorIntervalSec: monitorInterval,
    };
    await saveSettings(nextSettings);
    restartMonitoring(nextSettings);
    setForm(nextSettings);
    setMonitorStatus(await loadMonitoringStatus());
    setMessage({
      kind: "success",
      text: nextSettings.monitorTvCode ? "Monitoramento salvo e iniciado automaticamente." : "Monitoramento salvo. Informe o código da TV para iniciar os envios.",
    });
    setBusy(null);
  };

  const handleTestHeartbeat = async () => {
    if (busy) return;
    const serverUrl = form.monitorServerUrl.trim();
    const monitorInterval = Number.parseInt(monitorIntervalText, 10);
    if (!form.monitorTvCode.trim()) {
      setMessage({ kind: "error", text: "Informe o código da TV antes de testar o heartbeat." });
      return;
    }
    if (!isValidHttpUrl(serverUrl)) {
      setMessage({ kind: "error", text: "Informe uma URL de monitoramento válida antes de testar." });
      return;
    }
    if (!Number.isFinite(monitorInterval) || monitorInterval < 5 || monitorInterval > 3600) {
      setMessage({ kind: "error", text: "Intervalo do monitor inválido: use um número entre 5 e 3600 segundos." });
      return;
    }
    setBusy("test");
    const status = await sendHeartbeat({
      ...form,
      monitorTvCode: form.monitorTvCode.trim(),
      monitorServerUrl: serverUrl,
      monitorIntervalSec: monitorInterval,
    });
    setMonitorStatus(status);
    setMessage(
      status.lastHeartbeatOk
        ? { kind: "success", text: `Heartbeat enviado com sucesso — versão ${appVersion()}.` }
        : { kind: "error", text: status.lastHeartbeatError ?? "Não foi possível enviar o heartbeat." },
    );
    setBusy(null);
  };

  const handleUpdateNow = async () => {
    if (busy) return;
    setMessage(null);
    setBusy("sync");
    try {
      const link = form.folderLink.trim();
      if (!link) {
        setMessage({ kind: "error", text: "Configure o link da pasta primeiro." });
        setBusy(null);
        return;
      }
      const s: AppSettings = { ...form, folderLink: link };
      const outcome = await syncNow(s, await loadManifest());
      if (outcome.ok && outcome.playlist) {
        await saveManifest(outcome.playlist);
        setManifest(outcome.playlist);
      }
      setSyncStatus(await recordSyncOutcome(outcome));
      const m = await loadManifest();
      setManifest(m);
      setMessage(
        outcome.ok
          ? {
              kind: "success",
              text: `Sincronizado — ${m.length} arquivo(s) na playlist${outcome.downloaded ? `, ${outcome.downloaded} baixado(s)` : ""}${outcome.removed ? `, ${outcome.removed} removido(s)` : ""}`,
            }
          : { kind: "error", text: outcome.error ?? "Falha na sincronização" },
      );
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Falha na sincronização" });
    }
    setBusy(null);
  };

  const videoCount = manifest.filter((m) => m.type === "video").length;
  const photoCount = manifest.filter((m) => m.type === "photo").length;

  return (
    <KeyboardAwareScrollView
      style={styles.root}
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 24,
        gap: 8,
      }}
      bottomOffset={16}
      keyboardShouldPersistTaps="handled"
    >
      <FocusablePressable
        testID="settings-back-button"
        style={styles.backButton}
        onPress={() => router.back()}
      >
        <Text style={styles.backText}>← Voltar ao player</Text>
      </FocusablePressable>

      <Text style={styles.title}>Configurações do player</Text>

      <Text style={styles.label}>Nome do aparelho</Text>
      <TextInput
        testID="settings-name-input"
        style={styles.input}
        value={form.deviceName}
        onChangeText={(t) => setForm((f) => ({ ...f, deviceName: t }))}
        placeholder="Ex.: Loja Centro — TV 1"
        placeholderTextColor={colors.muted}
        maxLength={60}
      />

      <Text style={styles.label}>Link da pasta (tiny.cc ou Google Drive)</Text>
      <TextInput
        testID="settings-link-input"
        style={styles.input}
        value={form.folderLink}
        onChangeText={(t) => setForm((f) => ({ ...f, folderLink: t }))}
        placeholder="https://tiny.cc/exemplo ou https://drive.google.com/drive/folders/..."
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        maxLength={500}
      />
      <Text style={styles.hint}>
        Todos os arquivos MP4, JPG, JPEG e PNG direto na pasta viram a playlist, ordenados pelo nome (001, 002,
        003...). A pasta precisa estar compartilhada como &quot;Qualquer pessoa com o link&quot;.
      </Text>

      <Text style={styles.label}>Duração das fotos (segundos)</Text>
      <TextInput
        testID="settings-photo-duration-input"
        style={styles.input}
        value={durationText}
        onChangeText={setDurationText}
        keyboardType="number-pad"
        maxLength={4}
      />

      <Text style={styles.label}>Verificar novos arquivos a cada (minutos)</Text>
      <TextInput
        testID="settings-sync-interval-input"
        style={styles.input}
        value={intervalText}
        onChangeText={setIntervalText}
        keyboardType="number-pad"
        maxLength={4}
      />
      <Text style={styles.hint}>
        Enquanto o player estiver aberto e conectado, a pasta é verificada nesse intervalo. Arquivos novos entram na
        fila sem interromper o vídeo atual — começam a tocar quando a mídia atual terminar.
      </Text>

      <Text style={styles.label}>Rotação da tela</Text>
      <View style={styles.rotationRow}>
        {ROTATIONS.map((r) => {
          const selected = form.rotation === r.value;
          return (
            <FocusablePressable
              key={r.value}
              testID={`settings-rotation-${r.id}`}
              onPress={() => setForm((f) => ({ ...f, rotation: r.value }))}
              style={[styles.rotationChip, selected && styles.rotationChipSelected]}
              focusedStyle={styles.buttonFocused}
            >
              <Text style={[styles.rotationText, selected && styles.rotationTextSelected]}>{r.label}</Text>
            </FocusablePressable>
          );
        })}
      </View>
      <Text style={styles.hint}>Aplicada a fotos e vídeos, independente do sensor do aparelho.</Text>

      <View style={styles.switchRow}>
        <Text style={[styles.switchLabel, { flex: 1 }]}>Iniciar automaticamente ao ligar o aparelho</Text>
        <Switch
          testID="settings-autostart-switch"
          value={form.autostart}
          onValueChange={(v) => setForm((f) => ({ ...f, autostart: v }))}
          trackColor={{ false: colors.surfaceTertiary, true: colors.brandPrimary }}
          thumbColor={colors.onSurface}
          ios_backgroundColor={colors.surfaceTertiary}
        />
      </View>
      <Text style={styles.hint}>
        O autostart nativo (liga → abre em tela cheia → reproduz) funciona no APK instalado. Em alguns TV boxes é
        preciso ativar &quot;Início automático&quot; nas configurações do fabricante.
      </Text>

      <View style={styles.monitorCard} testID="settings-monitoring-section">
        <View style={styles.monitorHeader}>
          <View style={styles.monitorHeaderText}>
            <Text style={styles.sectionTitle}>Monitoramento</Text>
            <Text style={styles.sectionSubtitle}>Heartbeat automático enquanto o player estiver em execução</Text>
          </View>
          <View
            testID="settings-monitoring-status"
            style={[
              styles.statusPill,
              monitorStatus.lastHeartbeatOk === true
                ? styles.statusPillSuccess
                : monitorStatus.lastHeartbeatOk === false
                  ? styles.statusPillError
                  : styles.statusPillNeutral,
            ]}
          >
            <Text style={styles.statusPillText}>
              {monitorStatus.lastHeartbeatOk === true
                ? "Online"
                : monitorStatus.lastHeartbeatOk === false
                  ? "Falha"
                  : monitorStatus.configured
                    ? "Aguardando"
                    : "Não configurado"}
            </Text>
          </View>
        </View>

        <Text style={styles.label}>Código da TV</Text>
        <TextInput
          testID="settings-monitor-tv-code-input"
          style={styles.input}
          value={form.monitorTvCode}
          onChangeText={(t) => setForm((f) => ({ ...f, monitorTvCode: t }))}
          placeholder="Ex.: WEYEN_LOJA_01"
          placeholderTextColor={colors.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={80}
        />

        <Text style={styles.label}>URL do servidor de monitoramento</Text>
        <TextInput
          testID="settings-monitor-url-input"
          style={styles.input}
          value={form.monitorServerUrl}
          onChangeText={(t) => setForm((f) => ({ ...f, monitorServerUrl: t }))}
          placeholder="https://servidor.exemplo/heartbeat"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          maxLength={500}
        />

        <Text style={styles.label}>Intervalo de envio (segundos)</Text>
        <TextInput
          testID="settings-monitor-interval-input"
          style={styles.input}
          value={monitorIntervalText}
          onChangeText={setMonitorIntervalText}
          keyboardType="number-pad"
          maxLength={4}
        />
        <Text style={styles.hint}>
          Padrão: 20 segundos. O envio inclui código da TV, status online, data/hora e versão {appVersion()}.
        </Text>

        {monitorStatus.lastHeartbeatAt && (
          <Text testID="settings-monitor-last-heartbeat" style={styles.infoLine}>
            Último envio: {formatDateTimeBr(monitorStatus.lastHeartbeatAt)}
            {monitorStatus.lastHeartbeatOk === false ? " — com erro" : ""}
          </Text>
        )}
        {monitorStatus.lastHeartbeatError && (
          <Text testID="settings-monitor-error" style={styles.errorLine} numberOfLines={3}>
            {monitorStatus.lastHeartbeatError}
          </Text>
        )}

        <View style={styles.monitorActions}>
          <FocusablePressable
            testID="settings-monitor-save-button"
            onPress={handleSaveMonitoring}
            disabled={busy !== null}
            style={[styles.button, styles.monitorSaveButton, busy !== null && styles.buttonDisabled]}
            focusedStyle={styles.buttonFocused}
          >
            {busy === "monitor" ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <Text style={styles.primaryButtonText}>Salvar monitoramento</Text>
            )}
          </FocusablePressable>
          <FocusablePressable
            testID="settings-monitor-test-button"
            onPress={handleTestHeartbeat}
            disabled={busy !== null}
            style={[styles.button, busy !== null && styles.buttonDisabled]}
            focusedStyle={styles.buttonFocused}
          >
            {busy === "test" ? (
              <ActivityIndicator color={colors.onSurfaceSecondary} />
            ) : (
              <Text style={styles.buttonText}>Enviar teste agora</Text>
            )}
          </FocusablePressable>
        </View>
      </View>

      {message && (
        <View
          testID="settings-message"
          style={[styles.message, message.kind === "success" ? styles.messageSuccess : styles.messageError]}
        >
          <Text
            style={
              message.kind === "success" ? styles.messageSuccessText : styles.messageErrorText
            }
          >
            {message.text}
          </Text>
        </View>
      )}

      <FocusablePressable
        testID="settings-save-play-button"
        onPress={handleSaveAndPlay}
        disabled={busy !== null}
        style={[styles.button, styles.primaryButton, busy !== null && styles.buttonDisabled]}
        focusedStyle={styles.buttonFocused}
      >
        {busy === "save" ? (
          <ActivityIndicator color={colors.onBrandPrimary} />
        ) : (
          <Text style={styles.primaryButtonText}>Salvar e reproduzir</Text>
        )}
      </FocusablePressable>

      <FocusablePressable
        testID="settings-update-now-button"
        onPress={handleUpdateNow}
        disabled={busy !== null}
        style={[styles.button, busy !== null && styles.buttonDisabled]}
        focusedStyle={styles.buttonFocused}
      >
        {busy === "sync" ? (
          <ActivityIndicator color={colors.onSurfaceSecondary} />
        ) : (
          <Text style={styles.buttonText}>Atualizar agora</Text>
        )}
      </FocusablePressable>

      <View style={styles.infoCard} testID="settings-status-card">
        <Text style={styles.infoTitle}>Status</Text>
        <Text testID="settings-playlist-info" style={styles.infoLine}>
          Playlist atual: {manifest.length} arquivo(s) — {videoCount} vídeo(s), {photoCount} foto(s)
        </Text>
        <Text testID="settings-last-sync" style={styles.infoLine}>
          Última sincronização:{" "}
          {syncStatus.lastSyncAt
            ? `${formatDateTimeBr(syncStatus.lastSyncAt)}${syncStatus.lastSyncOk ? "" : " (com erros)"}`
            : "nunca"}
        </Text>
        {syncStatus.errors.length > 0 && (
          <View testID="settings-errors">
            <Text style={[styles.infoLine, { color: colors.error }]}>Erros recentes:</Text>
            {syncStatus.errors.map((err, i) => (
              <Text key={`${i}-${err.slice(0, 12)}`} style={styles.errorLine} numberOfLines={2}>
                • {err}
              </Text>
            ))}
          </View>
        )}
      </View>
      <Text testID="settings-attribution" style={styles.attribution}>
        FEITO por Tiago Rodrigues 64 9 84468273
      </Text>
    </KeyboardAwareScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  backButton: {
    minHeight: 44,
    alignSelf: "flex-start",
    justifyContent: "center",
    paddingVertical: 8,
    paddingRight: 16,
  },
  backText: {
    color: colors.onSurfaceSecondary,
    fontSize: 15,
    fontWeight: "600",
  },
  title: {
    color: colors.onSurface,
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
  },
  label: {
    color: colors.onSurfaceSecondary,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 8,
  },
  input: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
    color: colors.onSurface,
    paddingHorizontal: 16,
    fontSize: 15,
  },
  hint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  monitorCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    padding: 16,
    marginTop: 20,
    gap: 4,
  },
  monitorHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
  },
  monitorHeaderText: {
    flex: 1,
    gap: 4,
  },
  sectionTitle: {
    color: colors.onSurface,
    fontSize: 20,
    fontWeight: "700",
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  statusPill: {
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  statusPillSuccess: {
    backgroundColor: colors.success,
  },
  statusPillError: {
    backgroundColor: colors.error,
  },
  statusPillNeutral: {
    backgroundColor: colors.surfaceTertiary,
  },
  statusPillText: {
    color: colors.onSurface,
    fontSize: 12,
    fontWeight: "700",
  },
  monitorActions: {
    gap: 8,
    marginTop: 8,
  },
  monitorSaveButton: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  rotationRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  rotationChip: {
    minHeight: 48,
    flexShrink: 0,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  rotationChipSelected: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  rotationText: {
    color: colors.onSurfaceSecondary,
    fontSize: 15,
    fontWeight: "600",
  },
  rotationTextSelected: {
    color: colors.onBrandPrimary,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
  },
  switchLabel: {
    color: colors.onSurface,
    fontSize: 15,
  },
  message: {
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  messageSuccess: {
    backgroundColor: colors.success,
  },
  messageError: {
    backgroundColor: colors.error,
  },
  messageSuccessText: {
    color: colors.onSuccess,
    fontSize: 14,
    fontWeight: "600",
  },
  messageErrorText: {
    color: colors.onError,
    fontSize: 14,
    fontWeight: "600",
  },
  button: {
    minHeight: 52,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  primaryButton: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonFocused: {
    borderColor: colors.borderStrong,
    borderWidth: 2,
  },
  primaryButtonText: {
    color: colors.onBrandPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  buttonText: {
    color: colors.onSurface,
    fontSize: 15,
    fontWeight: "600",
  },
  infoCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    padding: 16,
    marginTop: 16,
    gap: 6,
  },
  infoTitle: {
    color: colors.onSurface,
    fontSize: 15,
    fontWeight: "700",
  },
  infoLine: {
    color: colors.onSurfaceSecondary,
    fontSize: 13,
  },
  errorLine: {
    color: colors.onSurfaceSecondary,
    fontSize: 12,
  },
  attribution: {
    color: colors.muted,
    fontSize: 12,
    textAlign: "center",
    marginTop: 24,
  },
}));
