import { render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import MomentDetailScreen from '../app/moment/[id]';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'moment_missing' }),
}));

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    getMomentDetail: async (id: string) => ({ kind: 'missing', requestedId: id }),
  }),
}));

describe('moment detail screen', () => {
  it('does not open another moment when the id is missing', async () => {
    const view = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        <MomentDetailScreen />
      </SafeAreaProvider>,
    );

    await waitFor(() => {
      expect(view.getByText('这条记录现在无法找到。')).toBeTruthy();
    });
    expect(view.getByText('没有改成显示其他记录。')).toBeTruthy();
    expect(view.queryByText(/门口的风|假数据/)).toBeNull();
  });
});
