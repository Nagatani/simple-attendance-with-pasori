// カード読み取り → 値抽出のパイプライン統合テスト。
// cardStudentId.readStudentIdFromCard() が内部で行う処理
// (readAllSectors → extractString) を、イメージ transceiver で Node 上に再現する。

const test = require('node:test');
const assert = require('node:assert');
const M = require('../static/mifare-webusb');

function ascii(str) {
  return Uint8Array.from(Array.from(str).map((c) => c.charCodeAt(0)));
}

test('パイプライン: セクタ読み取り→抽出（ASCII, length=8）', async () => {
  const src = new Uint8Array(M.IMAGE_SIZE);
  src.set(ascii('K21001'), 4 * 16); // セクタ1 ブロック0
  const { image, readSectors } = await M.readAllSectors(M.createImageTransceiver(src));
  assert.strictEqual(readSectors.length, 16);
  assert.strictEqual(
    M.extractString(image, { sector: 1, block: 0, offset: 0, length: 8, encoding: 'ascii' }),
    'K21001',
  );
});

test('パイプライン: BCD で格納された番号', async () => {
  const src = new Uint8Array(M.IMAGE_SIZE);
  src.set([0x20, 0x25, 0x00, 0x42, 0xff], 8 * 16); // セクタ2 ブロック0
  const { image } = await M.readAllSectors(M.createImageTransceiver(src));
  assert.strictEqual(M.extractString(image, { sector: 2, length: 5, encoding: 'bcd' }), '20250042');
});

test('パイプライン: validate 不一致は例外', async () => {
  const src = new Uint8Array(M.IMAGE_SIZE);
  src.set(ascii('NG!!!!'), 4 * 16);
  const { image } = await M.readAllSectors(M.createImageTransceiver(src));
  assert.throws(
    () => M.extractString(image, { sector: 1, length: 6, validate: /^[A-Z]\d{5}$/ }),
    /検証パターン/,
  );
});

test('WebUSB リーダー: 既定ではセクタ認証が未検証エラー', async () => {
  const reader = M.createWebUsbReader();
  await assert.rejects(() => reader.transceiver.authenticate({ sector: 0, keyType: M.KEY_A, key: M.DEFAULT_KEY }), /未検証・未実装/);
  await assert.rejects(() => reader.transceiver.readBlock(0), /未検証・未実装/);
});
