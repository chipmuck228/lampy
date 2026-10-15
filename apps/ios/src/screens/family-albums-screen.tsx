import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getFamilyUseCases } from '../application/container';
import { createFamilyAlbumReadSession, familyAlbumEvaluationOpen, FAMILY_ALBUM_RULE_COPY } from '../application/family-album';
import type { FamilyAlbumUseCases } from '../application/family-album';
import type { FamilyAlbumAccess, FamilyAlbumSummary, FamilyAlbumView } from '../family-api/family-album-types';
import type { FamilySummary, ShareView } from '../family-api/types';
import { pauseForegroundAudio } from '../application/foreground-audio';
import { isFamilyProductEntryOpen } from '../infrastructure/family-config';
import { useDeviceLock } from './device-lock-context';
import { SettingsPage } from './settings-chrome';
import { Text } from './life-text';
import { tr } from '../i18n';
export default function FamilyAlbumsScreen() {
  const router = useRouter();
  const lock = useDeviceLock();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const allowed = isFamilyProductEntryOpen() && familyAlbumEvaluationOpen(typeof __DEV__ !== 'undefined' && __DEV__) && !lock?.snapshot.locked && foreground;
  const [families, setFamilies] = useState<FamilySummary[]>([]);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [access, setAccess] = useState<FamilyAlbumAccess | null>(null);
  const [albums, setAlbums] = useState<FamilyAlbumSummary[]>([]);
  const [book, setBook] = useState<FamilyAlbumView | null>(null);
  const [sources, setSources] = useState<ShareView[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const accountId = useRef<string | null>(null);
  const epoch = useRef(0);
  const owner = useRef(false);
  const requestId = useRef<string | null>(null);
  const session = useRef<ReturnType<typeof createFamilyAlbumReadSession> | null>(null);
  const client = useRef<FamilyAlbumUseCases | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      setForeground(state === 'active');
      if (state !== 'active') {
        epoch.current++;
        session.current?.invalidate();
        pauseForegroundAudio();
      }
    });
    return () => sub.remove();
  }, []);
  useFocusEffect(useCallback(() => {
    void retry;
    const ticket = ++epoch.current;
    let disposed = false;
    session.current?.invalidate();
    setBook(null);
    setAccess(null);
    setAlbums([]);
    setSources([]);
    setSelected([]);
    setFamilies([]);
    setFailed(false);
    if (allowed) void (async () => {
      try {
        const app = await getFamilyUseCases();
        const directory = await app.getFamilies(() => !disposed && ticket === epoch.current);
        if (disposed || ticket !== epoch.current) return;
        if (accountId.current && accountId.current !== directory.userId) {
          setName('');
          requestId.current = null;
        }
        accountId.current = directory.userId;
        client.current = app.albums;
        setFamilies(directory.families);
        if (familyId && directory.families.some(family => family.familyId === familyId)) {
          const permission = await app.albums.access(familyId);
          if (disposed || ticket !== epoch.current) return;
          setAccess(permission);
          if (permission.rulesAcknowledged) {
            const list = await app.albums.list(familyId);
            if (disposed || ticket !== epoch.current) return;
            setAlbums(list.albums);
          }
        }
      } catch {
        if (!disposed && ticket === epoch.current) {
          setFailed(true);
          setBook(null);
          setAccess(null);
          setSources([]);
        }
      }
    })();
    return () => {
      disposed = true;
      epoch.current++;
      session.current?.invalidate();
      client.current = null;
      pauseForegroundAudio();
    };
  }, [allowed, familyId, retry]));
  // A bounded read lease: expire locally even if a network request hangs.
  useEffect(() => {
    if (!book || !allowed) return;
    const timer = setInterval(() => {
      if (!session.current?.snapshot()) {
        session.current?.invalidate();
        setBook(null);
        setAccess(null);
        setAlbums([]);
        setFamilies([]);
        setSources([]);
        setSelected([]);
        setFailed(true);
        pauseForegroundAudio();
      }
    }, 250);
    const validate = setInterval(() => {
      const current = session.current;
      if (current && !owner.current) void current.validate().catch(() => {
        if (session.current === current) {
          epoch.current++;
          setBook(null);
          setAccess(null);
          setAlbums([]);
          setFamilies([]);
          setSources([]);
          setSelected([]);
          setFailed(true);
          pauseForegroundAudio();
        }
      });
    }, 1500);
    return () => {
      clearInterval(timer);
      clearInterval(validate);
    };
  }, [book, allowed]);
  useEffect(() => {
    if (!allowed || failed) return;
    let disposed = false;
    let pending = false;
    let deadline = Date.now() + 3000;
    const clear = () => {
      epoch.current++;
      session.current?.invalidate();
      pauseForegroundAudio();
      setBook(null);
      setAccess(null);
      setAlbums([]);
      setSources([]);
      setSelected([]);
      setFamilies([]);
      setFailed(true);
    };
    const timer = setInterval(() => {
      if (!disposed && Date.now() > deadline) clear();
    }, 250);
    const validate = setInterval(() => {
      if (pending || owner.current) return;
      pending = true;
      const ticket = epoch.current;
      const started = Date.now();
      void (async () => {
        try {
          const app = await getFamilyUseCases();
          const directory = await app.getFamilies(() => !disposed && epoch.current === ticket);
          const permission = familyId ? await app.albums.access(familyId) : null;
          const refreshed = sources.length && familyId ? await app.albums.sources(familyId) : null;
          if (disposed || epoch.current !== ticket) return;
          if (Date.now() - started >= 3000) throw new Error('expired');
          if (access && permission && (access.userId !== permission.userId || access.authority !== permission.authority || access.rulesAcknowledged !== permission.rulesAcknowledged)) throw new Error('changed');
          deadline = started + 3000;
          setFamilies(directory.families);
          if (refreshed) {
            setSources(refreshed.shares);
            setSelected(previous => previous.filter(id => refreshed.shares.some(share => share.shareId === id)));
          }
        } catch {
          if (!disposed && epoch.current === ticket) clear();
        } finally {
          pending = false;
        }
      })();
    }, 1500);
    return () => {
      disposed = true;
      clearInterval(timer);
      clearInterval(validate);
    };
  }, [allowed, familyId, access, sources.length, failed]);
  async function run(work: (api: FamilyAlbumUseCases, current: () => boolean) => Promise<void>) {
    if (owner.current || !allowed || !client.current || !familyId) return;
    owner.current = true;
    setBusy(true);
    setFailed(false);
    const ticket = ++epoch.current;
    try {
      await work(client.current, () => epoch.current === ticket && AppState.currentState === 'active');
    } catch {
      if (epoch.current === ticket) {
        session.current?.invalidate();
        setBook(null);
        setAccess(null);
        setAlbums([]);
        setFamilies([]);
        setSources([]);
        setSelected([]);
        setFailed(true);
      }
    } finally {
      owner.current = false;
      setBusy(false);
    }
  }
  async function show(api: FamilyAlbumUseCases, albumId: string, current: () => boolean) {
    const reading = createFamilyAlbumReadSession({
      client: api,
      onInvalidate: pauseForegroundAudio
    });
    session.current?.invalidate();
    session.current = reading;
    setBook(null);
    setSources([]);
    setSelected([]);
    await reading.load(familyId!, albumId);
    if (current()) {
      setBook(reading.snapshot());
      setAccess(reading.snapshot()?.access ?? null);
    } else reading.invalidate();
  }
  return <SettingsPage title={tr('家里的生活册')} backLabel={tr('返回')} accessibilityLabel={tr('家里的生活册')} onBack={() => router.back()}>
    {allowed ? <View style={{
      paddingTop: 24,
      gap: 16
    }}>
      <Text>{tr('开发验收入口，家庭册导出尚未开放。')}</Text>
      {families.map(family => <View key={family.familyId}>{<FamilyAlbumButton label={family.name} onPress={() => {
          epoch.current++;
          session.current?.invalidate();
          setFamilyId(family.familyId);
          requestId.current = null;
          setName('');
          setRetry(value => value + 1);
        }} disabled={busy} />}</View>)}
      {access && !access.rulesAcknowledged ? <><Text>{tr(FAMILY_ALBUM_RULE_COPY)}</Text><Text>{tr('已经交付的文件和纸书无法追回。')}</Text>
        {<FamilyAlbumButton label={tr('我知道了')} onPress={() => void run(async (api, current) => {
          await api.acknowledge(familyId!, access.membershipId);
          if (current()) setRetry(value => value + 1);
        })} disabled={busy} />}</> : null}
      {access?.rulesAcknowledged ? <>
        {albums.map(album => <View key={album.albumId}>{<FamilyAlbumButton label={`${album.name} · ${album.entryCount}`} onPress={() => void run((api, current) => show(api, album.albumId, current))} disabled={busy} />}</View>)}
        {access.canManage ? <><TextInput accessibilityLabel={tr('册名')} value={name} onChangeText={value => {
            setName(value);
            requestId.current = null;
          }} maxLength={200} />
          {<FamilyAlbumButton label={tr('新建一册')} onPress={() => void run(async (api, current) => {
            const operation = requestId.current ?? `album_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
            requestId.current = operation;
            const created = await api.create(familyId!, {
              requestId: operation,
              authority: access.authority,
              name,
              opening: null
            });
            if (!current()) return;
            requestId.current = null;
            await show(api, created.albumId, current);
          })} disabled={busy || !name.trim()} />}</> : null}
      </> : null}
      {book ? <View style={{
        gap: 12
      }}><Text>{book.name}</Text>{book.opening ? <Text>{book.opening}</Text> : null}
        {book.items.map(item => <View key={item.shareId}>{item.status === 'active' ? <><Text>{item.share.authorNickname || tr('家人')}</Text><Text>{item.share.snapshot.note}</Text>{item.share.snapshot.media.length ? <FamilyAlbumButton label={tr('照片与声音请在家庭分享中查看。')} onPress={() => router.push({pathname:'/family-record/[id]',params:{id:item.shareId,familyId:familyId!}})} disabled={busy} /> : null}</> : <Text>{tr('这条分享已不可用。')}</Text>}
          {book.access.canManage ? <FamilyAlbumButton label={tr('移出这一册')} onPress={() => void run(async (api, current) => {
            await api.mutate(familyId!, book, {
              kind: 'remove',
              shareId: item.shareId
            });
            if (current()) await show(api, book.albumId, current);
          })} disabled={busy} /> : null}
        </View>)}
        {book.access.canManage ? <>
          {<FamilyAlbumButton label={tr('选择家庭分享')} onPress={() => void run(async (api, current) => {
            const result = await api.sources(familyId!);
            if (current()) {
              setSources(result.shares);
              setSelected([]);
            }
          })} disabled={busy} />}
          {sources.map(share => <View key={share.shareId}>{<FamilyAlbumButton label={`${selected.includes(share.shareId) ? '✓ ' : ''}${share.authorNickname || tr('家人')} · ${share.snapshot.note.slice(0, 60)}`} onPress={() => setSelected(previous => previous.includes(share.shareId) ? previous.filter(id => id !== share.shareId) : [...previous, share.shareId])} disabled={busy} />}</View>)}
          {selected.length ? <FamilyAlbumButton label={tr('收入选中的分享')} onPress={() => void run(async (api, current) => {
            await api.mutate(familyId!, book, {
              kind: 'collect',
              shareIds: selected
            });
            if (current()) await show(api, book.albumId, current);
          })} disabled={busy} /> : null}
          {<FamilyAlbumButton label={tr('收入当前全部分享')} onPress={() => void run(async (api, current) => {
            await api.mutate(familyId!, book, {
              kind: 'collect',
              shareIds: 'all'
            });
            if (current()) await show(api, book.albumId, current);
          })} disabled={busy} />}
        </> : null}
      </View> : null}
      {failed ? <><Text>{tr('家庭内容或资格已变化，请重新核对。')}</Text>{<FamilyAlbumButton label={tr('再试一次')} onPress={() => setRetry(value => value + 1)} disabled={busy} />}</> : null}
    </View> : null}
  </SettingsPage>;
}
function FamilyAlbumButton({label,onPress,disabled}:{label:string;onPress:()=>void;disabled:boolean}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{minHeight:48,justifyContent:'center'}}><Text>{label}</Text></Pressable>;
}
