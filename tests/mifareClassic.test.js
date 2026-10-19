// static/mifareClassic.js の単体テスト。
// 実行: node --test 'tests/*.test.js'

const test = require('node:test');
const assert = require('node:assert');
const {
  MC_IMAGE_SIZE,
  MC_KEY_A,
  MC_KEY_B,
  MC_DEFAULT_KEY,
  mcAbsoluteBlock,
  mcTrailerBlock,
  mcIsTrailer,
  mcHexToKey,
  mcParseKeysFile,
  mcKeyProviderFromCandidates,
  mcReadAllSectors,
  mcCreateImageTransceiver,
} = require('../static/mifareClassic.js');

test('ブロック計算', () => {
  assert.strictEqual(mcAbsoluteBlock(1, 0), 4);
  assert.strictEqual(mcTrailerBlock(0), 3);
  assert.strictEqual(mcTrailerBlock(15), 63);
  assert.strictEqual(mcIsTrailer(3), true);
  assert.strictEqual(mcIsTrailer(4), false);
});

test('mcHexToKey', () => {
  assert.deepStrictEqual(mcHexToKey('ffffffffffff'), MC_DEFAULT_KEY);
  assert.deepStrictEqual(mcHexToKey('A0:A1:A2:A3:A4:A5'), [0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5]);
  assert.throws(() => mcHexToKey('zz'), /12 桁/);
});

test('mcParseKeysFile: コメント・空行・重複を無視', () => {
  const text = '# comment\nFFFFFFFFFFFF\n\nA0A1A2A3A4A5 # key\nffffffffffff\n';
  const keys = mcParseKeysFile(text);
  assert.strictEqual(keys.length, 2);
  assert.deepStrictEqual(keys[0], MC_DEFAULT_KEY);
});

test('mcReadAllSectors: イメージ transceiver で全セクタ復元', async () => {
  const src = new Uint8Array(MC_IMAGE_SIZE);
  for (let i = 0; i < MC_IMAGE_SIZE; i += 1) { src[i] = i & 0xff; }
  const tx = mcCreateImageTransceiver(src);
  const { image, readSectors, errors } = await mcReadAllSectors(tx);
  assert.strictEqual(errors.length, 0);
  assert.strictEqual(readSectors.length, 16);
  assert.deepStrictEqual(Array.from(image), Array.from(src));
});

test('mcReadAllSectors: 鍵照合あり、正しい鍵で成功', async () => {
  const src = new Uint8Array(MC_IMAGE_SIZE);
  // セクタ 1 のトレーラに KeyA = A0A1A2A3A4A5 を仕込む
  const key = [0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5];
  const t = mcTrailerBlock(1) * 16;
  src.set(key, t);
  const tx = mcCreateImageTransceiver(src, { verifyKeys: true });
  const { readSectors, errors } = await mcReadAllSectors(tx, {
    sectors: [1],
    keyProvider: mcKeyProviderFromCandidates([key]),
  });
  assert.deepStrictEqual(readSectors, [1]);
  assert.strictEqual(errors.length, 0);
});

test('mcReadAllSectors: 鍵照合あり、鍵不一致で認証エラーを記録', async () => {
  const src = new Uint8Array(MC_IMAGE_SIZE); // トレーラ鍵は全て 00
  const tx = mcCreateImageTransceiver(src, { verifyKeys: true });
  const { readSectors, errors } = await mcReadAllSectors(tx, {
    sectors: [2],
    keyProvider: mcKeyProviderFromCandidates([[1, 2, 3, 4, 5, 6]]),
  });
  assert.deepStrictEqual(readSectors, []);
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0].message, /認証に失敗/);
});

test('mcReadAllSectors: 認証は KeyA → KeyB の順に試す', async () => {
  const attempts = [];
  const tx = {
    authenticate: async ({ keyType }) => {
      attempts.push(keyType);
      return keyType === MC_KEY_B; // KeyA は失敗、KeyB で成功
    },
    readBlock: async () => new Array(16).fill(0),
  };
  const { readSectors } = await mcReadAllSectors(tx, { sectors: [0], keyProvider: () => [MC_DEFAULT_KEY] });
  assert.deepStrictEqual(readSectors, [0]);
  assert.deepStrictEqual(attempts, [MC_KEY_A, MC_KEY_B]);
});
