import { tr } from "../i18n";
export function familyInviteError(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error ? error.code : "";
  if (code === "UNAUTHENTICATED") return tr("先登录，再决定是否加入。");
  if (code === "FAMILY_LIMIT_REACHED")
    return tr("你已在10个家庭中，暂时不能再创建或加入。");
  if (
    [
      "INVITE_ALREADY_USED",
      "INVITE_EXPIRED",
      "INVITE_REVOKED",
      "INVITE_NOT_FOUND",
      "FAMILY_DISSOLVED",
    ].includes(String(code))
  )
    return tr("这份邀请已结束。请向创建者要一份新的邀请。");
  if (code === "RATE_LIMITED") return tr("请稍后再试。");
  if (code === "INVITE_LINKS_CLOSED") return tr("邀请暂未开放。");
  return tr("暂时读不到邀请，可以再试一次。");
}
