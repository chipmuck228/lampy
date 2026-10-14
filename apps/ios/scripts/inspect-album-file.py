#!/usr/bin/env python3
"""Independent, read-only format-1 inspection. Never extracts an untrusted archive."""
import argparse
import hashlib
import json
import re
import struct
import zipfile
from pathlib import Path

LIMIT = 512 * 1024 * 1024
NAMES = re.compile(r'^(book\.json|album\.pdf|media-[0-9]{1,4}\.(png|m4a))$')


def inspect(path):
    if path.stat().st_size > LIMIT:
        raise ValueError('file exceeds limit')
    with path.open('rb') as raw:
        raw.seek(-22, 2)
        end = raw.read(22)
        signature, disk, start_disk, on_disk, count, length, offset, comment = struct.unpack('<IHHHHIIH', end)
        if signature != 0x06054b50 or disk or start_disk or on_disk != count or comment or offset + length != path.stat().st_size - 22:
            raise ValueError('invalid or unsupported ZIP footer')
    with zipfile.ZipFile(path) as archive:
        infos = archive.infolist()
        if not 2 <= len(infos) <= 512 or len(infos) != count:
            raise ValueError('invalid file count')
        names = set()
        cursor = 0
        total = 0
        hashes = {}
        with path.open('rb') as raw:
            for item in sorted(infos, key=lambda info: info.header_offset):
                if not NAMES.fullmatch(item.filename) or item.filename in names or item.flag_bits or item.compress_type != 0 or item.extra or item.comment or item.external_attr:
                    raise ValueError('unsupported ZIP entry')
                if item.header_offset != cursor or item.compress_size != item.file_size:
                    raise ValueError('overlapping or non-contiguous entry')
                names.add(item.filename)
                raw.seek(cursor)
                header = raw.read(30)
                values = struct.unpack('<IHHHHHIIIHH', header)
                if values[0] != 0x04034b50 or values[2] or values[3] or values[6] != item.CRC or values[7] != item.file_size or values[8] != item.file_size or values[10] or raw.read(values[9]) != item.filename.encode():
                    raise ValueError('local/central headers disagree')
                cursor += 30 + values[9] + item.file_size
                total += item.file_size
                if total > LIMIT or item.filename == 'book.json' and item.file_size > 4 * 1024 * 1024:
                    raise ValueError('expanded size exceeds limit')
                sha = hashlib.sha256()
                with archive.open(item) as source:
                    for chunk in iter(lambda: source.read(65536), b''):
                        sha.update(chunk)
                hashes[item.filename] = sha.hexdigest()
            if cursor != offset or not {'book.json', 'album.pdf'} <= names:
                raise ValueError('archive layout invalid')
        book = json.loads(archive.read('book.json'))
        if book.get('format') != 'lampy' or book.get('version') != 1 or book.get('readingVersion') != 1 or book.get('layoutVersion') != 'album-a5-v5':
            raise ValueError('unsupported album format')
        if book['fonts']['policy'] != 'system-not-redistributed':
            raise ValueError('unsupported font policy')
        declared = {item['name']: item['sha256'] for item in book['files']}
        if len(declared) != len(book['files']) or set(declared) != names - {'book.json'} or any(hashes[name] != sha for name, sha in declared.items()):
            raise ValueError('SHA manifest mismatch')
        for record in book['records']:
            for media in record['media']:
                if media['file'] not in declared:
                    raise ValueError('unresolved media')
        # eXIf chunk indicates accidental photo metadata forwarding.
        for name in names:
            if name.endswith('.png'):
                with archive.open(name) as image:
                    if image.read(8) != b'\x89PNG\r\n\x1a\n':
                        raise ValueError('not PNG')
                    while True:
                        header = image.read(8)
                        if len(header) != 8:
                            raise ValueError('truncated PNG')
                        size, kind = struct.unpack('>I4s', header)
                        if kind == b'eXIf':
                            raise ValueError('EXIF found in packaged image')
                        remaining = size + 4
                        while remaining:
                            data = image.read(min(remaining,65536))
                            if not data:
                                raise ValueError('truncated PNG')
                            remaining -= len(data)
                        if kind == b'IEND':
                            break
    return {'files':len(names),'records':len(book['records']),'bytes':path.stat().st_size,
            'CRCAndSHA':True,'fontPolicy':'system-not-redistributed','photoEXIFChecked':True,
            'nativeRoundTrip':'NOT_VERIFIED','audioMetadata':'NOT_VERIFIED','visualReview':'NOT_VERIFIED'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('file',type=Path)
    print(json.dumps(inspect(parser.parse_args().file),ensure_ascii=False,indent=2))
