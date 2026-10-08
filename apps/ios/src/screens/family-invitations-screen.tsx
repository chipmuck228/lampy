import { useCallback, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Image,
  Pressable,
  Share,
  StyleSheet,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { getFamilyUseCases } from "../application/container";
import { isFamilyProductEntryOpen } from "../infrastructure/family-config";
import type { CreatedInviteLink, InviteLinkView } from "../family-api/types";
import { dateLabel, tr } from "../i18n";
import { useDeviceLock } from "./device-lock-context";
import { SettingsPage } from "./settings-chrome";
import { Text, type } from "./life-text";
import { inkSoft, paperDeep, sage } from "./life-page";
import { familyInviteError } from "./family-invite-copy";
function expiry(value: string) {
  const d = new Date(value);
  return dateLabel(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
export default function FamilyInvitationsScreen() {
  const router = useRouter();
  const { familyId } = useLocalSearchParams<{ familyId: string }>();
  const lock = useDeviceLock();
  const allowed = isFamilyProductEntryOpen() && !lock?.snapshot.locked;
  const [items, setItems] = useState<InviteLinkView[]>([]);
  const [created, setCreated] = useState<
    (CreatedInviteLink & { link: string; qr: string }) | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [ready, setReady] = useState(false);
  const seq = useRef(0);
  const owner = useRef<number | null>(null);
  const load = useCallback(async () => {
    const n = ++seq.current;
    setReady(false);
    setLoadError(false);
    try {
      const u = await getFamilyUseCases();
      if (n !== seq.current) return;
      const result = await u.listInviteLinks(familyId);
      if (n !== seq.current) return;
      setItems(result);
      setReady(true);
      setMessage(null);
    } catch {
      if (n === seq.current) { setLoadError(true); setMessage(tr("邀请暂时读不出来。")); }
    }
  }, [familyId]);
  useFocusEffect(
    useCallback(() => {
      if (allowed) void load();
      const sub = AppState.addEventListener("change", (s) => {
        if (s === "background") {
          seq.current++;
          owner.current = null;
          setCreated(null);
          setBusy(false);
          setReady(false);
        }
      });
      return () => {
        sub.remove();
        seq.current++;
        owner.current = null;
        setCreated(null);
        setItems([]);
        setBusy(false);
        setReady(false);
      };
    }, [allowed, load]),
  );
  async function act(id?: string, replace = false) {
    if (
      !allowed ||
      !ready ||
      owner.current !== null ||
      AppState.currentState !== "active"
    )
      return;
    const n = seq.current;
    owner.current = n;
    setBusy(true);
    setMessage(null);
    const current = () =>
      n === seq.current && AppState.currentState === "active";
    try {
      const u = await getFamilyUseCases();
      if (!current()) return;
      if (id) {
        await u.revokeInviteLink(id, current);
        if (current()) {
          setCreated(null);
          setItems(old => old.map(item => item.invitationId === id ? { ...item, status: "revoked" } : item));
          if (replace) {
            const result = await u.createInviteLink(familyId, current);
            if (!current()) return;
            setCreated(result);
            setItems(old => [result, ...old]);
            await Share.share({ message: result.link });
          } else {
            await load();
          }
        }
      } else {
        const result = await u.createInviteLink(familyId, current);
        if (current()) {
          setCreated(result);
          setItems((old) => [result, ...old]);
        }
      }
    } catch (e) {
      if (current())
        setMessage(
          id
            ? (replace ? tr("新邀请未确认生成。请刷新查看，原邀请可能已经失效。") : familyInviteError(e))
            : tr("邀请未确认生成。请刷新查看，必要时撤销旧邀请后重新生成。"),
        );
    } finally {
      if (owner.current === n) {
        owner.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <SettingsPage
      accessibilityLabel={tr("邀请家人")}
      title={tr("邀请家人")}
      backLabel={tr("家庭")}
      onBack={() => router.dismissTo("/family")}
    >
      {allowed ? (
        <>
          <Text style={styles.body}>
            {tr("用这份邀请，给家人留一个位置。")}
          </Text>
          <Text>{tr("有效7天，可加入1人。")}</Text>
          <Text style={styles.body}>
            {tr("邀请生成后请分享，离开此页不保存链接。")}
          </Text>
          <Pressable
            testID="invite-create"
            style={styles.hit}
            disabled={!ready || busy}
            accessibilityRole="button"
            onPress={() => void act()}
          >
            <Text>{tr("生成一份邀请")}</Text>
          </Pressable>
          {created ? (
            <View testID="created-invitation">
              <Image
                source={{ uri: created.qr }}
                style={{ width: 220, height: 220 }}
                accessibilityLabel={tr("家庭邀请")}
              />
              <Text>
                {tr("这份邀请有效至 {0}", [expiry(created.expiresAt)])}
              </Text>
              <Pressable
                style={styles.hit}
                accessibilityRole="button"
                disabled={busy}
                onPress={() => {
                  if (allowed && AppState.currentState === "active")
                    void Share.share({
                      message: created.link,
                    }).catch(() => undefined);
                }}
              >
                <Text>{tr("分享邀请")}</Text>
              </Pressable>
            </View>
          ) : null}
          {message ? (
            <Text accessibilityLiveRegion="polite">{message}</Text>
          ) : null}
          <Pressable
            style={styles.hit}
            disabled={busy}
            accessibilityRole="button"
            onPress={() => void load()}
          >
            <Text>{tr(loadError ? "重新加载" : "刷新")}</Text>
          </Pressable>
          {items.map((i) => (
            <View key={i.invitationId} style={styles.row}>
              <Text>{tr("这份邀请有效至 {0}", [expiry(i.expiresAt)])}</Text>
              <Text>
                {tr(
                  i.status === "pending"
                    ? "可使用"
                    : i.status === "accepted"
                      ? "已使用"
                      : i.status === "expired"
                        ? "已过期"
                        : "已撤销",
                )}
              </Text>
              {i.status === "pending" && created?.invitationId !== i.invitationId ? (
                <>
                  <Text style={styles.body}>{tr("邀请仍有效，已分享的链接仍可使用。")}</Text>
                  <Pressable style={styles.hit} disabled={busy || !ready}
                    accessibilityRole="button"
                    onPress={() => Alert.alert(tr("重新生成并分享"), tr("原邀请将失效。生成新的邀请后，再分享给家人。"), [
                      { text: tr("取消"), style: "cancel" },
                      { text: tr("重新生成并分享"), onPress: () => void act(i.invitationId, true) },
                    ])}>
                    <Text>{tr("重新生成并分享")}</Text>
                  </Pressable>
                </>
              ) : null}
              {i.status === "pending" ? (
                <Pressable
                  style={styles.hit}
                  disabled={busy || !ready}
                  accessibilityRole="button"
                  onPress={() => void act(i.invitationId)}
                >
                  <Text>{tr("撤销邀请")}</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </>
      ) : (
        <Text>{tr("邀请暂未开放。")}</Text>
      )}
    </SettingsPage>
  );
}
const styles = StyleSheet.create({
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
  row: {
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: sage,
  },
});
