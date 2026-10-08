import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import FamilyDirectoryScreen from './family-directory-screen';
const mockPush = jest.fn();
const mockFamilies = jest.fn();
const mockCreate = jest.fn();
const mockOpen = jest.fn(() => false);
const mockLock = { snapshot: { locked: false } };
jest.mock('../application/container', () => ({ getFamilyUseCases: async () => ({ getFamilies: mockFamilies,createNamedFamily:mockCreate }) }));
jest.mock('../infrastructure/family-config', () => ({isFamilyProductEntryOpen: () => mockOpen()}));
jest.mock('./device-lock-context', () => ({ useDeviceLock: () => mockLock }));
jest.mock('./settings-chrome', () => { const { Text, View } = jest.requireActual('react-native'); return { SettingsPage: ({children,title}: {children: React.ReactNode;title:string}) => <View><Text>{title}</Text>{children}</View> }; });
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return { useRouter: () => ({ dismissTo: jest.fn(),push:mockPush }),useFocusEffect: (fn: () => void | (() => void)) => useEffect(fn,[fn]) };
});
beforeEach(() => { jest.clearAllMocks();mockOpen.mockReturnValue(false);mockLock.snapshot.locked=false;mockFamilies.mockResolvedValue({userId:'a',limit:10,families:[{familyId:'home',name:'Our home',role:'creator',memberCount:1}]}); });
it('closed entry and locked page never request private families', async () => {
  const closed=await render(<FamilyDirectoryScreen/>);
  expect(closed.getByText('敬请期待。')).toBeTruthy();
  expect(mockFamilies).not.toHaveBeenCalled();await closed.unmount();
  mockOpen.mockReturnValue(true);mockLock.snapshot.locked=true;
  await render(<FamilyDirectoryScreen/>);expect(mockFamilies).not.toHaveBeenCalled();
});
it('selects only a fresh authorized family and does not display a failure as an empty list', async () => {
  mockOpen.mockReturnValue(true);
  const page=await render(<FamilyDirectoryScreen/>);
  await waitFor(() => expect(page.getByText('Our home')).toBeTruthy());
  await fireEvent.press(page.getByTestId('family-select-home'));
  expect(page.getByTestId('family-selected')).toBeTruthy();
  await page.unmount();mockFamilies.mockRejectedValue(new Error('offline'));
  const failed=await render(<FamilyDirectoryScreen/>);
  await waitFor(() => expect(failed.getByText('暂时连不上，稍后再看看。')).toBeTruthy());
  expect(failed.queryByText('现在还没有家庭。')).toBeNull();
});
it('keeps an uncertain name read-only and retries the same operation once', async () => {
  mockOpen.mockReturnValue(true);mockCreate.mockRejectedValueOnce({code:'NETWORK'}).mockResolvedValueOnce({familyId:'new'});
  const page=await render(<FamilyDirectoryScreen/>);
  await waitFor(() => expect(page.getByText('Our home')).toBeTruthy());
  await fireEvent.press(page.getByTestId('family-open-create'));
  await fireEvent.changeText(page.getByLabelText('家庭名称'),'New home');
  await fireEvent.press(page.getByTestId('family-create-submit'));
  await waitFor(() => expect(page.getByText('再试创建')).toBeTruthy());
  expect(page.getByLabelText('家庭名称').props.editable).toBe(false);
  const first=mockCreate.mock.calls[0];
  await act(async () => { await fireEvent.press(page.getByText('再试创建')); });
  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(2));
  expect(mockCreate.mock.calls[1].slice(0,2)).toEqual(first.slice(0,2));
});

it('shows capacity before creation and explains the full limit without a request', async () => {
  mockOpen.mockReturnValue(true);
  mockFamilies.mockResolvedValue({userId:'a',limit:10,families:Array.from({length:10},(_,i)=>({familyId:`h${i}`,name:`Home ${i}`,role:'creator',memberCount:1}))});
  const page=await render(<FamilyDirectoryScreen/>);
  await waitFor(() => expect(page.getByText('10 / 10')).toBeTruthy());
  expect(page.getByTestId('family-limit-hint')).toBeTruthy();
  expect(page.getByTestId('family-open-create').props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(page.getByTestId('family-open-create'));
  expect(page.queryByTestId('family-create-form')).toBeNull();
  expect(mockCreate).not.toHaveBeenCalled();
  expect(page.getByTestId('family-cover-wall')).toBeTruthy();
});
it('opens and cancels the name form without creating a family', async () => {
  mockOpen.mockReturnValue(true);
  const page=await render(<FamilyDirectoryScreen/>);
  await waitFor(() => expect(page.getByText('1 / 10')).toBeTruthy());
  expect(page.queryByLabelText('家庭名称')).toBeNull();
  await fireEvent.press(page.getByTestId('family-open-create'));
  expect(page.getByLabelText('家庭名称')).toBeTruthy();
  await fireEvent.press(page.getByText('取消'));
  expect(page.queryByTestId('family-create-form')).toBeNull();
  expect(mockCreate).not.toHaveBeenCalled();
});

it('welcomes signed-out users without presenting a connection error or private tiles', async () => {
  mockOpen.mockReturnValue(true);mockFamilies.mockRejectedValue({code:'UNAUTHENTICATED'});
  const page=await render(<FamilyDirectoryScreen/>);
  await waitFor(() => expect(page.getByTestId('family-signed-out')).toBeTruthy());
  expect(page.queryByTestId('family-connection-failed')).toBeNull();
  expect(page.queryByTestId('family-cover-wall')).toBeNull();
  expect(page.queryByText('再试一次')).toBeNull();
  await fireEvent.press(page.getByTestId('family-sign-in'));
  expect(mockPush).toHaveBeenCalledWith('/account-diagnostics');
});
