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
4. 画面を開いた時点でダンプから学籍番号を取り出して**自動で**出席登録される
   （再実行用に「もう一度読み取る」ボタンも表示される）。

## 読み取りの起動とボタンについて

ボタンを押さずに読み取れるよう、起動を次のようにしている。

- **オフライン**: ページを開いた時点で 1 回自動実行（クリック不要）。
- **実機(WebUSB)**: ページを開くと、許可済みリーダーがあれば自動接続し、以降は
  `reader.startPolling()` による**連続ポーリング**でカードをかざすたびに登録する
  （1 枚ごとのクリックは不要）。

  ただし **WebUSB の仕様上、デバイス選択ダイアログ(`requestDevice`)だけはユーザー操作が
  必須**。そのため「そのリーダーをこのサイトで初めて使うとき」の 1 回だけ
  「リーダーに接続して開始」ボタンのクリックが要る。一度許可すれば、次回以降は
  `navigator.usb.getDevices()` による自動接続でクリック不要になる
  （ライブラリの `reader.connect({ interactive: false })`）。

  補足: ブラウザの自動再生ポリシーにより、セッション中に一度も操作していない状態では
  読み取り音が鳴らないことがある（読み取り自体は動作する）。

## 実機でのセクタ読み取り (crypto1)

全セクタを読むには MIFARE Classic の crypto1 認証（Load Authentication Keys →
Authentication → Read Block）が必要で、実機でのセクタ認証には実鍵が要ります。
鍵はサーバの `/keys`（`config.keys_file` を読む。`student_id` モード・127.0.0.1 限定）
から取得し、ブラウザで `keyProvider` としてライブラリに渡します。

### RC-S300（★第一版・実機検証中★）

RC-S300 は `FF` クラスの疑似APDU（`FF CA` 等）を受け付ける実績があるため、同じ経路で
標準の MIFARE コマンドを送って実装しています（`webusb-reader.js` の `rcs300*`）。

```
Load Key            : FF 82 00 00 06 <key6>
General Authenticate: FF 86 00 00 05 01 00 <block> <keyType 60/61> <keySlot 00>
Read Binary         : FF B0 00 <block> 10
```

第一版のため、送受信フレームを `console.info('[mifare-webusb] TX/RX: …')` に出力します。
うまく読めない場合は、その TX/RX ログ（特に認証/読み取りの SW 応答）を見て調整します。
`createWebUsbReader({ debug: true })`（既定 true）でログが出ます。

### RC-S380（未実装）

Port-100 の生 WebUSB で crypto1 が可能かは確証がなく（成功例は PC/SC ドライバ経由のみ）、
`authenticateSeam` / `readBlockSeam` は未実装で既定ではエラーになります。実装時は
`createWebUsbReader({ enableUnvalidatedSectorAuth: true })` とし、実機ログで SEAM を埋めます
（デバイス接続・Type A 有効化・UID 取得は実装済み）。

参考:
- [support mifare classic 1k · nfcpy #133](https://github.com/nfcpy/nfcpy/issues/133)
- [Pasori RC-S380でMifare Classic読み取りでハマる](https://ameblo.jp/waka21/entry-12237868842.html)
- [PaSoRi RC-S380対応 FeliCa+Mifareアクセスライブラリ](https://lnovel.diary.to/archives/65827630.html)

参考:
- [support mifare classic 1k · nfcpy #133](https://github.com/nfcpy/nfcpy/issues/133)
- [Pasori RC-S380でMifare Classic読み取りでハマる](https://ameblo.jp/waka21/entry-12237868842.html)
- [PaSoRi RC-S380対応 FeliCa+Mifareアクセスライブラリ](https://lnovel.diary.to/archives/65827630.html)
