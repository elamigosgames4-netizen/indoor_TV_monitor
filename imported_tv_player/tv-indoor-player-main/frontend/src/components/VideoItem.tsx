import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { useEventListener } from "expo";

import { RotatedMedia } from "./RotatedMedia";
import type { Rotation } from "@/src/lib/types";

interface Props {
  uri: string;
  rotation: Rotation;
  onDone: () => void;
}

export function VideoItem({ uri, rotation, onDone }: Props) {
  const player = useVideoPlayer({ uri }, (p) => {
    // Browsers block unmuted autoplay; real devices (the target) play with audio.
    if (Platform.OS === "web") p.muted = true;
    p.play();
  });
  const doneRef = useRef(false);

  const finish = () => {
    if (!doneRef.current) {
      doneRef.current = true;
      onDone();
    }
  };

  // Fires when the video reaches its natural end
  useEventListener(player, "playToEnd", finish);

  // Watchdog: skip media that never starts (corrupted download, unsupported codec)
  useEffect(() => {
    const t = setTimeout(() => {
      if (!player.playing) finish();
    }, 15000);
    return () => clearTimeout(t);
  }, [player, uri]);

  return (
    <RotatedMedia rotation={rotation}>
      <VideoView
        player={player}
        contentFit="contain"
        nativeControls={false}
        surfaceType="textureView"
        useExoShutter={false}
        style={{ width: "100%", height: "100%" }}
        testID="player-video-view"
      />
    </RotatedMedia>
  );
}
