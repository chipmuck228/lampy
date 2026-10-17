import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { FAMILY_ALBUM_LEASE_MS, FAMILY_ALBUM_RENEW_MS, familyAlbumEvaluationOpen } from '../application/family-album';
import { prepareFamilyPaper } from '../application/family-album-paper';
import { familyPaperReader } from '../infrastructure/family-album-paper';
import { isFamilyProductEntryOpen } from '../infrastructure/family-config';
import type { FamilyAlbumView } from '../family-api/family-album-types';
import { useDeviceLock } from './device-lock-context';
export function useFamilyPaper(familyId:string,albumId:string,withMedia:boolean) {
  const lock=useDeviceLock();
  const [foreground,setForeground]=useState(AppState.currentState==='active');
  const enabled=familyAlbumEvaluationOpen(typeof __DEV__!=='undefined'&&__DEV__)&&isFamilyProductEntryOpen();
  const blocked=!enabled||!foreground||!!lock?.snapshot.locked;
  const hidden=useRef(blocked);
  useLayoutEffect(()=>{hidden.current=blocked;},[blocked]);
  const generation=useRef(0),expires=useRef(0);
  const [view,setView]=useState<FamilyAlbumView|null>(null);
  const [prepared,setPrepared]=useState<Awaited<ReturnType<typeof prepareFamilyPaper>>|null>(null);
  const [error,setError]=useState(false),[retry,setRetry]=useState(0);
  const valid=useCallback(()=>!hidden.current&&AppState.currentState==='active'&&Date.now()<expires.current,[]);
  const capture=useCallback(()=>{const epoch=generation.current;return()=>epoch===generation.current&&valid();},[valid]);
  useEffect(()=>{const sub=AppState.addEventListener('change',state=>{if(state!=='active'){generation.current++;expires.current=0;}setForeground(state==='active');});return()=>sub.remove();},[]);
  useFocusEffect(useCallback(()=>{
    void retry;
    const epoch=++generation.current;let disposed=false,checking=false,lastCheck=Date.now();let book:FamilyAlbumView|null=null;
    const current=()=>!disposed&&generation.current===epoch&&!hidden.current&&AppState.currentState==='active';
    const fail=()=>{if(!current())return;generation.current++;expires.current=0;setView(null);setPrepared(null);setError(true);};
    setView(null);setPrepared(null);setError(false);expires.current=0;
    if(!blocked&&familyId&&albumId)void(async()=>{
      try{
        const reader=await familyPaperReader();
        book=await reader.albums.read(familyId,albumId,current);
        const data=withMedia?await prepareFamilyPaper(book,reader,current):null;
        const started=Date.now();await reader.albums.validate(book,current);
        if(!current())return;
        if(Date.now()-started>=FAMILY_ALBUM_LEASE_MS)throw Error('read too slow');
        expires.current=started+FAMILY_ALBUM_LEASE_MS;lastCheck=started;
        setView(book);setPrepared(data);
      }catch{fail();}
    })();
    const timer=setInterval(()=>{
      if(!current()||!book||expires.current===0)return;
      if(Date.now()>=expires.current){fail();return;}
      if(checking||Date.now()-lastCheck<FAMILY_ALBUM_RENEW_MS)return;
      checking=true;lastCheck=Date.now();const started=lastCheck;
      void familyPaperReader().then(reader=>reader.albums.validate(book!,current)).then(()=>{
        if(current()&&Date.now()-started<FAMILY_ALBUM_LEASE_MS)expires.current=started+FAMILY_ALBUM_LEASE_MS;
      }).catch(error=>{
        const code=error&&typeof error==='object'&&'code' in error?error.code:null;
        if(code!=='NETWORK'&&code!=='SERVER_UNREACHABLE'&&code!=='RATE_LIMITED')fail();
      }).finally(()=>{checking=false;});
    },250);
    return()=>{disposed=true;generation.current++;expires.current=0;clearInterval(timer);};
  },[albumId,blocked,familyId,retry,withMedia]));
  const shown=!blocked&&view?.familyId===familyId&&view.albumId===albumId?view:null;
  return {view:shown,prepared:shown&&prepared?.view===shown?prepared:null,error,blocked,valid,capture,retry:()=>setRetry(n=>n+1)};
}
