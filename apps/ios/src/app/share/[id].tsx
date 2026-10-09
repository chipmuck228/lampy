import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { getFamilyUseCases } from '../../application/container';
import type { FamilySummary } from '../../family-api/types';
import { HISTORY_AUDIENCE_CONFIRMATION, type HistoryPreview } from '../../application/family-history-use-cases';
import { SettingsPage } from '../../screens/settings-chrome';
import { Text, type } from '../../screens/life-text';
import { ink, inkSoft, sage, hairline, paperDeep } from '../../screens/life-page';
import { useFamilyPrivateRequest } from '../../screens/use-family-private-request';
import { LifeIcon } from '../../screens/life-icons';
import { familyHistoryError, familySnapshotDate } from '../../screens/family-history-copy';
import { tr, feelingLabel } from '../../i18n';

export default function ShareConfirmRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const momentId = Array.isArray(id) ? id[0] : id || '';
  const { allowed, enter, leave, begin } = useFamilyPrivateRequest();
  const [families, setFamilies] = useState<FamilySummary[]>([]);
  const [preview, setPreview] = useState<HistoryPreview | null>(null);
  const [target, setTarget] = useState<FamilySummary | null>(null);
  const [policy, setPolicy] = useState<'legacy' | 'family-history-v2' | null>(null);
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'busy' | 'stored' | 'failed'>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const busy = useRef(false);
  const currentRef = useRef<() => boolean>(() => false);
  const load = useCallback(async () => {
    const current = begin(); currentRef.current = current;
    if (!momentId) { setStatus('failed'); setMessage(tr('记录已变化，请重新查看并确认。')); return; }
    setFamilies([]); setPreview(null); setTarget(null); setPolicy(null); setConsent(false); setMessage(null); setStatus('loading');
    try {
      const family = await getFamilyUseCases(); if (!current()) return;
      const result = await family.getFamilies(); if (!current()) return;
      setFamilies(result.families); setStatus('ready');
    } catch (e) { if (current()) { setStatus('failed'); setMessage(familyHistoryError(e)); } }
  }, [begin, momentId]);
  useFocusEffect(useCallback(() => {
    enter(); if (allowed) void load();
    return () => { leave(); busy.current = false; currentRef.current = () => false; setFamilies([]); setPreview(null); setTarget(null); setConsent(false); };
  }, [allowed, enter, leave, load]));

  async function choose(selected: FamilySummary, upgrade = false, selectedAssetIds?: string[]) {
    if (!allowed || busy.current) return;
    busy.current = true;
    const current = begin(); currentRef.current = current;
    setTarget(selected); setPreview(null); setPolicy(null); setConsent(false); setMessage(null); setStatus('busy');
    try {
      const family = await getFamilyUseCases(); if (!current()) return;
      if (upgrade) await family.history.confirmPolicy(selected.familyId, current);
      const p = await family.history.getPolicy(selected.familyId, current); if (!current()) return;
      setPolicy(p.policy);
      if (p.policy === 'family-history-v2') {
        const next = await family.history.prepare(momentId, selected.familyId, current, selectedAssetIds);
        if (current()) setPreview(next);
      }
      if (current()) setStatus('ready');
    } catch (e) { if (current()) { setStatus('failed'); setMessage(familyHistoryError(e)); } }
    finally { if (current()) busy.current = false; }
  }
  async function confirm() {
    if (!preview || !preview.media.every(m => m.ready) || !consent || busy.current || !allowed) return;
    const selected = preview;
    const current = currentRef.current;
    if (!current()) return;
    busy.current = true; setStatus('busy'); setMessage(null);
    try {
      const family = await getFamilyUseCases(); if (!current()) return;
      await family.history.share(selected, HISTORY_AUDIENCE_CONFIRMATION, current);
      if (current()) setStatus('stored');
    } catch (e) { if (current()) { setStatus('failed'); setMessage(familyHistoryError(e)); setConsent(false); } }
    finally { if (current()) busy.current = false; }
  }
  const disabled = status === 'busy' || status === 'stored';
  return <SettingsPage title={tr('分享给家里')} backLabel={tr('记录')} accessibilityLabel={tr('分享确认页')} onBack={() => router.back()}>
    {!allowed ? <Text>{tr('家庭分享暂未开放。')}</Text> : <>
      <Text style={styles.intro}>{tr('分享这一刻。')}</Text>
      {status === 'loading' ? <Text>{tr('正在读取家庭。')}</Text> : null}
      <View style={styles.families}>{families.map(f => <Pressable key={f.familyId} testID={`share-family-${f.familyId}`} disabled={disabled}
        accessibilityRole="button" accessibilityState={{ selected: target?.familyId === f.familyId, disabled }}
        onPress={() => void choose(f)} style={[styles.hit, styles.family, target?.familyId === f.familyId && styles.selected]}>
        <View style={styles.familyTop}><LifeIcon name="family" size={24} color={target?.familyId === f.familyId ? sage : inkSoft} />{target?.familyId === f.familyId ? <LifeIcon name="check" /> : null}</View>
        <Text style={styles.name}>{f.name || tr('未命名家庭')}</Text>
        <Text style={styles.meta}>{tr(f.role === 'creator' ? '创建者' : '成员')}</Text>
      </Pressable>)}</View>
      {families.length === 0 && status === 'ready' ? <Text>{tr('现在还没有家庭。')}</Text> : null}
      {policy === 'legacy' && target ? <View style={styles.block}>
        <Text style={styles.hint}>{tr('开启历史分享后，后来加入的家人也能阅读仍有效的分享。旧的未使用邀请会结束，需要重新邀请。')}</Text>
        {target.role === 'creator' ? <Pressable accessibilityRole="button" style={styles.hit} disabled={disabled}
          testID="share-upgrade" onPress={() => void choose(target, true)}><Text style={styles.action}>{tr('确认开启历史分享')}</Text></Pressable>
          : <Text style={styles.hint}>{tr('请家庭创建者先开启历史分享。')}</Text>}
      </View> : null}
      {preview ? <View style={styles.block} testID="history-share-preview">
        <View style={styles.sectionTitle}><Text style={styles.name}>{tr('这次分享')}</Text><Text style={styles.meta}>{familySnapshotDate(preview)}</Text></View>
        {preview.note ? <Text style={styles.body}>{preview.note}</Text> : null}
        {preview.emotion ? <Text style={styles.hint}>{feelingLabel(preview.emotion)}</Text> : null}
        {preview.availableMedia.length ? <Text style={styles.sectionLabel}>{tr('随这一刻分享')}</Text> : null}
        <View style={styles.mediaChoices}>
        {preview.availableMedia.map((media,index) => <Pressable key={media.assetId} accessibilityRole="checkbox"
          accessibilityState={{checked:preview.media.some(m=>m.assetId===media.assetId),disabled}} disabled={disabled} style={[styles.mediaHit,preview.media.some(m=>m.assetId===media.assetId) && styles.selected]}
          testID={`share-select-media-${media.assetId}`} onPress={() => {
            const ids=preview.media.map(m=>m.assetId);
            void choose(preview.family,false,ids.includes(media.assetId) ? ids.filter(id=>id!==media.assetId) : [...ids,media.assetId]);
          }}><LifeIcon name={media.mimeType.startsWith('image/') ? 'photo' : 'record'} color={inkSoft} /><Text style={styles.mediaLabel}>{tr(media.mimeType.startsWith('image/') ? '照片 {0}' : '声音 {0}',[preview.availableMedia.slice(0,index+1).filter(m=>m.mimeType.startsWith(media.mimeType.startsWith('image/') ? 'image/' : 'audio/')).length])}</Text>
          {preview.media.some(m=>m.assetId===media.assetId) ? <LifeIcon name="check"/> : null}
        </Pressable>)}
        </View>
        {preview.media.some(m=>!m.ready) ? <Text style={styles.hint}>{tr('照片或声音暂时无法分享，原记录还在。')}</Text> : null}
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: consent, disabled }} disabled={disabled}
          testID="share-history-consent" style={styles.consent} onPress={() => setConsent(v => !v)}>
          <View style={[styles.checkBox,consent && styles.selected]}>{consent ? <LifeIcon name="check" size={18}/> : null}</View><Text style={styles.consentText}>{tr('我知道，后来加入的家人也能看到这次分享。')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={disabled || !consent || !preview.media.every(m=>m.ready)} accessibilityState={{ disabled: disabled || !consent || !preview.media.every(m=>m.ready) }}
          testID="share-confirm" onPress={() => void confirm()} style={[styles.confirm,(disabled || !consent || !preview.media.every(m=>m.ready)) && styles.disabled]}>
          <Text style={styles.action}>{tr(status === 'busy' ? '正在保存这次分享。' : '确认分享')}</Text>
        </Pressable>
        <Text style={styles.footnote}>{tr('个人原记录不变。')}</Text>
      </View> : null}
      {status === 'stored' ? <Text style={styles.hint}>{tr('分享已保存，家人可以在家庭记录中查看。')}</Text> : null}
      {message ? <Text style={styles.hint}>{message}</Text> : null}
      {status === 'failed' ? <Pressable accessibilityRole="button" style={styles.hit} onPress={() => target ? void choose(target) : void load()}><Text style={styles.action}>{tr('重新查看')}</Text></Pressable> : null}
    </>}
  </SettingsPage>;
}
const styles = StyleSheet.create({
  hit: { minHeight:48, justifyContent:'center', paddingVertical:12 },
  intro:{...type.body,color:inkSoft,marginTop:16,marginBottom:24},
  families:{flexDirection:'row',flexWrap:'wrap',gap:12},
  family: { flexGrow:1,flexBasis:'44%',padding:16,gap:8,borderRadius:16,borderWidth:StyleSheet.hairlineWidth,borderColor:hairline },
  familyTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  meta:{...type.meta,color:inkSoft},
  sectionTitle:{gap:6,paddingBottom:8},sectionLabel:{...type.meta,color:inkSoft,marginTop:8},
  mediaChoices:{flexDirection:'row',flexWrap:'wrap',gap:12},
  mediaHit:{minHeight:48,paddingHorizontal:12,paddingVertical:10,borderRadius:12,borderWidth:StyleSheet.hairlineWidth,borderColor:hairline,flexDirection:'row',alignItems:'center',gap:8},
  mediaLabel:{...type.meta,color:ink},
  consent:{minHeight:48,flexDirection:'row',alignItems:'center',gap:12,paddingVertical:16,marginTop:8,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:hairline},
  checkBox:{width:24,height:24,borderRadius:8,borderWidth:1,borderColor:inkSoft,alignItems:'center',justifyContent:'center'},
  consentText:{...type.meta,color:inkSoft,flex:1},
  confirm:{minHeight:48,borderRadius:24,backgroundColor:paperDeep,alignItems:'center',justifyContent:'center',padding:12},disabled:{opacity:0.45},
  footnote:{...type.meta,color:inkSoft,textAlign:'center'},
  selected: { borderColor:sage, backgroundColor:paperDeep },
  name: { ...type.action,fontSize:16,lineHeight:24,color:ink }, body: { ...type.body,color:ink }, hint: { ...type.meta,color:inkSoft,marginBottom:12 },
  action: { ...type.action,color:sage }, block: { gap:12,marginTop:20 },
});
