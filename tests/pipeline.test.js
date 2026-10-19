// カード読み取り → 学籍番号抽出のパイプライン統合テスト。
// ブラウザ側 cardStudentId.readStudentIdFromCard() が内部で行う処理
// (mcReadAllSectors → extractStudentId) を、イメージ transceiver を使って
// Node 上で再現し、config.student_id_location 相当の設定で検証する。

const test = require('node:test');
const assert = require('node:assert');
const { mcReadAllSectors, mcCreateImageTransceiver, MC_IMAGE_SIZE } = require('../static/mifareClassic.js');
const { extractStudentId } = require('../static/studentId.js');

function ascii(str) {
  return Uint8Array.from(Array.from(str).map((c) => c.charCodeAt(0)));
}

test('パイプライン: セクタ読み取り→学籍番号抽出（ASCII, length=8）', async () => {
  // 合成イメージ: セクタ1 ブロック0 (絶対ブロック4) の先頭に "K21001"
  const src = new Uint8Array(MC_IMAGE_SIZE);
  src.set(ascii('K21001'), 4 * 16);

  const tx = mcCreateImageTransceiver(src);
  const { image, readSectors } = await mcReadAllSectors(tx);
  assert.strictEqual(readSectors.length, 16);

  const location = { sector: 1, block: 0, offset: 0, length: 8, encoding: 'ascii' };
  const studentId = extractStudentId(image, location);
  assert.strictEqual(studentId, 'K21001');
});

test('パイプライン: BCD で格納された学籍番号', async () => {
  const src = new Uint8Array(MC_IMAGE_SIZE);
  // セクタ2 ブロック0 (絶対ブロック8): BCD "20250042" + 0xFF パディング
  src.set([0x20, 0x25, 0x00, 0x42, 0xff], 8 * 16);

  const tx = mcCreateImageTransceiver(src);
  const { image } = await mcReadAllSectors(tx);

  const location = { sector: 2, block: 0, offset: 0, length: 5, encoding: 'bcd' };
  assert.strictEqual(extractStudentId(image, location), '20250042');
});

test('パイプライン: validate 不一致は例外', async () => {
  const src = new Uint8Array(MC_IMAGE_SIZE);
  src.set(ascii('NG!!!!'), 4 * 16);
  const tx = mcCreateImageTransceiver(src);
  const { image } = await mcReadAllSectors(tx);
  assert.throws(
    () => extractStudentId(image, { sector: 1, length: 6, validate: /^[A-Z]\d{5}$/ }),
    /検証パターン/,
  );
});
