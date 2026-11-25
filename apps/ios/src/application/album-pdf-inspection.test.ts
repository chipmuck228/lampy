import {readFileSync} from 'fs';
import {join} from 'path';
import {JSDOM} from 'jsdom';
// Execute the actual inspection script embedded in the native renderer. Only
// layout rectangles/font readiness are supplied by the DOM test environment.
const swift=readFileSync(join(__dirname,'../../modules/lampy-album-layout/ios/AlbumPrint.swift'),'utf8');
const inspection=swift.split('let inspect = """')[1].split('"""')[0];
async function inspect(body:string,sourceTexts:string[]=[]):Promise<{texts:string[];textKinds:string[];textBounds:unknown[];sourceBounds:unknown[]}>{
 const dom=new JSDOM(body,{runScripts:'outside-only'});
 Object.defineProperty(dom.window.document,'fonts',{value:{ready:Promise.resolve()}});
 Object.defineProperty(dom.window.Range.prototype,'getClientRects',{value:()=>[{left:10,top:10,right:100,bottom:40}]});
 Object.defineProperty(dom.window.Range.prototype,'getBoundingClientRect',{value:()=>({left:10,top:10,width:90,height:30})});
 try{return await dom.window.eval(`(async function(recordPage,sourceTexts){${inspection}})(false,${JSON.stringify(sourceTexts)})`) as {texts:string[];textKinds:string[];textBounds:unknown[];sourceBounds:unknown[]};}finally{dom.window.close();}
}
it('checks opening words and philosophy without requiring a decorative quote to be searchable',async()=>{
 const result=await inspect('<header>LAMPY</header><span aria-hidden="true">“</span><div class="fixed-prose"><div class="opening-copy">My opening “words”.</div></div><p class="opening-philosophy">Ordinary life.</p><p>Lampy</p>');
 expect(result.texts).toEqual(['LAMPY','My opening “words”.','Ordinary life.','Lampy']);
 expect(result.textKinds).toEqual(['imprint','opening','philosophy','imprint']);
});
it('retains quotation marks in user writing and excludes only explicitly hidden ornament',async()=>{
 const result=await inspect('<div class="fixed-prose">“我的文字”</div><span aria-hidden="true"><i>“</i></span><p style="display:none">not painted</p>');
 expect(result.texts).toEqual(['“我的文字”']);expect(result.textKinds).toEqual(['writing']);
});

it('keeps glyph-reconstruction regions aligned with mixed-font DOM and source checks',async()=>{
 const text='小猫和panda，各自休息';
 const result=await inspect(`<span aria-hidden="true">“</span><div class="fixed-prose">${text}</div><footer>Lampy</footer>`,[text,'not present']);
 expect(result.texts).toEqual([text,'Lampy']);
 expect(result.textBounds).toHaveLength(result.texts.length);
 expect(result.sourceBounds).toEqual([{left:10,top:10,width:90,height:30},null]);
});
