import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ScaffoldHomeScreen from '../app/index';

describe('iOS scaffold home', () => {
  it('renders the empty shell without inventing moments', async () => {
    const view = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        <ScaffoldHomeScreen />
      </SafeAreaProvider>,
    );
    expect(view.getByLabelText('Lampy iOS 脚手架')).toBeTruthy();
    expect(view.getByText('Lampy')).toBeTruthy();
    expect(view.queryByText(/假数据|mock moment/i)).toBeNull();
  });
});
