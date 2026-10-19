# データベース

SQLite ファイル `attend.db`（`config.database_name`）。テーブルは `main.py` 起動時に `create table if not exists` で作成されます。

> `config.init_tables = True` で起動すると `students` と `attendance` が DROP されます。全回分の出席データが消えるので、使う前に必ず DB ファイルをバックアップしてください。

## students

カード ID と学籍番号の対応表。全講義回で共通です。

| カラム | 型 | 説明 |
|---|---|---|
| `id` | integer PK autoincrement | |
| `card_id` | nverchar(32) not null | カード ID。UNIQUE (`studentindex`) |
| `student_id` | nverchar(32) | 学籍番号 |
| `student_name` | nverchar(64) default `''` | 氏名（現状未使用） |
| `create_datetime` | TIMESTAMP | 作成日時（ローカル時刻） |
| `update_datetime` | TIMESTAMP | 更新日時（ローカル時刻） |

## attendance

講義回ごとの出席記録。

| カラム | 型 | 説明 |
|---|---|---|
| `id` | integer PK autoincrement | |
| `section_id` | nverchar(32) not null | 第 n 回 |
| `card_id` | nverchar(32) not null | カード ID（カード忘れかつ未登録学生の場合は学籍番号） |
| `student_id` | nverchar(32) | 学籍番号 |
| `forgot_card` | nverchar(32) | カード忘れ登録時は `'FORGOT'`、通常は NULL |
| `create_datetime` | TIMESTAMP | 初回登録日時 |
| `update_datetime` | TIMESTAMP | 再読み取り時に更新 |

UNIQUE インデックス `attendanceindex` (`section_id`, `card_id`)。

## メモ

- `nverchar` は `nvarchar` の typo ですが、SQLite は型名を厳密に扱わないため TEXT 相当として動作します。既存 DB との互換のため変更していません。
- `section_id` は TEXT 列ですが、Python からは int を渡しています。SQLite の型親和性により比較は問題なく動きます。
- カード ID の検索は `COLLATE NOCASE` で大文字小文字を区別せずに行います（`/forgot_card` のクエリを除く）。
- 学生情報の一括投入用の機能はありません。必要な場合は `sqlite3 attend.db` で直接 INSERT します。
