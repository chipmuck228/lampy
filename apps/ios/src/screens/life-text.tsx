import {
  Animated,
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextProps,
} from 'react-native';

/**
 * Fixed app type scale in iOS points.
 * Not Figma CSS px, and not Dynamic Type. Confirm on device.
 */
export const type = {
  title: { fontSize: 28, lineHeight: 36 },
  body: { fontSize: 17, lineHeight: 32 },
  action: { fontSize: 17, lineHeight: 24 },
  meta: { fontSize: 15, lineHeight: 22 },
} as const;

export const FONT_SCALING = {
  allowFontScaling: false as const,
  maxFontSizeMultiplier: 1 as const,
};

export function Text(props: TextProps) {
  return <RNText {...props} allowFontScaling={false} maxFontSizeMultiplier={1} />;
}

export function TextInput({ style, ...props }: TextInputProps) {
  const flat = StyleSheet.flatten(style);
  let next = style;
  if (flat && typeof flat === 'object' && 'lineHeight' in flat) {
    next = { ...flat };
    delete (next as { lineHeight?: number }).lineHeight;
  }
  return (
    <RNTextInput
      {...props}
      allowFontScaling={false}
      maxFontSizeMultiplier={1}
      style={next}
    />
  );
}

export function AnimatedText(props: Animated.AnimatedProps<TextProps>) {
  return <Animated.Text {...props} allowFontScaling={false} maxFontSizeMultiplier={1} />;
}
