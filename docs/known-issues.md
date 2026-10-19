# 既知の問題・注意点

コードを読んで見つかった問題点のメモです（2026-10 時点）。修正したらこの一覧からも削除してください。

## バグ

- **`updateHeadingMessage` が未定義**: `static/append.js` の各 `catch` で呼ばれているが、`ui.js` に定義がない。API 通信エラー時に ReferenceError になり、画面にエラーが表示されない。
- **`/register` の重複**: 既に `students` に存在する `card_id`、またはこの回に出席済みの組み合わせで呼ぶと UNIQUE 制約違反で 500 になる。フロント側では `register` の `.catch` に入る（上記の未定義関数で再度失敗する）。
- **`/register` 失敗時のメッセージが出ない**: `status: error` の場合にダイアログへメッセージを表示していない。
- **`/forgot_card` のクエリに `COLLATE NOCASE` がない**: 他の API と異なり、学籍番号・カード ID の大文字小文字が一致しないと別人扱いになる。
- **全回エクスポート (`export 0`) の列不足**: ヘッダー行とカード忘れ列が出力されない。
- **`export` の引数は必須**: 回数を省略するとエラーになる。全回出力は `0` を指定する（README は修正済み）。

## 運用上の注意

- **WebUSB はセキュアコンテキスト必須**: `http://127.0.0.1:8000` または `http://localhost:8000` で開く。別 PC から IP アドレスで HTTP アクセスした場合はリーダーが使えない。
- **`init_tables = True` は全データ削除**: [database.md](database.md) 参照。
- **Python バージョン**: `Pipfile` は 3.11 指定。ローカルの `.python-version`（gitignore 対象）と異なる場合は `pipenv --python 3.11` などで合わせる。
- **画面上の出席済み判定は学籍番号ベース**: `append.js` の `students` 配列はページ読み込み時の出席者 + その後の登録で構成される。複数ブラウザで同時に使うと画面同士は同期しない。
