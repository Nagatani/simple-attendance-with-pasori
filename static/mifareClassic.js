// MIFARE Classic 1K の「全セクタ読み取り」ライブラリ。
//
// 設計方針:
//   リーダー固有の低レベル通信（認証・ブロック読み取りの実バイト列）は
//   「transceiver」オブジェクトとして外部から注入する。このファイルは
//   «どのセクタをどの順で認証し、どのブロックを読み、1024 バイトの
//   イメージに組み立てるか» という手順だけを持つ。こうすることで、
//   ハードウェアに依存しない手順部分を単体テストできる。
//
//   - 実機用 transceiver は felica.js 側で生成する（RC-S380 / RC-S300）。
//   - createImageTransceiver() は .mfd ダンプ等の 1024 バイトイメージから
//     読み出すモック。ハード無しで出席登録フロー全体を検証するのに使う。
//
// MIFARE Classic 1K: 16 セクタ × 4 ブロック × 16 バイト = 1024 バイト。
// 各セクタの最終ブロックは「セクタトレーラ」(KeyA/access/KeyB)。
// 認証はセクタ単位（セクタ内のどれか 1 ブロックを認証すると、その
// セクタの全ブロックにアクセスできる）。

const MC_SECTORS = 16;
const MC_BLOCKS_PER_SECTOR = 4;
const MC_BLOCK_SIZE = 16;
const MC_TOTAL_BLOCKS = MC_SECTORS * MC_BLOCKS_PER_SECTOR; // 64
const MC_IMAGE_SIZE = MC_TOTAL_BLOCKS * MC_BLOCK_SIZE;     // 1024
const MC_KEY_A = 0x60;
const MC_KEY_B = 0x61;
const MC_DEFAULT_KEY = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff];

/** セクタ/ブロックから絶対ブロック番号を求める。 */
const mcAbsoluteBlock = (sector, block) => sector * MC_BLOCKS_PER_SECTOR + block;

/** セクタのトレーラ(最終)ブロックの絶対番号。 */
const mcTrailerBlock = (sector) => mcAbsoluteBlock(sector, MC_BLOCKS_PER_SECTOR - 1);

/** 絶対ブロックがセクタトレーラかどうか。 */
const mcIsTrailer = (absBlock) => absBlock % MC_BLOCKS_PER_SECTOR === MC_BLOCKS_PER_SECTOR - 1;

/** 16 進文字列(12 桁)を 6 バイト配列に変換する。 */
const mcHexToKey = (hex) => {
  const clean = hex.trim().replace(/[\s:]/g, '');
  if (!/^[0-9a-fA-F]{12}$/.test(clean)) {
    throw new Error(`鍵は 12 桁の 16 進で指定してください: "${hex}"`);
  }
  const key = [];
  for (let i = 0; i < 12; i += 2) {
    key.push(parseInt(clean.substr(i, 2), 16));
  }
  return key;
};

/**
 * MIFARE Classic Tool 形式等の .keys テキストから候補鍵の配列を作る。
 * 1 行 1 鍵(12 桁 16 進)。'#' 以降と空行は無視。重複は除去。
 * @param {string} text
 * @returns {number[][]} 候補鍵の配列
 */
const mcParseKeysFile = (text) => {
  const seen = new Set();
  const keys = [];
  text.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.split('#')[0].trim();
    if (line === '') { return; }
    const key = mcHexToKey(line);
    const sig = key.map((b) => b.toString(16).padStart(2, '0')).join('');
    if (!seen.has(sig)) {
      seen.add(sig);
      keys.push(key);
    }
  });
  return keys;
};

/** 鍵のバイト配列が等しいか。 */
const mcKeyEquals = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * 候補鍵リストから「セクタごとの鍵プロバイダ」を作る。
 * 各セクタに対して候補鍵を順に KeyA→KeyB として試す単純な実装。
 * @param {number[][]} candidateKeys
 * @returns {function(number): number[][]} sector -> 候補鍵の配列
 */
const mcKeyProviderFromCandidates = (candidateKeys) => {
  const keys = (candidateKeys && candidateKeys.length) ? candidateKeys : [MC_DEFAULT_KEY];
  return () => keys;
};

/**
 * @typedef {Object} McTransceiver
 * @property {function(Object): Promise<boolean>} authenticate
 *   引数 {sector, block, keyType(0x60|0x61), key:number[6], uid:number[]} でセクタ認証。成功で true。
 * @property {function(number): Promise<number[]>} readBlock
 *   絶対ブロック番号を受け取り 16 バイトの配列を返す。
 */

