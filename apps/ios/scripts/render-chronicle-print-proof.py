"""Static layout proof only. Input comes from the explicit Jest glyph-width test double.
Not a native PDF export or a substitute for Core Text / iPhone acceptance.
Usage: python3 scripts/render-chronicle-print-proof.py LAYOUT_JSON OUTPUT_DIR
"""
import html,json,sys
from pathlib import Path
from weasyprint import HTML
import fitz
from PIL import Image,ImageDraw,ImageFont
src=json.loads(Path(sys.argv[1]).read_text());layout=src['layout'];out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
assets=Path(__file__).resolve().parents[1]/'assets'/'first-run'
pages=layout['pages']
selected=[next(p['index'] for p in pages if any(b['kind']=='image' and b.get('momentId')==m for b in p['blocks'])) for m in ['single','pair','three']]
selected.append(next(p['index'] for p in pages if any(b['kind']=='note' and b.get('momentId')=='three' for b in p['blocks'])))
doc=fitz.open();images=[]
def text(value,x,y,size=17,color='#25231f'):
 return f'<div style="position:absolute;left:{x}pt;top:{y-size*.95}pt;font-size:{size}pt;line-height:1;white-space:pre;color:{color}">{html.escape(value)}</div>'
for i in selected:
 p=layout['pages'][i];ink=p.get('rendering',{}).get('bodyColor','#105f62');w=layout['pageSize']['widthPt'];h=layout['pageSize']['heightPt'];parts=[]
 edge=p['rendering'].get('bindingColor')
 if edge:parts.append(f'<div style="position:absolute;left:18pt;top:40pt;width:5pt;height:{h-84}pt;background:{edge}"></div>')
 parts.append(text(src['source']['album']['name'],36,23,8,'#5c5851'))
 parts.append(f'<div style="position:absolute;left:36pt;right:36pt;top:31pt;border-top:.5pt solid #b8cac4"></div>')
 if any(b['kind']=='note' for b in p['blocks']) and not any(b['kind'] in ['image','audio'] for b in p['blocks']):
  parts.extend([text('“',2,90,32,'#b8cac4'),text('”',w-36,h-70,32,'#b8cac4'),f'<div style="position:absolute;left:36pt;top:{h-51}pt;width:29pt;border-top:.6pt solid #829e96"></div>'])
 for b in p['blocks']:
  box=b['box'];x=box['xPt'];y=box['yPt'];kind=b['kind']
  if kind=='image':
   file=(assets/(b['assetId']+'.jpg')).as_uri()
   parts.append(f'<img src="{file}" style="position:absolute;left:{x}pt;top:{y}pt;width:{box["widthPt"]}pt;height:{box["heightPt"]}pt;object-fit:contain"/>')
  elif kind=='feeling':continue
  elif 'lines' in b:
   for line in b['lines']:
    chars=list(b['text']);a=line['start'];z=line['end'];xx=line['xPt'];baseline=line['baselineYPt'];initial=b.get('printInitial')
    if a==0 and initial:
     n=initial['scalars'];parts.append(text(''.join(chars[:n]),xx,baseline,initial['sizePt'],ink));parts.append(text(''.join(chars[n:z]),xx+initial['widthPt'],baseline,color=ink))
    else:parts.append(text(''.join(chars[a:z]),xx,baseline,color=ink if kind=='note' else '#25231f'))
  else:parts.append(text(b.get('text',b.get('label','')),x,y+12,15,'#53604f'))
 parts.append(text(f'{i+1:02}',w/2-6,h-18,10,'#53604f'))
 parts.append(text('静态布局校样 · 非 iPhone 原生 PDF',36,h-5,6,'#84928c'))
 source=f'<html><head><style>@page{{size:{w}pt {h}pt;margin:0}}body{{margin:0;background:#faf9f5;font-family:"Noto Serif CJK SC",serif}}*{{box-sizing:border-box}}</style></head><body>'+''.join(parts)+'</body></html>'
 proof=fitz.open(stream=HTML(string=source).write_pdf(),filetype='pdf');assert len(proof)==1
 for block in proof[0].get_text('blocks'):
  assert block[0]>=0 and block[1]>=0 and block[2]<=w+1 and block[3]<=h+1,block
 png=out/f'page-{i}.png';proof[0].get_pixmap(matrix=fitz.Matrix(1.4,1.4)).save(png);images.append(Image.open(png).convert('RGB'));doc.insert_pdf(proof)
doc.save(out/'Lampy-Chronicle-print-layout-proof.pdf')
font_path=next((p for p in ['/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc','/System/Library/Fonts/Supplemental/Songti.ttc'] if Path(p).exists()),None)
font=ImageFont.truetype(font_path,21) if font_path else ImageFont.load_default()
thumbs=[]
for title,im in zip(['单图完整展示','双图错落排列 · 打印适配','三图紧凑照片墙','长文首字与装饰'],images):
 im.thumbnail((540,780));tile=Image.new('RGB',(580,850),'#e8eae6');tile.paste(im,((580-im.width)//2,50));ImageDraw.Draw(tile).text((20,10),title,fill='#53604f',font=font);thumbs.append(tile)
sheet=Image.new('RGB',(1160,1700),'white')
for n,t in enumerate(thumbs):sheet.paste(t,((n%2)*580,(n//2)*850))
sheet.save(out/'Lampy-Chronicle-print-layout-proof.png')
print('STATIC_PROOF_OK',len(doc))
