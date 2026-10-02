import type { ReactElement } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AccountDiagnosticsClosed } from './account-screen';
import AccountAboutScreen from './account-about-screen';
import AccountStorageScreen from './account-storage-screen';
import { SettingsPage, settingsEdgePad } from './settings-chrome';
import { paper, READING_MAX } from './life-page';

const mockDismissTo = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ dismissTo: mockDismissTo, push: jest.fn(), back: jest.fn() }),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    nativeAppVersion: '1.2.3',
    nativeBuildVersion: '45',
    expoConfig: { version: '9.9.9', ios: { buildNumber: '99' } },
  },
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
    expect(view.getByText('本机设置')).toBeTruthy();
    expect(view.getByTestId('account-personal').props.children).toContain('个人记录保存在这台设备');
    expect(view.getByTestId('account-storage-sync').props.children).toContain('没有跨设备同步或云备份');
    expect(view.getByTestId('account-storage-keep').props.children).toContain('卸载或更换设备前');
    expect(view.queryByText(/永久/)).toBeNull();
    expect(view.queryByLabelText('导出')).toBeNull();
    fireEvent.press(view.getByLabelText('返回'));
    expect(mockDismissTo).toHaveBeenCalledWith('/account');
  });

  it('shows the quiet brand line and the installed native version, without empty policy links', async () => {
    const view = await render(wrap(<AccountAboutScreen />));
    expect(view.getByLabelText('关于 Lampy')).toBeTruthy();
    expect(view.getByText('Lampy')).toBeTruthy();
    expect(view.getByText('把生活，留给自己。')).toBeTruthy();
    expect(view.getByTestId('account-version').props.children).toBe('版本 1.2.3（45）');
    expect(view.queryByText('9.9.9')).toBeNull();
    expect(view.queryByText('隐私政策')).toBeNull();
    expect(view.queryByText('这是一个界面设计原型')).toBeNull();
    fireEvent.press(view.getByLabelText('返回'));
    expect(mockDismissTo).toHaveBeenCalledWith('/account');
  });

  it('fills the closed diagnostics page so Release deep links keep the back control', async () => {
    const view = await render(wrap(<AccountDiagnosticsClosed />));
    const page = view.getByTestId('account-diagnostics-closed');
    expect(StyleSheet.flatten(page.props.style)).toEqual(expect.objectContaining({ flex: 1, backgroundColor: paper }));
    expect(view.getByText('这里没有开发诊断。')).toBeTruthy();
    expect(view.getByLabelText('返回')).toBeTruthy();
    fireEvent.press(view.getByLabelText('返回'));
    expect(mockDismissTo).toHaveBeenCalledWith('/account');
  });

  it('keeps landscape notches and iPad reading width out of the chrome', () => {
    expect(settingsEdgePad(47, 24)).toBe(47);
    expect(settingsEdgePad(0, 24)).toBe(24);
    expect(settingsEdgePad(0, 48)).toBe(48);
    expect(READING_MAX).toBe(520);
  });

  it('pads the settings header past a landscape safe inset', async () => {
    const view = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 844, height: 390 },
          insets: { top: 0, left: 47, right: 21, bottom: 21 },
        }}
      >
        <SettingsPage title="本机设置" backLabel="最近" accessibilityLabel="本机设置" onBack={() => undefined}>
          {null}
        </SettingsPage>
      </SafeAreaProvider>,
    );
    const header = view.getByText('本机设置').parent;
    expect(header).toBeTruthy();
    expect(StyleSheet.flatten(header?.props.style).paddingLeft).toBe(47);
    expect(StyleSheet.flatten(header?.props.style).paddingRight).toBe(24);
  });
});
