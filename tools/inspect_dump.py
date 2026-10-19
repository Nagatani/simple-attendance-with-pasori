#!/usr/bin/env python3
"""MIFARE Classic 1K ダンプ (.mfd) の内容を確認し、学籍番号の格納場所を特定するためのローカル専用ツール。

カードダンプには学籍番号などの個人情報が含まれるため、このスクリプトは
手元でのみ実行してください。出力結果を外部に送信・貼り付けしないこと。

使い方:
    python3 tools/inspect_dump.py secrets/Dump_XXXXXXXX.mfd

各データブロックの 16 進数と ASCII 表現を並べて表示します。学籍番号は
人が読める文字列（ASCII の数字や英字）として特定のブロックに入っている
ことが多いので、ASCII 列を見て「どのセクタ・ブロックの何バイト目から
何バイトか」を読み取り、config.py の STUDENT_ID_LOCATION に設定します。

セクタトレーラ（各セクタの最終ブロック = 鍵と access bits）は鍵が
露出しないよう、既定では中身を伏せて表示します。鍵も確認したい場合は
--show-keys を付けてください。
"""

import argparse
import sys

BLOCK_SIZE = 16
BLOCKS_PER_SECTOR = 4
MIFARE_1K_BYTES = 1024  # 16 セクタ × 4 ブロック × 16 バイト


def is_trailer(block_index: int) -> bool:
    """絶対ブロック番号がセクタトレーラ(各セクタ末尾)かどうか。"""
    return block_index % BLOCKS_PER_SECTOR == BLOCKS_PER_SECTOR - 1


def ascii_render(data: bytes) -> str:
    """表示可能な ASCII はそのまま、それ以外は '.' に置換した文字列。"""
    return "".join(chr(b) if 0x20 <= b <= 0x7E else "." for b in data)


def main() -> int:
    parser = argparse.ArgumentParser(description="MIFARE Classic 1K ダンプの内容確認ツール")
    parser.add_argument("dump", help="読み込む .mfd ファイル (1024 バイト)")
    parser.add_argument("--show-keys", action="store_true",
                        help="セクタトレーラの鍵/access bits も表示する")
    args = parser.parse_args()

    with open(args.dump, "rb") as f:
        raw = f.read()

    if len(raw) != MIFARE_1K_BYTES:
        print(f"警告: ファイルサイズが {len(raw)} バイトです "
              f"(MIFARE Classic 1K は {MIFARE_1K_BYTES} バイト想定)", file=sys.stderr)

    total_blocks = len(raw) // BLOCK_SIZE
    print(f"ファイル: {args.dump} ({len(raw)} バイト, {total_blocks} ブロック)")
    print("Sec Blk Abs | 16進                                             | ASCII")
    print("-" * 78)

    for block_index in range(total_blocks):
        sector = block_index // BLOCKS_PER_SECTOR
        block_in_sector = block_index % BLOCKS_PER_SECTOR
        data = raw[block_index * BLOCK_SIZE:(block_index + 1) * BLOCK_SIZE]

        if is_trailer(block_index) and not args.show_keys:
            hex_str = "<セクタトレーラ: KeyA / access / KeyB は伏せています>".ljust(48)
            ascii_str = ""
        else:
            hex_str = " ".join(f"{b:02x}" for b in data)
            ascii_str = ascii_render(data)

        note = " (製造者ブロック)" if block_index == 0 else (" (トレーラ)" if is_trailer(block_index) else "")
        print(f"{sector:>3} {block_in_sector:>3} {block_index:>3} | {hex_str} | {ascii_str}{note}")

    print("-" * 78)
    print("学籍番号らしき文字列が見えたら、その『セクタ・ブロック・開始バイト・バイト数』を")
    print("config.py の STUDENT_ID_LOCATION に設定してください。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
