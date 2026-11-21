import { freezeEpubSnapshot, type EpubSnapshotStore } from './album-epub-snapshot';
import type { AlbumLayoutInput } from './album-layout-input';
const input = {
  album: { id:'a',name:'Original',opening:'Words',cover:{kind:'words'},entries:[],updatedAt:'2026-11-21' },
  entries: [{ momentId:'m',note:'Original words',presence:'ready',revision:1,media:[{ assetId:'p',role:'image',availability:'available',uri:'file:///original' }] }],
} as unknown as AlbumLayoutInput;
function fixture() {
  const store: jest.Mocked<EpubSnapshotStore> = { begin:jest.fn<ReturnType<EpubSnapshotStore['begin']>,Parameters<EpubSnapshotStore['begin']>>(async()=>{}),copy:jest.fn<ReturnType<EpubSnapshotStore['copy']>,Parameters<EpubSnapshotStore['copy']>>(async()=>({file:'media-0',sha256:'hash',bytes:10})),verify:jest.fn<ReturnType<EpubSnapshotStore['verify']>,Parameters<EpubSnapshotStore['verify']>>(async()=>{}),commit:jest.fn<ReturnType<EpubSnapshotStore['commit']>,Parameters<EpubSnapshotStore['commit']>>(async()=>{}),discard:jest.fn<ReturnType<EpubSnapshotStore['discard']>,Parameters<EpubSnapshotStore['discard']>>(async()=>{}) };
  return { store,read:jest.fn(async()=>input),authorize:jest.fn(async()=>{}),id:'epub_test',now:'2026-11-21T00:00:00Z',style:'plain' as const,current:()=>true,dates:()=>({}) };
}
it('freezes a standalone edition without PDF/layout/font dependencies or original paths', async()=>{
  const deps=fixture();const snapshot=await freezeEpubSnapshot(deps);
  expect(snapshot.content.entries[0].media[0].uri).toBe('media-0');
  expect(snapshot).not.toHaveProperty('pdf');expect(snapshot).not.toHaveProperty('layout');
  expect(input.entries[0].media[0].uri).toBe('file:///original');
  expect(deps.authorize).toHaveBeenCalledTimes(2);expect(deps.store.verify).toHaveBeenCalledWith('file:///original','hash');
});
it.each(['background','leave','cancel'])('discards the pending snapshot on %s',async()=>{
  const deps=fixture();let valid=true;deps.current=()=>valid;
  deps.store.copy.mockImplementationOnce(async()=>{valid=false;return{file:'media-0',sha256:'hash',bytes:10};});
  await expect(freezeEpubSnapshot(deps)).rejects.toThrow('CANCELLED');
  expect(deps.store.discard).toHaveBeenCalledWith('epub_test');expect(deps.store.commit).not.toHaveBeenCalled();
});
it('discards a directory committed immediately before cancellation',async()=>{
  const deps=fixture();let valid=true;deps.current=()=>valid;deps.store.commit.mockImplementationOnce(async()=>{valid=false;});
  await expect(freezeEpubSnapshot(deps)).rejects.toThrow('CANCELLED');expect(deps.store.discard).toHaveBeenCalled();
});
it('rejects a changed source before publication',async()=>{
  const deps=fixture();deps.read.mockResolvedValueOnce(input).mockResolvedValueOnce({...input,album:{...input.album,name:'Changed'}});
  await expect(freezeEpubSnapshot(deps)).rejects.toThrow('SOURCE_CHANGED');expect(deps.store.commit).not.toHaveBeenCalled();
});
