#!/usr/bin/env python3
"""Independent validation of a native stage C edition (requires pypdf; --render also Poppler)."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import unicodedata


def digest(path):
    sha = hashlib.sha256()
    with path.open('rb') as file:
        for chunk in iter(lambda: file.read(65536), b''):
            sha.update(chunk)
    return sha.hexdigest()


def compact(text):
    return ''.join(unicodedata.normalize('NFC', text).split())


def font_embedding(font):
    font = font.get_object()
    descendants = font.get('/DescendantFonts')
    if descendants:
        return all(font_embedding(child) for child in descendants.get_object())
    if font.get('/Subtype') == '/Type3':
        return bool(font.get('/CharProcs'))
    descriptor = font.get('/FontDescriptor')
    if not descriptor:
        return None
    descriptor = descriptor.get_object()
    return any(descriptor.get(key) for key in ('/FontFile', '/FontFile2', '/FontFile3'))


def resource_fonts(resources, depth=0):
    if depth > 20:
        raise ValueError('PDF resource recursion exceeds limit')
    resources = resources.get_object()
    result = []
    for font in resources.get('/Font', {}).get_object().values() if '/Font' in resources else []:
        result.append({'baseFont': str(font.get_object().get('/BaseFont', '')), 'embedded': font_embedding(font)})
    for obj in resources.get('/XObject', {}).get_object().values() if '/XObject' in resources else []:
        obj = obj.get_object()
        if obj.get('/Subtype') == '/Form' and obj.get('/Resources'):
            result.extend(resource_fonts(obj['/Resources'], depth + 1))
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('edition', type=Path, help='Saved print_* directory copied from simulator/device')
    parser.add_argument('--render', action='store_true')
    args = parser.parse_args()
    from pypdf import PdfReader
    folder = args.edition.resolve()
    manifest = json.loads((folder / 'manifest.json').read_text())
    if manifest.get('version') != 1 or manifest['pdf']['file'] != 'album.pdf':
        raise ValueError('unsupported edition')
    if digest(folder / 'manifest.json') != (folder / 'manifest.sha256').read_text().strip():
        raise ValueError('manifest checksum mismatch')
    pdf = folder / 'album.pdf'
    if digest(pdf) != manifest['pdf']['sha256']:
        raise ValueError('PDF checksum mismatch')
    for item in manifest['media']:
        if Path(item['file']).name != item['file']:
            raise ValueError('invalid media path')
        if digest(folder / item['file']) != item['sha256']:
            raise ValueError('media checksum mismatch')
    reader = PdfReader(pdf)
    if len(reader.pages) != len(manifest['layout']['pages']):
        raise ValueError('page count mismatch')
    fonts = []
    for actual, planned in zip(reader.pages, manifest['layout']['pages']):
        if abs(float(actual.mediabox.width) - 148 * 72 / 25.4) > 0.1 or abs(float(actual.mediabox.height) - 210 * 72 / 25.4) > 0.1:
            raise ValueError('not physical A5')
        text = compact(actual.extract_text() or '')
        for block in planned['blocks']:
            if block['kind'] in ('note', 'opening', 'cover-name') and compact(block['text']) not in text:
                raise ValueError('PDF selectable text mismatch')
        fonts.extend(resource_fonts(actual['/Resources']))
    embedded = None if not fonts or any(font['embedded'] is None for font in fonts) else all(font['embedded'] for font in fonts)
    result = {'pages': len(reader.pages), 'A5': True, 'textChecked': True, 'pdfAndMediaHashesChecked': True,
              'fontResources': fonts, 'fontsEmbedded': embedded, 'nativeFontRuns': manifest['pdf']['fontRunNames'], 'visualReview': 'NOT_VERIFIED'}
    if args.render:
        destination = folder / 'rendered'
        destination.mkdir(exist_ok=True)
        subprocess.run(['pdftoppm', '-r', '144', '-png', str(pdf), str(destination / 'page')], check=True)
        result['renderedPages'] = len(list(destination.glob('page-*.png')))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
