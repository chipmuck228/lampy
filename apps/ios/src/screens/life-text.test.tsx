import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import { AnimatedText, Text, TextInput, type } from './life-text';

describe('fixed app type', () => {
  it('keeps Text, TextInput, and Animated.Text off system scaling', async () => {
    const view = await render(
      <>
        <Text testID="life-text">正文</Text>
        <TextInput testID="life-input" value="草稿" />
        <AnimatedText testID="life-animated">淡入</AnimatedText>
      </>,
    );

    for (const id of ['life-text', 'life-input', 'life-animated']) {
      expect(view.getByTestId(id).props.allowFontScaling).toBe(false);
      expect(view.getByTestId(id).props.maxFontSizeMultiplier).toBe(1);
    }
    expect(view.getByTestId('life-input').props.value).toBe('草稿');
  });

  it('ignores a caller that tries to turn scaling back on', async () => {
    const view = await render(
      <Text testID="forced" allowFontScaling maxFontSizeMultiplier={3}>
        标题
      </Text>,
    );
    expect(view.getByTestId('forced').props.allowFontScaling).toBe(false);
    expect(view.getByTestId('forced').props.maxFontSizeMultiplier).toBe(1);
  });

  it('exposes the native point baseline, not Figma CSS px', () => {
    expect(type.title.fontSize).toBe(28);
    expect(type.body.fontSize).toBe(17);
    expect(type.body.lineHeight).toBeGreaterThanOrEqual(30);
    expect(type.body.lineHeight).toBeLessThanOrEqual(34);
    expect(type.action.fontSize).toBeGreaterThanOrEqual(16);
    expect(type.action.fontSize).toBeLessThanOrEqual(17);
    expect(type.meta.fontSize).toBeGreaterThanOrEqual(14);
    expect(type.meta.fontSize).toBeLessThanOrEqual(15);
    expect(type.body.fontSize).not.toBe(13);
  });

  it('keeps token styles usable in StyleSheet', () => {
    const styles = StyleSheet.create({
      title: type.title,
      body: type.body,
    });
    expect(StyleSheet.flatten(styles.body)).toEqual(
      expect.objectContaining({ fontSize: 17, lineHeight: 32 }),
    );
  });
});
