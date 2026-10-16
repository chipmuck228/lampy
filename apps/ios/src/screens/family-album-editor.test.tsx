import {fireEvent,render,waitFor} from '@testing-library/react-native';
import {FamilyAlbumEditor} from './family-album-editor';
import type {FamilyAlbumView} from '../family-api/family-album-types';
const mockRead=jest.fn();
jest.mock('../application/container',()=>({getFamilyUseCases:async()=>({history:{read:mockRead}})}));
jest.mock('expo-router',()=>{const {useEffect}=jest.requireActual('react');return {useFocusEffect:(fn:()=>void|(()=>void))=>useEffect(fn,[fn])};});
jest.mock('expo-image',()=>({Image:()=>null}));
const book={albumId:'b',familyId:'f',name:'Old name',opening:'Old opening',coverChoice:null,cover:{shareId:'s',objectId:'photo'},items:[{shareId:'s',status:'active',share:{authorNickname:'Author',snapshot:{media:[{objectId:'photo',mimeType:'image/png'}]}}},{shareId:'revoked',status:'withdrawn'}]} as unknown as FamilyAlbumView;
beforeEach(()=>{mockRead.mockReset();mockRead.mockResolvedValue({media:[{objectId:'photo',uri:'file:///private/photo'}]});});
it('uses separate name/opening saves and saves covers on selection like the personal editor',async()=>{
 const save=jest.fn();const page=await render(<FamilyAlbumEditor book={book} busy={false} onSave={save}/>);
 await fireEvent.changeText(page.getByLabelText('册名'),'New name');await fireEvent.changeText(page.getByLabelText('开篇'),'Opening');
 await fireEvent(page.getByLabelText('册名'),'submitEditing');expect(save).toHaveBeenLastCalledWith({kind:'rename',name:'New name',opening:'Old opening'});
 await fireEvent.press(page.getByLabelText('保存开篇'));expect(save).toHaveBeenLastCalledWith({kind:'rename',name:'Old name',opening:'Opening'});
 await fireEvent.press(page.getByLabelText('选这张照片做封面 · Author · 照片 1'));expect(save).toHaveBeenLastCalledWith({kind:'edit',name:'Old name',opening:'Old opening',coverChoice:{shareId:'s',objectId:'photo'}});
 await waitFor(()=>expect(mockRead).toHaveBeenCalledWith('f','s',expect.any(Function),'photo'));
});
it('restores auto on selection and blocks all writes while busy',async()=>{
 const save=jest.fn();const selected={...book,coverChoice:{shareId:'s',objectId:'photo'}};const page=await render(<FamilyAlbumEditor book={selected} busy={false} onSave={save}/>);
 await fireEvent.press(page.getByText('自动封面'));expect(save).toHaveBeenLastCalledWith(expect.objectContaining({coverChoice:null}));
 save.mockClear();await page.rerender(<FamilyAlbumEditor book={selected} busy onSave={save}/>);await fireEvent.press(page.getByLabelText('保存册名'));await fireEvent.press(page.getByLabelText('保存开篇'));expect(save).not.toHaveBeenCalled();
});
