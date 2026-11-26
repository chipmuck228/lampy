import {fireEvent,render} from '@testing-library/react-native';
import {FamilyAlbumContents,familyAlbumContentsEntries} from './family-album-contents';
import type {FamilyAlbumItem,FamilyAlbumView} from '../family-api/family-album-types';
jest.mock('./family-album-editor',()=>{const {View}=jest.requireActual('react-native');return {FamilyAlbumCoverPreview:({cover}:{cover:{objectId:string}})=><View testID={`private-photo-${cover.objectId}`}/>};});
function item(id:string,note:string,media:{mimeType:string;objectId:string}[]=[],date?:string,precision='unknown'):FamilyAlbumItem{
 return {shareId:id,status:'active',share:{authorNickname:'家人甲',snapshot:{note,media,occurredAt:date,occurredAtPrecision:precision}}} as unknown as FamilyAlbumItem;
}
it('adapts in original order without exposing withdrawn text or inventing exact dates',()=>{
 const items=[item('b','First',[],'2026-06-01T12:00:00Z','month'),{shareId:'gone',status:'withdrawn'} as FamilyAlbumItem,item('a','Last',[],'2026-01-01T12:00:00Z','unknown')];
 const before=JSON.stringify(items),entries=familyAlbumContentsEntries(items);
 expect(entries.map(e=>e.momentId)).toEqual(['b','gone','a']);expect(entries[0].dateLabel).toContain('2026');expect(entries[1].noteExcerpt).toBeNull();expect(entries[2].dateLabel).toBeNull();expect(JSON.stringify(items)).toBe(before);
});
it('uses the shared two-column preview with private photos, authors, audio and unavailable placeholders',async()=>{
 const items=[item('photo','Photo words',[{mimeType:'image/jpeg',objectId:'p1'},{mimeType:'image/jpeg',objectId:'p2'}]),item('voice','Voice words',[{mimeType:'audio/mp4',objectId:'voice'}]),{shareId:'gone',status:'withdrawn'} as FamilyAlbumItem];
 const book={familyId:'f',items} as FamilyAlbumView;const open=jest.fn();const page=await render(<FamilyAlbumContents book={book} disabled={false} onOpen={open}/>);
 expect(page.getByTestId('family-album-content-tiles')).toBeTruthy();expect(page.getByTestId('private-photo-p1')).toBeTruthy();expect(page.queryByTestId('private-photo-p2')).toBeNull();
 expect(page.getAllByText('家人甲')).toHaveLength(2);expect(page.getByTestId('family-album-entry-note-photo').props.numberOfLines).toBe(2);expect(page.getByTestId('family-album-entry-audio-voice')).toBeTruthy();expect(page.getByText('这条分享已不可用。')).toBeTruthy();
 await fireEvent.press(page.getByTestId('family-album-entry-open-gone'));expect(open).not.toHaveBeenCalled();await fireEvent.press(page.getByTestId('family-album-entry-open-photo'));expect(open).toHaveBeenCalledWith('photo');
});
