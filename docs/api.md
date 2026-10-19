# API 仕様 (main.py)

- すべての API は起動時に指定した講義回 `section_id` を対象にします。
- POST のパラメータはフォーム形式（`multipart/form-data` または `application/x-www-form-urlencoded`）。
- 業務エラーも HTTP 200 で返り、`status` が `"error"` になります。想定外の例外は Flask の 500 になります。

## `GET /`

出席登録画面 (`templates/index.html`) を返します。テンプレート変数は `section_title`, `section_id`。

## `GET /config`

ブラウザ側のカード読み取りパイプラインが必要とする設定を返します。鍵などの秘密情報は含みません。

```json
{"read_mode": "student_id", "student_id_location": {"sector": 1, "block": 0, "offset": 0, "length": 8, "encoding": "ascii", "validate": ""}, "offline": true}
```

## `GET /card-image`

オフライン(デモ)用に、`config.offline_dump` の .mfd を「読み取ったカード」として返します。`offline_dump` が未設定なら 404。個人情報を含むため 127.0.0.1 専用の想定です。

```json
{"status": "ok", "uid": "26fa40a6", "image": [38, 250, ...]}
```

`image` は 1024 バイトの配列（MIFARE Classic 1K の全ブロック）。

## `GET /get-attended`

この回の出席者一覧。

```json
[["0123456789abcdef", "S1234567"], ["deadbeef", "S7654321"]]
```

各要素は `[card_id, student_id]`。

## `GET /get-students`

学籍番号が空でない登録済み学生の一覧 `[[card_id, student_id], ...]`。現在フロントエンドからは使われていません。

## `POST /attend`

| パラメータ | 必須 | 説明 |
|---|---|---|
| `student_id` | △ | カードから読み取った学籍番号。指定時はこの学籍番号で直接出席登録する（`student_id` モード） |
| `card_id` | △ | カード ID（16 進文字列。大文字小文字は区別しない）。`student_id` 指定時は attendance.card_id に入れる任意の値 |

`student_id` を指定した場合（カード内学籍番号モード）:

- `card_id` があればそれを、無ければ `student_id` を attendance.card_id のキーとして
  INSERT（既にあれば `update_datetime` を更新）。常に `status: ok` を返す。
  ```json
  {"status": "ok", "student_id": "K2100001", "message": "出席登録完了しました: K2100001"}
  ```

`student_id` を指定しない場合（従来の UID モード、`card_id` 必須）:

- 登録済みカード: その回の `attendance` を INSERT（既にあれば `update_datetime` を更新）。
  ```json
  {"status": "ok", "student_id": "S1234567", "message": "出席登録完了しました: S1234567"}
  ```
- 未登録カード / `card_id` なし:
  ```json
  {"status": "error", "student_id": "", "message": "..."}
  ```

## `POST /register`

未登録カードを学生として登録し、同時にこの回の出席を登録します。

| パラメータ | 必須 | 説明 |
|---|---|---|
| `card_id` | ○ | カード ID |
| `student_id` | ○ | 学籍番号 |

- 成功時は `/attend` と同じ形式。この回に既に出席済みの場合は出席の INSERT をスキップします。
- `card_id` / `student_id` が空: `{"status": "error", "student_id": "", "message": "card_id or student_id is empty."}`
- 既に登録済みのカード: `{"status": "error", "student_id": "<登録済みの学籍番号>", "message": "このカードは登録済みです: ..."}`

## `POST /forgot_card`

カードを忘れた学生を学籍番号で出席登録します。

| パラメータ | 必須 | 説明 |
|---|---|---|
| `student_id` | ○ | 学籍番号 |

- 学生が登録済みならその `card_id`、未登録なら `student_id` を `card_id` として使用し、`forgot_card = 'FORGOT'` で INSERT。
- 成功: `{"status": "ok", "student_id": "...", "message": "出席登録完了しました: ..."}`
- この回に出席済み: `{"status": "error", "card_id": "...", "message": "<学籍番号>は出席登録済みです。"}`
