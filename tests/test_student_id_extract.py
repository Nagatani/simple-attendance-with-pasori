"""student_id_extract.py の単体テスト（標準ライブラリ unittest のみ）。

実行: python3 -m unittest tests.test_student_id_extract
      （リポジトリ直下から）
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from student_id_extract import decode_bytes, trim_padding, extract_student_id  # noqa: E402


def image_with(block, offset, data):
  img = bytearray(1024)
  start = block * 16 + offset
  img[start:start + len(data)] = data
  return img


class DecodeTests(unittest.TestCase):
  def test_ascii(self):
    self.assertEqual(decode_bytes(b"K21001", "ascii"), "K21001")

  def test_hex(self):
    self.assertEqual(decode_bytes(bytes([0x0a, 0xff]), "hex"), "0aff")

  def test_bcd(self):
    self.assertEqual(decode_bytes(bytes([0x12, 0x34, 0x5f]), "bcd"), "12345")
    self.assertEqual(decode_bytes(bytes([0x00, 0x99]), "bcd"), "0099")

  def test_trim(self):
    self.assertEqual(trim_padding("\x00 K21001 \xff"), "K21001")


class ExtractTests(unittest.TestCase):
  def test_ascii_padding(self):
    img = image_with(4, 0, b"K21001" + b"\x00" * 10)
    self.assertEqual(extract_student_id(img, {"sector": 1, "block": 0, "offset": 0, "length": 16}), "K21001")

  def test_offset(self):
    img = image_with(8, 4, b"20250042")
    self.assertEqual(extract_student_id(img, {"sector": 2, "offset": 4, "length": 8}), "20250042")

  def test_validate_ok_and_ng(self):
    img = image_with(4, 0, b"K21001")
    self.assertEqual(extract_student_id(img, {"sector": 1, "length": 6, "validate": r"^[A-Z]\d{5}$"}), "K21001")
    ng = image_with(4, 0, b"XXXXXX")
    with self.assertRaisesRegex(ValueError, "検証パターン"):
      extract_student_id(ng, {"sector": 1, "length": 6, "validate": r"^[A-Z]\d{5}$"})

  def test_empty_and_range_and_bad_sector(self):
    img = bytearray(1024)
    with self.assertRaisesRegex(ValueError, "取得できませんでした"):
      extract_student_id(img, {"sector": 1, "length": 6})
    with self.assertRaisesRegex(ValueError, "イメージ外"):
      extract_student_id(img, {"sector": 15, "block": 3, "offset": 8, "length": 16})
    with self.assertRaisesRegex(ValueError, "sector は 0-15"):
      extract_student_id(img, {"sector": 16, "length": 4})


if __name__ == "__main__":
  unittest.main()
