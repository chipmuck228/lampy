import { render } from '@testing-library/react-native';
import { Dimensions, StyleSheet, View } from 'react-native';

import { LookThisHit } from './life-icons';

function setFontScale(fontScale: number) {
  Dimensions.set({
    window: { width: 390, height: 844, scale: 3, fontScale },
    screen: { width: 390, height: 844, scale: 3, fontScale },
  });
}

describe('LookThisHit', () => {
  afterEach(() => {
    setFontScale(1);
  });

  it('keeps the full caption, allows wrap, and stays a 48pt visible hit at max type', async () => {
    setFontScale(3.1);
    const view = await render(
      <View style={{ width: 160 }}>
        <LookThisHit
          caption="看这条，还有正文"
          accessibilityLabel="记录于 10月1日，看这条，还有正文"
          testID="recent-open-moment_long"
          onPress={() => undefined}
        />
      </View>,
    );
    const label = view.getByTestId('recent-open-label-moment_long');
    expect(label.props.children).toBe('看这条，还有正文');
    expect(label.props.numberOfLines).toBeUndefined();
    expect(label.props.allowFontScaling).not.toBe(false);
    expect(label.props.adjustsFontSizeToFit).toBeFalsy();

    const hit = view.getByTestId('recent-open-moment_long');
    const hitStyle = StyleSheet.flatten(hit.props.style);
    expect(hitStyle.minHeight).toBe(48);
    expect(hit.props.hitSlop).toBeUndefined();

    const row = StyleSheet.flatten(view.getByTestId('recent-open-row-moment_long').props.style);
    expect(row.flexWrap).toBe('wrap');
    expect(row.maxWidth).toBe('100%');
  });

  it('still shows 看这条 in full when the row is short', async () => {
    setFontScale(3.1);
    const view = await render(
      <View style={{ width: 120 }}>
        <LookThisHit
          caption="看这条"
          accessibilityLabel="看这条"
          testID="recent-open-moment_short"
          onPress={() => undefined}
        />
      </View>,
    );
    expect(view.getByTestId('recent-open-label-moment_short').props.children).toBe('看这条');
    expect(view.getByTestId('recent-open-label-moment_short').props.numberOfLines).toBeUndefined();
  });
});
