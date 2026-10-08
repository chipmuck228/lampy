import { invitationOrigin } from "../infrastructure/family-invite-link";
export const INVITE_WEB_HTML = `<!doctype html><html lang="zh-Hans"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Lampy · 家庭邀请</title><link rel="stylesheet" href="/invite.css"><main><p>LAMPY</p><h1>有些日子，想一起留着。</h1><h2 id="name">正在读取邀请…</h2><p id="state"></p><a id="open" hidden>在 Lampy 中打开 / Open Lampy</a><a id="download" hidden>下载 Lampy / Download Lampy</a><p>尚未安装？安装后，请再次打开这份邀请或扫描原二维码。</p><p>查看邀请不会加入家庭。只有在 Lampy 中登录并确认，才会加入。自己的记录不会自动分享。</p><p>Opening this link does not join a family. Install Lampy, reopen the original invitation, then sign in and confirm. Personal moments are not shared automatically.</p><button id="retry" hidden>再试一次 / Retry</button></main><script src="/invite.js" defer></script></html>`;
export const INVITE_WEB_CSS =
  "body{margin:0;background:#F3F0E9;color:#292D29;font:17px/1.9 system-ui}main{max-width:480px;margin:auto;padding:48px 24px}h1{font-size:28px;line-height:1.5}h2{font-size:20px}a,button{display:block;padding:12px 20px;margin:16px 0;border:1px solid #6F8B86;border-radius:24px;color:#416052;background:#E8E1D5;text-decoration:none}a[hidden],button[hidden]{display:none}";
export function inviteWebJs(appStoreUrl?: string) {
  let download = "";
  try {
    const u = new URL(appStoreUrl || "");
    if (u.protocol === "https:" && u.hostname === "apps.apple.com")
      download = u.href;
  } catch {
    /* No invented App Store ID. */
  }
  return `const token=location.hash.slice(1);const name=document.getElementById('name'),state=document.getElementById('state'),open=document.getElementById('open'),retry=document.getElementById('retry');async function load(){retry.hidden=true;open.hidden=true;if(!/^[a-f0-9]{64}$/.test(token)){name.textContent='这份邀请暂不可用 / Invitation unavailable';return;}try{const r=await fetch('/v2/invitations/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),cache:'no-store'});if(!r.ok)throw Error();const p=await r.json();name.textContent=p.name;state.textContent=p.status==='pending' ? '邀请有效至 / Valid until '+new Date(p.expiresAt).toLocaleDateString()+' · 可加入1人 / One new member' : '邀请已结束，请联系创建者 / Ask the creator for a new invitation';if(p.status==='pending'){open.href='lampy:///family-invite#'+token;open.hidden=false;}}catch{state.textContent='暂时读不到邀请 / Unable to read the invitation';retry.hidden=false;}}retry.onclick=load;const download=${JSON.stringify(download)};if(download){const a=document.getElementById('download');a.href=download;a.hidden=false;}load();`;
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
