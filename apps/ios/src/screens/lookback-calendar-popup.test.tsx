import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LookbackCalendarPopup from './lookback-calendar-popup';
import { projectHistoryMonthFromCounts } from '../projections/history-projection';
import { resetLookbackSessionForTests } from '../application/lookback-session';
const mockBook=jest.fn(), mockMonth=jest.fn(), mockClose=jest.fn(), mockOpenDay=jest.fn();
const mockLock={snapshot:{locked:false}};
let mockStateListener:((state:string)=>void)|null=null;
jest.mock('../application/container',()=>({getUseCases:async()=>({getLookbackBook:mockBook,getHistoryMonth:mockMonth})}));
jest.mock('./device-lock-context',()=>({useDeviceLock:()=>mockLock}));
const book={years:[{year:2026,months:[{month:9,count:2}],yearUnconfirmedCount:0},{year:2025,months:[{month:1,count:1}],yearUnconfirmedCount:0}],unknownCount:0,isEmpty:false};
const month=(year=2026,m=9)=>projectHistoryMonthFromCounts(year,m,Array.from({length:m===9?30:31},(_,i)=>i===23?2:0),0);
function screen(){return <SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:390,height:844},insets:{top:47,left:0,right:0,bottom:34}}}><LookbackCalendarPopup visible onClose={mockClose} onOpenDay={mockOpenDay}/></SafeAreaProvider>;}
beforeEach(()=>{jest.clearAllMocks();resetLookbackSessionForTests();mockLock.snapshot.locked=false;Object.defineProperty(AppState,'currentState',{configurable:true,value:'active'});jest.spyOn(AppState,'addEventListener').mockImplementation((_,listener)=>{mockStateListener=listener as (s:string)=>void;return {remove:jest.fn()};});mockBook.mockResolvedValue(book);mockMonth.mockImplementation(async(y,m)=>month(y,m));});
afterEach(()=>jest.restoreAllMocks());
it('marks recorded days only and returns the selected full date to existing reading',async()=>{
 const view=await render(screen());await waitFor(()=>expect(view.getByTestId('lookback-day-2026-09-24')).toBeTruthy());
 expect(view.getByTestId('lookback-day-count-2026-09-24').props.children).toBe(2);
 expect(view.queryByTestId('lookback-day-2026-09-01')).toBeNull();expect(view.getByTestId('lookback-day-quiet-2026-09-01')).toBeTruthy();expect(view.getByTestId('calendar-later')).toBeDisabled();
 await fireEvent.press(view.getByTestId('lookback-day-2026-09-24'));expect(mockOpenDay).toHaveBeenCalledWith({year:2026,month:9,day:24});
});
it('jumps across years and ignores late results from a previous month',async()=>{
 const view=await render(screen());await waitFor(()=>expect(view.getByTestId('lookback-day-2026-09-24')).toBeTruthy());
 let finish!:(v:ReturnType<typeof month>)=>void;mockMonth.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 await fireEvent.press(view.getByTestId('calendar-earlier'));await waitFor(()=>expect(mockMonth).toHaveBeenCalledWith(2025,1));
 await fireEvent.press(view.getByTestId('calendar-later'));await waitFor(()=>expect(view.getByTestId('lookback-day-2026-09-24')).toBeTruthy());
 await act(async()=>{finish(month(2025,1));});expect(view.queryByTestId('lookback-day-2025-01-24')).toBeNull();
 await fireEvent.press(view.getByTestId('calendar-month-picker'));await fireEvent.press(view.getByTestId('calendar-month-2025-1'));await waitFor(()=>expect(view.getByTestId('lookback-day-2025-01-24')).toBeTruthy());expect(view.getByTestId('calendar-earlier')).toBeDisabled();
});
it('retries a loading failure without pretending the library is empty',async()=>{
 mockBook.mockRejectedValueOnce(Error('disk read'));const view=await render(screen());await waitFor(()=>expect(view.getByTestId('calendar-retry')).toBeTruthy());expect(view.queryByText('还没有日期明确的记录。')).toBeNull();await fireEvent.press(view.getByTestId('calendar-retry'));await waitFor(()=>expect(view.getByTestId('lookback-day-2026-09-24')).toBeTruthy());
});
it('does not invent dates for unknown and year-only records',async()=>{
 mockBook.mockResolvedValue({years:[{year:2025,months:[],yearUnconfirmedCount:1}],unknownCount:2,isEmpty:false});const view=await render(screen());await waitFor(()=>expect(view.getByText('还没有日期明确的记录。')).toBeTruthy());expect(view.getByText('日期未确认的记录仍在时间目录中。')).toBeTruthy();expect(mockMonth).not.toHaveBeenCalled();
});
it('hides dates on background and lock, rejects late work and reloads after returning',async()=>{
 let finish!:(v:ReturnType<typeof month>)=>void;mockMonth.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const view=await render(screen());await waitFor(()=>expect(mockMonth).toHaveBeenCalledTimes(1));await act(async()=>{mockStateListener?.('background');});await act(async()=>{finish(month());});expect(view.queryByTestId('lookback-month-calendar')).toBeNull();await act(async()=>{mockStateListener?.('active');});await waitFor(()=>expect(view.getByTestId('lookback-day-2026-09-24')).toBeTruthy());mockLock.snapshot.locked=true;await view.rerender(screen());expect(view.queryByTestId('lookback-month-calendar')).toBeNull();
});

it('outside tap and explicit close dismiss without selecting a date',async()=>{
 const view=await render(screen());await waitFor(()=>expect(view.getByTestId('lookback-day-2026-09-24')).toBeTruthy());
 await fireEvent.press(view.getByTestId('calendar-backdrop'));expect(mockClose).toHaveBeenCalledTimes(1);expect(mockOpenDay).not.toHaveBeenCalled();
 await fireEvent.press(view.getByTestId('calendar-close'));expect(mockClose).toHaveBeenCalledTimes(2);
});
