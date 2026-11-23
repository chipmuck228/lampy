# Development-only: requires WeasyPrint and PyMuPDF. Never called by the iOS/Android app.
from pathlib import Path
import re
from weasyprint import HTML,CSS
import argparse
parser=argparse.ArgumentParser(description='Print proofs of synthetic EPUB samples; not the iOS PDF renderer.')
parser.add_argument('--samples',required=True)
root=Path(parser.parse_args().samples).resolve()
for design in ['literary','imagebook']:
 base=root/design/'OEBPS'
 sources=['cover.xhtml','archive.xhtml','opening.xhtml',*sorted(base.glob('record-*.xhtml'),key=lambda p:int(p.stem.split('-')[-1]))]
 sections=[]
 for name in sources:
  p=base/name if isinstance(name,str) else name
  source=p.read_text();body=re.search(r'<body[^>]*>([\s\S]*)</body>',source).group(1)
  body=re.sub(r'<audio[^>]*>.*?</audio>','<p class="proof-audio">声音保存在 EPUB 中 · 打开电子册即可播放</p>',body,flags=re.S)
  sections.append('<div class="source-page">'+body+'</div>')
 html='<html lang="zh-Hans"><head><meta charset="utf-8"></head><body class="'+design+'">'+''.join(sections)+'</body></html>'
 css=f'''@page{{size:A5;margin:12mm 13mm;@bottom-center{{content:counter(page);font-size:9pt;color:#53604f}}}}body{{font-size:12pt;color:#25231f}} .source-page{{break-after:page}} .proof-audio{{font-size:.75em;color:#53604f;margin:.8em 0}}'''
 HTML(string=html,base_url=base.as_uri()+'/',media_type='screen').write_pdf(root/f'Lampy-{design}-design-proof.pdf',stylesheets=[CSS(filename=str(base/'style.css')),CSS(string=css)])
 print(design)

# An explicit cover distinguishes the static EPUB print proof from an iOS-native PDF.
intro_html="""<html lang="zh-Hans"><meta charset="utf-8"><body><small>LAMPY / DESIGN PROOF</small><h1>装帧设计校样</h1><h2>生活文集 · 影像小册</h2><hr/><p>由 EPUB 样册内容排版生成，供比较装帧效果。</p><p>这不是 iOS 真机导出的 PDF。</p><p>照片、文字、记录者与日期均为示例素材。</p><p>声音请在 EPUB 中播放。</p><p>实际阅读器可以调整字号、纸色和分页。</p><footer>2026年11月23日 · 设计预览</footer></body></html>"""
intro_css="""@page{size:A5;margin:23mm 13mm;background:#f3f0e9}body{font-family:'Noto Serif CJK SC',serif;color:#53604f;font-size:11pt;line-height:1.9}small{font-family:sans-serif;font-size:9pt;letter-spacing:.13em}h1{font-weight:400;font-size:26pt;margin:22mm 0 4mm}h2{font-weight:400;font-size:15pt;margin:0 0 12mm}hr{border:0;border-top:1px solid #b6baae;margin-bottom:13mm}p{margin:0 0 2mm;color:#5c5851}footer{font-size:10pt;margin-top:15mm}"""
HTML(string=intro_html).write_pdf(root/'proof-introduction.pdf',stylesheets=[CSS(string=intro_css)])
import fitz
combined=fitz.open();combined.insert_pdf(fitz.open(root/'proof-introduction.pdf'));toc=[[1,'设计校样说明',1]]
for design,label in [('literary','生活文集'),('imagebook','影像小册')]:
 toc.append([1,label,len(combined)+1]);combined.insert_pdf(fitz.open(root/f'Lampy-{design}-design-proof.pdf'))
combined.set_toc(toc);combined.set_metadata({'title':'Lampy EPUB 装帧设计校样','subject':'Synthetic EPUB print proofs; not native iOS PDF output','author':'Lampy design review'})
combined.save(root/'Lampy-design-proof.pdf',garbage=4,deflate=True)
