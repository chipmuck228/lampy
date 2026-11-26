import X from 'lucide-react-native/icons/x';
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { getFamilyUseCases } from "../application/container";
import { isFamilyProductEntryOpen } from "../infrastructure/family-config";
import {
  currentFamilyInvite,
  subscribeIncomingFamilyInvite,
  forgetFamilyInvite,
  parseFamilyInviteLink,
  rememberFamilyInvite,
} from "../infrastructure/family-invite-link";
import type { InvitePreview } from "../family-api/types";
import { tr, dateLabel } from "../i18n";
import { useDeviceLock } from "./device-lock-context";
import { SettingsPage } from "./settings-chrome";
import { Text, TextInput, type } from "./life-text";
import { hairline, ink, inkSoft, paperDeep, placeholder, sage } from "./life-page";
import { LifeIcon } from "./life-icons";
import { familyInviteError } from "./family-invite-copy";
export function FamilyInvitePanel({ onJoined, onClose, returnTo = "/family-invite", onBusyChange }: { onBusyChange?: (busy: boolean) => void; onJoined?: () => void; onClose?: () => void; returnTo?: "/family" | "/family-invite" }) {
  const router = useRouter();
  const lock = useDeviceLock();
  const allowed = isFamilyProductEntryOpen() && !lock?.snapshot.locked;
  const [link, setLink] = useState("");
  const [linkFocused, setLinkFocused] = useState(false);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [user, setUser] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const completed = useRef(false);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => () => { onBusyChange?.(false); }, [onBusyChange]);
  const seq = useRef(0);
  const owner = useRef<number | null>(null);
  const focus = useRef(false);
  const load = useCallback(async () => {
    const intent = currentFamilyInvite();
    const n = ++seq.current;
    setPreview(null);
    setUser(null);
    if (!intent && completed.current) return;
    completed.current = false;
    setJoined(false);
    setMessage(null);
    if (!intent) return;
    const current = () =>
      focus.current &&
      n === seq.current &&
      currentFamilyInvite()?.generation === intent.generation &&
      AppState.currentState === "active";
    try {
      const u = await getFamilyUseCases();
      if (!current()) return;
      const p = await u.previewInviteLink(intent.token);
      if (!current()) return;
      setPreview(p);
      try {
        const account = await u.inviteLinkAccount();
        if (current()) setUser(account);
      } catch (e) {
        if (current()) setMessage(familyInviteError(e));
      }
    } catch (e) {
      if (current()) setMessage(familyInviteError(e));
    }
  }, []);
  useEffect(()=>subscribeIncomingFamilyInvite(()=>{
    if(!focus.current||AppState.currentState!=='active')return;
    seq.current++;owner.current=null;setBusy(false);void load();
  }),[load]);
  useFocusEffect(
    useCallback(() => {
      focus.current = allowed;
      if (allowed) void load();
      const sub = AppState.addEventListener("change", (s) => {
        if (s === "background") {
          seq.current++;
          owner.current = null;
          setBusy(false);
          setPreview(null);
          setUser(null);
        } else if (s === "active" && focus.current) void load();
      });
      return () => {
        sub.remove();
        focus.current = false;
        seq.current++;
        owner.current = null;
        setBusy(false);
        setPreview(null);
        setUser(null);
      };
    }, [allowed, load]),
  );
  function cancel() {
    forgetFamilyInvite();
    setLink("");
    seq.current++;
    owner.current = null;
    setBusy(false);
    setPreview(null);
    setUser(null);
    completed.current = false;
    setJoined(false);
    setMessage(null);
    onClose?.();
  }
  async function accept() {
    const intent = currentFamilyInvite();
    if (
      !allowed ||
      !intent ||
      !user ||
      !preview ||
      !["pending", "accepted"].includes(preview.status) ||
      owner.current !== null ||
      AppState.currentState !== "active"
    )
      return;
    const n = seq.current;
    owner.current = n;
    setBusy(true);
    setMessage(null);
    const current = () =>
      focus.current &&
      n === seq.current &&
      currentFamilyInvite()?.generation === intent.generation &&
      AppState.currentState === "active";
    try {
      const u = await getFamilyUseCases();
      if (!current()) return;
      await u.acceptInviteLink(intent.token, user, current);
      if (!current()) return;
      forgetFamilyInvite(intent.generation);
      completed.current = true;
      setJoined(true);
      setPreview(null);
      onJoined?.();
    } catch (e) {
      if (current()) {
        setMessage(familyInviteError(e));
        if (
          e &&
          typeof e === "object" &&
          "code" in e &&
          ["UNAUTHENTICATED", "STALE_FAMILY_REQUEST"].includes(String(e.code))
        )
          setUser(null);
      }
    } finally {
      if (owner.current === n) {
        owner.current = null;
        setBusy(false);
      }
    }
  }
  function open() {
    if (!allowed || busy || AppState.currentState !== "active") return;
    const token = parseFamilyInviteLink(link.trim());
    if (!token) {
      setMessage(tr("请粘贴一份完整的家庭邀请链接。"));
      return;
    }
    rememberFamilyInvite(token);
  }
  return (
    <>
      {allowed ? (
        <>
          {!joined ? (
            <>
              <View style={styles.linkSection}>
                <Text style={styles.linkLabel}>{tr("邀请链接")}</Text>
                <View style={[styles.linkRow, linkFocused && styles.linkRowFocused]}>
                  <TextInput
                    testID="invitation-link-input"
                    accessibilityLabel={tr("邀请链接")}
                    placeholder={tr("粘贴邀请链接")}
                    placeholderTextColor={placeholder}
                    selectionColor={sage}
                    style={[styles.linkInput, busy && styles.linkDisabled]}
                    value={link}
                    editable={!busy}
                    onFocus={() => setLinkFocused(true)}
                    onBlur={() => setLinkFocused(false)}
                    onChangeText={value => {
                      forgetFamilyInvite();
                      seq.current++;
                      owner.current = null;
                      setPreview(null);
                      setUser(null);
                      setMessage(null);
                      setLink(value);
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    clearButtonMode="never"
                  />
                  {link || currentFamilyInvite() ? <Pressable
                    testID="invitation-link-clear"
                    accessibilityRole="button"
                    accessibilityLabel={tr("清除输入")}
                    accessibilityState={{disabled:busy}}
                    disabled={busy}
                    style={({pressed})=>[styles.linkClear,busy&&styles.linkDisabled,pressed&&!busy&&styles.linkClearPressed]}
                    onPress={() => { forgetFamilyInvite(); seq.current++; owner.current=null; setLink(""); setPreview(null); setUser(null); setMessage(null); }}>
                    <X size={17} color={sage} strokeWidth={1.6} accessible={false}/>
                  </Pressable> : null}
                </View>
              </View>
              <Pressable
                style={[styles.openHit, (busy || !link.trim()) && styles.linkDisabled]}
                accessibilityRole="button"
                disabled={busy || !link.trim()}
                accessibilityState={{disabled:busy || !link.trim()}}
                onPress={open}
              >
                <Text style={styles.openLabel}>{tr("查看邀请")}</Text>
                <LifeIcon name="open" size={15} color={sage}/>
              </Pressable>
            </>
          ) : null}
          {preview ? (
            <>
              <Text style={styles.title}>
                {preview.name || tr("未命名家庭")}
              </Text>
              <Text>
                {tr("这份邀请有效至 {0}", [expiry(preview.expiresAt)])}
              </Text>
              <Text style={styles.body}>
                {tr("自己的记录，不会自动分享给家人。")}
              </Text>
              {["pending", "accepted"].includes(preview.status) ? (
                user ? (
                  <Pressable
                    testID="invite-confirm"
                    style={styles.hit}
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => void accept()}
                  >
                    <Text>{tr("确认加入")}</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={styles.hit}
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => {
                      const intent = currentFamilyInvite();
                      if (!intent || busy || AppState.currentState !== "active") return;
                      router.push({ pathname: "/family-invite-login", params: { returnTo, generation: String(intent.generation) } });
                    }}
                  >
                    <Text>{tr("登录后加入")}</Text>
                  </Pressable>
                )
              ) : (
                <Text>{tr("这份邀请已结束。请向创建者要一份新的邀请。")}</Text>
              )}
            </>
          ) : null}
          {joined ? (
            <>
              <Text>{tr("已加入这个家。")}</Text>
              <Pressable
                style={styles.hit}
                accessibilityRole="button"
                onPress={cancel}
              >
                <Text>{tr("完成")}</Text>
              </Pressable>
            </>
          ) : null}
          {message ? (
            <Text accessibilityLiveRegion="polite">{message}</Text>
          ) : null}
          {!joined && message && currentFamilyInvite() ? (
            <Pressable
              style={styles.hit}
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void load()}
            >
              <Text>{tr("再试一次")}</Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <Text>{tr("邀请暂未开放。")}</Text>
      )}
    </>
  );
}
export default function FamilyInviteScreen() {
  const router = useRouter();
  return <SettingsPage accessibilityLabel={tr("家庭邀请")} title={tr("家庭邀请")}
    backLabel={tr("取消")} onBack={() => { forgetFamilyInvite(); router.dismissTo("/family"); }}>
    <FamilyInvitePanel onClose={() => router.dismissTo("/family")} />
  </SettingsPage>;
}

