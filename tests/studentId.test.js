// static/studentId.js の単体テスト。
// 実行: node --test tests/
// 依存追加なし（Node 組み込みの node:test を使用）。

const test = require('node:test');
const assert = require('node:assert');
const {
  sidAbsoluteBlock,
  sidToByteImage,
  sidDecodeBytes,
  sidTrimPadding,
  extractStudentId,
} = require('../static/studentId.js');

/** 1024 バイトの空イメージを作り、絶対ブロック block の offset に bytes を書き込む。 */
function imageWith(block, offset, bytes) {
  const img = new Uint8Array(1024);
  const start = block * 16 + offset;
  img.set(bytes, start);
  return img;
}

function ascii(str) {
  return Uint8Array.from(Array.from(str).map((c) => c.charCodeAt(0)));
}

test('sidAbsoluteBlock: セクタ/ブロックから絶対ブロック', () => {
  assert.strictEqual(sidAbsoluteBlock(0, 0), 0);
  assert.strictEqual(sidAbsoluteBlock(1, 0), 4);
  assert.strictEqual(sidAbsoluteBlock(15, 3), 63);
});

test('sidToByteImage: ブロック配列を連結して正規化', () => {
  const blocks = [new Uint8Array([1, 2]), [3, 4]];
  assert.deepStrictEqual(Array.from(sidToByteImage(blocks)), [1, 2, 3, 4]);
});

test('sidDecodeBytes ascii', () => {
  assert.strictEqual(sidDecodeBytes(ascii('K21001'), 'ascii'), 'K21001');
});

test('sidDecodeBytes hex', () => {
  assert.strictEqual(sidDecodeBytes(Uint8Array.from([0x0a, 0xff]), 'hex'), '0aff');
});

test('sidDecodeBytes bcd: 0xF ニブルで打ち切り', () => {
  assert.strictEqual(sidDecodeBytes(Uint8Array.from([0x12, 0x34, 0x5f]), 'bcd'), '12345');
  assert.strictEqual(sidDecodeBytes(Uint8Array.from([0x00, 0x99]), 'bcd'), '0099');
});

test('sidTrimPadding: NUL/0xFF/空白を前後から除去', () => {
  assert.strictEqual(sidTrimPadding('\u0000 K21001 ÿ'), 'K21001');
});

test('extractStudentId: ASCII の学籍番号を取得（パディング除去）', () => {
  const img = imageWith(4, 0, ascii('K21001\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000'));
  const value = extractStudentId(img, { sector: 1, block: 0, offset: 0, length: 16 });
  assert.strictEqual(value, 'K21001');
});

test('extractStudentId: offset 指定', () => {
  const img = imageWith(8, 4, ascii('20250042'));
  const value = extractStudentId(img, { sector: 2, block: 0, offset: 4, length: 8 });
  assert.strictEqual(value, '20250042');
});

test('extractStudentId: validate パターンに一致', () => {
  const img = imageWith(4, 0, ascii('K21001'));
  const value = extractStudentId(img, { sector: 1, length: 6, validate: /^[A-Z]\d{5}$/ });
  assert.strictEqual(value, 'K21001');
});

test('extractStudentId: validate 不一致で例外', () => {
  const img = imageWith(4, 0, ascii('XXXXXX'));
  assert.throws(
    () => extractStudentId(img, { sector: 1, length: 6, validate: /^[A-Z]\d{5}$/ }),
    /検証パターンに一致しません/,
  );
});

test('extractStudentId: 空データで例外', () => {
  const img = new Uint8Array(1024);
  assert.throws(
    () => extractStudentId(img, { sector: 1, length: 6 }),
    /取得できませんでした/,
  );
});

test('extractStudentId: 範囲外で例外', () => {
  const img = new Uint8Array(1024);
  assert.throws(
    () => extractStudentId(img, { sector: 15, block: 3, offset: 8, length: 16 }),
    /イメージ外/,
  );
});

test('extractStudentId: 不正な sector で例外', () => {
  const img = new Uint8Array(1024);
  assert.throws(() => extractStudentId(img, { sector: 16, length: 4 }), /sector は 0-15/);
});
