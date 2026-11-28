import { useState } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react-native';
import { Dimensions, StyleSheet, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { pageFrame } from './page-frame';
import { recentColumnWidth } from './life-page';
import { SettingsPage } from './settings-chrome';
import { LookbackScaffold, lookbackLayoutFor } from './lookback-chrome';

jest.mock('expo-router', () => ({
  useRouter: () => ({back: jest.fn()}),
  useFocusEffect: (effect: () => void) => jest.requireActual('react').useEffect(effect, [effect]),
}));
const originalWindow = Dimensions.get('window');
const originalScreen = Dimensions.get('screen');
async function resize(width: number, height: number) {
  await act(async () => { Dimensions.set({
    window: {width,height,scale:2,fontScale:1},
    screen: {width,height,scale:2,fontScale:1},
  }); });
}
afterEach(async () => {
  await cleanup();
  await act(async () => {Dimensions.set({window:originalWindow,screen:originalScreen});});
});
function Draft() {
  const [text,setText] = useState('');
  return <TextInput testID="draft" value={text} onChangeText={setText}/>;
}
function Page({wide=false}:{wide?:boolean}) {
  return <SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:1024,height:1366},insets:{top:24,left:0,right:0,bottom:20}}}>
    <SettingsPage title="设置" backLabel="最近" accessibilityLabel="设置" onBack={()=>undefined} wide={wide}><Draft/></SettingsPage>
  </SafeAreaProvider>;
}
it.each([[1366,1024],[1024,1366],[1194,834],[834,1194],[768,1024]])('shares the page frame at %sx%s', (width,height) => {
  const frame = pageFrame(width,height);
  expect(frame.column).toBe(recentColumnWidth(width,height));
  expect(frame.column).toBe(lookbackLayoutFor(width,height).readingWidth);
  expect(frame.column).toBeLessThanOrEqual(width);
  expect(frame.content).toBe(frame.column-96);
  expect(frame.reading).toBeLessThanOrEqual(640);
  expect(frame.top).toBe(28);
});
it.each([[390,844],[600,900],[852,393]])('uses compact layout at %sx%s', (width,height) => {
  expect(pageFrame(width,height).regular).toBe(false);
  expect(pageFrame(width,height).gutter).toBe(24);
});
it('keeps settings header/body aligned and retains the draft across rotation', async () => {
  await resize(1366,1024);
  const view = await render(<Page/>);
  const scroll = () => StyleSheet.flatten(view.getByTestId('account-scroll').props.contentContainerStyle);
  expect(scroll().maxWidth).toBe(1120);
  expect(scroll().paddingLeft).toBe(48);
  expect(StyleSheet.flatten(view.getByTestId('account-header').props.style).maxWidth).toBe(1120);
  expect(StyleSheet.flatten(view.getByTestId('account-reading-column').props.style).maxWidth).toBe(640);
  await fireEvent.changeText(view.getByTestId('draft'),'未保存的文字');
  await resize(1024,1366);
  expect(scroll().maxWidth).toBe(1024);
  expect(view.getByTestId('draft').props.value).toBe('未保存的文字');
  await resize(600,900);
  expect(scroll().maxWidth).toBeUndefined();
  expect(scroll().paddingLeft).toBe(24);
  expect(view.getByTestId('draft').props.value).toBe('未保存的文字');
});
it('gives album tools a wide body within the same header frame', async () => {
  await resize(1366,1024);
  const view = await render(<Page wide/>);
  expect(StyleSheet.flatten(view.getByTestId('account-reading-column').props.style).maxWidth).toBe(1024);
  expect(StyleSheet.flatten(view.getByTestId('account-header').props.style).maxWidth).toBe(1120);
});
it('aligns the actual Revisit root header and body to the shared frame',async()=>{
  await resize(1366,1024);
  const view = await render(<SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:1366,height:1024},insets:{top:24,left:0,right:0,bottom:20}}}>
    <LookbackScaffold title="回看" path="/lookback" root onGoRecent={()=>undefined}><Draft/></LookbackScaffold>
  </SafeAreaProvider>);
  expect(StyleSheet.flatten(view.getByTestId('lookback-scroll').props.contentContainerStyle).maxWidth).toBe(1120);
  expect(StyleSheet.flatten(view.getByTestId('lookback-scroll').props.contentContainerStyle).paddingHorizontal).toBe(48);
  expect(StyleSheet.flatten(view.getByTestId('lookback-wordmark').props.style).fontSize).toBe(42);
});
