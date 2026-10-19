// RC-S300 の PC/SC 風疑似APDU コマンド(第一版)の単体テスト。
// 実際のデバイスは使わず、CCID 応答を模したバイト列で APDU 組み立てと解析を検証する。

const test = require('node:test');
const assert = require('node:assert');
const M = require('../static/mifare-webusb');
const { rcs300 } = M;

/** CCID 応答(先頭10バイトヘッダ + payload[data+SW]) を組み立てる。 */
function ccid(payload) {
  const header = [0x83, payload.length & 0xff, (payload.length >> 8) & 0xff, 0, 0, 0, 0, 0, 0, 0];
  return header.concat(payload);
}

/** 送信フレームを記録し、用意した応答を順に返す擬似 ctx。 */
function fakeCtx(responses) {
  const tx = [];
  const queue = responses.slice();
  return {
    tx,
    debug: false,
    send: async (data) => { tx.push(data); },
    receive: async () => queue.shift(),
  };
}

test('parseCcidApdu: データ部と SW を取り出す', () => {
  const r = rcs300.parseCcidApdu(ccid([0x11, 0x22, 0x90, 0x00]));
  assert.deepStrictEqual(r.data, [0x11, 0x22]);
  assert.deepStrictEqual(r.sw, [0x90, 0x00]);
  assert.strictEqual(rcs300.swOk(r.sw), true);
});

test('authenticate: Load Key(FF82) → General Authenticate(FF86) を送り SW9000 で成功', async () => {
  const ctx = fakeCtx([ccid([0x90, 0x00]), ccid([0x90, 0x00])]);
  const ok = await rcs300.authenticate(ctx, { block: 4, keyType: M.KEY_A, key: M.DEFAULT_KEY });
  assert.strictEqual(ok, true);
  // 1 発目: Load Key
  assert.deepStrictEqual(ctx.tx[0], [0xff, 0x82, 0x00, 0x00, 0x06, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
  // 2 発目: General Authenticate（block=4, KeyA=0x60）
  assert.deepStrictEqual(ctx.tx[1], [0xff, 0x86, 0x00, 0x00, 0x05, 0x01, 0x00, 0x04, 0x60, 0x00]);
});

test('authenticate: 認証APDUが SW!=9000 なら false', async () => {
  const ctx = fakeCtx([ccid([0x90, 0x00]), ccid([0x63, 0x00])]);
  const ok = await rcs300.authenticate(ctx, { block: 4, keyType: M.KEY_B, key: M.DEFAULT_KEY });
  assert.strictEqual(ok, false);
});

test('readBlock: FF B0 を送り 16 バイト + SW9000 を返す', async () => {
  const data16 = Array.from({ length: 16 }, (_, i) => i);
  const ctx = fakeCtx([ccid(data16.concat([0x90, 0x00]))]);
  const out = await rcs300.readBlock(ctx, 5);
  assert.deepStrictEqual(ctx.tx[0], [0xff, 0xb0, 0x00, 0x05, 0x10]);
  assert.deepStrictEqual(out, data16);
});

test('readBlock: SW エラーや長さ不足は例外', async () => {
  const bad = fakeCtx([ccid([0x12, 0x90, 0x00])]);
  await assert.rejects(() => rcs300.readBlock(bad, 5), /READ ブロック 5 失敗/);
});
