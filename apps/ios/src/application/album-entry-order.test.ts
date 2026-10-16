import {moveAlbumReference} from './album-entry-order';
it('uses the same stable single-step ordering for either kind of album',()=>{
 const ids=['a','b','c'];expect(moveAlbumReference(ids,'b','up')).toEqual(['b','a','c']);expect(moveAlbumReference(ids,'b','down')).toEqual(['a','c','b']);expect(ids).toEqual(['a','b','c']);
});
it('does not cross boundaries or invent a missing entry',()=>{
 expect(moveAlbumReference(['a','b'],'a','up')).toEqual(['a','b']);expect(moveAlbumReference(['a','b'],'b','down')).toEqual(['a','b']);expect(moveAlbumReference(['a'],'missing','up')).toBeNull();
});
