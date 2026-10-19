# カード読み取りと学籍番号の取得

このシステムには 2 つのカード読み取りモードがあり、`config.read_mode` で切り替えます。

| モード | 概要 | 事前登録 |
|---|---|---|
| `uid` | カードの UID/IDm を `card_id` として出席登録する従来方式。未登録カードは学籍番号の手入力ダイアログが出る。 | 必要（初回に UID↔学籍番号を登録） |
| `student_id` | カード内（MIFARE Classic のセクタ）に書かれた学籍番号を読み取り、そのまま出席登録する。 | 不要 |

## `student_id` モードの構成

関連ファイルと役割:

```
static/mifareReader.js   transceiver(リーダー固有の低レベル実装)を生成
static/mifareClassic.js  全セクタを認証・読み取りして1024バイトイメージに組み立てる
static/studentId.js      イメージの指定場所から学籍番号を取り出す
static/cardStudentId.js  上記を束ね、読み取り→抽出→/attend まで実行
tools/inspect_dump.py    ダンプを調べて学籍番号の格納場所を特定する（ローカル専用）
```

データの流れ:

```
transceiver ──▶ mcReadAllSectors() ──▶ 1024バイトイメージ ──▶ extractStudentId() ──▶ /attend
 (リーダー)        (mifareClassic.js)                           (studentId.js)
```

`mcReadAllSectors()` は「どのセクタをどの鍵で認証し、どのブロックを読むか」という
手順だけを持ち、実際の通信は transceiver に委譲します。これにより手順部分は
ハードウェア無しで単体テストできます（`tests/mifareClassic.test.js`）。

## 2 つの transceiver

- **オフライン(デモ)**: `createOfflineReader()`。サーバの `/card-image` が返す
  ダンプ(`config.offline_dump` の .mfd)を「読み取ったカード」として扱います。
  実機が無くても出席登録フロー全体を検証できます。鍵照合はしません。
- **実機(WebUSB)**: `createWebUsbReader()`。**現時点では未実装**で、呼ぶと明示的に
  エラーを返します。理由は下記「実機対応の現状」を参照。

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
- そのため `createWebUsbReader()` は未実装とし、実機とカードでの検証（console /
  USB 通信ログ）が得られ次第、`felica.js` の低レベル処理を使って
  `authenticate()` / `readBlock()` を実装する方針です。

参考:
- [support mifare classic 1k · nfcpy #133](https://github.com/nfcpy/nfcpy/issues/133)
- [Pasori RC-S380でMifare Classic読み取りでハマる](https://ameblo.jp/waka21/entry-12237868842.html)
- [PaSoRi RC-S380対応 FeliCa+Mifareアクセスライブラリ](https://lnovel.diary.to/archives/65827630.html)
