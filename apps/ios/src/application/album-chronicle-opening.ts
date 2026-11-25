import type {AlbumEpubOptions} from './album-epub';

export const CHRONICLE_PHILOSOPHY={
 'zh-Hans':'留住普通生活里的文字、影像与声音。\n让今天的片刻，成为往后可以重温的记忆。',
 en:'Keep the words, photographs and voices of ordinary life.\nA little of today, to return to tomorrow.',
} as const;
/** Editorial opening; the user's words stay separate from the publisher's quiet footer. */
export function chronicleOpening(options:AlbumEpubOptions,text:string,page:number,escape:(s:string)=>string):string{
 return `<section class="chronicle-opening" epub:type="preface" lang="${options.language}"><header class="opening-masthead">LAMPY<span class="opening-masthead-rule" aria-hidden="true"></span></header><span class="opening-quote" aria-hidden="true">“</span><span class="opening-side-rule" aria-hidden="true"></span><div class="opening-letter fixed-prose"><div class="opening-copy">${escape(text)}</div></div><footer class="opening-imprint"><p class="opening-signature" lang="en">Lampy</p>${page===0?`<p class="opening-philosophy">${escape(CHRONICLE_PHILOSOPHY[options.language])}</p>`:''}<img class="opening-symbol" src="lampy-symbol.svg" alt=""/></footer></section>`;
}
export const CHRONICLE_OPENING_CSS=`
.chronicle-opening{position:absolute;inset:0;background:#faf9f5;color:#303a37;font-family:Baskerville,"Palatino Linotype",Georgia,"Songti SC","STSong","Noto Serif CJK SC",serif}
.opening-masthead{position:absolute;left:110px;right:110px;top:94px;font:18px/1.5 Georgia,serif;letter-spacing:6px;color:#105f62}
.opening-masthead-rule{position:absolute;left:150px;right:0;top:13px;border-top:1px solid #b8cac4}
.opening-quote{position:absolute;left:105px;top:225px;font:150px/1 Georgia,serif;color:#bfd2ca}
.opening-side-rule{position:absolute;left:190px;top:270px;height:280px;border-left:1px solid #c4d3cd}
.opening-letter{position:absolute;left:260px;right:auto;width:830px;top:215px;height:430px;display:flex;align-items:center;font-size:34px;line-height:1.8;letter-spacing:.025em;font-weight:400;text-align:left;white-space:pre-wrap;overflow-wrap:anywhere}
.opening-copy{width:100%;min-width:0;white-space:pre-wrap;overflow-wrap:anywhere}
.chronicle-opening:lang(en) .opening-letter{font-family:Baskerville,"Palatino Linotype",Palatino,Georgia,"Songti SC","Noto Serif CJK SC",serif;font-size:34px;line-height:1.7;letter-spacing:.005em}
.opening-imprint{position:absolute;left:110px;right:110px;top:705px;height:130px;border-top:1px solid #b8cac4;padding-top:28px}
.opening-signature{position:absolute;left:0;top:32px;font:italic 30px/1.4 Baskerville,"Palatino Linotype",Georgia,serif;color:#105f62}
.opening-philosophy{position:absolute;left:210px;right:80px;top:30px;font-size:19px;line-height:1.75;letter-spacing:.02em;color:#687870;white-space:pre-wrap}
.chronicle-opening:lang(en) .opening-philosophy{font-family:Baskerville,"Palatino Linotype",Georgia,serif;font-size:20px;letter-spacing:.005em}
.opening-symbol{position:absolute;right:0;top:28px;width:64px;height:64px;opacity:.6}
`;
