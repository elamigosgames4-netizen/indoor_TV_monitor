import { useState } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

interface Props extends PressableProps {
  style?: StyleProp<ViewStyle>;
  focusedStyle?: StyleProp<ViewStyle>;
}

// Pressable that tracks TV/D-pad focus (onFocus/onBlur) and applies a focus ring.
// Works identically to Pressable for touch.
export function FocusablePressable({ style, focusedStyle, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      {...rest}
      onFocus={(e) => {
        setFocused(true);
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        rest.onBlur?.(e);
      }}
      style={(state) => [style, focused && focusedStyle]}
    />
  );
}
