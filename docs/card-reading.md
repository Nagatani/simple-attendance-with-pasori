# カード読み取りと学籍番号の取得

このシステムには 2 つのカード読み取りモードがあり、`config.read_mode`（Python コード上の 1 行）で切り替えます。**既定は `uid`** です。

| モード | 概要 | 事前登録 |
|---|---|---|
| `uid`（既定） | カードの UID/IDm を `card_id` として出席登録する従来方式。未登録カードは学籍番号の手入力ダイアログが出る。 | 必要（初回に UID↔学籍番号を登録） |
| `student_id` | カード内（MIFARE Classic のセクタ）に書かれた学籍番号を読み取り、そのまま出席登録する。 | 不要 |

`uid` モードでは `student_id` 用の機能は一切動きません（`/card-image` は 404、`/config` も学籍番号の場所を返さない）。`mifare-webusb/*` と `cardStudentId.js` は読み込まれますが、ボタンが無効なので待機するだけです。

## `student_id` モードの構成

カード読み取り自体は独立ライブラリ **`static/mifare-webusb/`**（`window.MifareWebUSB`）に
切り出してあります（フォルダごと外に出せる。詳細は
[static/mifare-webusb/README.md](../static/mifare-webusb/README.md)）。アプリ側は
これを利用するだけです。

| ファイル | 役割 | 区分 |
|---|---|---|
| `static/mifare-webusb/mifare-classic.js` | 全セクタ読み取り `readAllSectors()`・鍵・イメージ transceiver | ライブラリ |
| `static/mifare-webusb/webusb-reader.js` | PaSoRi を WebUSB 制御し transceiver を提供 | ライブラリ |
| `static/mifare-webusb/student-id.js` | イメージの指定場所から値を抽出 `extractString()` | ライブラリ |
| `static/cardStudentId.js` | 上記を束ね、/config・/card-image・/attend と UI を繋ぐ | アプリ |
| `tools/inspect_dump.py` | ダンプを調べて学籍番号の格納場所を特定（ローカル専用） | ツール |

データの流れ:

```
transceiver ──▶ readAllSectors() ──▶ 1024バイトイメージ ──▶ extractString() ──▶ /attend
 (リーダー)       (mifare-webusb)                           (mifare-webusb)       (アプリ)
```

`readAllSectors()` は「どのセクタをどの鍵で認証し、どのブロックを読むか」という
手順だけを持ち、実際の通信は transceiver に委譲します。これにより手順部分は
ハードウェア無しで単体テストできます（`tests/mifare-classic.test.js`）。

## 2 つの transceiver

- **オフライン(デモ)**: アプリが `/card-image`（`config.offline_dump` の .mfd）を取得し、
  ライブラリの `MifareWebUSB.createImageTransceiver(image)` に渡します。実機が無くても
  出席登録フロー全体を検証できます。鍵照合はしません。
- **実機(WebUSB)**: `MifareWebUSB.createWebUsbReader()`。接続・Type A 有効化・UID 取得は
  実装済み。**crypto1 セクタ認証/読み取りは実機未検証**で、既定では明示エラーを返します
  （下記「実機対応の現状」）。

## 学籍番号の格納場所を特定する

カードのどこに学籍番号が、どの形式で入っているかは発行仕様によります。手元で
ダンプを調べて `config.student_id_location` に設定します。

```sh
python3 tools/inspect_dump.py secrets/Dump_XXXXXXXX.mfd
```

各データブロックの ASCII 表現が出るので、学籍番号らしき文字列の
「セクタ・ブロック・開始バイト・バイト数・形式」を読み取り、設定します。

```python
# config.py
student_id_location = {
  "sector": 1, "block": 0, "offset": 0, "length": 8,
  "encoding": "ascii",      # 'ascii' | 'hex' | 'bcd'
  "validate": "^[A-Z]\\d{7}$",  # 任意: 形式検証の正規表現（JS側で使用）
}
```

> ダンプ(.mfd) と鍵(.keys) は個人情報・秘密情報です。`secrets/` 配下に置き、
> コミットや外部送信をしないでください。`inspect_dump.py` はセクタトレーラ（鍵）を
> 既定で伏せて表示します。

## オフラインでの動作確認手順

1. `config.read_mode = 'student_id'`、`config.offline_dump` に .mfd を設定。
2. `tools/inspect_dump.py` で `student_id_location` を設定。
3. `pipenv run start 講義名 1` で起動し、`http://127.0.0.1:8000/` を開く。
4. 「カードから学籍番号を読み取る」ボタンを押すと、ダンプから学籍番号を取り出して
   出席登録される。

## 実機対応の現状（重要）

実機(RC-S380 / RC-S300)で全セクタを読むには MIFARE Classic の crypto1 認証
（Load Authentication Keys → Authentication → Read Block）が必要です。調査の結果:

- セクタ読み取りの成功例はいずれも **PC/SC ドライバ経由**（Sony の NFC Port
  Software が crypto1 を処理）で、本プロジェクトのような **生の WebUSB で crypto1 が
  できたという確証は見つかっていません**。Port-100 チップは crypto1 を内蔵しないと
  いう理解が一般的で、現行の UID 読み取りは認証不要なので動いています。
- そのため `webusb-reader.js` では crypto1 のセクタ認証/読み取りを SEAM
  (`authenticateSeam` / `readBlockSeam`) として分離し、既定では明示エラーを投げます。
  実機検証時は `createWebUsbReader({ enableUnvalidatedSectorAuth: true })` とし、
  console / USB 通信ログで確認したコマンド列を SEAM 部に実装します
  （デバイス接続・Type A 有効化・UID 取得は既に実装済み）。

参考:
- [support mifare classic 1k · nfcpy #133](https://github.com/nfcpy/nfcpy/issues/133)
- [Pasori RC-S380でMifare Classic読み取りでハマる](https://ameblo.jp/waka21/entry-12237868842.html)
- [PaSoRi RC-S380対応 FeliCa+Mifareアクセスライブラリ](https://lnovel.diary.to/archives/65827630.html)
