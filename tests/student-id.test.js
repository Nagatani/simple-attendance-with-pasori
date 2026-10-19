// mifare-webusb の値抽出(student-id.js)の単体テスト。

const test = require('node:test');
const assert = require('node:assert');
const M = require('../static/mifare-webusb');

function imageWith(block, offset, bytes) {
  const img = new Uint8Array(1024);
  img.set(bytes, block * 16 + offset);
  return img;
}
function ascii(str) {
  return Uint8Array.from(Array.from(str).map((c) => c.charCodeAt(0)));
}

test('decodeBytes ascii/hex/bcd', () => {
  assert.strictEqual(M.decodeBytes(ascii('K21001'), 'ascii'), 'K21001');
  assert.strictEqual(M.decodeBytes(Uint8Array.from([0x0a, 0xff]), 'hex'), '0aff');
  assert.strictEqual(M.decodeBytes(Uint8Array.from([0x12, 0x34, 0x5f]), 'bcd'), '12345');
});

test('trimPadding: NUL/0xFF/空白を前後から除去', () => {
  assert.strictEqual(M.trimPadding('\u0000 K21001 ÿ'), 'K21001');
});

test('extractString: ASCII（パディング除去）', () => {
  const img = imageWith(4, 0, ascii('K21001\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000'));
  assert.strictEqual(M.extractString(img, { sector: 1, block: 0, offset: 0, length: 16 }), 'K21001');
});

test('extractString: offset 指定', () => {
  const img = imageWith(8, 4, ascii('20250042'));
  assert.strictEqual(M.extractString(img, { sector: 2, block: 0, offset: 4, length: 8 }), '20250042');
});

test('extractString: validate 一致/不一致', () => {
  const ok = imageWith(4, 0, ascii('K21001'));
  assert.strictEqual(M.extractString(ok, { sector: 1, length: 6, validate: /^[A-Z]\d{5}$/ }), 'K21001');
  const ng = imageWith(4, 0, ascii('XXXXXX'));
  assert.throws(() => M.extractString(ng, { sector: 1, length: 6, validate: /^[A-Z]\d{5}$/ }), /検証パターン/);
});

test('extractString: 空データ/範囲外/不正sectorで例外', () => {
  const img = new Uint8Array(1024);
  assert.throws(() => M.extractString(img, { sector: 1, length: 6 }), /取得できませんでした/);
  assert.throws(() => M.extractString(img, { sector: 15, block: 3, offset: 8, length: 16 }), /イメージ外/);
  assert.throws(() => M.extractString(img, { sector: 16, length: 4 }), /sector は 0-15/);
});

test('extractStudentId は extractString の別名', () => {
  assert.strictEqual(M.extractStudentId, M.extractString);
});
