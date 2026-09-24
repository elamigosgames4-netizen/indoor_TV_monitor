/**
 * Autostart nativo (Android) + launcher de TV.
 *
 * - Adiciona as permissões RECEIVE_BOOT_COMPLETED e WAKE_LOCK.
 * - Registra um BootReceiver que abre o app em tela cheia quando o aparelho liga,
 *   disparando o deep link "indoorplayer://boot" (o player decide tocar a playlist
 *   imediatamente; se o autostart estiver desligado nas configurações, abre as configurações).
 * - Adiciona a categoria LEANBACK_LAUNCHER ao MainActivity para o app aparecer na
 *   interface de TVs Android (sem exigir o recurso leanback).
 *
 * O receiver só tem efeito no APK instalado (não no Expo Go).
 */
const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const BOOT_SCHEME = "indoorplayer";

const BOOT_RECEIVER_KOTLIN = (appPackage) => `package ${appPackage}

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action == Intent.ACTION_BOOT_COMPLETED || action == "android.intent.action.QUICKBOOT_POWERON") {
            val launch = Intent(Intent.ACTION_VIEW, Uri.parse("${BOOT_SCHEME}://boot"))
            launch.setPackage(context.packageName)
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try {
                context.startActivity(launch)
            } catch (_: Exception) {
            }
        }
    }
}
`;

function withAutostart(config) {
  config = withDangerousMod(config, [
    "android",
    (cfg) => {
      const pkg = cfg.android?.package ?? config.android?.package;
      if (!pkg) return cfg;
      const dir = path.join(
        cfg.modRequest.projectRoot,
        "android",
        "app",
        "src",
        "main",
        "java",
        ...pkg.split("."),
      );
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "BootReceiver.kt"), BOOT_RECEIVER_KOTLIN(pkg));
      return cfg;
    },
  ]);

  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    manifest["uses-permission"] = manifest["uses-permission"] ?? [];
    const hasPermission = (name) =>
      manifest["uses-permission"].some((p) => p.$["android:name"] === name);
    if (!hasPermission("android.permission.RECEIVE_BOOT_COMPLETED")) {
      manifest["uses-permission"].push({
        $: { "android:name": "android.permission.RECEIVE_BOOT_COMPLETED" },
      });
    }
    if (!hasPermission("android.permission.WAKE_LOCK")) {
      manifest["uses-permission"].push({ $: { "android:name": "android.permission.WAKE_LOCK" } });
    }

    // TV support: leanback feature optional + launcher category on MainActivity
    manifest["uses-feature"] = manifest["uses-feature"] ?? [];
    if (!manifest["uses-feature"].some((f) => f.$["android:name"] === "android.software.leanback")) {
      manifest["uses-feature"].push({
        $: { "android:name": "android.software.leanback", "android:required": "false" },
      });
    }

    const application = manifest.application[0];
    application.receiver = application.receiver ?? [];
    if (!application.receiver.some((r) => r.$["android:name"] === ".BootReceiver")) {
      application.receiver.push({
        $: { "android:name": ".BootReceiver", "android:exported": "true" },
        "intent-filter": [
          {
            action: [
              { $: { "android:name": "android.intent.action.BOOT_COMPLETED" } },
              { $: { "android:name": "android.intent.action.QUICKBOOT_POWERON" } },
            ],
          },
        ],
      });
    }

    const activities = application.activity ?? [];
    for (const activity of activities) {
      const name = activity.$["android:name"] ?? "";
      if (name.endsWith(".MainActivity")) {
        const mainFilter = (activity["intent-filter"] ?? []).find((f) =>
          (f.action ?? []).some((x) => x.$["android:name"] === "android.intent.action.MAIN"),
        );
        if (mainFilter) {
          mainFilter.category = mainFilter.category ?? [];
          if (
            !mainFilter.category.some(
              (c) => c.$["android:name"] === "android.intent.category.LEANBACK_LAUNCHER",
            )
          ) {
            mainFilter.category.push({
              $: { "android:name": "android.intent.category.LEANBACK_LAUNCHER" },
            });
          }
        }
      }
    }

    return cfg;
  });

  return config;
}

module.exports = withAutostart;
