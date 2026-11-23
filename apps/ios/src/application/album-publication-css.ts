export const ALBUM_PUBLICATION_CSS=`
html,body{margin:0;padding:0;background:transparent}
body{font-family:"Songti SC","STSong",serif;font-size:1em;line-height:1.85}
h1,h2,h3,p,figure,ol{margin:0;padding:0}
h1,h2,h3{font-weight:normal;line-height:1.4;overflow-wrap:break-word}
p{orphans:2;widows:2;overflow-wrap:break-word}
.cover{padding:1.8em .8em 1em;page-break-after:always;break-after:page}
.cover-kicker{font-family:sans-serif;font-size:.6em;letter-spacing:.18em;margin:0 0 2em}
.cover-picture{margin:0 auto 1.8em;max-width:28em}
.cover-picture img{display:block;max-width:100%;width:100%;height:auto;margin:auto}
.cover h1.cover-title{font-size:1.8em;line-height:1.4;text-indent:0;margin:0 0 .6em}
.cover-subtitle{font-family:sans-serif;font-size:.7em;letter-spacing:.1em;margin:0 0 1em}
.cover-rule{width:2.5em;border-top:1px solid;margin:5em 0}
.opening{padding:3em 1em 0}
.section-label{font-family:sans-serif;font-size:.8em;letter-spacing:.08em;margin:0 0 2em}
.chapter{padding:0 .8em}
.chapter-head{padding:4em 0 3em;margin:0 0 2em;page-break-after:always;break-after:page}
.chapter-kicker{font-family:sans-serif;font-size:.6em;letter-spacing:.16em;margin:0 0 3em}
.chapter h1.chapter-title{font-size:2.5em;line-height:1.4;margin:0;text-indent:0}
.entry{margin:0 0 2.5em;padding:0;page-break-after:auto;break-after:auto}
.entry+.entry{border-top:1px solid #aab2a4;padding-top:1.8em}
.entry-head{margin:0 0 1.1em;page-break-after:avoid;break-after:avoid}
.entry-meta{font-family:sans-serif;font-size:.7em;line-height:1.7;letter-spacing:.05em}
.date{font-weight:normal}
.feeling{font-weight:normal;margin-left:1em;padding-left:1em;border-left:1px solid}
.attribution{font-family:sans-serif;font-size:.7em;margin:.4em 0 0}
.prose{font-size:1em;line-height:1.85;text-align:left}
.prose p{margin:0 0 1em;text-indent:0}
.entry-media{margin:1.2em 0 0}
.photo{margin:1.1em auto;page-break-inside:avoid;break-inside:avoid}
.photo img{display:block;width:100%;max-width:100%;height:auto;margin:0 auto}
.photo.portrait{width:86%;max-width:24em}
.photo-pair{display:table;table-layout:fixed;width:100%;margin:1em 0;page-break-inside:avoid;break-inside:avoid}
.photo.paired{display:table-cell;width:50%;padding:0 .25em;vertical-align:middle}
.sound{border-top:1px solid;border-bottom:1px solid;margin:1.5em 0;padding:1em 0;page-break-inside:avoid;break-inside:avoid}
.sound-label{font-family:sans-serif;font-size:.8em;margin:0 0 .7em}
audio{width:100%;max-width:100%}
.colophon{margin:2.5em 0 0;padding:1em 0 0;border-top:1px solid #aab2a4}
.colophon p{font-family:sans-serif;font-size:.65em;line-height:1.7;text-align:left}
.imprint{margin-left:1em}
.imagebook .cover{padding:1em .3em}
.imagebook .cover-picture{max-width:none;margin-bottom:1.2em}
.imagebook .cover-copy{padding:0 .5em}
.imagebook .cover h1.cover-title{font-size:2em}
.imagebook .chapter-head{background:#354b3e;color:#f5f2e7;padding:3em 1em;margin:0 -.8em 2em}
.imagebook .chapter-head .chapter-title{font-size:3em;color:#f5f2e7}
.imagebook .chapter-head .chapter-kicker{color:#d2dac8}
.imagebook .entry-lead{margin:0 0 1.5em}
.imagebook .entry-lead .photo{width:100%;max-width:none;margin-top:0}
.imagebook .entry-lead .photo-pair{margin-top:0}
.imagebook .photo.portrait{width:94%;max-width:28em}
.imagebook .photo.paired{padding:0 .15em}
.imagebook .long-entry .prose{margin:0 .5em;line-height:1.95}
.imagebook .entry-media{margin-top:.8em}
nav{padding:1em .5em}nav ol{list-style:none}nav li{margin:.8em 0;font-size:.9em}a{color:inherit;text-decoration:none}
@media screen and (max-width:360px){.photo-pair{display:block}.photo.paired{display:block;width:100%;padding:0;margin:1em auto}}

/* Keepsake edition. Old readers keep natural block flow; no script, absolute
   content positioning, fixed text height or required grid support. */
body{font-family:"Songti SC","Noto Serif CJK SC","Source Han Serif SC",Georgia,serif;letter-spacing:.015em}
.cover{padding:2.2em 1em 1.5em;border:1px solid currentColor}
.cover-kicker{opacity:.65;letter-spacing:.2em}
.cover-picture img{width:auto;max-width:100%;max-height:22em;max-height:46vh}
.cover-title{overflow-wrap:anywhere}
.cover-copy{border-top:1px solid currentColor;padding-top:1.3em}
.cover-subtitle{opacity:.65}
.archive{text-align:center;padding:3em .8em;page-break-after:always;break-after:page}
.archive-kicker{font: .62em/1.6 sans-serif;letter-spacing:.2em;opacity:.7}
.archive-seal{font:italic 2em/1.4 Georgia,serif;border:1px solid currentColor;width:1.6em;margin:1.8em auto .8em}
.archive h1.archive-title{font-size:1.6em;margin:0 0 1em}
.archive-line{font-size:.9em;line-height:1.8;opacity:.8}
.archive-stats{display:table;width:100%;margin:2.6em 0 1.6em;padding:1.5em 0;border-top:1px solid currentColor;border-bottom:1px solid currentColor}
.archive-stats>div{display:table-cell;width:33.33%;vertical-align:top}
.archive-stats dt{font:2em/1.3 Georgia,serif}
.archive-stats dd{font:.65em/1.8 sans-serif;margin:.6em .3em 0;opacity:.7}
.archive-date{font:.65em/1.8 sans-serif;letter-spacing:.08em;opacity:.65}
.opening{padding:3em 1em 1em;page-break-after:always;break-after:page}
.opening .section-label{border-top:1px solid currentColor;padding-top:1em}
.chapter-head{padding:3.5em 0 2em}
.chapter-number{font:4.4em/1.1 Georgia,serif;opacity:.24;letter-spacing:.05em;margin:.3em 0}
.chapter-kicker{margin:0 0 1em}
.chapter h1.chapter-title{font-size:2em}
.chapter-ornament{width:2.8em;height:.35em;border-top:1px solid currentColor;border-bottom:1px solid currentColor;margin:2em 0 .3em;opacity:.55}
.entry-meta{padding-bottom:.6em;border-bottom:1px solid currentColor}
.prose{line-height:1.85}.prose p{text-align:justify;hyphens:auto}
.entry+.entry{border-color:currentColor}
.photo{padding:.5em;border:1px solid currentColor;background:rgba(128,128,128,.045)}
.photo img{width:auto;max-width:100%;height:auto;max-height:26em;max-height:62vh;object-fit:contain}
.photo.landscape img,.photo.square img{width:auto;height:auto;object-fit:contain}
.photo.portrait,.imagebook .photo.portrait{width:auto;max-width:24em}
figcaption{font:.6em/1.5 sans-serif;letter-spacing:.13em;text-align:right;opacity:.55;margin:.65em 0 0}
.photo-pair{border-spacing:.6em 0;page-break-inside:avoid;break-inside:avoid}
.photo.paired,.imagebook .photo.paired{padding:.5em;width:50%}
.photo-composition{margin:1.4em 0;page-break-inside:avoid;break-inside:avoid}
.photo-composition .photo{margin:.7em auto}
.sound{border-color:currentColor;padding:1em .7em;background:rgba(128,128,128,.045)}
.sound-heading{display:table;width:100%;margin-bottom:.8em}
.sound-mark{display:table-cell;width:2.4em;height:1.6em;vertical-align:middle}
.sound-label{display:table-cell;vertical-align:middle;padding-left:.8em;line-height:1.6}
.sound-fallback{font:.65em/1.6 sans-serif;opacity:.65;margin:.7em 0 0}
.colophon{border-color:currentColor}
.imagebook .cover{padding:1.5em .8em;background:#354b3e;color:#f5f2e7}
.imagebook .cover-picture{margin:1em auto 1.5em}
.imagebook .chapter-head{padding:2.5em 1em;margin:0 -.8em 2em}
.imagebook .chapter-head .chapter-title{font-size:2em}
.imagebook .entry-lead .photo{margin-top:0}
.photo-composition.contact{display:block;width:100%}
.photo-row{display:table;table-layout:fixed;width:100%;border-spacing:.6em .6em}
.photo-row .photo{display:table-cell;width:50%;vertical-align:middle;margin:0;padding:.5em}
.imagebook .entry-lead .photo-row .photo{width:50%;max-width:none}
.photo-row img{max-height:14em;max-height:34vh}
.photo-composition.triptych{display:table;table-layout:fixed;width:100%;border-spacing:.5em 0}
.photo-main,.photo-stack{display:table-cell;width:50%;vertical-align:middle}
.photo-main .photo,.photo-stack .photo{max-width:100%;width:auto;margin:.6em 0}
.photo-stack img{max-height:12em;max-height:28vh}
@media screen and (max-width:360px){
 .photo-pair{display:block}.photo.paired,.imagebook .photo.paired{display:block;width:auto;margin:1em auto}
 .photo-composition.contact,.photo-composition.triptych,.photo-row,.photo-main,.photo-stack{display:block;width:100%}
 .photo-row .photo{display:block;width:auto}
 .photo-composition .photo{margin:.8em 0}
 .cover h1.cover-title,.imagebook .cover h1.cover-title{font-size:1.6em}
 .archive-stats dt{font-size:1.6em}
}
`;
