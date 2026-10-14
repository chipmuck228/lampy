import * as FileSystem from 'expo-file-system/legacy';
import { albumArchiveNative, albumPrintNative, diagnoseAlbumFonts } from '../../modules/lampy-album-layout';
import { albumFileInput, makeAlbumFile, validateAlbumFile, type AlbumFile } from '../application/album-file';
import { manifestDigest, type PrintManifest } from '../application/album-print';
let prepared: Promise<void> | null = null;
export function prepareAlbumFileSessions() {
  if (!prepared) prepared = Promise.resolve().then(() => albumArchiveNative().cleanAlbumArchiveSessions()).catch(error => {prepared = null; throw error;});
  return prepared;
}
export function newAlbumFileSessionId() { return `file_${Date.now()}_${Math.random().toString(36).slice(2,10)}`; }
export async function closeAlbumFileSession(id: string) { await albumArchiveNative().closeAlbumArchive(id); }
export type OpenAlbumFile = {id: string; directory: string; book: AlbumFile; input: ReturnType<typeof albumFileInput>};
export async function openAlbumFile(source: string, id: string, current: () => boolean): Promise<OpenAlbumFile> {
  await prepareAlbumFileSessions(); if (!current()) throw new Error('FILE_CANCELLED');
  let extracted = false;
  try {
    const result = await albumArchiveNative().openAlbumArchive(source,id);
    extracted = true;
    if (!current()) throw new Error('FILE_CANCELLED');
    const book = validateAlbumFile(result.manifest,result.hashes);
    const fonts = diagnoseAlbumFonts(book.fonts.serif,book.fonts.ui);
    if (!fonts || fonts.serif.fontName !== book.fonts.serif || fonts.ui.fontName !== book.fonts.ui) throw new Error('FILE_FONTS_UNAVAILABLE');
    return {id,directory:result.directory,book,input:albumFileInput(book,result.directory,id)};
  } catch (error) { if (extracted) await closeAlbumFileSession(id); throw error; }
}
export async function createAlbumFileEdition(editionId: string, current: () => boolean) {
  const id = newAlbumFileSessionId();
  const assertCurrent = () => {if (!current()) throw new Error('FILE_CANCELLED');};
  await prepareAlbumFileSessions(); assertCurrent();
  if (!/^print_[a-zA-Z0-9_-]{1,90}$/.test(editionId) || !FileSystem.documentDirectory) throw new Error('FILE_INVALID');
  const source = `${FileSystem.documentDirectory}album-print-evaluation/${editionId}/`;
  const manifest: PrintManifest = JSON.parse(await FileSystem.readAsStringAsync(`${source}manifest.json`));
  if (manifest.id !== editionId || manifest.version !== 1 || manifestDigest(manifest) !== await FileSystem.readAsStringAsync(`${source}manifest.sha256`)) throw new Error('FILE_CHANGED');
  assertCurrent();
  const estimate = manifest.media.reduce((total,item) => total + item.bytes,manifest.pdf.bytes);
  if (estimate > 512 * 1024 * 1024 || manifest.media.length > 510 || manifest.content.entries.length > 2000) throw new Error('FILE_TOO_LARGE');
  const available = await FileSystem.getFreeDiskStorageAsync();
  if (available < estimate * 3 + 16 * 1024 * 1024) throw new Error('FILE_NO_SPACE');
  let owned = false;
  try {
    const directory = await albumArchiveNative().beginAlbumArchive(id); owned = true; assertCurrent();
    const files: AlbumFile['files'] = [];
    const dimensions: Record<string,{widthPx?:number;heightPx?:number}> = {};
    for (const [index, item] of manifest.media.entries()) {
      if (!/^media-[0-9]+$/.test(item.file)) throw new Error('FILE_INVALID');
      const role = manifest.content.entries.flatMap(record => record.media).find(media => media.assetId === item.assetId)?.role;
      if (role !== 'image' && role !== 'audio') throw new Error('FILE_INVALID');
      const uri = `${source}${item.file}`;
      if ((await albumPrintNative().printFileDigest(uri)).sha256 !== item.sha256) throw new Error('FILE_CHANGED');
      assertCurrent();
      const name = `media-${index}.${role === 'image' ? 'png' : 'm4a'}`;
      const stats = await albumArchiveNative().prepareAlbumArchiveMedia(id,uri,name,role); assertCurrent();
      files.push({name,sha256:stats.sha256,bytes:stats.bytes});
      if (role === 'image') dimensions[item.assetId] = {widthPx:stats.widthPx,heightPx:stats.heightPx};
    }
    const pdf = await albumPrintNative().copyPrintMedia(`${source}album.pdf`,`${directory}album.pdf`); assertCurrent();
    if (pdf.sha256 !== manifest.pdf.sha256) throw new Error('FILE_CHANGED');
    files.push({name:'album.pdf',...pdf});
    const book = makeAlbumFile(manifest,files,dimensions);
    const json = JSON.stringify(book); validateAlbumFile(json,Object.fromEntries(files.map(file => [file.name,file.sha256])));
    await FileSystem.writeAsStringAsync(`${directory}book.json`,json); assertCurrent();
    const artifact = await albumArchiveNative().packAlbumArchive(id); assertCurrent();
    return {id,...artifact,name:book.name};
  } catch (error) {if (owned) await closeAlbumFileSession(id); throw error;}
}

export async function saveAlbumFileArtifact(artifact: Awaited<ReturnType<typeof createAlbumFileEdition>>, current: () => boolean) {
  if (!current()) throw new Error('FILE_CANCELLED');
  if ((await albumPrintNative().printFileDigest(artifact.uri)).sha256 !== artifact.sha256) throw new Error('FILE_CHANGED');
  if (!current()) throw new Error('FILE_CANCELLED');
  return albumArchiveNative().saveAlbumArchive(artifact.uri);
}
