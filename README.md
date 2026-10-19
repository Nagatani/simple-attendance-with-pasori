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

## workflow

1. 初回講義で学生証のNFC（mifare classicで検証）を読み取らせる
1. データベース上に生徒情報が存在しないので、学籍番号の入力を求めるダイアログが表示されます
    - 未登録の生徒の学籍番号入力はキーボードからも可能だが、バーコードリーダーなどで簡略化できると良い
1. 2回目以降は生徒が教室に入室後、都度学生証を読み込ませるだけで良い
1. 学生証忘れの場合は、専用の用紙に学籍番号や氏名等を書き込んでもらうことで不正の対策を行う
    - 画面左下のカード忘れ登録リンクから、カード忘れの生徒の学籍番号を登録可能なので、紙に記入してもらった学籍番号は後ほど手動で登録する

## documents

- [AGENTS.md](AGENTS.md) — 開発者 / AI エージェント向けガイド
- [docs/architecture.md](docs/architecture.md) — 構成とカード読み取りの流れ
- [docs/api.md](docs/api.md) — HTTP API 仕様
- [docs/database.md](docs/database.md) — DB スキーマ
- [docs/known-issues.md](docs/known-issues.md) — 既知の問題・運用上の注意
