/** Local-only interaction. Prevent Books' own tap/zoom gestures only on controls. */
export const PHOTO_VIEWER_SCRIPT=`(function(){
'use strict';
document.documentElement.classList.add('photo-viewer-ready');
var active=null,origin=null,start=null;
function close(){if(!active)return;active.classList.remove('is-open');active.setAttribute('aria-hidden','true');var back=origin;active=null;origin=null;if(back)try{back.focus({preventScroll:true});}catch(e){back.focus();}}
function control(target){return target&&target.closest?target.closest('.photo-link,.photo-return'):null;}
function activate(event){
 var hit=control(event.target);if(!hit)return;
 if(event.type==='touchend'&&(!start||(event.touches&&event.touches.length)))return;
 if(event.type==='touchend'&&start&&event.changedTouches&&event.changedTouches.length){var t=event.changedTouches[0];if(Math.abs(t.clientX-start.x)>12||Math.abs(t.clientY-start.y)>12){start=null;return;}}
 start=null;event.preventDefault();event.stopPropagation();
 if(hit.classList.contains('photo-return')){close();return;}
 var id=(hit.getAttribute('href')||'').slice(1),view=document.getElementById(id);if(!view||!view.classList.contains('photo-detail'))return;
 close();origin=hit;active=view;view.classList.add('is-open');view.setAttribute('aria-hidden','false');var back=view.querySelector('.photo-return');if(back)try{back.focus({preventScroll:true});}catch(e){back.focus();}
}
document.addEventListener('touchstart',function(e){var hit=control(e.target);if(!hit||!e.touches||e.touches.length!==1){start=null;return;}var t=e.touches[0];start={x:t.clientX,y:t.clientY};},{passive:true});
document.addEventListener('touchend',activate,{passive:false});
document.addEventListener('click',activate,false);
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&active){e.preventDefault();close();}});
window.addEventListener('pagehide',close);
})();`;
