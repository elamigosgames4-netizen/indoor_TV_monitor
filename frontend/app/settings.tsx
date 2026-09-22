import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Switch, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FocusablePressable } from "@/src/components/FocusablePressable";
import { resolveFolder } from "@/src/lib/backend";
import { formatDateTimeBr } from "@/src/lib/format";
import {
  defaultSettings,
  loadManifest,
  loadSettings,
  loadSyncStatus,
  saveManifest,
  saveSettings,
} from "@/src/lib/settings";
import { recordSyncOutcome, syncNow } from "@/src/lib/sync";
import type { AppSettings, LocalMedia, Rotation, SyncStatus } from "@/src/lib/types";
import { makeStyles, useTheme } from "@/src/theme";

const ROTATIONS: { value: Rotation; label: string; id: string }[] = [
  { value: "0", label: "0°", id: "0" },
  { value: "90", label: "90°", id: "90" },
  { value: "-90", label: "−90°", id: "neg-90" },
  { value: "180", label: "180°", id: "180" },
];

type Message = { kind: "success" | "error"; text: string };

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();

  const [form, setForm] = useState<AppSettings>(defaultSettings);
  const [durationText, setDurationText] = useState("10");
  const [manifest, setManifest] = useState<LocalMedia[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ lastSyncAt: null, lastSyncOk: true, errors: [] });
  const [busy, setBusy] = useState<"save" | "sync" | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [s, m, st] = await Promise.all([loadSettings(), loadManifest(), loadSyncStatus()]);
        setForm(s);
        setDurationText(String(s.photoDurationSec));
        setManifest(m);
        setSyncStatus(st);
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
    const s: AppSettings = { ...form, folderLink: link, photoDurationSec: duration };
    await saveSettings(s);

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
}));
