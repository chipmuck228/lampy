import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert, AppState } from 'react-native';
import { FamilySafetyActions } from './family-safety-actions';
const mockReport=jest.fn(),mockBlock=jest.fn(),mockLock={snapshot:{locked:false}};
jest.mock('../application/container',()=>({getFamilyUseCases:async()=>({safety:{report:mockReport,block:mockBlock}})}));
jest.mock('./device-lock-context',()=>({useDeviceLock:()=>mockLock}));
beforeEach(()=>{jest.clearAllMocks();mockLock.snapshot.locked=false;Object.defineProperty(AppState,'currentState',{configurable:true,value:'active'});jest.spyOn(Alert,'alert').mockImplementation(()=>{});mockReport.mockResolvedValue({reportId:'receipt_1'});mockBlock.mockResolvedValue(undefined);});
afterEach(()=>jest.restoreAllMocks());
it('submits only the selected reason and optional detail and shows the receipt',async()=>{
 const page=await render(<FamilySafetyActions familyId="f" shareId="s" authorUserId="b" current={()=>true} onHidden={jest.fn()}/>);
 await fireEvent.press(page.getByTestId('family-safety-menu'));await fireEvent.press(page.getByText('举报这条内容'));
 await fireEvent.press(page.getByText('隐私侵犯'));await fireEvent.changeText(page.getByLabelText('补充说明（可选）'),'please review');
 await fireEvent.press(page.getByText('提交举报'));
 expect(mockReport).toHaveBeenCalledWith('f','s',{requestId:expect.any(String),reason:'privacy',detail:'please review'},expect.any(Function));
 expect(Alert.alert).toHaveBeenCalledWith('已收到举报',expect.stringContaining('receipt_1'));
});
it('cancels blocking without writing and refuses a delayed confirmation after focus is lost',async()=>{
 let active=true;const page=await render(<FamilySafetyActions familyId="f" shareId="s" authorUserId="b" current={()=>active} onHidden={jest.fn()}/>);
 await fireEvent.press(page.getByTestId('family-safety-menu'));await fireEvent.press(page.getByText('不再看这位家人的内容'));
 expect(mockBlock).not.toHaveBeenCalled();const buttons=(Alert.alert as jest.Mock).mock.calls[0][2];
 active=false;await act(async()=>buttons[1].onPress());expect(mockBlock).not.toHaveBeenCalled();
});
it('hides the report modal when device protection locks',async()=>{
 const props={familyId:'f',shareId:'s',authorUserId:'b',current:()=>true,onHidden:jest.fn()};const page=await render(<FamilySafetyActions {...props}/>);
 await fireEvent.press(page.getByTestId('family-safety-menu'));expect(page.getByText('举报这条内容')).toBeTruthy();
 mockLock.snapshot.locked=true;await page.rerender(<FamilySafetyActions {...props}/>);
 expect(page.queryByText('举报这条内容')).toBeNull();
});
