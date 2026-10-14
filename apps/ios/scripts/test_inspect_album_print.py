import runpy
import unittest
from pathlib import Path

check = runpy.run_path(str(Path(__file__).with_name('inspect-album-print.py')))['check_block_text']


class TextInspectionTests(unittest.TestCase):
    def test_interleaved_lines_and_mixed_unicode(self):
        block = {'text': '第一行🙂\nCafé第二行', 'lines': [
            {'start': 0, 'end': 4}, {'start': 5, 'end': 13},
        ]}
        check(block, '第一行🙂\n旁边的日期\nCafé第二行')

    def test_missing_or_reordered_characters_fail(self):
        block = {'text': '第一行第二行', 'lines': [
            {'start': 0, 'end': 3}, {'start': 3, 'end': 6},
        ]}
        for actual in ('第一行', '第一行第行二', ''):
            with self.assertRaises(ValueError):
                check(block, actual)

    def test_invalid_range_fails(self):
        with self.assertRaises(ValueError):
            check({'text': '正文', 'lines': [{'start': -1, 'end': 2}]}, '正文')

    def test_unwrapped_title_still_checked(self):
        check({'text': '册名'}, '册名 1 / 9')
        with self.assertRaises(ValueError):
            check({'text': '册名'}, '1 / 9')


if __name__ == '__main__':
    unittest.main()
