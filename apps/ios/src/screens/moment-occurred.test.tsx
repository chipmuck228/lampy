import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { OccurredDatePicker } from './moment-occurred';

const today = { year: 2026, month: 9, day: 27 };

describe('OccurredDatePicker collapse', () => {
  it('hides date options until the toggle is expanded, and VoiceOver matches', async () => {
    const onChange = jest.fn();
    const view = await render(
      <OccurredDatePicker
        value={{ kind: 'today', label: '今天' }}
        today={today}
        onChange={onChange}
      />,
    );
    expect(view.getByLabelText('这件事发生在哪一天').props.accessibilityState.expanded).toBe(false);
    expect(view.queryByTestId('composer-occurred-options')).toBeNull();
    expect(view.queryByTestId('composer-occurred-today')).toBeNull();
    expect(view.getByText('今天')).toBeTruthy();

    fireEvent.press(view.getByLabelText('这件事发生在哪一天'));
    await waitFor(() => {
      expect(view.getByLabelText('这件事发生在哪一天').props.accessibilityState.expanded).toBe(true);
      expect(view.getByTestId('composer-occurred-options')).toBeTruthy();
    });
    expect(view.getByLabelText('发生日期，今天，已选中')).toBeTruthy();

    fireEvent.press(view.getByLabelText('这件事发生在哪一天'));
    await waitFor(() => {
      expect(view.getByLabelText('这件事发生在哪一天').props.accessibilityState.expanded).toBe(false);
    });
    expect(view.queryByTestId('composer-occurred-options')).toBeNull();
  });
});
