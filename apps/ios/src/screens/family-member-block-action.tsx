import { useRef, useState } from 'react';
import { Alert, Pressable } from 'react-native';
import { getFamilyUseCases } from '../application/container';
import { pauseForegroundAudio } from '../application/foreground-audio';
import { tr } from '../i18n';
import { Text, type } from './life-text';
import { sage } from './life-page';
export function FamilyMemberBlockAction({familyId,userId,current}:{familyId:string;userId:string;current:()=>boolean}) {
 const pending=useRef(false);const [busy,setBusy]=useState(false);
 function confirm(){if(!current()||pending.current)return;pauseForegroundAudio();Alert.alert(tr('不再看这位家人的内容？'),tr('只对你生效。家庭记录和家庭册会隐藏对方的内容；对方不会被移出家庭，也不会收到通知。可在设置中解除屏蔽。'),[{text:tr('取消'),style:'cancel'},{text:tr('屏蔽内容'),style:'destructive',onPress:()=>{void(async()=>{if(!current()||pending.current)return;pending.current=true;setBusy(true);try{const app=await getFamilyUseCases();if(!current())return;await app.safety.block(familyId,userId,current);}catch{if(current())Alert.alert(tr('这次没有完成，请稍后再试。'));}finally{pending.current=false;setBusy(false);}})();}}]);}
 return <Pressable accessibilityRole="button" disabled={busy} style={{minHeight:48,justifyContent:'center',alignItems:'center'}} onPress={confirm}><Text style={{...type.action,color:sage}}>{tr('屏蔽内容')}</Text></Pressable>;
}
