import { invitationOrigin } from "../infrastructure/family-invite-link";
export const INVITE_WEB_HTML = `<!doctype html><html lang="zh-Hans"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Lampy · 家庭邀请</title><link rel="stylesheet" href="/invite.css"><main><p class="brand">LAMPY</p><h1>有些日子，想一起留着。</h1><h2 id="name">正在读取邀请…</h2><p id="state" role="status"></p><a id="open" hidden>已安装 · 打开 Lampy / Open Lampy</a><p id="open-help" hidden>没有打开？请复制邀请，在 Lampy 家庭页的「通过邀请加入」中粘贴。 / Copy the invitation and paste it into Family → Join with an invitation in Lampy.</p><button id="copy" hidden>复制邀请 / Copy invitation</button><textarea id="invite-link" readonly hidden aria-label="邀请链接 / Invitation link"></textarea><p id="copy-status" role="status"></p><p id="wechat" hidden>微信内可能无法直接打开 App。请点右上角菜单，在浏览器中打开；也可复制邀请后回到 Lampy 加入家庭。 / In WeChat, open this page in your browser, or copy the invitation and paste it into Lampy.</p><a id="download" hidden>尚未安装 · 前往 App Store / Get Lampy</a><p id="download-help">Lampy 尚未开放公开下载，请向邀请人确认安装方式。 / Public download is not available yet. Ask the person who invited you how to install Lampy.</p><p>安装后请重新打开原邀请，或在「通过邀请加入」粘贴邀请链接。安装不会自动保留邀请。 / After installation, reopen this invitation or paste it into Join with an invitation. Installation does not automatically carry the invitation over.</p><p>查看邀请不会加入家庭。只有在 Lampy 中登录并确认，才会加入。自己的记录不会自动分享。 / Viewing an invitation does not join a family. Sign in and confirm in Lampy to join. Personal moments are not shared automatically.</p><button id="retry" hidden>再试一次 / Retry</button></main><script src="/invite.js" defer></script></html>`;
export const INVITE_WEB_CSS =
  "body{margin:0;background:#F3F0E9;color:#292D29;font:17px/1.9 system-ui}main{max-width:480px;margin:auto;padding:48px 24px}.brand{letter-spacing:.25em;color:#416052}h1{font-family:Georgia,serif;font-size:28px;line-height:1.5}h2{font-size:20px}a,button{display:block;padding:12px 20px;margin:16px 0;border:1px solid #6F8B86;border-radius:24px;color:#416052;background:#E8E1D5;text-decoration:none;font:inherit}textarea{box-sizing:border-box;width:100%;min-height:100px;font:14px/1.7 system-ui;color:#416052;background:transparent;border:1px solid #6F8B86;padding:12px}[hidden]{display:none!important}";
export function inviteWebJs(appStoreUrl?: string) {
  let download = "";
  try {
    const u = new URL(appStoreUrl || "");
    if (u.protocol === "https:" && u.hostname === "apps.apple.com" && !u.username && !u.password && /\/id[0-9]+(?:$|\/)/.test(u.pathname))
      download = u.href;
  } catch {
    /* No invented App Store ID. */
  }
  return `const token=location.hash.slice(1);const name=document.getElementById('name'),state=document.getElementById('state'),open=document.getElementById('open'),retry=document.getElementById('retry'),copy=document.getElementById('copy'),field=document.getElementById('invite-link'),feedback=document.getElementById('copy-status'),help=document.getElementById('open-help');const valid=/^[a-f0-9]{64}$/.test(token);let sequence=0;document.getElementById('wechat').hidden=!/micromessenger/i.test(navigator.userAgent);async function load(){const n=++sequence;retry.hidden=true;open.hidden=true;copy.hidden=true;field.hidden=true;help.hidden=true;feedback.textContent='';if(!valid){name.textContent='这份邀请暂不可用 / Invitation unavailable';return;}const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{const r=await fetch('/v2/invitations/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),cache:'no-store',signal:controller.signal});if(!r.ok)throw Error();const p=await r.json();if(n!==sequence)return;name.textContent=p.name;state.textContent=p.status==='pending' ? '邀请有效至 / Valid until '+new Date(p.expiresAt).toLocaleDateString()+' · 可加入1人 / One new member' : '邀请已结束，请联系创建者 / Ask the creator for a new invitation';if(p.status==='pending'){open.href='lampy:///family-invite#'+token;open.hidden=false;copy.hidden=false;field.value=location.origin+'/invite#'+token;}}catch{if(n===sequence){state.textContent='暂时读不到邀请 / Unable to read the invitation';retry.hidden=false;}}finally{clearTimeout(timer);}}open.onclick=()=>{help.hidden=false;};copy.onclick=async()=>{try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(field.value);feedback.textContent='邀请已复制，可在 Lampy 家庭页的通过邀请加入中粘贴。 / Invitation copied. Paste it into Family → Join with an invitation in Lampy.';}catch{field.hidden=false;field.focus();field.select();feedback.textContent='请长按选中链接并复制。 / Select and copy the invitation link.';}};retry.onclick=load;const download=${JSON.stringify(download)};if(download){const a=document.getElementById('download');a.href=download;a.rel='noopener noreferrer';a.hidden=false;document.getElementById('download-help').textContent='从 App Store 安装后，请回到这份邀请继续。 / Return to this invitation after installing from the App Store.';}load();`;

}
export function inviteAssociation(origin: string | undefined) {
  if (!invitationOrigin(origin) || !origin?.startsWith("https://")) return null;
  return {
    applinks: {
      details: [
        {
          appIDs: ["B283NY984J.app.lampy.ios"],
          components: [
            {
              "/": "/invite",
              comment:
                "Explicit family invitation; fragment stays on the device.",
            },
          ],
        },
      ],
    },
  };
}
