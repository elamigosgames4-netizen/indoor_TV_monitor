import { View, useWindowDimensions } from "react-native";

import type { ReactNode } from "react";

import { makeStyles } from "@/src/theme";
import type { Rotation } from "@/src/lib/types";

interface Props {
  rotation: Rotation;
  children: ReactNode;
}

// Fullscreen media canvas that applies the configured rotation to any media
// (photo or video), independent from the device sensor. For 90/-90 the inner
// box swaps width/height so, once rotated around its center, it exactly fills
// the screen without cropping or distorting (media uses contain).
export function RotatedMedia({ rotation, children }: Props) {
  const { width, height } = useWindowDimensions();
  const styles = useStyles();
  const rotated = rotation === "90" || rotation === "-90";
  const inner = rotated
    ? { width: height, height: width, transform: [{ rotate: `${rotation}deg` }] }
    : { width, height, transform: [{ rotate: `${rotation}deg` }] };
  return (
    <View style={styles.canvas}>
      <View style={inner}>{children}</View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  // Pure black canvas behind media — identical in every theme
  canvas: {
    flex: 1,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
}));
