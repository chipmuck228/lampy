import {
  Animated,
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

export function TextInput(props: TextInputProps) {
  return <RNTextInput {...props} allowFontScaling={false} maxFontSizeMultiplier={1} />;
}

export function AnimatedText(props: Animated.AnimatedProps<TextProps>) {
  return <Animated.Text {...props} allowFontScaling={false} maxFontSizeMultiplier={1} />;
}
