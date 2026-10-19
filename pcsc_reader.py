"""サーバー側で PC/SC 経由に PaSoRi(RC-S300) から MIFARE Classic を読む。

crypto1 はリーダー＋PC/SC ドライバがローカルで実行するため、サーバーは認証済みの
平文セクタを受け取れる。pyscard は実機モードでのみ必要なので遅延 import する。

ハード無しでも出席登録フロー/SSE/UI を検証できるよう、ダンプ(.mfd)から読む
SimulatedReader も用意する。
"""

BLOCK_SIZE = 16
BLOCKS_PER_SECTOR = 4
IMAGE_SIZE = 1024
KEY_A = 0x60
KEY_B = 0x61


class NoCardError(Exception):
  """カードがかざされていない。"""


class ReaderError(Exception):
  """リーダー未検出・通信失敗など。"""


class AuthError(Exception):
  """セクタ認証に失敗（鍵不一致など）。"""


def _to_hex(data):
  return "".join("{:02x}".format(b) for b in data)


def _place_block(image, abs_block, data):
  image[abs_block * BLOCK_SIZE:abs_block * BLOCK_SIZE + BLOCK_SIZE] = bytes(data)


def list_readers():
  """検出された PC/SC リーダー名の一覧（pyscard 未導入なら ReaderError）。"""
  try:
    from smartcard.System import readers
  except ImportError as e:
    raise ReaderError("pyscard が未導入です。`pipenv install pyscard` を実行してください。") from e
  return [str(r) for r in readers()]


class PcscReader:
  """PC/SC 経由の実機リーダー。"""

  def __init__(self, reader_index=0):
    self._reader_index = reader_index
    self._reader = None

  def _ensure_reader(self):
    if self._reader is not None:
      return
    try:
      from smartcard.System import readers
    except ImportError as e:
      raise ReaderError("pyscard が未導入です。`pipenv install pyscard` を実行してください。") from e
    rlist = readers()
    if not rlist:
      raise ReaderError("PC/SC リーダーが見つかりません（Sony のドライバを確認してください）。")
    if self._reader_index >= len(rlist):
      raise ReaderError("リーダー番号 {} は範囲外です（{} 台検出）。".format(self._reader_index, len(rlist)))
    self._reader = rlist[self._reader_index]

  def read_sector(self, sector, candidate_keys):
    """指定セクタを認証して全ブロックを読み、(uid_hex, 1024バイトイメージ) を返す。

    candidate_keys: 6バイト列(list[int])のリスト。KeyA→KeyB の順に試す。
    カード未検出は NoCardError、認証失敗は AuthError。
    """
    from smartcard.Exceptions import NoCardException, CardConnectionException

    self._ensure_reader()
    conn = self._reader.createConnection()
    try:
      conn.connect()
    except NoCardException:
      raise NoCardError()
    except Exception as e:  # noqa: BLE001
      raise ReaderError("カード接続に失敗: {}".format(e))

    try:
      uid_data, _, _ = conn.transmit([0xFF, 0xCA, 0x00, 0x00, 0x00])
      uid_hex = _to_hex(uid_data)

      image = bytearray(IMAGE_SIZE)
      base = sector * BLOCKS_PER_SECTOR
      authed = False
      for key in candidate_keys:
        for key_type in (KEY_A, KEY_B):
          conn.transmit([0xFF, 0x82, 0x00, 0x00, 0x06] + list(key))  # Load Key
          _, sw1, sw2 = conn.transmit([0xFF, 0x86, 0x00, 0x00, 0x05, 0x01, 0x00, base & 0xFF, key_type, 0x00])
          if (sw1, sw2) == (0x90, 0x00):
            authed = True
            break
        if authed:
          break
      if not authed:
        raise AuthError("セクタ {} の認証に失敗しました（鍵不一致）。".format(sector))

      for b in range(BLOCKS_PER_SECTOR):
        abs_block = base + b
        data, sw1, sw2 = conn.transmit([0xFF, 0xB0, 0x00, abs_block & 0xFF, 0x10])
        if (sw1, sw2) == (0x90, 0x00) and len(data) == BLOCK_SIZE:
          _place_block(image, abs_block, data)
      return uid_hex, image
    except CardConnectionException as e:
      raise ReaderError("カード通信エラー: {}".format(e))
    finally:
      try:
        conn.disconnect()
      except Exception:  # noqa: BLE001
        pass


class SimulatedReader:
  """ハード無し検証用: ダンプ(.mfd)を「かざされたカード」として返す。"""

  def __init__(self, dump_path):
    self._dump_path = dump_path

  def read_sector(self, sector, candidate_keys):
    import os
    if not self._dump_path or not os.path.exists(self._dump_path):
      raise ReaderError("シミュレーション用ダンプが見つかりません: {}".format(self._dump_path))
    with open(self._dump_path, "rb") as f:
      raw = f.read()
    image = bytearray(IMAGE_SIZE)
    image[:min(len(raw), IMAGE_SIZE)] = raw[:IMAGE_SIZE]
    uid_hex = _to_hex(raw[0:4]) if len(raw) >= 4 else ""
    return uid_hex, image
