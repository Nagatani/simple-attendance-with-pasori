// mifare-webusb コア(mifare-classic.js)の単体テスト。
// 実行: node --test 'tests/*.test.js'

const test = require('node:test');
const assert = require('node:assert');
const M = require('../static/mifare-webusb');

test('ブロック計算', () => {
  assert.strictEqual(M.absoluteBlock(1, 0), 4);
  assert.strictEqual(M.trailerBlock(0), 3);
  assert.strictEqual(M.trailerBlock(15), 63);
  assert.strictEqual(M.isTrailer(3), true);
  assert.strictEqual(M.isTrailer(4), false);
});

test('hexToKey', () => {
  assert.deepStrictEqual(M.hexToKey('ffffffffffff'), M.DEFAULT_KEY);
  assert.deepStrictEqual(M.hexToKey('A0:A1:A2:A3:A4:A5'), [0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5]);
  assert.throws(() => M.hexToKey('zz'), /12 桁/);
});

test('parseKeysFile: コメント・空行・重複を無視', () => {
  const text = '# comment\nFFFFFFFFFFFF\n\nA0A1A2A3A4A5 # key\nffffffffffff\n';
  const keys = M.parseKeysFile(text);
  assert.strictEqual(keys.length, 2);
  assert.deepStrictEqual(keys[0], M.DEFAULT_KEY);
});

test('readAllSectors: イメージ transceiver で全セクタ復元', async () => {
  const src = new Uint8Array(M.IMAGE_SIZE);
  for (let i = 0; i < M.IMAGE_SIZE; i += 1) { src[i] = i & 0xff; }
  const tx = M.createImageTransceiver(src);
  const { image, readSectors, errors } = await M.readAllSectors(tx);
  assert.strictEqual(errors.length, 0);
  assert.strictEqual(readSectors.length, 16);
  assert.deepStrictEqual(Array.from(image), Array.from(src));
});

test('readAllSectors: 鍵照合あり、正しい鍵で成功', async () => {
  const src = new Uint8Array(M.IMAGE_SIZE);
  const key = [0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5];
  src.set(key, M.trailerBlock(1) * 16);
  const tx = M.createImageTransceiver(src, { verifyKeys: true });
  const { readSectors, errors } = await M.readAllSectors(tx, {
    sectors: [1],
    keyProvider: M.keyProviderFromCandidates([key]),
  });
  assert.deepStrictEqual(readSectors, [1]);
  assert.strictEqual(errors.length, 0);
});

test('readAllSectors: 鍵照合あり、鍵不一致で認証エラーを記録', async () => {
  const src = new Uint8Array(M.IMAGE_SIZE);
  const tx = M.createImageTransceiver(src, { verifyKeys: true });
  const { readSectors, errors } = await M.readAllSectors(tx, {
    sectors: [2],
    keyProvider: M.keyProviderFromCandidates([[1, 2, 3, 4, 5, 6]]),
  });
  assert.deepStrictEqual(readSectors, []);
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0].message, /認証に失敗/);
});

test('readAllSectors: 認証は KeyA → KeyB の順に試す', async () => {
  const attempts = [];
  const tx = {
    authenticate: async ({ keyType }) => {
      attempts.push(keyType);
      return keyType === M.KEY_B;
    },
    readBlock: async () => new Array(16).fill(0),
  };
  const { readSectors } = await M.readAllSectors(tx, { sectors: [0], keyProvider: () => [M.DEFAULT_KEY] });
  assert.deepStrictEqual(readSectors, [0]);
  assert.deepStrictEqual(attempts, [M.KEY_A, M.KEY_B]);
});
