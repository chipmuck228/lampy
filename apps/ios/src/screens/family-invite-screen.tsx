import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { getFamilyUseCases } from "../application/container";
import { isFamilyProductEntryOpen } from "../infrastructure/family-config";
import {
  currentFamilyInvite,
  forgetFamilyInvite,
  parseFamilyInviteLink,
  rememberFamilyInvite,
} from "../infrastructure/family-invite-link";
import type { InvitePreview } from "../family-api/types";
import { tr, dateLabel } from "../i18n";
import { useDeviceLock } from "./device-lock-context";
import { SettingsPage } from "./settings-chrome";
import { Text, TextInput, type } from "./life-text";
import { inkSoft, paperDeep } from "./life-page";
import { LifeIcon } from "./life-icons";
import { familyInviteError } from "./family-invite-copy";
export function FamilyInvitePanel({ onJoined, onClose, returnTo = "/family-invite", onBusyChange }: { onBusyChange?: (busy: boolean) => void; onJoined?: () => void; onClose?: () => void; returnTo?: "/family" | "/family-invite" }) {
  const router = useRouter();
  const lock = useDeviceLock();
  const allowed = isFamilyProductEntryOpen() && !lock?.snapshot.locked;
  const [link, setLink] = useState("");
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
    void load();
  }
  return (
    <>
      {allowed ? (
        <>
          {!joined ? (
            <>
              <View style={{flexDirection:"row",alignItems:"center",gap:8}}>
              <TextInput
                accessibilityLabel={tr("邀请链接")}
                placeholder={tr("邀请链接")}
                value={link}
                editable={!busy}
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
                style={[styles.input, {flex:1}]}
              />
              <Pressable accessibilityRole="button" accessibilityLabel={tr("清除输入")} disabled={busy || (!link && !currentFamilyInvite())}
                style={{minHeight:48,minWidth:48,alignItems:"center",justifyContent:"center"}}
                onPress={() => { forgetFamilyInvite(); seq.current++; owner.current=null; setLink(""); setPreview(null); setUser(null); setMessage(null); }}>
                <LifeIcon name="clear" />
              </Pressable>
              </View>
              <Pressable
                style={[styles.hit, (busy || !link.trim()) && {opacity:0.45}]}
                accessibilityRole="button"
                disabled={busy || !link.trim()}
                accessibilityState={{disabled:busy || !link.trim()}}
                onPress={open}
              >
                <Text>{tr("查看邀请")}</Text>
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
  title: { ...type.title, marginTop: 24 },
  body: { ...type.body, color: inkSoft, marginVertical: 16 },
  input: { ...type.action, minHeight: 48, marginVertical: 16 },
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
