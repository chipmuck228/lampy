/** Conservative pagination budget; leaves room for platform serif font differences.
 * Chunks preserve every source character. Never clamp, ellipsize or hide overflow.
 */
export function splitPublicationText(text:string,columns=30,lines=14,unitWidth?:(glyph:string)=>number):string[]{
 const graphemes=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(s=>s.segment):Array.from(text);
 const chunks:string[]=[];let start=0;
 while(start<graphemes.length){
  let line=0,width=0,end=start,lastPause=-1;
  while(end<graphemes.length){
   const glyph=graphemes[end],newline=glyph==='\n'||glyph==='\r\n';
   const weight=newline?0:unitWidth?unitWidth(glyph):/^[\x20-\x7e]+$/.test(glyph)?glyph===' '? .4:.65:1.2;
   if(newline||width+weight>columns){if(line+1>=lines&&end>start)break;line++;width=0;}
   if(!newline)width+=weight;
   end++;if(/[\n。！？.!?;]/u.test(glyph))lastPause=end;
  }
  if(end<graphemes.length&&lastPause>start+(end-start)*.7)end=lastPause;
  chunks.push(graphemes.slice(start,end).join(''));start=end;
 }
 return chunks;
}
