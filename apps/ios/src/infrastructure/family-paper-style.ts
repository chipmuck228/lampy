import type { AlbumReadingStyle } from '../application/album-reading';
// Session-only preference, scoped to account/family/book. No record or private URI is persisted.
const styles=new Map<string,AlbumReadingStyle>();
export function familyPaperStyle(scope:string){return styles.get(scope)??'plain';}
export function setFamilyPaperStyle(scope:string,style:AlbumReadingStyle){styles.delete(scope);styles.set(scope,style);if(styles.size>128)styles.delete(styles.keys().next().value!);}
