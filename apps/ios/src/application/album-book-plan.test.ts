import {planBookSections,selectBookCover,bookDateRange,chronologicalBook} from './album-book-plan';
import type {AlbumEpubOptions} from './album-epub';
const record=(id:string,day:string,note='短短的一天。')=>({momentId:id,collectedAt:'',sourceRevisionAtCollect:1,presence:'ready' as const,revision:1,note,attribution:'家人',feeling:'',occurredAt:day+'T12:00:00Z',occurredAtPrecision:'day' as const,recordedAt:'',media:[]});
const options:AlbumEpubOptions={input:{album:{id:'a',schemaVersion:1,name:'日子',opening:null,cover:{kind:'words'},entries:[],createdAt:'',updatedAt:''},entries:[record('1','2026-01-01'),record('2','2026-01-01'),record('3','2026-01-02')]},assets:{},language:'zh-Hans',id:'book',createdAt:'2026-11-24T00:00:00Z',dates:{}};
it('groups consecutive brief records on known days without reordering or merging across days',()=>{
 expect(planBookSections(options).map(p=>p.indices)).toEqual([[0,1],[2]]);
 const entries=[...options.input.entries,record('4','2026-01-01')];expect(planBookSections({...options,input:{...options.input,entries}}).map(p=>p.indices)).toEqual([[0,1],[2],[3]]);
 expect(bookDateRange(options)).toBe('2026-01-01 — 2026-01-02');
});
it('does not group long or multiline prose',()=>{
 const entries=[record('1','2026-01-01','文'.repeat(81)),record('2','2026-01-01','分行\n文字')];expect(planBookSections({...options,input:{...options.input,entries}}).map(p=>p.indices)).toEqual([[0],[1]]);
});
it('chooses a sufficiently large photo closest to the landscape cover ratio, respecting explicit selection',()=>{
 const media=[{assetId:'portrait',role:'image' as const,availability:'available' as const,intrinsicRatio:.7,widthPx:1400,heightPx:2000,durationMs:null},{assetId:'landscape',role:'image' as const,availability:'available' as const,intrinsicRatio:1.4,widthPx:1400,heightPx:1000,durationMs:null}];
 const input={...options.input,entries:[{...options.input.entries[0],media}]};const assets={portrait:{path:'media/portrait.jpg',mime:'image/jpeg'},landscape:{path:'media/landscape.jpg',mime:'image/jpeg'}};
 expect(selectBookCover({...options,input,assets})).toBe('media/landscape.jpg');
 expect(selectBookCover({...options,input:{...input,album:{...input.album,cover:{kind:'image',momentId:'1',assetId:'portrait'}}},assets})).toBe('media/portrait.jpg');
 expect(selectBookCover(options)).toBe('');
});

it('sorts exports by moment time, retains ties, places unknown dates last and leaves source untouched',()=>{
 const entries=[record('late','2026-01-03'),record('early','2026-01-01'),record('tie','2026-01-01'),{...record('unknown','2025-01-01'),occurredAtPrecision:'unknown' as const}];
 const source={...options,input:{...options.input,entries}};expect(chronologicalBook(source).input.entries.map(e=>e.momentId)).toEqual(['early','tie','late','unknown']);expect(source.input.entries[0].momentId).toBe('late');
});
