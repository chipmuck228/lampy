import { albumFileFailureCode, albumFileEvaluationOpen, albumFileInput, validateAlbumFile, type AlbumFile } from './album-file';
import { receiveAlbumFile, pendingAlbumFile, forgetAlbumFile } from './album-file-open';
const hash = 'a'.repeat(64);
export function bookFixture(): AlbumFile {return {format:'lampy',version:1,readingVersion:1,layoutVersion:'album-a5-v5',name:'一册🙂',opening:'开篇',style:'handmade',createdAt:'2026-10-14',cover:null,
  fonts:{policy:'system-not-redistributed',serif:'TimesNewRomanPSMT',ui:'PingFangSC-Regular'},
  records:[{note:'全文🦞\n💩',feeling:'平静',occurredAtPrecision:'exact',occurredAt:'2026-10-14T01:00:00Z',recordedAt:'2026-10-14T01:00:00Z',media:[{file:'media-0.m4a',role:'audio',durationMs:8000}]}],
  files:[{name:'album.pdf',bytes:100,sha256:hash},{name:'media-0.m4a',bytes:100,sha256:hash}]};}
const hashes = {'album.pdf':hash,'media-0.m4a':hash};
it('external reading is built entirely from the frozen package with session IDs',()=>{
  const book = validateAlbumFile(JSON.stringify(bookFixture()),hashes);
  const input = albumFileInput(book,'file:///temporary/','session');
  expect(input.entries[0].note).toBe('全文🦞\n💩');
  expect(input.entries[0].media[0].uri).toBe('file:///temporary/media-0.m4a');
  expect(input.entries[0].momentId).toBe('session-r0');
});
it.each(['../escape','https://example.com/a','media-0.js','/absolute','media-0.png/../../bad'])('rejects unsafe or unsupported media reference %s',file=>{
  const book=bookFixture();book.records[0].media[0].file=file;
  expect(()=>validateAlbumFile(JSON.stringify(book),hashes)).toThrow();
});
it('rejects unknown versions, fields, mismatched hashes and undeclared resources',()=>{
  for (const mutate of [
    (book:AlbumFile)=>Object.assign(book,{version:2}),
    (book:AlbumFile)=>Object.assign(book,{serverToken:'secret'}),
    (book:AlbumFile)=>{book.files.push({...book.files[0]});},
    (book:AlbumFile)=>{book.records[0].media=[];},
  ]) {const book=bookFixture();mutate(book);expect(()=>validateAlbumFile(JSON.stringify(book),hashes)).toThrow();}
  expect(()=>validateAlbumFile(JSON.stringify(bookFixture()),{...hashes,'media-0.m4a':'b'.repeat(64)})).toThrow('FILE_CHANGED');
});
it('cover must point to a valid image, and dimension/duration limits are checked',()=>{
  const book=bookFixture();book.cover={record:0,media:0};expect(()=>validateAlbumFile(JSON.stringify(book),hashes)).toThrow();
  book.cover=null;book.records[0].media[0].durationMs=-1;
  expect(()=>validateAlbumFile(JSON.stringify(book),hashes)).toThrow();
});
it('creation remains default off and release cannot enable it',()=>{
  expect(albumFileEvaluationOpen(true,'1')).toBe(true);expect(albumFileEvaluationOpen(false,'1')).toBe(false);expect(albumFileEvaluationOpen(true,'')).toBe(false);
});
it('file URLs are memory-only, repeats reuse the session and close forgets it',()=>{
  const token=receiveAlbumFile('file:///received/book.lampy');expect(receiveAlbumFile('file:///received/book.lampy')).toBe(token);
  expect(pendingAlbumFile(token)).toBe('file:///received/book.lampy');forgetAlbumFile(token);expect(pendingAlbumFile(token)).toBeNull();
  expect(receiveAlbumFile('file:///received/book.lampy')).not.toBe(token);
  expect(()=>receiveAlbumFile('https://example.com/book.lampy')).toThrow();
});

it('diagnostics never expose arbitrary private source text or paths',()=>{
  expect(albumFileFailureCode(new Error('FILE_FONTS_UNAVAILABLE'))).toBe('FILE_FONTS_UNAVAILABLE');
  expect(albumFileFailureCode(new Error('private title file:///private/path'))).toBe('FILE_OPERATION_FAILED');
});
