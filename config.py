run_port = 8000
run_host = '127.0.0.1' # 他の端末からアクセスさせる場合は '0.0.0.0'
run_debug = False # Trueにするとデバッガ・自動リロードが有効になる（共有ネットワークでは無効推奨）

database_name = "attend.db"
init_tables = False

# ------------------------------------------------------------------
# カード読み取りモード（この 1 行で切り替える）
#   'uid'        : 【既定・シンプル】従来方式。カードのUID/IDmをcard_idとして
#                  出席登録する。未登録カードは学籍番号の手入力ダイアログが出る。
#   'student_id' : カード内（MIFARE Classic のセクタ）に書かれた学籍番号を
#                  読み取ってそのまま出席登録する。事前の学籍番号登録は不要。
#                  ※ 以下の student_id_location / keys_file / offline_dump は
#                    'student_id' のときだけ使われる。'uid' のときは無視される。
# ------------------------------------------------------------------
read_mode = 'uid'

# 学籍番号の格納場所。tools/inspect_dump.py でダンプを調べて設定する。
# （read_mode = 'student_id' のときのみ使用）
#   sector   : セクタ番号 (0-15)
#   block    : セクタ内ブロック番号 (0-3, 既定0)
#   offset   : ブロック先頭からのバイトオフセット (既定0)
#   length   : バイト数
#   encoding : 'ascii' | 'hex' | 'bcd'
#   validate : 学籍番号の形式を検証する正規表現（任意, JS側で使用）
student_id_location = {
  "sector": 1,
  "block": 0,
  "offset": 0,
  "length": 8,
  "encoding": "ascii",
  "validate": "",
}

# MIFARE Classic の鍵ファイル（.keys / 1行12桁16進）。実機でのセクタ認証に使う。
# 鍵はサーバ側に留め、ブラウザには送らない。
keys_file = "secrets/Dump_26FA40A6.keys"

# オフライン(デモ/動作確認)用のダンプ(.mfd, 1024バイト)。
#   実機のリーダーが使えない段階で、このダンプを「読み取ったカード」とみなして
#   出席登録フロー全体を検証するために使う。None にすると実機モードになる。
#   ※ 個人情報を含むため 127.0.0.1 でのみ配信し、共有ネットワークでは使わないこと。
offline_dump = "secrets/Dump_26FA40A6.mfd"
