#!/usr/bin/env python3
"""PC/SC 経由で PaSoRi(RC-S300) から MIFARE Classic を読めるかを確認するローカル専用スクリプト。

サーバー側 PC/SC 読み取りモードを実装する前に、お使いの Mac + Sony ドライバで
次が通るかを確認する:
  1. リーダーが PC/SC デバイスとして見えるか
  2. Load Key (FF 82) → Authenticate (FF 86) が 90 00 を返すか
  3. Read (FF B0) で 16 バイト取れるか

実行:
  pipenv install pyscard        # 未導入なら
  python3 tools/probe_pcsc.py                 # 既定鍵(FFFFFFFFFFFF)でセクタ1を試す
  python3 tools/probe_pcsc.py --block 4 --key FFFFFFFFFFFF --keytype A

カードの個人情報に触れるため手元でのみ実行し、出力を外部へ貼らないこと。
読み取った 16 バイトは既定では伏せ、SW(ステータス)のみ表示する。
"""

import argparse
import sys


def to_hex(data):
    return "".join("{:02x}".format(b) for b in data)


def main():
    parser = argparse.ArgumentParser(description="PC/SC で MIFARE Classic 認証/読み取りを試す")
    parser.add_argument("--block", type=int, default=4, help="認証/読み取りする絶対ブロック番号 (既定:4 = セクタ1先頭)")
    parser.add_argument("--key", default="FFFFFFFFFFFF", help="12桁16進の鍵 (既定: FFFFFFFFFFFF)")
    parser.add_argument("--keytype", choices=["A", "B"], default="A", help="鍵タイプ (既定: A)")
    parser.add_argument("--show-data", action="store_true", help="読み取った16バイトも表示する(個人情報に注意)")
    args = parser.parse_args()

    try:
        from smartcard.System import readers
        from smartcard.util import toBytes
    except ImportError:
        print("pyscard が見つかりません。`pipenv install pyscard` を実行してください。", file=sys.stderr)
        return 2

    rlist = readers()
    print("検出された PC/SC リーダー:")
    for i, r in enumerate(rlist):
        print(f"  [{i}] {r}")
    if not rlist:
        print("PC/SC リーダーが見つかりません。Sony のドライバ(PC/SC)が入っているか確認してください。", file=sys.stderr)
        return 1

    reader = rlist[0]
    print(f"使用するリーダー: {reader}")
    conn = reader.createConnection()
    try:
        conn.connect()
    except Exception as e:  # noqa: BLE001
        print(f"カードへの接続に失敗しました（カードをかざしていますか？）: {e}", file=sys.stderr)
        return 1

    key_type = 0x60 if args.keytype == "A" else 0x61
    key = toBytes(args.key)
    block = args.block & 0xFF

    def transmit(apdu, label):
        data, sw1, sw2 = conn.transmit(apdu)
        print(f"  {label}: SW={sw1:02X}{sw2:02X}" + (f" data={to_hex(data)}" if data and args.show_data else (f" ({len(data)}バイト)" if data else "")))
        return data, sw1, sw2

    # UID
    transmit([0xFF, 0xCA, 0x00, 0x00, 0x00], "Get UID (FF CA)")
    # Load Key -> volatile slot 0
    transmit([0xFF, 0x82, 0x00, 0x00, 0x06] + key, "Load Key (FF 82)")
    # Authenticate block
    _, a1, a2 = transmit([0xFF, 0x86, 0x00, 0x00, 0x05, 0x01, 0x00, block, key_type, 0x00], "Authenticate (FF 86)")
    if (a1, a2) != (0x90, 0x00):
        print(f"→ 認証が通りませんでした (SW={a1:02X}{a2:02X})。鍵/ブロック/キータイプを確認してください。")
        return 1
    # Read block
    _, r1, r2 = transmit([0xFF, 0xB0, 0x00, block, 0x10], "Read Binary (FF B0)")
    if (r1, r2) == (0x90, 0x00):
        print("→ 成功: PC/SC 経由でセクタ認証・読み取りができました。サーバー側実装に進めます。")
        return 0
    print(f"→ 読み取りが通りませんでした (SW={r1:02X}{r2:02X})。")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
