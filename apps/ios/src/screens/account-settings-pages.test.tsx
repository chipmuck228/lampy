import type { ReactElement } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AccountAboutScreen from './account-about-screen';
import AccountStorageScreen from './account-storage-screen';

const mockDismissTo = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ dismissTo: mockDismissTo, push: jest.fn(), back: jest.fn() }),
}));

function wrap(node: ReactElement) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      {node}
    </SafeAreaProvider>
  );
}

describe('account settings pages', () => {
  beforeEach(() => {
    mockDismissTo.mockReset();
  });

  it('states only checked storage facts and returns to the settings root', async () => {
    const view = await render(wrap(<AccountStorageScreen />));
    expect(view.getByLabelText('记录与存储')).toBeTruthy();
    expect(view.getByTestId('account-personal').props.children).toContain('个人记录保存在这台设备');
    expect(view.getByTestId('account-storage-sync').props.children).toContain('没有跨设备同步或云备份');
    expect(view.getByTestId('account-storage-keep').props.children).toContain('卸载或更换设备前');
    expect(view.queryByText(/永久/)).toBeNull();
    expect(view.queryByLabelText('导出')).toBeNull();
    fireEvent.press(view.getByLabelText('返回'));
    expect(mockDismissTo).toHaveBeenCalledWith('/account');
  });

  it('shows the quiet brand line and a real version, without empty policy links', async () => {
    const view = await render(wrap(<AccountAboutScreen />));
    expect(view.getByLabelText('关于 Lampy')).toBeTruthy();
    expect(view.getByText('Lampy')).toBeTruthy();
    expect(view.getByText('把生活，留给自己。')).toBeTruthy();
    expect(view.getByTestId('account-version').props.children).toMatch(/^版本 /);
    expect(view.queryByText('隐私政策')).toBeNull();
    expect(view.queryByText('这是一个界面设计原型')).toBeNull();
    fireEvent.press(view.getByLabelText('返回'));
    expect(mockDismissTo).toHaveBeenCalledWith('/account');
  });
});
