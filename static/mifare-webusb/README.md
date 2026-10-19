# mifare-webusb

WebUSB で Sony PaSoRi (RC-S380 / RC-S300) から MIFARE Classic 1K を読み取るための
ライブラリ。リーダーとの通信を **transceiver**（`authenticate` / `readBlock`）として
抽象化し、「全セクタ読み取り」と「値抽出」をハードウェアから切り離して提供する。

- 依存ゼロ（DOM にもアプリにも依存しない）。このフォルダごと別リポジトリ/npm パッケージ
  として切り出せる。
- ブラウザは `<script>` で読み込むと `window.MifareWebUSB` に公開される。
- Node / バンドラは `require('mifare-webusb')`（`index.js`）。

## 構成

| ファイル | 役割 | ハード依存 |
|---|---|---|
| `mifare-classic.js` | レイアウト定数・鍵パース・`readAllSectors()`・イメージ transceiver | なし |
| `webusb-reader.js` | PaSoRi を WebUSB 制御し transceiver を提供 | あり（WebUSB） |
| `student-id.js` | 読み取ったイメージから文字列（学籍番号など）を抽出 | なし |
| `index.js` | Node 用の集約エントリ | — |

## 使い方（ブラウザ）

```html
<script src="mifare-webusb/mifare-classic.js"></script>
<script src="mifare-webusb/webusb-reader.js"></script>
<script src="mifare-webusb/student-id.js"></script>
<script>
  const { createWebUsbReader, readAllSectors, parseKeysFile,
          keyProviderFromCandidates, extractString } = MifareWebUSB;

  async function run() {
    const reader = createWebUsbReader();
    await reader.connect();                 // ユーザー操作(クリック)内で呼ぶこと
    const { uidHex } = await reader.pollUid();

    const keys = parseKeysFile(keysFileText);
    const { image, readSectors, errors } = await readAllSectors(reader.transceiver, {
      keyProvider: keyProviderFromCandidates(keys),
    });

    const id = extractString(image, { sector: 1, length: 8, encoding: 'ascii' });
    console.log(uidHex, id, readSectors, errors);
  }
</script>
```

## 使い方（Node / テスト・オフライン）

```js
const { readAllSectors, createImageTransceiver, extractString } = require('mifare-webusb');

const tx = createImageTransceiver(uint8ArrayOf1024Bytes); // .mfd 等のイメージ
const { image } = await readAllSectors(tx);
const id = extractString(image, { sector: 1, length: 8, encoding: 'ascii' });
```

## 公開 API

- `readAllSectors(transceiver, options)` → `{ image: Uint8Array(1024), readSectors, errors }`
- `createImageTransceiver(image, { verifyKeys })` → transceiver（イメージ由来）
- `createWebUsbReader(options)` → `{ connect, pollUid, transceiver, disconnect, deviceModel }`
- `parseKeysFile(text)` / `hexToKey(hex)` / `keyProviderFromCandidates(keys)`
- `extractString(image, location)`（別名 `extractStudentId`）
- 定数: `SECTORS`, `BLOCKS_PER_SECTOR`, `BLOCK_SIZE`, `IMAGE_SIZE`, `KEY_A`, `KEY_B`, `DEFAULT_KEY`
- ブロック計算: `absoluteBlock`, `trailerBlock`, `isTrailer`

## 実機対応の状況（重要）

`webusb-reader.js` のうち **デバイス接続・Type A 有効化・UID 取得は実装済み**。
一方、**crypto1 によるセクタ認証とブロック読み取り（`transceiver.authenticate` /
`readBlock`）は実機未検証**で、既定では説明付きエラーを投げる。

理由: 生 WebUSB (Port-100) で crypto1 が可能かは確証が無い（成功例は PC/SC ドライバ
経由のみ）。実機検証を行う際は次のようにし、`webusb-reader.js` の `SEAM` 部
(`authenticateSeam` / `readBlockSeam`) に実機ログで確認したコマンド列を実装する:

```js
const reader = createWebUsbReader({ enableUnvalidatedSectorAuth: true });
```

crypto1 の手順は Load Authentication Keys → Authentication → Read Block の 3 段階。
