import * as SecureStore from 'expo-secure-store';
type ShareData = { link: string; qr: string };
// Each secure value stays small. Publish the manifest last; partial writes cannot be read.
function key(user: string, family: string, id: string) {
  return 'lampy.invite.' + [user, family, id].map(v => Array.from(v).map(c => c.codePointAt(0)!.toString(16).padStart(6,'0')).join('')).join('.');
}
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
export async function saveInviteShare(user: string, family: string, id: string, data: ShareData) {
  const base = key(user, family, id);
  const raw = JSON.stringify(data);
  const chunks = Math.ceil(raw.length / 1000);
  if (chunks > 64) throw new Error('Invitation is too large.');
  try {
    for (let i=0;i<chunks;i++) await SecureStore.setItemAsync(base+'.'+i,raw.slice(i*1000,(i+1)*1000),options);
    await SecureStore.setItemAsync(base,String(chunks),options);
  } catch {
    await removeInviteShare(user,family,id,chunks);
    throw new Error('Invitation could not be saved securely.');
  }
}
export async function readInviteShare(user: string, family: string, id: string): Promise<ShareData | null> {
  const base=key(user,family,id);
  const count=Number(await SecureStore.getItemAsync(base));
  if (!Number.isInteger(count) || count<1 || count>64) return null;
  let raw='';
  for(let i=0;i<count;i++) { const part=await SecureStore.getItemAsync(base+'.'+i); if(part===null)return null;raw+=part; }
  try { const value=JSON.parse(raw);return typeof value.link==='string' && typeof value.qr==='string' ? value : null; } catch { return null; }
}
export async function removeInviteShare(user: string, family: string, id: string, knownCount?: number) {
  const base=key(user,family,id);
  const count=knownCount ?? Number(await SecureStore.getItemAsync(base));
  await SecureStore.deleteItemAsync(base);
  if(Number.isInteger(count)&&count>0&&count<=64) for(let i=0;i<count;i++) await SecureStore.deleteItemAsync(base+'.'+i);
}
