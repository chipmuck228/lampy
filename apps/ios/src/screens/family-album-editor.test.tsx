import {fireEvent,render,waitFor} from '@testing-library/react-native';
import {FamilyAlbumEditor} from './family-album-editor';
import type {FamilyAlbumView} from '../family-api/family-album-types';
const mockRead=jest.fn();
jest.mock('../application/container',()=>({getFamilyUseCases:async()=>({history:{read:mockRead}})}));
jest.mock('expo-router',()=>{const {useEffect}=jest.requireActual('react');return {useFocusEffect:(fn:()=>void|(()=>void))=>useEffect(fn,[fn])};});
jest.mock('expo-image',()=>({Image:()=>null}));
const book={albumId:'b',familyId:'f',name:'Old name',opening:'Old opening',coverChoice:null,cover:{shareId:'s',objectId:'photo'},items:[{shareId:'s',status:'active',share:{authorNickname:'Author',snapshot:{media:[{objectId:'photo',mimeType:'image/png'}]}}},{shareId:'revoked',status:'withdrawn'}]} as unknown as FamilyAlbumView;
beforeEach(()=>{mockRead.mockReset();mockRead.mockResolvedValue({media:[{objectId:'photo',uri:'file:///private/photo'}]});});
it('edits the same name, opening and cover fields and submits one atomic change',async()=>{
 const save=jest.fn(),cancel=jest.fn();const page=await render(<FamilyAlbumEditor book={book} busy={false} onSave={save} onCancel={cancel}/>);
 await fireEvent.changeText(page.getByLabelText('册名'),'New name');await fireEvent.changeText(page.getByLabelText('开篇'),'Opening');
 await fireEvent.press(page.getByLabelText('选这张照片做封面 · Author · 照片 1'));await fireEvent.press(page.getByText('保存修改'));
 expect(save).toHaveBeenCalledWith({kind:'edit',name:'New name',opening:'Opening',coverChoice:{shareId:'s',objectId:'photo'}});
 await fireEvent.press(page.getByText('取消'));expect(cancel).toHaveBeenCalled();await waitFor(()=>expect(mockRead).toHaveBeenCalledWith('f','s',expect.any(Function)));
});
it('retains manual selection on open, can restore auto, and blocks writes while busy',async()=>{
 const save=jest.fn();const selected={...book,coverChoice:{shareId:'s',objectId:'photo'}};const page=await render(<FamilyAlbumEditor book={selected} busy={false} onSave={save} onCancel={jest.fn()}/>);
 await fireEvent.press(page.getByText('保存修改'));expect(save).toHaveBeenLastCalledWith(expect.objectContaining({coverChoice:selected.coverChoice}));
 await fireEvent.press(page.getByText('自动封面'));await fireEvent.press(page.getByText('保存修改'));expect(save).toHaveBeenLastCalledWith(expect.objectContaining({coverChoice:null}));
 save.mockClear();await page.rerender(<FamilyAlbumEditor book={selected} busy onSave={save} onCancel={jest.fn()}/>);await fireEvent.press(page.getByText('保存修改'));expect(save).not.toHaveBeenCalled();
});
