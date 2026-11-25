import { act, fireEvent, render } from '@testing-library/react-native';
import { PanResponder, Text } from 'react-native';
import { AlbumEditionSwipeRow } from './album-edition-swipe-row';
it('reveals a deliberate delete action and does not delete on reveal',async()=>{
 const remove=jest.fn();const v=await render(<AlbumEditionSwipeRow id="epub_1" disabled={false} onDelete={remove}><Text>One</Text></AlbumEditionSwipeRow>);
 expect(v.queryByLabelText('删除这版成品')).toBeNull();
 await fireEvent.press(v.getByLabelText('成品操作'));expect(remove).not.toHaveBeenCalled();
 await fireEvent.press(v.getByLabelText('删除这版成品'));expect(remove).toHaveBeenCalledTimes(1);
 expect(v.queryByLabelText('删除这版成品')).toBeNull();
});
it('closes and disables the action while an operation is busy',async()=>{
 const remove=jest.fn();const v=await render(<AlbumEditionSwipeRow id="epub_1" disabled={false} onDelete={remove}><Text>One</Text></AlbumEditionSwipeRow>);
 await fireEvent.press(v.getByLabelText('成品操作'));
 await v.rerender(<AlbumEditionSwipeRow id="epub_1" disabled onDelete={remove}><Text>One</Text></AlbumEditionSwipeRow>);
 expect(v.queryByLabelText('删除这版成品')).toBeNull();
 await fireEvent.press(v.getByLabelText('成品操作'));expect(remove).not.toHaveBeenCalled();
});
it('shares on whole-row tap and reveals share/delete together without executing either',async()=>{
 const share=jest.fn(),remove=jest.fn();const v=await render(<AlbumEditionSwipeRow id="epub_two" disabled={false} onShare={share} onDelete={remove}><Text>Album</Text></AlbumEditionSwipeRow>);
 expect(v.queryByLabelText('成品操作')).toBeNull();
 await fireEvent.press(v.getByTestId('edition-open-epub_two'));expect(share).toHaveBeenCalledTimes(1);expect(remove).not.toHaveBeenCalled();
 await fireEvent(v.getByTestId('edition-open-epub_two'),'accessibilityAction',{nativeEvent:{actionName:'showActions'}});
 expect(v.getByText('分享')).toBeTruthy();expect(v.getByText('删除')).toBeTruthy();expect(remove).not.toHaveBeenCalled();
 await fireEvent.press(v.getByTestId('edition-share-epub_two'));expect(share).toHaveBeenCalledTimes(2);expect(v.queryByText('删除')).toBeNull();
 await fireEvent(v.getByTestId('edition-open-epub_two'),'accessibilityAction',{nativeEvent:{actionName:'showActions'}});
 await fireEvent.press(v.getByLabelText('删除这版成品'));expect(remove).toHaveBeenCalledTimes(1);
});
it('disables whole-row and accessible actions and closes the dual action tray while busy',async()=>{
 const share=jest.fn(),remove=jest.fn();const row=(disabled:boolean)=><AlbumEditionSwipeRow id="epub_busy" disabled={disabled} onShare={share} onDelete={remove}><Text>Album</Text></AlbumEditionSwipeRow>;
 const v=await render(row(false));await fireEvent(v.getByTestId('edition-open-epub_busy'),'accessibilityAction',{nativeEvent:{actionName:'showActions'}});
 await v.rerender(row(true));expect(v.queryByText('删除')).toBeNull();
 await fireEvent.press(v.getByTestId('edition-open-epub_busy'));
 await fireEvent(v.getByTestId('edition-open-epub_busy'),'accessibilityAction',{nativeEvent:{actionName:'delete'}});
 expect(share).not.toHaveBeenCalled();expect(remove).not.toHaveBeenCalled();
});

it('requires a deliberate horizontal left swipe to reveal both actions without sharing or deleting',async()=>{
 const spy=jest.spyOn(PanResponder,'create'),share=jest.fn(),remove=jest.fn();
 const v=await render(<AlbumEditionSwipeRow id="epub_gesture" disabled={false} onShare={share} onDelete={remove}><Text>Album</Text></AlbumEditionSwipeRow>);
 const config=spy.mock.calls[spy.mock.calls.length-1][0];
 expect(config.onMoveShouldSetPanResponder!({} as never,{dx:-10,dy:50} as never)).toBe(false);
 expect(config.onMoveShouldSetPanResponder!({} as never,{dx:-70,dy:2} as never)).toBe(true);
 await act(async()=>{config.onPanResponderRelease!({} as never,{dx:-70,dy:2} as never);});
 expect(v.getByText('分享')).toBeTruthy();expect(v.getByText('删除')).toBeTruthy();
 expect(share).not.toHaveBeenCalled();expect(remove).not.toHaveBeenCalled();spy.mockRestore();
});
