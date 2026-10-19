# アーキテクチャ

## 全体像

```
┌───────────── Chrome (http://127.0.0.1:8000/) ─────────────┐
│                                                            │
│  felica.js ──WebUSB──▶ PaSoRi (RC-S380 / RC-S300)          │
│     │ カードID検出                                          │
│     ▼ onCardReadCallback                                   │
│  append.js (handleCardRead / attend / register ...)        │
│     │                    │                                 │
│     ▼                    ▼                                 │
│  api.js (fetch)        ui.js (DOM・効果音)                  │
└─────┼──────────────────────────────────────────────────────┘
      │ HTTP (FormData / JSON)
      ▼
  main.py (Flask) ──▶ attend.db (SQLite)
                          ▲
  output_excel.py ────────┘──▶ Attend_<n>.xlsx
```

カードの読み取りはすべてブラウザ内で完結し、サーバーには読み取ったカード ID だけが送られます。そのため、PaSoRi はブラウザを動かす PC に接続します（サーバーと同じ PC である想定）。

## サーバー (main.py)

- 起動引数 `section_title`（講義名）と `section_id`（第 n 回、整数）を受け取り、モジュールグローバルの `args` に保持する。全 API はこの `section_id` に対して動作する。
- `__main__` で DB テーブルとインデックスを `create if not exists` で作成してから `app.run()` で起動する。
- DB 接続はリクエストごとに `flask.g` にキャッシュし、`teardown_appcontext` で閉じる。
- 設定値は `config.py`（`run_port`, `run_host`, `run_debug`, `database_name`, `init_tables`）。

## フロントエンド

`templates/index.html` が唯一の画面です。スクリプトは `defer` で次の順に読み込まれ、グローバルスコープを共有します。

| 順 | ファイル | 役割 |
|---|---|---|
| 1 | `ui.js` | DOM 操作・効果音再生。状態は持たない |
| 2 | `api.js` | `fetchApi` と `callAttendApi` / `callRegisterApi` / `callGetAttendedApi` / `callForgotCardApi` |
| 3 | `felica.js` | WebUSB でのリーダー制御、ポーリングループ、重複読み取り抑止 (`beforeIdm`) |
| 4 | `append.js` | アプリロジック。画面表示中の出席者リスト `students` を保持し、初回に `showAllAttendance()` を実行 |

### カード読み取りの流れ

1. 「SETUP」ボタン押下 → `navigator.usb` でデバイスを取得（ペアリング済みの対応機が 1 台なら自動選択）。
2. productId から機種を判定し、RC-S300 なら `send`/`session` を `send300`/`session300` に差し替える。
3. `while (true) { await session(device) }` でポーリング。
   - RC-S380: まず FeliCa (212F) をポーリングし、なければ Type A (MIFARE) で UID を取得。
   - RC-S300: FeliCa ポーリング → だめなら Type A に切り替えて Get UID。
4. ID 検出時 `updateIDm(id)` → 読み取り音再生 → 登録ダイアログが開いておらず、かつ前回と別の ID なら `handleCardRead(id)` を呼ぶ。
5. `handleCardRead` → `attend(id)` → `/attend`。
   - `status: ok` → 出席者リストに追加して出席音を再生（画面上で既に出席済みなら「出席済」表示）。
   - `status: error`（未登録カード）→ 学籍番号入力ダイアログ (`favDialog`) を表示。

FeliCa は IDm（8 バイト = 16 桁の 16 進）、MIFARE は UID（4 バイト = 8 桁の 16 進）がカード ID になります。

### 未登録カードの登録

`favDialog` の学籍番号欄で Enter → `register(card_id, student_id)` → `/register` が `students` と `attendance` に同時に INSERT。ダイアログを閉じると `clearBeforeIdm()` が呼ばれ、同じカードを再度かざせるようになります。

### カード忘れ

画面左下「カード忘れ登録」→ `forgotCardDialog` で学籍番号を入力 → `/forgot_card`。学生が登録済みならそのカード ID で、未登録なら学籍番号をカード ID として `forgot_card = 'FORGOT'` 付きで出席登録します。

## Excel 出力 (output_excel.py)

- `section_id > 0`: その回のシートを持つ `Attend_<n>.xlsx`。列は `ROWNUMBER, カードID, 学籍番号, カード忘れ, 登録日時, 更新日時`。
- `section_id == 0`（または省略）: 回ごとにシートを分けた `Attend_all.xlsx`。列は上と同じ。
- 出力先はカレントディレクトリ。
