// Design tokens for this app. Single dark scheme (indoor signage runs in the dark,
// always): values come from /app/design_guidelines.json ("7 Dark-First Utility").
//
// The keys match the "color" block of /app/design_guidelines.json. Keep every key;
// do not add a second theme or colors file; do not write color literals in
// components (exception: colors that must be identical in every theme, like the
// pure-black media canvas).
//
// Styling a screen or component: build the sheet with makeStyles so colors
// and layout live together:
//   const useStyles = makeStyles((colors) => ({
//     card: { backgroundColor: colors.surfaceSecondary, padding: 16 },
//     title: { color: colors.onSurfaceSecondary, fontSize: 16 },
//   }));
// For color props that are not styles (icon color, placeholderTextColor,
// ActivityIndicator) read useTheme().colors inside the component.

import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const dark = {
  // ---------------------------------------------------------------------------
  // Surfaces: backgrounds, from the screen down to small fills.
  // Each `on` key is the text and icon color for that background.
  // ---------------------------------------------------------------------------
  surface: "#121418", // primary canvas, most of every screen
  onSurface: "#F0F4F8", // text and icons on the canvas
  surfaceSecondary: "#1A1D24", // cards, sheets, list rows
  onSurfaceSecondary: "#D1D5DB", // text and icons on cards, sheets, rows
  surfaceTertiary: "#262B35", // input backgrounds, chips, deepest nesting
  onSurfaceTertiary: "#9CA3AF", // text on inputs and chips; also muted text
  surfaceInverse: "#FFFFFF", // tooltips, snackbars, anything popping against the theme
  onSurfaceInverse: "#121418", // text and icons on the inverse surface
  muted: "#9CA3AF", // subdued text on surface: captions, timestamps, placeholders

  // ---------------------------------------------------------------------------
  // Brand: the identity color and the fills built from it.
  // ---------------------------------------------------------------------------
  brand: "#D97706", // base hue, anchor only
  onBrand: "#FFFFFF", // text and icons placed directly on brand
  brandPrimary: "#D97706", // primary CTA, selected states
  onBrandPrimary: "#FFFFFF", // text and icons on brandPrimary
  brandSecondary: "#B45309", // secondary CTA, less prominent accents
  onBrandSecondary: "#FFFFFF", // text and icons on brandSecondary
  brandTertiary: "#2E2516", // chips, tags, badges, subtle brand moments
  onBrandTertiary: "#FDE68A", // text and icons on brandTertiary

  // ---------------------------------------------------------------------------
  // Status: semantic only, never decorative. Fill for badges, banners and
  // toasts; the `on` key is text on that fill. The plain key is also safe as
  // text on `surface`.
  // ---------------------------------------------------------------------------
  success: "#10B981",
  onSuccess: "#FFFFFF",
  warning: "#F59E0B",
  onWarning: "#121418",
  error: "#EF4444",
  onError: "#FFFFFF",
  info: "#3B82F6",
  onInfo: "#FFFFFF",

  // ---------------------------------------------------------------------------
  // Lines
  // ---------------------------------------------------------------------------
  border: "#2A2E39", // hairline outline, 0.5pt or 1pt max: inputs, cards
  borderStrong: "#D97706", // focus rings, selected outlines, 1.5pt max
  divider: "#1F242D", // subtle list separators
};

export type ThemeColors = typeof dark;

export const defaultScheme = "dark" satisfies ColorScheme;

// Single scheme app: every device setting resolves to the same dark palette.
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light: dark, dark };

// In-app theme toggle (unused in this single-scheme app, kept for completeness).
export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.((scheme ?? "unspecified") as Parameters<typeof Appearance.setColorScheme>[0]);
}

setColorScheme?.("dark");

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system === "light" || system === "dark" ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

// Themed StyleSheet: returns a hook that builds the sheet from the active
// scheme's colors and memoizes it until the scheme changes.
export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
