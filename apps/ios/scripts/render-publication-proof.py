"""Render the actual sample EPUB spine for static visual review, not native PDF acceptance.
Needs WeasyPrint / PyMuPDF; neither is an app dependency. Apple Books still needs device testing.
"""
import argparse
from pathlib import Path
import xml.etree.ElementTree as ET
from weasyprint import HTML, CSS
import fitz

parser=argparse.ArgumentParser()
parser.add_argument('--samples',required=True)
root=Path(parser.parse_args().samples).resolve()
for design in ['literary','imagebook']:
    base=root/design/'OEBPS'
    opf=ET.parse(base/'package.opf')
    ns={'p':'http://www.idpf.org/2007/opf'}
    manifest={n.attrib['id']:n.attrib['href'] for n in opf.findall('p:manifest/p:item',ns)}
    sources=[manifest[n.attrib['idref']] for n in opf.findall('p:spine/p:itemref',ns)]
    combined=fitz.open()
    for source in sources:
        styles=[] if design=='imagebook' else [CSS(string='@page{size:A5;margin:15mm}body{font-size:12pt}')]
        pdf=fitz.open(stream=HTML(filename=str(base/source),encoding='utf-8').write_pdf(stylesheets=styles),filetype='pdf')
        if design=='imagebook' and len(pdf)!=1:
            raise ValueError('A fixed EPUB document must occupy one page: '+source)
        if design=='imagebook':
            for block in pdf[0].get_text('dict')['blocks']:
                rect=fitz.Rect(block['bbox'])
                if not pdf[0].rect.contains(rect):
                    raise ValueError('Content outside fixed page: '+source+' '+str(rect))
        combined.insert_pdf(pdf)
        if design=='imagebook':
            pdf[0].get_pixmap().save(root/(Path(source).stem+'.png'))
    combined.save(root/f'Lampy-{design}-static-proof.pdf')
    print(design,len(combined),'static proof pages')
