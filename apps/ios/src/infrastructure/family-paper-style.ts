import type { AlbumReadingPosition, AlbumReadingStyle } from '../application/album-reading';
// Session-only preference, scoped to account/family/book. No record or private URI is persisted.
const styles=new Map<string,AlbumReadingStyle>();
export function familyPaperStyle(scope:string){return styles.get(scope)??'plain';}
export function setFamilyPaperStyle(scope:string,style:AlbumReadingStyle){styles.delete(scope);styles.set(scope,style);if(styles.size>128)styles.delete(styles.keys().next().value!);}

const positions=new Map<string,AlbumReadingPosition|null>();
export function familyReadingState(scope:string){return {style:familyPaperStyle(scope),position:positions.get(scope)??null};}
export async function setFamilyReadingState(scope:string,style:AlbumReadingStyle,position:AlbumReadingPosition|null){setFamilyPaperStyle(scope,style);positions.delete(scope);positions.set(scope,position);if(positions.size>128)positions.delete(positions.keys().next().value!);}
