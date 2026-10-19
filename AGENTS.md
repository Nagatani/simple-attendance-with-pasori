# AGENTS.md

このリポジトリで作業する AI エージェント / コントリビューター向けのガイドです。
人間向けの利用方法は [README.md](README.md)、詳細設計は [docs/](docs/) を参照してください。

## プロジェクト概要

Sony PaSoRi (RC-S380 / RC-S300) で学生証の IC カード (FeliCa / MIFARE) を読み取り、講義の出席を登録する簡易システムです。

- **カード読み取りはブラウザ側 (WebUSB)** で行う。Python 側は USB に触れない。
- **サーバーは Flask + SQLite** の 1 プロセス。講義名と「第 n 回」を起動引数で受け取り、その回の出席だけを扱う。
- 出席データは `output_excel.py` で Excel (`Attend_<n>.xlsx`) に書き出す。

## ディレクトリ構成

```
main.py            Flask アプリ本体。起動時に DB テーブルを作成し、API を提供
output_excel.py    attendance テーブルを Excel に書き出す CLI
config.py          ポート / ホスト / デバッグ / DB ファイル名 / テーブル初期化フラグ
templates/
  index.html       唯一の画面 (Jinja2)。ダイアログ 2 つと効果音 <audio> を含む
static/
  felica.js        WebUSB で PaSoRi を制御し、カード ID を読み取る (低レベル)
  api.js           fetch ラッパーと各 API 呼び出し関数
  ui.js            DOM 操作・効果音再生などの表示系関数
  append.js        アプリロジック。felica.js のコールバックを受けて api.js / ui.js を呼ぶ
  mifareClassic.js MIFARE Classic 1K の全セクタ読み取り手順 (transceiver を注入)
  studentId.js     ブロックイメージの指定場所から学籍番号を抽出
  mifareReader.js  transceiver 生成 (オフライン=ダンプ / 実機=WebUSB)
  cardStudentId.js student_id モードのパイプライン (読み取り→抽出→/attend)
  custom.css       UIkit 風のクラス (uk-*) を自前実装した CSS (UIkit 本体は使っていない)
  pi.mp3, sound.mp3  読み取り音 / 出席登録音
tools/
  inspect_dump.py  .mfd ダンプを調べ学籍番号の場所を特定する (ローカル専用)
tests/             static/*.js の単体テスト (node:test, 依存追加なし)
docs/              設計ドキュメント
```

`secrets/`・`*.db`・`*.xlsx` は `.gitignore` 対象です。`secrets/` には実カードのダンプ(.mfd)と鍵(.keys)が入っており、**学籍番号などの個人情報・秘密情報を含みます**。**読み取り・コミット・外部送信をしないでください**（ダンプ内の学籍番号の場所は `tools/inspect_dump.py` を使って利用者自身が特定する）。`attend.db` も実在の学生データなので同様に扱います。

## 開発環境とコマンド

- Python: `Pipfile` は `python_version = "3.11"`。依存は `flask`, `openpyxl` のみ。
- ブラウザ: WebUSB 対応の Google Chrome（Chromium 系）が必須。

```sh
pipenv install
pipenv run start <講義名> <第n回>   # 例: pipenv run start オブジェクト指向プログラミング 1
# → http://127.0.0.1:8000/ を Chrome で開き「SETUP」を押してリーダーを選択

pipenv run export <第n回>           # Attend_<n>.xlsx を出力
pipenv run export                   # 省略 (または 0) で全回を 1 ブックにまとめて Attend_all.xlsx を出力
```

JS ライブラリ (`static/mifareClassic.js`, `static/studentId.js`) には単体テストがあります（依存追加なし）。

```sh
node --test 'tests/*.test.js'
```

Python 側のリンター・ビルド工程はありません。変更後は `python -m py_compile main.py output_excel.py` 程度、フロントは実機 (PaSoRi + カード) かブラウザの DevTools で確認します。実機がない場合、`/attend` などの API は `curl -F card_id=XXXX http://127.0.0.1:8000/attend` で直接叩けます。`student_id` モードは `config.offline_dump` にダンプを設定すればオフラインで一通り動かせます（[docs/card-reading.md](docs/card-reading.md)）。

## アーキテクチャの要点

詳細は [docs/architecture.md](docs/architecture.md)。

- スクリプトは `<script defer>` で `ui.js → api.js → felica.js → mifareClassic.js → studentId.js → mifareReader.js → append.js → cardStudentId.js` の順に読み込まれ、**ES Modules ではなくグローバル関数で連携**している（各ファイル末尾の `module.exports` は Node テスト用で、ブラウザでは無視される）。読み込み順を変えると未定義参照になる。
- `felica.js` は DOM を直接触らず、`ui.js` の関数 (`displayFelicaMessage`, `playReadSound` など) を呼ぶ。カード検出時は `setCardReadCallback` で登録された `append.js` の `handleCardRead` を呼ぶ。
- 同じカードの連続読み取りは `felica.js` の `beforeIdm` で抑止。登録ダイアログを閉じると `clearBeforeIdm()` でリセットされる。
- RC-S300 接続時は `send` / `session` を `send300` / `session300` に差し替える（そのため `send` と `session` は `let` 宣言）。
- サーバー側の講義回 (`section_id`) は argparse のグローバル `args` から参照している。1 プロセス = 1 講義回。
- カード読み取りは 2 モード (`config.read_mode`)。`uid`=従来の UID 方式、`student_id`=カード内の学籍番号を読む方式。後者のデータ流れ（transceiver→`mcReadAllSectors`→`extractStudentId`→`/attend`）と実機対応の現状は [docs/card-reading.md](docs/card-reading.md)。

API 仕様は [docs/api.md](docs/api.md)、DB スキーマは [docs/database.md](docs/database.md)、カード読み取りは [docs/card-reading.md](docs/card-reading.md)。

## コーディング規約

既存コードに合わせてください。

- **Python**: インデント 2 スペース、SQL は `sqlite3` のプレースホルダ (`?`) を必ず使う。カード ID の比較には `COLLATE NOCASE` を付ける（リーダーやブラウザで 16 進の大文字小文字が揺れるため）。
- **JavaScript**: グローバル関数 + `const` アロー関数。JSDoc を日本語で書く。`felica.js` はセミコロンなし、他のファイルはセミコロンあり、と既存の書き方が混在しているのでファイル単位で合わせる。
- **ログ・UI メッセージ・コメントは日本語**。`console.info` / `console.error` を使う。
- API のレスポンスは HTTP 200 + `{"status": "ok" | "error", ...}` 形式。フロントは `status` で分岐している。
- 新しい DOM 操作は `ui.js`、新しい API 呼び出しは `api.js` に関数として追加し、`append.js` から呼ぶ。

## 注意点 / 既知の問題

[docs/known-issues.md](docs/known-issues.md) に一覧があります。作業前に目を通してください。特に:

- `config.init_tables = True` で起動すると**全テーブルが DROP される**。誤って有効にしないこと。
- WebUSB はセキュアコンテキスト必須。`http://127.0.0.1` / `localhost` 以外の HTTP アクセスではカードリーダーが使えない。

## Git

- デフォルトブランチは `main`。作業はフィーチャーブランチで行い PR でマージする。
- `secrets/`, `*.db`, `*.xlsx` を絶対にコミットしない。
