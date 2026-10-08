import { render, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AccountTermsScreen from './account-terms-screen';
import AccountSubscribeScreen from './account-subscribe-screen';
import { SETTINGS_PRIVACY_CHAPTERS } from './settings-privacy-copy';
import { FIRST_RUN_SCREENS, firstRunBodyLines, firstRunProgressLabel, isFirstRunFinishAction } from '../application/first-run';
import { FIRST_RUN_SERIF, FIRST_RUN_SANS, loadFirstRunFonts } from './first-run-fonts';
import * as Font from 'expo-font';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));
const mockDismissTo = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ dismissTo: mockDismissTo }) }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn() }));
const wrap = (children: React.ReactNode) => <SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:320,height:568},insets:{top:20,left:0,right:0,bottom:0}}}>{children}</SafeAreaProvider>;

it('provides English copy with complete heading labels and explicit final completion', () => {
  expect(FIRST_RUN_SCREENS[0].photoNote).toBe('A cup of coffee. An afternoon.');
  for (const page of FIRST_RUN_SCREENS) {
    expect(page.titleLines.join(' ')).toBe(page.title);
    expect(page.title + page.body + page.photoAlt).not.toMatch(/[\u4e00-\u9fff]/);
  }
  expect(firstRunBodyLines(FIRST_RUN_SCREENS[0].body)).toEqual(['No need to write a story.', 'Just keep this moment for yourself.']);
  expect(firstRunProgressLabel(1,3)).toBe('Page 2 of 3');
  expect(isFirstRunFinishAction(1)).toBe(false);
  expect(FIRST_RUN_SCREENS[2].action).toBeTruthy();
});
it('uses system English fonts instead of loading the Chinese glyph subsets', async () => {
  await loadFirstRunFonts();
  expect(Font.loadAsync).not.toHaveBeenCalled();
  expect(FIRST_RUN_SERIF).toBe('Georgia');
  expect(FIRST_RUN_SANS).toBe('System');
});
it('renders bundled English terms and returns through the existing route', async () => {
  const ui = await render(wrap(<AccountTermsScreen />));
  expect(ui.getByLabelText('Terms of use')).toBeTruthy();
  expect(ui.getByTestId('account-terms-updated').props.children).toBe('Updated: October 2, 2026');
  await fireEvent.press(ui.getByLabelText('Back'));
  expect(mockDismissTo).toHaveBeenCalledWith('/account');
});
it('keeps the no-purchases notice and qualified system-backup statements', async () => {
  const ui = await render(wrap(<AccountSubscribeScreen />));
  expect(ui.getByTestId('account-subscribe-store').props.children).toContain('no options to purchase');
  const privacy = SETTINGS_PRIVACY_CHAPTERS.flatMap(c => c.paragraphs).join(' ');
  expect(privacy).toContain('does not obtain or store facial data');
  expect(privacy).toContain('Lampy cannot guarantee this');
  expect(privacy).not.toMatch(/[\u4e00-\u9fff]/);
});
