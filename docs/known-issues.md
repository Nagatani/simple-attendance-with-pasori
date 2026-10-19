# 既知の問題・注意点

コードを読んで見つかった問題点のメモです（2026-10 時点）。修正したらこの一覧からも削除してください。

## 未完了・保留

- **実機(WebUSB)での MIFARE Classic セクタ読み取りは未実装**: `student_id` モードは
  現在オフライン(ダンプ)でのみ動作する。実機対応は crypto1 認証の実機検証が前提。
  経緯と方針は [card-reading.md](card-reading.md)「実機対応の現状」を参照。
- **`/card-image` は個人情報(学籍番号)を含むダンプをそのまま返す**: 必ず
  `run_host = '127.0.0.1'`（既定）で、共有ネットワークでは `offline_dump` を使わない。

## 運用上の注意

- **WebUSB はセキュアコンテキスト必須**: `http://127.0.0.1:8000` または `http://localhost:8000` で開く。別 PC から IP アドレスで HTTP アクセスした場合はリーダーが使えない。
- **`init_tables = True` は全データ削除**: [database.md](database.md) 参照。
- **Python バージョン**: `Pipfile` は 3.11 指定。ローカルの `.python-version`（gitignore 対象）と異なる場合は `pipenv --python 3.11` などで合わせる。
- **画面上の出席済み判定は学籍番号ベース**: `append.js` の `students` 配列はページ読み込み時の出席者 + その後の登録で構成される。複数ブラウザで同時に使うと画面同士は同期しない。
