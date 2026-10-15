import type { ShareView } from './types';
export const FAMILY_ALBUM_RULE_VERSION = 1;
export const FAMILY_ALBUM_CONFIRMATION = 'family-shares-can-be-collected-saved-printed-v1';
export type FamilyAlbumCover = {shareId:string;objectId:string};
export type FamilyAlbumRecord = {
  coverChoice?:FamilyAlbumCover|null;
  albumId: string; familyId: string; name: string; opening: string | null;
  shareIds: string[]; revision: number; createdAt: string; updatedAt: string;
};
export type FamilyAlbumNotice = { familyId: string; membershipId: string; userId: string; version: 1; acceptedAt: string };
export type FamilyAlbumAccess = {
  familyId: string; userId: string; membershipId: string; role: 'creator' | 'member';
  authority: string; rulesAcknowledged: boolean; rulesVersion: 1;
  canManage: boolean; canExport: false;
};
export type FamilyAlbumItem = {shareId: string; status: 'withdrawn'} | {shareId: string; status: 'active'; share: ShareView};
export type FamilyAlbumView = Omit<FamilyAlbumRecord,'shareIds'|'coverChoice'> & {
  coverChoice?:FamilyAlbumCover|null;
  access: FamilyAlbumAccess; items: FamilyAlbumItem[];
  cover: {shareId: string; objectId: string} | null; validation: string;
};
export type FamilyAlbumMutation =
  | {kind:'collect'; shareIds: string[] | 'all'}
  | {kind:'remove'; shareId: string}
  | {kind:'reorder'; shareIds: string[]}
  | {kind:'edit';name:string;opening:string|null;coverChoice:FamilyAlbumCover|null}
  | {kind:'rename'; name: string; opening: string | null};
export type FamilyAlbumSummary = Omit<FamilyAlbumRecord,'shareIds'|'coverChoice'> & {entryCount:number};
export type FamilyAlbumApi = {
  access(session: string,familyId: string): Promise<FamilyAlbumAccess>;
  acknowledge(session: string,familyId: string,membershipId: string,confirmation: string): Promise<FamilyAlbumAccess>;
  list(session: string,familyId: string): Promise<{access:FamilyAlbumAccess;albums:FamilyAlbumSummary[]}>;
  sources(session: string,familyId: string): Promise<{access:FamilyAlbumAccess;shares:ShareView[]}>;
  create(session: string,familyId: string,input:{requestId:string;authority:string;name:string;opening:string|null}): Promise<FamilyAlbumView>;
  read(session: string,familyId: string,albumId:string): Promise<FamilyAlbumView>;
  validate(session:string,familyId:string,albumId:string,validation:string): Promise<{valid:true}>;
  mutate(session:string,familyId:string,albumId:string,input:{authority:string;revision:number;change:FamilyAlbumMutation}): Promise<FamilyAlbumView>;
};
