import { ApplicationError } from './errors';
import type { FamilySessionStore } from './family-use-cases';
import type { FamilyApiClient } from '../infrastructure/family-http-client';
import { FAMILY_ALBUM_CONFIRMATION, type FamilyAlbumApi, type FamilyAlbumMutation, type FamilyAlbumView } from '../family-api/family-album-types';
export const FAMILY_ALBUM_LEASE_MS=15000;
export const FAMILY_ALBUM_RENEW_MS=3000;
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
    async validate(view:FamilyAlbumView,current:()=>boolean,onStage?:(stage:string)=>void) {
      // The validation digest already includes server-side user, membership and authority.
      // Repeating access() first adds a round trip without strengthening this check.
      onStage?.('ACCOUNT_BEFORE');
      const before=await account();const api=deps.client.albums;
      if(!api)throw new ApplicationError('FAMILY_ALBUMS_CLOSED','Family albums are not available.');
      if(!current()||before.userId!==view.access.userId)throw new ApplicationError('FAMILY_ALBUM_CANCELLED','Account changed.');
      onStage?.('SERVER_REQUEST');
      const result=await api.validate(before.token,view.familyId,view.albumId,view.validation);
      onStage?.('ACCOUNT_AFTER');
      const after=await account();
      if(!current()||before.token!==after.token||before.userId!==after.userId)throw new ApplicationError('FAMILY_ALBUM_CANCELLED','Account changed.');
      return result;
    },
  };
}
export type FamilyAlbumUseCases=ReturnType<typeof createFamilyAlbumUseCases>;
// Memory only: no album snapshot, private media or position is persisted in a personal store.
export function createFamilyAlbumReadSession(deps:{client:FamilyAlbumUseCases;now?:()=>number;onInvalidate?:()=>void}) {
  let generation=0;let view:FamilyAlbumView|null=null;let expires=0;const now=deps.now??Date.now;
  let stage='NOT_STARTED',pendingSince:number|null=null,lastMs:number|null=null,completed=0;
  const clear=()=>{generation++;view=null;expires=0;deps.onInvalidate?.();};
  return {
    invalidate:clear,
    diagnostic() {return `stage=${stage} pendingMs=${pendingSince===null?0:Math.max(0,now()-pendingSince)} lastMs=${lastMs??'none'} completed=${completed}`;},
    snapshot() {return view&&now()<expires?view:null;},
    async load(familyId:string,albumId:string) {
      clear();const epoch=generation;const started=now();
      try {const next=await deps.client.read(familyId,albumId,()=>epoch===generation);
        if(epoch===generation&&now()-started<FAMILY_ALBUM_LEASE_MS){view=next;expires=started+FAMILY_ALBUM_LEASE_MS;}
      } catch(error) {if(epoch===generation)clear();throw error;}
    },
    async validate() {
      if(!view){clear();return false;}
      const candidate=view;const epoch=generation;const started=now();
      pendingSince=started;stage='STARTING';
      try {await deps.client.validate(candidate,()=>epoch===generation,next=>{if(epoch===generation)stage=next;});
        if(epoch!==generation)return false;lastMs=now()-started;pendingSince=null;completed++;stage='COMPLETED';if(now()-started>=FAMILY_ALBUM_LEASE_MS){stage='TOO_SLOW';expires=0;return false;}expires=started+FAMILY_ALBUM_LEASE_MS;return true;
      } catch(error){if(epoch!==generation)return false;lastMs=now()-started;pendingSince=null;stage='REJECTED';const code=error&&typeof error==='object'&&'code' in error?error.code:null;if(code==='SERVER_UNREACHABLE'||code==='NETWORK'||code==='RATE_LIMITED'){stage='RETRY';return false;}clear();throw error;}
    },
  };
}
