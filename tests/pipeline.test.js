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

test('readAllSectors: authenticate が投げた例外は「鍵不一致」に化けず理由が出る', async () => {
  const tx = {
    authenticate: async () => { throw new Error('未検証・未実装です'); },
    readBlock: async () => new Array(16).fill(0),
  };
  const { readSectors, errors } = await M.readAllSectors(tx, { sectors: [0] });
  assert.deepStrictEqual(readSectors, []);
  assert.match(errors[0].message, /認証でエラー: 未検証・未実装/);
  assert.doesNotMatch(errors[0].message, /鍵不一致/);
});

test('readAllSectors: false は従来どおり「鍵不一致」', async () => {
  const tx = { authenticate: async () => false, readBlock: async () => new Array(16).fill(0) };
  const { errors } = await M.readAllSectors(tx, { sectors: [0] });
  assert.match(errors[0].message, /鍵不一致/);
});

test('createCardDeduper: 新しいカードのみ発火、同一カードは抑止、離脱でリセット', () => {
  const d = M.createCardDeduper({ removalPolls: 2 });
  assert.strictEqual(d.accept('aa'), true);   // 新規カード
  assert.strictEqual(d.accept('aa'), false);  // 同じカードが乗り続け
  assert.strictEqual(d.accept('bb'), true);   // 別カードに変わった
  assert.strictEqual(d.accept(null), false);  // 離脱 1 回目
  assert.strictEqual(d.accept(null), false);  // 離脱 2 回目 → リセット
  assert.strictEqual(d.accept('bb'), true);   // 同じカードを再度かざすと発火
});
