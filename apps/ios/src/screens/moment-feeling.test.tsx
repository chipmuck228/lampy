import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { FeelingPicker } from './moment-feeling';

describe('FeelingPicker restore and disclosure', () => {
  it('shows chips when empty, and collapse chevron when the list is open', async () => {
    const view = await render(<FeelingPicker value="" onChange={jest.fn()} />);
    expect(view.getByLabelText('当时的感受').props.accessibilityState.expanded).toBe(true);
    expect(view.getByLabelText('当时的感受，高兴')).toBeTruthy();
  });

  it('restores a stored feeling without repeating it, then expands to change', async () => {
    const view = await render(<FeelingPicker value="喜悦" onChange={jest.fn()} />);
    expect(view.getByLabelText('当时的感受，喜悦').props.accessibilityState.expanded).toBe(false);
    expect(view.queryByTestId('composer-feeling-unknown')).toBeNull();
    expect(view.getAllByText('喜悦')).toHaveLength(1);
    expect(view.queryByLabelText('当时的感受，高兴')).toBeNull();

    fireEvent.press(view.getByLabelText('当时的感受，喜悦'));
    await waitFor(() => {
      expect(view.getByLabelText('当时的感受，喜悦').props.accessibilityState.expanded).toBe(true);
    });
    expect(view.getByLabelText('当时的感受，高兴').props.accessibilityState.selected).toBe(false);
  });
});
