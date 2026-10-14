import hashlib
import json
import runpy
import struct
import tempfile
import unittest
import zlib
from pathlib import Path

inspect = runpy.run_path(str(Path(__file__).with_name('inspect-album-file.py')))['inspect']


def stored_zip(items):
    local = bytearray()
    central = bytearray()
    for name, data in items:
        encoded = name.encode()
        crc = zlib.crc32(data)
        offset = len(local)
        local += struct.pack('<IHHHHHIIIHH',0x04034b50,20,0,0,0,0,crc,len(data),len(data),len(encoded),0) + encoded + data
        central += struct.pack('<IHHHHHHIIIHHHHHII',0x02014b50,20,20,0,0,0,0,crc,len(data),len(data),len(encoded),0,0,0,0,0,offset) + encoded
    return local + central + struct.pack('<IHHHHIIH',0x06054b50,0,0,len(items),len(items),len(central),len(local),0)


def fixture():
    # Synthetic byte fixture tests the container, not a native PDF or audio encoder.
    data = b'synthetic PDF bytes'
    book = {'format':'lampy','version':1,'readingVersion':1,'layoutVersion':'album-a5-v5',
            'fonts':{'policy':'system-not-redistributed'},'records':[{'media':[]}],
            'files':[{'name':'album.pdf','sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}]}
    return [('book.json',json.dumps(book).encode()),('album.pdf',data)]


class ArchiveTests(unittest.TestCase):
    def check(self,data):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'sample.lampy'
            path.write_bytes(data)
            return inspect(path)

    def test_stored_container_and_hashes(self):
        self.assertTrue(self.check(stored_zip(fixture()))['CRCAndSHA'])

    def test_path_traversal_duplicates_and_scripts(self):
        for name in ('../bad','album.pdf','media-0.js','/absolute'):
            with self.assertRaises(ValueError):
                self.check(stored_zip(fixture()+[(name,b'bad')]))

    def test_corrupt_bytes_fail_crc(self):
        data = stored_zip(fixture())
        position = data.index(b'synthetic')
        data[position] ^= 1
        with self.assertRaises(Exception):
            self.check(data)

    def test_hash_mismatch(self):
        items = fixture()
        items[1] = ('album.pdf',b'changed bytes')
        with self.assertRaises(ValueError):
            self.check(stored_zip(items))

    def test_unknown_version(self):
        items = fixture()
        book = json.loads(items[0][1]); book['version'] = 2
        items[0] = ('book.json',json.dumps(book).encode())
        with self.assertRaises(ValueError):
            self.check(stored_zip(items))

    def test_trailing_data_rejected(self):
        with self.assertRaises(ValueError):
            self.check(stored_zip(fixture())+b'extra')


if __name__ == '__main__':
    unittest.main()
