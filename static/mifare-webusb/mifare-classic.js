// mifare-webusb / mifare-classic.js
// ------------------------------------------------------------------
// MIFARE Classic 1K のコア（ハードウェア非依存）。
//   - レイアウト定数とブロック計算
//   - 鍵のパース / 候補鍵プロバイダ
//   - 全セクタ読み取りの手順 readAllSectors()（transceiver を注入）
//   - テスト/オフライン用のイメージ transceiver
//
// 実際のリーダー通信は transceiver (authenticate / readBlock) として
// 外から与える。これにより手順部分をハードウェア無しでテストできる。
//
// ブラウザ(<script>)では window.MifareWebUSB に、Node では module.exports に
// 公開される(UMD)。
// ------------------------------------------------------------------
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    factory(module.exports);
  } else {
    factory((root.MifareWebUSB = root.MifareWebUSB || {}));
  }
})(typeof self !== 'undefined' ? self : this, function (exports) {
  'use strict';

  const SECTORS = 16;
  const BLOCKS_PER_SECTOR = 4;
  const BLOCK_SIZE = 16;
  const TOTAL_BLOCKS = SECTORS * BLOCKS_PER_SECTOR; // 64
  const IMAGE_SIZE = TOTAL_BLOCKS * BLOCK_SIZE;      // 1024
  const KEY_A = 0x60;
  const KEY_B = 0x61;
  const DEFAULT_KEY = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff];

  /** セクタ/ブロックから絶対ブロック番号を求める。 */
  const absoluteBlock = (sector, block) => sector * BLOCKS_PER_SECTOR + block;

  /** セクタのトレーラ(最終)ブロックの絶対番号。 */
  const trailerBlock = (sector) => absoluteBlock(sector, BLOCKS_PER_SECTOR - 1);

  /** 絶対ブロックがセクタトレーラかどうか。 */
  const isTrailer = (abs) => abs % BLOCKS_PER_SECTOR === BLOCKS_PER_SECTOR - 1;

  /** 12 桁 16 進文字列を 6 バイト配列に変換。 */
  const hexToKey = (hex) => {
    const clean = String(hex).trim().replace(/[\s:]/g, '');
    if (!/^[0-9a-fA-F]{12}$/.test(clean)) {
      throw new Error(`鍵は 12 桁の 16 進で指定してください: "${hex}"`);
    }
    const key = [];
    for (let i = 0; i < 12; i += 2) {
      key.push(parseInt(clean.substr(i, 2), 16));
    }
    return key;
  };

  /** 鍵バイト配列が等しいか。 */
  const keyEquals = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

  /**
   * MIFARE Classic Tool 形式等の .keys テキストから候補鍵配列を作る。
   * 1 行 1 鍵(12 桁 16 進)。'#' 以降と空行は無視、重複除去。
   */
  const parseKeysFile = (text) => {
    const seen = new Set();
    const keys = [];
    String(text).split(/\r?\n/).forEach((rawLine) => {
      const line = rawLine.split('#')[0].trim();
      if (line === '') { return; }
      const key = hexToKey(line);
      const sig = key.map((b) => b.toString(16).padStart(2, '0')).join('');
      if (!seen.has(sig)) {
        seen.add(sig);
        keys.push(key);
      }
    });
    return keys;
  };

  /**
   * 候補鍵リストから「セクタ -> 候補鍵配列」のプロバイダを作る。
   * 各セクタに同じ候補鍵群を順に試す単純な実装。
   */
  const keyProviderFromCandidates = (candidateKeys) => {
    const keys = (candidateKeys && candidateKeys.length) ? candidateKeys : [DEFAULT_KEY];
    return () => keys;
  };

  /**
   * @typedef {Object} Transceiver
   * @property {function(Object): Promise<boolean>} authenticate
   *   {sector, block, keyType(0x60|0x61), key:number[6], uid:number[]} でセクタ認証。成功で true。
   * @property {function(number): Promise<number[]>} readBlock
   *   絶対ブロック番号を受け取り 16 バイト配列を返す。
   */

  /**
   * 全セクタ(または指定セクタ)を読み取り、1024 バイトのイメージに組み立てる。
   * @param {Transceiver} transceiver
   * @param {Object} [options]
   * @param {number[]} [options.uid=[]]
   * @param {function(number): number[][]} [options.keyProvider]
   * @param {number[]} [options.sectors] 既定: 全セクタ
   * @param {boolean} [options.includeTrailers=true]
   * @returns {Promise<{image: Uint8Array, readSectors: number[], errors: Array<{sector:number, message:string}>}>}
   */
  const readAllSectors = async (transceiver, options = {}) => {
    const {
      uid = [],
      keyProvider = keyProviderFromCandidates([DEFAULT_KEY]),
      sectors = Array.from({ length: SECTORS }, (_, i) => i),
      includeTrailers = true,
    } = options;

    const image = new Uint8Array(IMAGE_SIZE);
    const readSectors = [];
    const errors = [];

    for (const sector of sectors) {
      const candidateKeys = keyProvider(sector) || [DEFAULT_KEY];
      let authenticated = false;
      const authBlock = absoluteBlock(sector, 0);

      for (const key of candidateKeys) {
        for (const keyType of [KEY_A, KEY_B]) {
          try {
            // eslint-disable-next-line no-await-in-loop
            if (await transceiver.authenticate({ sector, block: authBlock, keyType, key, uid })) {
              authenticated = true;
              break;
            }
          } catch (e) {
            // この鍵では失敗。次を試す。
          }
        }
        if (authenticated) { break; }
      }

      if (!authenticated) {
        errors.push({ sector, message: `セクタ ${sector} の認証に失敗しました（鍵不一致）。` });
        continue;
      }

      try {
        for (let b = 0; b < BLOCKS_PER_SECTOR; b += 1) {
          const abs = absoluteBlock(sector, b);
          if (!includeTrailers && isTrailer(abs)) { continue; }
          // eslint-disable-next-line no-await-in-loop
          const block = await transceiver.readBlock(abs);
          if (!block || block.length !== BLOCK_SIZE) {
            throw new Error(`ブロック ${abs} の読み取り結果が不正です。`);
          }
          image.set(block, abs * BLOCK_SIZE);
        }
        readSectors.push(sector);
      } catch (e) {
        errors.push({ sector, message: `セクタ ${sector} の読み取りに失敗しました: ${e.message}` });
      }
    }

    return { image, readSectors, errors };
  };

  /**
   * 1024 バイトイメージから読み出す擬似 transceiver（テスト/オフライン用）。
   * verifyKeys=true のときはトレーラの KeyA/KeyB と照合して認証可否を判定する。
   */
  const createImageTransceiver = (image, opts = {}) => {
    const { verifyKeys = false } = opts;
    const bytes = image instanceof Uint8Array ? image : Uint8Array.from(image);
    if (bytes.length !== IMAGE_SIZE) {
      throw new Error(`イメージは ${IMAGE_SIZE} バイト必要です（実際: ${bytes.length}）。`);
    }
    return {
      authenticate: async ({ sector, keyType, key }) => {
        if (!verifyKeys) { return true; }
        const t = trailerBlock(sector) * BLOCK_SIZE;
        const stored = keyType === KEY_B
          ? Array.from(bytes.subarray(t + 10, t + 16))
          : Array.from(bytes.subarray(t, t + 6));
        return keyEquals(stored, key);
      },
      readBlock: async (abs) => Array.from(bytes.subarray(abs * BLOCK_SIZE, abs * BLOCK_SIZE + BLOCK_SIZE)),
    };
  };

  exports.SECTORS = SECTORS;
  exports.BLOCKS_PER_SECTOR = BLOCKS_PER_SECTOR;
  exports.BLOCK_SIZE = BLOCK_SIZE;
  exports.TOTAL_BLOCKS = TOTAL_BLOCKS;
  exports.IMAGE_SIZE = IMAGE_SIZE;
  exports.KEY_A = KEY_A;
  exports.KEY_B = KEY_B;
  exports.DEFAULT_KEY = DEFAULT_KEY;
  exports.absoluteBlock = absoluteBlock;
  exports.trailerBlock = trailerBlock;
  exports.isTrailer = isTrailer;
  exports.hexToKey = hexToKey;
  exports.keyEquals = keyEquals;
  exports.parseKeysFile = parseKeysFile;
  exports.keyProviderFromCandidates = keyProviderFromCandidates;
  exports.readAllSectors = readAllSectors;
  exports.createImageTransceiver = createImageTransceiver;
});