/**
 * 全セクタ(または指定セクタ)を読み取り、1024 バイトのイメージに組み立てる。
 * @param {McTransceiver} transceiver リーダー固有の低レベル実装
 * @param {Object} [options]
 * @param {number[]} [options.uid=[]] カード UID（認証に使うリーダーがある）
 * @param {function(number): number[][]} [options.keyProvider] sector -> 候補鍵配列
 * @param {number[]} [options.sectors] 読み取るセクタ番号（既定: 全セクタ）
 * @param {boolean} [options.includeTrailers=true] トレーラブロックも読むか
 * @returns {Promise<{image: Uint8Array, readSectors: number[], errors: Array<{sector:number, message:string}>}>}
 */
const mcReadAllSectors = async (transceiver, options = {}) => {
  const {
    uid = [],
    keyProvider = mcKeyProviderFromCandidates([MC_DEFAULT_KEY]),
    sectors = Array.from({ length: MC_SECTORS }, (_, i) => i),
    includeTrailers = true,
  } = options;

  const image = new Uint8Array(MC_IMAGE_SIZE);
  const readSectors = [];
  const errors = [];

  for (const sector of sectors) {
    const candidateKeys = keyProvider(sector) || [MC_DEFAULT_KEY];
    let authenticated = false;

    // 候補鍵を KeyA → KeyB の順に試す。認証はセクタ先頭ブロックに対して行う。
    const authBlock = mcAbsoluteBlock(sector, 0);
    for (const key of candidateKeys) {
      for (const keyType of [MC_KEY_A, MC_KEY_B]) {
        try {
          // eslint 無視: 候補を順に試すため意図的に await をループ内で使う
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
      for (let b = 0; b < MC_BLOCKS_PER_SECTOR; b += 1) {
        const abs = mcAbsoluteBlock(sector, b);
        if (!includeTrailers && mcIsTrailer(abs)) { continue; }
        // eslint-disable-next-line no-await-in-loop
        const block = await transceiver.readBlock(abs);
        if (!block || block.length !== MC_BLOCK_SIZE) {
          throw new Error(`ブロック ${abs} の読み取り結果が不正です。`);
        }
        image.set(block, abs * MC_BLOCK_SIZE);
      }
      readSectors.push(sector);
    } catch (e) {
      errors.push({ sector, message: `セクタ ${sector} の読み取りに失敗しました: ${e.message}` });
    }
  }

  return { image, readSectors, errors };
};

/**
 * 1024 バイトイメージから読み出す擬似 transceiver（モック）。
 * ハード無しで出席登録フロー全体を検証するために使う。
 * keys を渡すと、イメージ内トレーラの KeyA/KeyB と照合して認証可否を判定する。
 * （ダンプによっては KeyA が読み出し不可で 00 埋めの場合があるため、
 *   既定では鍵照合を行わず常に認証成功とする。）
 * @param {Uint8Array|number[]} image 1024 バイトのブロックイメージ
 * @param {Object} [opts]
 * @param {boolean} [opts.verifyKeys=false] トレーラの鍵と照合するか
 * @returns {McTransceiver}
 */
const mcCreateImageTransceiver = (image, opts = {}) => {
  const { verifyKeys = false } = opts;
  const bytes = image instanceof Uint8Array ? image : Uint8Array.from(image);
  if (bytes.length !== MC_IMAGE_SIZE) {
    throw new Error(`イメージは ${MC_IMAGE_SIZE} バイト必要です（実際: ${bytes.length}）。`);
  }
  return {
    authenticate: async ({ sector, keyType, key }) => {
      if (!verifyKeys) { return true; }
      const t = mcTrailerBlock(sector) * MC_BLOCK_SIZE;
      const stored = keyType === MC_KEY_B
        ? Array.from(bytes.subarray(t + 10, t + 16))
        : Array.from(bytes.subarray(t, t + 6));
      return mcKeyEquals(stored, key);
    },
    readBlock: async (absBlock) => Array.from(bytes.subarray(absBlock * MC_BLOCK_SIZE, absBlock * MC_BLOCK_SIZE + MC_BLOCK_SIZE)),
  };
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MC_SECTORS,
    MC_BLOCKS_PER_SECTOR,
    MC_BLOCK_SIZE,
    MC_TOTAL_BLOCKS,
    MC_IMAGE_SIZE,
    MC_KEY_A,
    MC_KEY_B,
    MC_DEFAULT_KEY,
    mcAbsoluteBlock,
    mcTrailerBlock,
    mcIsTrailer,
    mcHexToKey,
    mcParseKeysFile,
    mcKeyEquals,
    mcKeyProviderFromCandidates,
    mcReadAllSectors,
    mcCreateImageTransceiver,
  };
}
