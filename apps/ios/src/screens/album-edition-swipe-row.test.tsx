import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';
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
