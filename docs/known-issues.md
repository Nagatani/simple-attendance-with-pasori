# 既知の問題・注意点

コードを読んで見つかった問題点のメモです（2026-10 時点）。修正したらこの一覧からも削除してください。

## 未完了・保留

- **RC-S300 は生 WebUSB (`student_id` モード) ではセクタ認証が通らない**（`6983`）。crypto1 を
  PC/SC ドライバ経由でしか実行できないため。→ RC-S300 でカード内学籍番号を読むなら
  **`pcsc` モード**（サーバー側 PC/SC + SSE）を使う。RC-S380 の WebUSB crypto1 も未実装。
- **`pcsc` モードは pyscard と Sony の PC/SC ドライバに依存**（実機検証が前提）。`pyscard` は
  任意依存で、使う場合のみ `pipenv install pyscard`。可否は `tools/probe_pcsc.py` で確認する。
- **`/card-image`・`/keys` は個人情報/秘密情報を返す**: `/card-image` は学籍番号を含む
  ダンプ、`/keys` は鍵を返す。必ず `run_host = '127.0.0.1'`（既定）で、共有ネットワークでは
  使わない。いずれも `read_mode = 'student_id'` のときのみ有効。

## 運用上の注意

- **WebUSB はセキュアコンテキスト必須**: `http://127.0.0.1:8000` または `http://localhost:8000` で開く。別 PC から IP アドレスで HTTP アクセスした場合はリーダーが使えない。
- **`init_tables = True` は全データ削除**: [database.md](database.md) 参照。
- **Python バージョン**: `Pipfile` は 3.11 指定。ローカルの `.python-version`（gitignore 対象）と異なる場合は `pipenv --python 3.11` などで合わせる。
- **画面上の出席済み判定は学籍番号ベース**: `append.js` の `students` 配列はページ読み込み時の出席者 + その後の登録で構成される。複数ブラウザで同時に使うと画面同士は同期しない。
