import {cleanup,fireEvent,render} from '@testing-library/react-native';
import {AlbumContentsPreview,albumContentsGroups} from './album-contents-preview';
import type {AlbumEntryView} from '../application/life-album';
function entry(id:string,dateLabel:string|null,overrides:Partial<AlbumEntryView>={}):AlbumEntryView{
 return {momentId:id,collectedAt:'',sourceRevisionAtCollect:1,source:'ready',noteExcerpt:'正文摘要',dateLabel,mediaHint:null,photoCount:0,hasAudio:false,unknownCount:0,audioDurationMs:null,thumbnailUri:null,occurredSortKey:null,...overrides};
}
afterEach(async()=>{await cleanup();});
it('merges adjacent dates without sorting or losing manually ordered moments',()=>{
 const entries=[entry('a','一天'),entry('b','一天'),entry('c','另一天'),entry('d','一天'),entry('e',null)];
 const original=JSON.stringify(entries),groups=albumContentsGroups(entries);
 expect(groups.map(g=>g.date)).toEqual(['一天','另一天','一天',null]);
 expect(groups.flatMap(g=>g.entries.map(x=>x.entry.momentId))).toEqual(['a','b','c','d','e']);
 expect(JSON.stringify(entries)).toBe(original);
});
it('shows the date once, two-line photo captions and decorative multi-photo stacks',async()=>{
 const open=jest.fn(),a=entry('a','同一天',{photoCount:3,thumbnailUri:'file:///a.jpg'}),b=entry('b','同一天',{photoCount:1,thumbnailUri:'file:///b.jpg'});
 const page=await render(<AlbumContentsPreview entries={[a,b]} onOpen={open}/>);
 expect(page.getAllByText('同一天')).toHaveLength(1);
 expect(page.getByTestId('life-album-entry-stack-a')).toBeTruthy();
 expect(page.queryByTestId('life-album-entry-media-a')).toBeNull();
 expect(page.getByTestId('life-album-entry-note-a').props.numberOfLines).toBe(2);
 await fireEvent.press(page.getByTestId('life-album-entry-open-b'));expect(open).toHaveBeenCalledWith(b);
});
it('keeps voice, unavailable media and missing source entries visible and tappable',async()=>{
 const open=jest.fn();
 const entries=[entry('voice',null,{hasAudio:true,audioDurationMs:12500,noteExcerpt:null}),entry('photo',null,{photoCount:1,unknownCount:1}),entry('missing','old date',{source:'missing',noteExcerpt:null})];
 const page=await render(<AlbumContentsPreview entries={entries} onOpen={open}/>);
 expect(page.getByTestId('life-album-entry-audio-voice')).toBeTruthy();
 expect(page.getByTestId('life-album-entry-unknown-photo')).toBeTruthy();
 expect(page.queryByText('old date')).toBeNull();
 await fireEvent.press(page.getByTestId('life-album-entry-open-missing'));expect(open).toHaveBeenCalledWith(entries[2]);
});
