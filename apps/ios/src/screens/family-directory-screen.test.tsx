import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import FamilyDirectoryScreen from './family-directory-screen';
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
  return { useRouter: () => ({ dismissTo: jest.fn(),push:jest.fn() }),useFocusEffect: (fn: () => void | (() => void)) => useEffect(fn,[fn]) };
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
  await waitFor(() => expect(failed.getByText('暂时读不到家庭。请确认登录后再试。')).toBeTruthy());
  expect(failed.queryByText('现在还没有家庭。')).toBeNull();
});
it('keeps an uncertain name read-only and retries the same operation once', async () => {
  mockOpen.mockReturnValue(true);mockCreate.mockRejectedValueOnce({code:'NETWORK'}).mockResolvedValueOnce({familyId:'new'});
  const page=await render(<FamilyDirectoryScreen/>);
  await waitFor(() => expect(page.getByText('Our home')).toBeTruthy());
  await fireEvent.changeText(page.getByLabelText('家庭名称'),'New home');
  await fireEvent.press(page.getByText('创建家庭'));
  await waitFor(() => expect(page.getByText('再试创建')).toBeTruthy());
  expect(page.getByLabelText('家庭名称').props.editable).toBe(false);
  const first=mockCreate.mock.calls[0];
  await act(async () => { await fireEvent.press(page.getByText('再试创建')); });
  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(2));
  expect(mockCreate.mock.calls[1].slice(0,2)).toEqual(first.slice(0,2));
});
