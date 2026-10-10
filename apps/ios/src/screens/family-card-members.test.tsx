import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, AppState } from 'react-native';
import { FamilyCardMembers } from './family-card-members';
const mockTransfer=jest.fn(),mockCreateTransfer=jest.fn(),mockRespondTransfer=jest.fn();
const mockMembers=jest.fn(),mockLeave=jest.fn(),mockRemove=jest.fn(),mockChanged=jest.fn();
const mockLock={snapshot:{locked:false}};
jest.mock('expo-router',()=>{const {useEffect}=jest.requireActual('react');return {useFocusEffect:(fn:()=>void)=>useEffect(fn,[fn])};});
jest.mock('../application/container',()=>({getFamilyUseCases:async()=>({history:{getCreatorTransfer:mockTransfer,createCreatorTransfer:mockCreateTransfer,respondCreatorTransfer:mockRespondTransfer,getMembers:mockMembers,leaveFamily:mockLeave,removeMember:mockRemove}})}));
jest.mock('../infrastructure/family-config',()=>({isFamilyProductEntryOpen:()=>true}));
jest.mock('./device-lock-context',()=>({useDeviceLock:()=>mockLock}));
const member={membershipId:'mb',userId:'b',role:'member',joinedAt:'2026-10-09T00:00:00Z'};
const creator={membershipId:'ma',userId:'a',role:'creator',joinedAt:'2026-10-08T00:00:00Z'};
const roster={familyId:'home',userId:'b',role:'member',membershipId:'mb',members:[creator,member]};
beforeEach(()=>{jest.clearAllMocks();mockTransfer.mockResolvedValue(null);mockLock.snapshot.locked=false;Object.defineProperty(AppState,'currentState',{configurable:true,value:'active'});mockMembers.mockResolvedValue(roster);mockLeave.mockResolvedValue({left:true});mockRemove.mockResolvedValue({removed:true});});
afterEach(()=>jest.restoreAllMocks());
async function open(){const page=await render(<FamilyCardMembers familyId="home" onChanged={mockChanged}/>);await fireEvent.press(page.getByTestId('family-members-home'));await waitFor(()=>expect(mockMembers).toHaveBeenCalled());await waitFor(()=>expect(page.getByText('你')).toBeTruthy());return page;}
it('keeps leave behind explicit confirmation and refreshes the directory only after success',async()=>{
 const alert=jest.spyOn(Alert,'alert');const page=await open();await fireEvent.press(page.getByTestId('family-leave'));
 expect(mockLeave).not.toHaveBeenCalled();expect(alert.mock.calls[0][1]).toContain('已经分享的片段会保留');
 await act(async()=>{alert.mock.calls[0][2]![1].onPress!();});expect(mockLeave).toHaveBeenCalledWith(roster,expect.any(Function));expect(mockChanged).toHaveBeenCalledTimes(1);
});
it('does not show creator leave or self-removal; confirms the exact member membership',async()=>{
 const expected={...roster,userId:'a',role:'creator',membershipId:'ma'};mockMembers.mockResolvedValue(expected);
 const alert=jest.spyOn(Alert,'alert');const page=await open();expect(page.queryByTestId('family-leave')).toBeNull();expect(page.queryByTestId('family-remove-ma')).toBeNull();
 await fireEvent.press(page.getByTestId('family-member-mb'));await fireEvent.press(page.getByTestId('family-remove-mb'));await act(async()=>{alert.mock.calls[0][2]![1].onPress!();});expect(mockRemove).toHaveBeenCalledWith(expected,'mb',expect.any(Function));
});
it('discards an alert confirmed after unmount',async()=>{
 const alert=jest.spyOn(Alert,'alert');const page=await open();await fireEvent.press(page.getByTestId('family-leave'));const confirm=alert.mock.calls[0][2]![1].onPress!;
 await page.unmount();await act(async()=>{confirm();});expect(mockLeave).not.toHaveBeenCalled();
});
it('shows retry after a failed read and hides names under protection',async()=>{
 mockMembers.mockRejectedValueOnce({code:'NETWORK'});const page=await render(<FamilyCardMembers familyId="home" onChanged={mockChanged}/>);
 await fireEvent.press(page.getByTestId('family-members-home'));await waitFor(()=>expect(page.getByText('再试一次')).toBeTruthy());await fireEvent.press(page.getByText('再试一次'));await waitFor(()=>expect(page.getByText('你')).toBeTruthy());
 mockLock.snapshot.locked=true;await page.rerender(<FamilyCardMembers familyId="home" onChanged={mockChanged}/>);expect(page.queryByText('你')).toBeNull();
});

