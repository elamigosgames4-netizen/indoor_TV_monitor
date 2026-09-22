import { useEffect } from "react";
import { Image } from "expo-image";

import { RotatedMedia } from "./RotatedMedia";
import type { Rotation } from "@/src/lib/types";

interface Props {
  uri: string;
  durationSec: number;
  rotation: Rotation;
  onDone: () => void;
}

export function PhotoItem({ uri, durationSec, rotation, onDone }: Props) {
  useEffect(() => {
    const t = setTimeout(onDone, Math.max(1, Math.round(durationSec)) * 1000);
    return () => clearTimeout(t);
  }, [uri, durationSec, onDone]);

  return (
    <RotatedMedia rotation={rotation}>
      <Image
        source={{ uri }}
        style={{ width: "100%", height: "100%" }}
        contentFit="contain"
        transition={0}
        testID="player-photo-image"
      />
    </RotatedMedia>
  );
}
