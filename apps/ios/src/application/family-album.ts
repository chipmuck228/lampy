import { ApplicationError } from './errors';
import type { FamilySessionStore } from './family-use-cases';
import type { FamilyApiClient } from '../infrastructure/family-http-client';
import { FAMILY_ALBUM_CONFIRMATION, type FamilyAlbumApi, type FamilyAlbumMutation, type FamilyAlbumView } from '../family-api/family-album-types';
export const FAMILY_ALBUM_RULE_COPY='分享到这里的记录，家人可以阅读，家庭创建者也可以收进生活册，保存或打印。' as const;
export function familyAlbumEvaluationOpen(dev:boolean,value=process.env.EXPO_PUBLIC_FAMILY_ALBUM_EVAL) {return dev&&value==='1';}
export function createFamilyAlbumUseCases(deps:{client:FamilyApiClient;session:FamilySessionStore}) {
  async function account() {
    const token=await deps.session.getSessionToken();const userId=await deps.session.getUserId();
    if(!token||!userId)throw new ApplicationError('UNAUTHENTICATED','Sign in is required.');return {token,userId};
  }
  async function request<T>(familyId:string,work:(api:FamilyAlbumApi,token:string)=>Promise<T>,current=()=>true) {
    const before=await account();const api=deps.client.albums;
    if(!api)throw new ApplicationError('FAMILY_ALBUMS_CLOSED','Family albums are not available.');
    const check=async()=>{const after=await account();if(!current()||before.token!==after.token||before.userId!==after.userId)throw new ApplicationError('FAMILY_ALBUM_CANCELLED','The family request is no longer current.');};
    const access=await api.access(before.token,familyId);await check();
    if(access.userId!==before.userId)throw new ApplicationError('UNAUTHENTICATED','Account changed.');
    const result=await work(api,before.token);await check();return result;
  }
  return {
    access(familyId:string) {return request(familyId,(api,token)=>api.access(token,familyId));},
    acknowledge(familyId:string,membershipId:string) {return request(familyId,(api,token)=>api.acknowledge(token,familyId,membershipId,FAMILY_ALBUM_CONFIRMATION));},
    list(familyId:string) {return request(familyId,(api,token)=>api.list(token,familyId));},
    sources(familyId:string) {return request(familyId,(api,token)=>api.sources(token,familyId));},
    create(familyId:string,input:Parameters<FamilyAlbumApi['create']>[2]) {return request(familyId,(api,token)=>api.create(token,familyId,input));},
    mutate(familyId:string,view:FamilyAlbumView,change:FamilyAlbumMutation) {return request(familyId,(api,token)=>api.mutate(token,familyId,view.albumId,{authority:view.access.authority,revision:view.revision,change}));},
    read(familyId:string,albumId:string,current:()=>boolean) {return request(familyId,async(api,token)=>{
      const view=await api.read(token,familyId,albumId);
      if(!current())throw new ApplicationError('FAMILY_ALBUM_CANCELLED','The family request is no longer current.');
      await api.validate(token,familyId,albumId,view.validation);return view;
    },current);},
    validate(view:FamilyAlbumView,current:()=>boolean) {return request(view.familyId,(api,token)=>api.validate(token,view.familyId,view.albumId,view.validation),current);},
  };
}
export type FamilyAlbumUseCases=ReturnType<typeof createFamilyAlbumUseCases>;
// Memory only: no album snapshot, private media or position is persisted in a personal store.
export function createFamilyAlbumReadSession(deps:{client:FamilyAlbumUseCases;now?:()=>number;onInvalidate?:()=>void}) {
  let generation=0;let view:FamilyAlbumView|null=null;let expires=0;const now=deps.now??Date.now;
  const clear=()=>{generation++;view=null;expires=0;deps.onInvalidate?.();};
  return {
    invalidate:clear,
    snapshot() {return view&&now()<expires?view:null;},
    async load(familyId:string,albumId:string) {
      clear();const epoch=generation;const started=now();
      try {const next=await deps.client.read(familyId,albumId,()=>epoch===generation);
        if(epoch===generation&&now()-started<3000){view=next;expires=started+3000;}
      } catch(error) {if(epoch===generation)clear();throw error;}
    },
    async validate() {
      if(!view){clear();return false;}
      const candidate=view;const epoch=generation;const started=now();
      try {await deps.client.validate(candidate,()=>epoch===generation);
        if(epoch!==generation)return false;if(now()-started>=3000){clear();return false;}expires=started+3000;return true;
      } catch(error){if(epoch!==generation)return false;clear();throw error;}
    },
  };
}