it('discards background confirmation and does not duplicate a pending leave', async () => {
 const alert=jest.spyOn(Alert,'alert');const page=await open();await fireEvent.press(page.getByTestId('family-leave'));const confirm=alert.mock.calls[0][2]![1].onPress!;
 Object.defineProperty(AppState,'currentState',{configurable:true,value:'background'});await act(async()=>{confirm();});expect(mockLeave).not.toHaveBeenCalled();
 Object.defineProperty(AppState,'currentState',{configurable:true,value:'active'});
 let finish!:()=>void;mockLeave.mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve;}));
 await act(async()=>{confirm();});await waitFor(()=>expect(mockLeave).toHaveBeenCalledTimes(1));
 await act(async()=>{confirm();});expect(mockLeave).toHaveBeenCalledTimes(1);
 await act(async()=>{finish();});expect(mockChanged).toHaveBeenCalledTimes(1);
});
it('reloads the directory when the last viewed membership is no longer valid', async () => {
 mockMembers.mockRejectedValue({code:'NOT_IN_FAMILY'});const page=await render(<FamilyCardMembers familyId="home" onChanged={mockChanged}/>);
 await fireEvent.press(page.getByTestId('family-members-home'));await waitFor(()=>expect(mockChanged).toHaveBeenCalledTimes(1));
 expect(page.queryByTestId('family-leave')).toBeNull();
});
const pendingTransfer={transferId:'t',familyId:'home',requestId:'i',fromUserId:'a',toUserId:'b',fromMembershipId:'ma',toMembershipId:'mb',status:'pending',revision:1,createdAt:'now',updatedAt:'now'};
it('E2 shows a pending transfer without accepting it; only explicit confirmation accepts',async()=>{
 mockTransfer.mockResolvedValue(pendingTransfer);mockRespondTransfer.mockResolvedValue({...pendingTransfer,status:'accepted'});
 const alert=jest.spyOn(Alert,'alert'),page=await open();expect(mockRespondTransfer).not.toHaveBeenCalled();
 await fireEvent.press(page.getByTestId('family-transfer-accept'));expect(mockRespondTransfer).not.toHaveBeenCalled();
 await act(async()=>{alert.mock.calls[0][2]![1].onPress!();});expect(mockRespondTransfer).toHaveBeenCalledWith(roster,pendingTransfer,'accept',expect.any(Function));expect(mockChanged).toHaveBeenCalledTimes(1);
});
it('E2 keeps creation behind confirmation and blocks duplicate creation while submitting',async()=>{
 const expected={...roster,userId:'a',role:'creator',membershipId:'ma'};mockMembers.mockResolvedValue(expected);
 let finish!:(t:typeof pendingTransfer)=>void;mockCreateTransfer.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const alert=jest.spyOn(Alert,'alert'),page=await open();await fireEvent.press(page.getByTestId('family-member-mb'));await fireEvent.press(page.getByTestId('family-transfer-mb'));expect(mockCreateTransfer).not.toHaveBeenCalled();
 const confirm=alert.mock.calls[0][2]![1].onPress!;await act(async()=>{confirm();});await waitFor(()=>expect(mockCreateTransfer).toHaveBeenCalledTimes(1));
 await act(async()=>{confirm();});expect(mockCreateTransfer).toHaveBeenCalledTimes(1);
 await act(async()=>{finish(pendingTransfer);});expect(page.getByTestId('family-transfer-cancel')).toBeTruthy();expect(mockChanged).not.toHaveBeenCalled();
});
it('E2 ignores a transfer alert confirmed after leaving the screen',async()=>{
 mockTransfer.mockResolvedValue(pendingTransfer);const alert=jest.spyOn(Alert,'alert'),page=await open();await fireEvent.press(page.getByTestId('family-transfer-accept'));const confirm=alert.mock.calls[0][2]![1].onPress!;
 await page.unmount();await act(async()=>{confirm();});expect(mockRespondTransfer).not.toHaveBeenCalled();
});
it('E2 retains the creation intent after uncertain failure so a retry cannot create a second request',async()=>{
 const expected={...roster,userId:'a',role:'creator',membershipId:'ma'};mockMembers.mockResolvedValue(expected);mockCreateTransfer.mockRejectedValueOnce({code:'NETWORK'}).mockResolvedValueOnce(pendingTransfer);
 const alert=jest.spyOn(Alert,'alert'),page=await open();await fireEvent.press(page.getByTestId('family-member-mb'));await fireEvent.press(page.getByTestId('family-transfer-mb'));await act(async()=>{alert.mock.calls[0][2]![1].onPress!();});
 await fireEvent.press(page.getByText('再试一次'));await waitFor(()=>expect(page.getByTestId('family-member-mb')).toBeTruthy());
 await fireEvent.press(page.getByTestId('family-member-mb'));await fireEvent.press(page.getByTestId('family-transfer-mb'));await act(async()=>{alert.mock.calls[1][2]![1].onPress!();});
 expect(mockCreateTransfer.mock.calls[0][2]).toBe(mockCreateTransfer.mock.calls[1][2]);expect(mockCreateTransfer).toHaveBeenCalledTimes(2);
});
it('shows actions only below the selected member and switches selection without sending a command',async()=>{
 const third={...member,membershipId:'mc',userId:'c'};
 mockMembers.mockResolvedValue({...roster,userId:'a',role:'creator',membershipId:'ma',members:[creator,member,third]});
 const page=await open();
 expect(page.queryByTestId('family-transfer-mb')).toBeNull();expect(page.queryByTestId('family-remove-mb')).toBeNull();
 expect(page.queryByText(/加入于/)).toBeNull();expect(page.queryByText('创建者可以转交给现有成员；解散将在后续提供。')).toBeNull();
 await fireEvent.press(page.getByTestId('family-member-mb'));
 expect(page.getByTestId('family-member-mb').props.accessibilityState.expanded).toBe(true);
 expect(page.getByTestId('family-transfer-mb')).toBeTruthy();expect(page.getByTestId('family-remove-mb')).toBeTruthy();
 await fireEvent.press(page.getByTestId('family-member-mc'));
 expect(page.queryByTestId('family-member-actions-mb')).toBeNull();expect(page.getByTestId('family-remove-mc')).toBeTruthy();
 await fireEvent.press(page.getByTestId('family-member-mc'));expect(page.queryByTestId('family-member-actions-mc')).toBeNull();
 expect(mockCreateTransfer).not.toHaveBeenCalled();expect(mockRemove).not.toHaveBeenCalled();
});
it('does not offer member management to a recipient or under protection',async()=>{
 const page=await open();expect(page.queryByTestId('family-member-ma')).toBeNull();expect(page.queryByTestId('family-transfer-mb')).toBeNull();
 mockLock.snapshot.locked=true;await page.rerender(<FamilyCardMembers familyId="home" onChanged={mockChanged}/>);expect(page.queryByText('你')).toBeNull();
});
