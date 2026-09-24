import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Pressable, StatusBar, Text, View } from "react-native";
import { useKeepAwake } from "expo-keep-awake";
import { getNetworkStateAsync } from "expo-network";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FocusablePressable } from "@/src/components/FocusablePressable";
import { PhotoItem } from "@/src/components/PhotoItem";
import { VideoItem } from "@/src/components/VideoItem";
import { formatDateTimeBr } from "@/src/lib/format";
import { driveDownloadUrl, localUriFor } from "@/src/lib/media";
import { defaultSettings, loadManifest, loadSettings, loadSyncStatus } from "@/src/lib/settings";
import { recordSyncOutcome, syncNow } from "@/src/lib/sync";
import type { AppSettings, LocalMedia, SyncStatus } from "@/src/lib/types";
import { makeStyles, useTheme } from "@/src/theme";

export default function PlayerScreen() {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();

  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [items, setItems] = useState<LocalMedia[]>([]);
  const [index, setIndex] = useState(0);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ lastSyncAt: null, lastSyncOk: true, errors: [] });

  const itemsRef = useRef<LocalMedia[]>([]);
  const pendingRef = useRef<LocalMedia[] | null>(null);
  const settingsRef = useRef<AppSettings>(defaultSettings);
  const currentNameRef = useRef<string | null>(null);
  const syncBusyRef = useRef(false);
  const overlayRef = useRef(false);
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const advance = useCallback(() => {
    const pending = pendingRef.current;
    if (pending && pending.length > 0) {
      // New playlist validated during sync: activate it when the current media ends,
      // continuing right after the item that just played (no jump back to the first).
      pendingRef.current = null;
      itemsRef.current = pending;
      setItems(pending);
      const playedName = currentNameRef.current;
      const foundAt = playedName ? pending.findIndex((m) => m.name === playedName) : -1;
      setIndex(foundAt >= 0 ? (foundAt + 1) % pending.length : 0);
      return;
    }
    const len = itemsRef.current.length;
    if (len > 0) setIndex((i) => (i + 1) % len);
  }, []);

  const runSync = useCallback(async () => {
    if (syncBusyRef.current) return;
    const s = settingsRef.current;
    if (!s.folderLink.trim()) return;
    try {
      const net = await getNetworkStateAsync();
      if (!net.isConnected || net.isInternetReachable === false) return; // offline: keep local playlist
    } catch {
      return;
    }
    syncBusyRef.current = true;
    setSyncing(true);
    try {
      const manifest = await loadManifest();
      const outcome = await syncNow(s, manifest);
      if (outcome.ok && outcome.playlist) pendingRef.current = outcome.playlist;
      const st = await recordSyncOutcome(outcome);
      setSyncStatus(st);
    } finally {
      syncBusyRef.current = false;
      setSyncing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let disposed = false;
      let firstSync: ReturnType<typeof setTimeout> | undefined;
      let interval: ReturnType<typeof setInterval> | undefined;
      (async () => {
        const [s, manifest, st, initialUrl] = await Promise.all([
          loadSettings(),
          loadManifest(),
          loadSyncStatus(),
          // autostart deep link: "indoorplayer://boot" is fired by the native boot receiver
          (async () => {
            try {
              return await (await import("expo-linking")).getInitialURL();
            } catch {
              return null;
            }
          })(),
        ]);
        if (disposed) return;
        settingsRef.current = s;
        setSettings(s);
        itemsRef.current = manifest;
        setItems(manifest);
        setIndex(0);
        pendingRef.current = null;
        setSyncStatus(st);
        setReady(true);

        const fromBoot = Boolean(initialUrl && initialUrl.includes("//boot"));
        if (fromBoot && (!s.autostart || manifest.length === 0)) {
          router.replace("/settings");
          return;
        }

        firstSync = setTimeout(() => {
          void runSync();
        }, 2000);
        const intervalMs = Math.max(1, Math.round(s.syncIntervalMin || 1)) * 60_000;
        interval = setInterval(() => {
          void runSync();
        }, intervalMs);
      })();
      // Back button keeps the player alive (signage must not exit accidentally)
      const backSub = BackHandler.addEventListener("hardwareBackPress", () => {
        toggleOverlay();
        return true;
      });
      return () => {
        disposed = true;
        backSub.remove();
        if (firstSync) clearTimeout(firstSync);
        if (interval) clearInterval(interval);
        if (overlayTimer.current) clearTimeout(overlayTimer.current);
        overlayRef.current = false;
        setOverlayVisible(false);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runSync]),
  );

  const toggleOverlay = () => {
    const next = !overlayRef.current;
    overlayRef.current = next;
    setOverlayVisible(next);
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    if (next) {
      overlayTimer.current = setTimeout(() => {
        overlayRef.current = false;
        setOverlayVisible(false);
      }, 6000);
    }
  };

  const currentItem = items.length > 0 ? items[index % items.length] : null;
  currentNameRef.current = currentItem ? currentItem.name : null;
  const currentUri = currentItem ? localUriFor(currentItem.name) : null;
  const sourceUri = currentItem ? currentUri ?? driveDownloadUrl(currentItem.fileId) : "";

  if (!ready) {
    return (
      <View style={styles.root}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      {currentItem ? (
        <Pressable style={styles.mediaTouch} onPress={toggleOverlay} testID="player-media-touch">
          {currentItem.type === "video" ? (
            <VideoItem
              key={`v-${index}-${currentItem.fileId}`}
              uri={sourceUri}
              rotation={settings.rotation}
              onDone={advance}
            />
          ) : (
            <PhotoItem
              key={`p-${index}-${currentItem.fileId}`}
              uri={sourceUri}
              durationSec={settings.photoDurationSec}
              rotation={settings.rotation}
              onDone={advance}
            />
          )}
        </Pressable>
      ) : (
        <View style={styles.emptyState} testID="player-empty-state">
          <Text style={styles.emptyTitle}>Nenhuma mídia para reproduzir</Text>
          <Text style={styles.emptyText}>
            Abra as configurações, cole o link da pasta do Google Drive (tiny.cc ou link direto) e toque em
            &quot;Salvar e reproduzir&quot;. A pasta se transforma na playlist automaticamente.
          </Text>
          <FocusablePressable
            testID="player-settings-button"
            style={[styles.button, styles.primaryButton]}
            focusedStyle={styles.buttonFocused}
            onPress={() => router.push("/settings")}
            hasTVPreferredFocus
          >
            <Text style={styles.primaryButtonText}>Configurações</Text>
          </FocusablePressable>
        </View>
      )}

      {overlayVisible && (
        <View
          testID="player-overlay"
          style={[
            styles.overlayBar,
            { bottom: insets.bottom + 16, left: insets.left + 16, right: insets.right + 16 },
          ]}
        >
          <View style={styles.overlayInfo}>
            <Text style={styles.overlayDevice} numberOfLines={1}>
              {settings.deviceName}
            </Text>
            <Text style={styles.overlayStatus} numberOfLines={1}>
              {currentItem ? `Item ${index + 1}/${items.length} — ${currentItem.name}` : "Playlist vazia"}
            </Text>
            <Text
              style={[styles.overlayStatus, { color: syncStatus.lastSyncOk ? colors.success : colors.warning }]}
              numberOfLines={1}
            >
              {syncing
                ? "Sincronizando..."
                : syncStatus.lastSyncAt
                  ? `Última sincronização: ${formatDateTimeBr(syncStatus.lastSyncAt)}${syncStatus.lastSyncOk ? "" : " — com erros"}`
                  : "Ainda não sincronizou"}
            </Text>
          </View>
          <FocusablePressable
            testID="player-overlay-settings-button"
            style={[styles.button]}
            focusedStyle={styles.buttonFocused}
            onPress={() => router.push("/settings")}
            hasTVPreferredFocus
          >
            <Text style={styles.buttonText}>Configurações</Text>
          </FocusablePressable>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  mediaTouch: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  emptyTitle: {
    color: colors.onSurface,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyText: {
    color: colors.onSurfaceSecondary,
    fontSize: 14,
    textAlign: "center",
    maxWidth: 480,
  },
  button: {
    minHeight: 48,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
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
  overlayBar: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 16,
    borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  overlayInfo: {
    flex: 1,
    gap: 2,
  },
  overlayDevice: {
    color: colors.onSurface,
    fontSize: 16,
    fontWeight: "700",
  },
  overlayStatus: {
    color: colors.onSurfaceSecondary,
    fontSize: 13,
  },
}));
