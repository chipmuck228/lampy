import type { ReactElement } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AccountDiagnosticsClosed } from './account-screen';
import AccountAboutScreen from './account-about-screen';
import AccountHelpScreen from './account-help-screen';
import AccountPrivacyScreen from './account-privacy-screen';
import AccountStorageScreen from './account-storage-screen';
import AccountSubscribeScreen from './account-subscribe-screen';
import AccountTermsScreen from './account-terms-screen';
import { SETTINGS_HELP_CHAPTERS } from './settings-help-copy';
import { SETTINGS_PRIVACY_CHAPTERS, SETTINGS_PRIVACY_UPDATED } from './settings-privacy-copy';
import { SETTINGS_TERMS_CHAPTERS, SETTINGS_TERMS_UPDATED } from './settings-terms-copy';
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
    expect(view.getByTestId('account-personal').props.children).toContain('应用数据库');
    expect(view.getByTestId('account-storage-media').props.children).toContain('不会写回系统相册');
    expect(view.getByTestId('account-storage-sync').props.children).toContain(
      '没有由 Lampy 提供的跨设备同步或云备份',
    );
    expect(view.getByTestId('account-storage-keep').props.children).toContain('Lampy 不能保证');
    expect(view.getByTestId('account-storage-reinstall').props.children).toContain(
      '重新安装不会自动找回',
    );
    expect(view.queryByText(/永久/)).toBeNull();
    expect(view.queryByText(/绝不丢失/)).toBeNull();
    expect(view.queryByLabelText('导出')).toBeNull();
    expect(view.queryByLabelText('清空全部记录')).toBeNull();
    fireEvent.press(view.getByLabelText('返回'));
    expect(mockDismissTo).toHaveBeenCalledWith('/account');
  });

  it('introduces subscribe without purchase actions and returns to the settings root', async () => {
    const view = await render(wrap(<AccountSubscribeScreen />));
    expect(view.getByLabelText('订阅与付费')).toBeTruthy();
    expect(view.getByTestId('account-subscribe-none').props.children).toBe('目前没有付费项目。');
    expect(view.queryByLabelText('购买')).toBeNull();
    expect(view.queryByLabelText('恢复购买')).toBeNull();
    expect(view.queryByLabelText('管理订阅')).toBeNull();
    expect(view.queryByText('已订阅')).toBeNull();
    fireEvent.press(view.getByLabelText('返回'));
    expect(mockDismissTo).toHaveBeenCalledWith('/account');
  });

  it('explains current help chapters with live UI names', async () => {
    const view = await render(wrap(<AccountHelpScreen />));
    expect(view.getByLabelText('使用帮助')).toBeTruthy();
    expect(SETTINGS_HELP_CHAPTERS).toHaveLength(6);
    expect(view.getByText('留下文字、照片和声音')).toBeTruthy();
    expect(view.getByText(/点「拍摄」用相机拍一张/)).toBeTruthy();
    expect(view.getByText(/点「阅读完整记录」进入详情/)).toBeTruthy();
    expect(view.getByText(/「最近」按写下的时间排列/)).toBeTruthy();
    expect(view.getByText(/再点「播放」会从停下的位置继续/)).toBeTruthy();
    expect(view.getByText(/「已开启」或「未开启」/)).toBeTruthy();
    expect(view.getByText(/相机未打开，草稿还在/)).toBeTruthy();
    expect(view.queryByText(/家庭空间/)).toBeNull();
    expect(view.queryByText(/测试账号登录/)).toBeNull();
    fireEvent.press(view.getByLabelText('返回'));
    expect(mockDismissTo).toHaveBeenCalledWith('/account');
  });

  it('keeps terms readable offline with a dated chapter list', async () => {
    const view = await render(wrap(<AccountTermsScreen />));
    expect(view.getByLabelText('使用条款')).toBeTruthy();
    expect(view.getByTestId('account-terms-updated').props.children).toEqual([
      '更新日期：',
      SETTINGS_TERMS_UPDATED,
    ]);
    expect(view.getByText(SETTINGS_TERMS_CHAPTERS[0].title)).toBeTruthy();
    expect(view.getByText(SETTINGS_TERMS_CHAPTERS[SETTINGS_TERMS_CHAPTERS.length - 1].title)).toBeTruthy();
    expect(view.getByText('目前没有付费项目。当前版本没有可购买的内容、订阅或试用。')).toBeTruthy();
    expect(view.queryByText(/法律审核/)).toBeNull();
    expect(view.queryByText(/TODO/)).toBeNull();
    expect(view.queryByText(/@/)).toBeNull();
    fireEvent.press(view.getByLabelText('返回'));
    expect(mockDismissTo).toHaveBeenCalledWith('/account');
  });

  it('keeps privacy readable offline without unverified upload promises', async () => {
    const view = await render(wrap(<AccountPrivacyScreen />));
    expect(view.getByLabelText('隐私政策')).toBeTruthy();
    expect(view.getByTestId('account-privacy-updated').props.children).toEqual([
      '更新日期：',
      SETTINGS_PRIVACY_UPDATED,
    ]);
    expect(view.getByText(SETTINGS_PRIVACY_CHAPTERS[0].title)).toBeTruthy();
    expect(view.getByText(/Lampy 不会取得或保存人脸数据/)).toBeTruthy();
    expect(view.getByText(/不会为个人记录去请求家庭或授权服务/)).toBeTruthy();
    expect(view.queryByText(/任何数据都不会上传/)).toBeNull();
    expect(view.queryByText(/法律审核/)).toBeNull();
    expect(view.queryByText(/TODO/)).toBeNull();
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
