/** Reflowable companion to the landscape image book. No fixed-height text boxes. */
export const ALBUM_PUBLICATION_CSS=`
html,body{margin:0;padding:0;background:transparent}
body{font-family:"Songti SC","Noto Serif CJK SC",Georgia,serif;font-size:1em;line-height:1.8;color:inherit}
h1,h2,p,figure,dl,dd{margin:0;padding:0}h1,h2{font-weight:normal;overflow-wrap:anywhere}
p{orphans:2;widows:2;overflow-wrap:anywhere}
.cover{padding:3em 1em 1em}.cover-picture{margin:0 0 2em}.cover-picture img{display:block;width:auto;height:auto;max-width:100%;max-height:55vh;margin:auto}
.cover-copy{margin:1em 0 0}.cover-kicker{font:.6em/1.5 sans-serif;letter-spacing:.24em;opacity:.55;margin:0 0 1.6em}
.cover-title{font-size:2.1em;line-height:1.4}.opening{padding:16vh 1.2em 1em}.opening .prose{max-width:28em;margin:auto}
.chapter{padding:0 .6em}.chapter-head{margin:1.8em 0 2em;break-after:avoid;page-break-after:avoid}.chapter-title{font-size:1.6em;line-height:1.5}
.entry{margin:0 0 2.4em;break-after:auto;page-break-after:auto}.entry-head{margin:0 0 .8em;break-after:avoid;page-break-after:avoid}
.entry-meta,.attribution{font:.72em/1.7 sans-serif;opacity:.65}.attribution{margin:.2em 0 0}.feeling{margin-left:1em}
.prose{text-align:left;line-height:1.8}.prose p{margin:0 0 .8em}
.entry-media{margin:1em 0 0}.photo{margin:1.2em auto;break-inside:avoid;page-break-inside:avoid}
.photo img{display:block;width:auto;height:auto;max-width:100%;max-height:62vh;margin:auto;object-fit:contain}
.photo.portrait{max-width:24em}.photo-pair{display:table;table-layout:fixed;width:100%;border-spacing:.7em 0;margin:1.2em 0}
.photo.paired{display:table-cell;width:50%;vertical-align:middle}.photo-composition{margin:1.2em 0;break-inside:auto}
.photo-row{display:table;table-layout:fixed;width:100%;border-spacing:.7em .7em}.photo-row .photo{display:table-cell;width:50%;vertical-align:middle}
.photo-composition.triptych{display:block}.photo-main,.photo-stack{display:block}.photo-stack .photo{margin:1em auto}
.sound{margin:1.4em 0;padding:.8em 0;break-inside:avoid;page-break-inside:avoid}.sound-heading{display:table;margin-bottom:.6em}.sound-mark{width:1.8em;height:1.2em;display:table-cell;vertical-align:middle}.sound-label{font:.8em/1.6 sans-serif;display:table-cell;padding-left:.6em}
audio{width:100%;max-width:100%}.sound-fallback{font:.65em/1.6 sans-serif;opacity:.6;margin-top:.6em}
.edition-notes{padding:4em 1em 1em}.edition-notes h1{font-size:1.2em;margin-bottom:1.5em}.edition-notes p{font:.8em/1.8 sans-serif;opacity:.7}
.edition-notes dl{display:table;width:100%;margin:2em 0}.edition-notes dl>div{display:table-cell}.edition-notes dt{font:1.5em/1.5 Georgia,serif}.edition-notes dd{font:.7em/1.8 sans-serif;opacity:.6}.imprint{margin-top:1em}
nav{padding:1em}nav ol{list-style:none;padding:0}nav li{margin:.8em 0}a{color:inherit;text-decoration:none}
@media screen and (max-width:480px){.photo-pair,.photo-row,.photo.paired,.photo-row .photo{display:block;width:auto}.photo.paired{margin:1em auto}}
`;
