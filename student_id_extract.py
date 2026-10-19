"""読み取ったブロックイメージから、指定場所の学籍番号を取り出す（サーバー側用）。

static/mifare-webusb/student-id.js の Python 版。格納場所・形式は config の
student_id_location（sector/block/offset/length/encoding/validate）で与える。
"""

import re

BLOCK_SIZE = 16
BLOCKS_PER_SECTOR = 4


def absolute_block(sector, block):
  return sector * BLOCKS_PER_SECTOR + block


def decode_bytes(data, encoding):
  """バイト列を指定エンコーディングで文字列化する。"""
  if encoding == "ascii":
    return "".join(chr(b) for b in data)
  if encoding == "hex":
    return "".join("{:02x}".format(b) for b in data)
  if encoding == "bcd":
    out = ""
    for b in data:
      hi = (b >> 4) & 0x0F
      lo = b & 0x0F
      if hi == 0x0F:
        break
      out += str(hi)
      if lo == 0x0F:
        break
      out += str(lo)
    return out
  raise ValueError("未知のエンコーディングです: {}".format(encoding))


_TRIM_RE_HEAD = re.compile(r"^[\x00-\x20\x7f\xff]+")
_TRIM_RE_TAIL = re.compile(r"[\x00-\x20\x7f\xff]+$")


def trim_padding(s):
  """NUL/0xFF/空白/制御文字を前後から除去する。"""
  return _TRIM_RE_TAIL.sub("", _TRIM_RE_HEAD.sub("", s))


def extract_student_id(image, location):
  """全ブロックイメージ(bytes/bytearray)から location の学籍番号を取り出す。

  image は絶対バイト位置でインデックスできるもの（1024バイトのイメージや、
  対象セクタだけ正しい絶対位置に埋めた bytearray）。
  """
  if not isinstance(location, dict):
    raise ValueError("location が指定されていません。")

  sector = location.get("sector")
  block = location.get("block", 0)
  offset = location.get("offset", 0)
  length = location.get("length")
  encoding = location.get("encoding", "ascii")
  trim = location.get("trim", True)
  validate = location.get("validate", "")

  if not isinstance(sector, int) or not (0 <= sector <= 15):
    raise ValueError("sector は 0-15 の整数で指定してください: {}".format(sector))
  if not isinstance(block, int) or not (0 <= block <= 3):
    raise ValueError("block は 0-3 の整数で指定してください: {}".format(block))
  if not isinstance(length, int) or length <= 0:
    raise ValueError("length は 1 以上の整数で指定してください: {}".format(length))

  start = absolute_block(sector, block) * BLOCK_SIZE + offset
  end = start + length
  if end > len(image):
    raise ValueError("指定範囲がイメージ外です (start={}, length={}, image={}バイト)".format(start, length, len(image)))

  value = decode_bytes(image[start:end], encoding)
  if encoding == "ascii" and trim:
    value = trim_padding(value)

  if value == "":
    raise ValueError("指定場所から学籍番号を取得できませんでした（空）。格納場所の設定を確認してください。")
  if validate and not re.search(validate, value):
    raise ValueError('取得した学籍番号が検証パターンに一致しません: "{}"'.format(value))
  return value
