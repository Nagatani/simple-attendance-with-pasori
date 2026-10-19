# simple-attendance-with-pasori
簡易出席登録

Sony PaSoRi で学生証（FeliCa / MIFARE）を読み取り、講義の出席を登録する簡易システムです。カードの読み取りは Chrome の WebUSB で行い、出席データは SQLite に保存、Excel に書き出せます。

WebUSBでFelica使うコードは、以下のリポジトリを参考にしています。感謝感激。

- [marioninc/webusb-felica](https://github.com/marioninc/webusb-felica)

出席登録時の効果音は以下のサイトからいただきました。

- 効果音ラボ様 : [https://soundeffect-lab.info/sound/button/](https://soundeffect-lab.info/sound/button/)


## require

- Sony PaSoRi RC-S380 or RC-S300
- Python 3.11 (with pipenv)
- Google Chrome（WebUSB 対応ブラウザ）

## setup (pipenv)

```
$ pip install pipenv
$ pipenv install
```

## usage

出席登録時

```
$ pipenv run start 講義名を入力 1 # 最後の数字は講義のセクションの第n回
# Chrome で http://127.0.0.1:8000/ を開き、右上の「SETUP」を押して PaSoRi を選択
```

> WebUSB はセキュアコンテキストでしか動かないため、`127.0.0.1` か `localhost` で開いてください。

出席登録後のExcel export

```
$ pipenv run export 1 # 最後の数字は講義のセクションの第n回
# Attend_1.xlsxが生成されています

$ pipenv run export # 省略または 0 を指定すると全回をまとめて出力
# Attend_all.xlsxが生成されています
```

### example

```
# 開始時
$ pipenv run start オブジェクト指向プログラミングおよび演習１ 1
# export
$ pipenv run export 1
```

### config

`config.py` で以下を変更できます。

| 項目 | 既定値 | 説明 |
|---|---|---|
| `run_port` | `8000` | 待ち受けポート |
| `run_host` | `'127.0.0.1'` | 待ち受けアドレス。他の端末からアクセスさせる場合は `'0.0.0.0'` |
| `run_debug` | `False` | Flask のデバッグモード（デバッガ・自動リロード） |
| `database_name` | `"attend.db"` | SQLite ファイル |
| `init_tables` | `False` | `True` で起動すると**テーブルを削除して作り直す**（全データ消去） |
| `read_mode` | `'student_id'` | `'uid'`=カードUIDで登録（従来） / `'student_id'`=カード内の学籍番号を読んで登録 |
| `student_id_location` | — | 学籍番号の格納場所（セクタ/ブロック/オフセット/長さ/形式）。`tools/inspect_dump.py` で特定して設定 |
| `keys_file` | `secrets/*.keys` | MIFARE Classic の鍵ファイル（実機でのセクタ認証に使用） |
| `offline_dump` | `secrets/*.mfd` | オフライン（実機なし）動作確認用のダンプ。`None` で実機モード |

## カード内の学籍番号で出席登録する (`read_mode = 'student_id'`)

学生証の MIFARE Classic セクタに書かれた学籍番号を直接読み取って登録するモードです。
事前のカード登録は不要になります。設計・手順の詳細は [docs/card-reading.md](docs/card-reading.md)。

```sh
# 1. ダンプを調べて学籍番号の場所を特定し、config.py の student_id_location に設定
python3 tools/inspect_dump.py secrets/Dump_XXXXXXXX.mfd

# 2. 起動して「カードから学籍番号を読み取る」ボタンで登録
pipenv run start 講義名 1
```

> **現状**: 実機(WebUSB)での MIFARE Classic セクタ認証(crypto1)は未実装で、今は
> `offline_dump` を使ったオフライン動作のみ対応しています。経緯は
> [docs/card-reading.md](docs/card-reading.md) を参照してください。
>
> ダンプ(.mfd)・鍵(.keys) は学籍番号などの個人情報・秘密情報を含みます。`secrets/`
> に置き、コミットや外部送信をしないでください。

## workflow（従来の `uid` モード）

1. 初回講義で学生証のNFC（mifare classicで検証）を読み取らせる
1. データベース上に生徒情報が存在しないので、学籍番号の入力を求めるダイアログが表示されます
    - 未登録の生徒の学籍番号入力はキーボードからも可能だが、バーコードリーダーなどで簡略化できると良い
1. 2回目以降は生徒が教室に入室後、都度学生証を読み込ませるだけで良い
1. 学生証忘れの場合は、専用の用紙に学籍番号や氏名等を書き込んでもらうことで不正の対策を行う
    - 画面左下のカード忘れ登録リンクから、カード忘れの生徒の学籍番号を登録可能なので、紙に記入してもらった学籍番号は後ほど手動で登録する

## documents

- [AGENTS.md](AGENTS.md) — 開発者 / AI エージェント向けガイド
- [docs/architecture.md](docs/architecture.md) — 構成とカード読み取りの流れ
- [docs/card-reading.md](docs/card-reading.md) — カード内学籍番号の読み取り設計・手順・実機対応の現状
- [docs/api.md](docs/api.md) — HTTP API 仕様
- [docs/database.md](docs/database.md) — DB スキーマ
- [docs/known-issues.md](docs/known-issues.md) — 既知の問題・運用上の注意