function expiry(value: string) {
  const d = new Date(value);
  return dateLabel(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
const styles = StyleSheet.create({
  linkSection: { gap:8, paddingTop:12 },
  linkLabel: { fontSize:13, lineHeight:20, letterSpacing:0.3, color:inkSoft },
  linkRow: { flexDirection:"row", alignItems:"center", minHeight:54, borderBottomWidth:1, borderBottomColor:hairline },
  linkRowFocused: { borderBottomColor:sage },
  linkInput: { flex:1, minWidth:0, minHeight:54, fontSize:16, color:ink, paddingHorizontal:2, paddingVertical:14, backgroundColor:"transparent" },
  linkClear: { minWidth:44, minHeight:48, alignItems:"center", justifyContent:"center" },
  linkDisabled: { opacity:0.45 },
  linkClearPressed: { opacity:0.6 },
  openHit: { minHeight:48, flexDirection:"row", alignItems:"center", gap:8, alignSelf:"flex-start", paddingVertical:12, paddingHorizontal:2, marginTop:8, marginBottom:12 },
  openLabel: { ...type.action, color:sage },
  title: { ...type.title, marginTop: 24 },
  body: { ...type.body, color: inkSoft, marginVertical: 16 },
  hit: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 16,
    backgroundColor: paperDeep,
    borderRadius: 24,
    marginVertical: 8,
    alignSelf: "flex-start",
  },
});
