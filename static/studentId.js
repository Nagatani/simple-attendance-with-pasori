// 読み取ったセクタデータ（MIFARE Classic 1K の全ブロックイメージ）から、
// 指定された場所の学籍番号を取り出すライブラリ。
//
// カードのどこに学籍番号が入っているか・どのような形式か（ASCII の数字列、
// パックされた BCD、生の 16 進など）はカードの発行仕様によって異なるため、
// 格納場所と形式は「設定(location)」として外から与える方針にしている。
// 実際の場所は tools/inspect_dump.py でダンプを調べて決める。
//
// ブラウザでは window のグローバル関数として、Node では module.exports として
// 利用できるようにしてある（単体テスト用）。

const SID_BLOCK_SIZE = 16;
const SID_BLOCKS_PER_SECTOR = 4;

/**
 * セクタ番号とセクタ内ブロック番号から、カード先頭からの絶対ブロック番号を求めます。
 * @param {number} sector セクタ番号 (0-15)
 * @param {number} block セクタ内ブロック番号 (0-3)
 * @returns {number} 絶対ブロック番号 (0-63)
 */
const sidAbsoluteBlock = (sector, block) => sector * SID_BLOCKS_PER_SECTOR + block;

/**
 * 全ブロックイメージ(Uint8Array)を Uint8Array に正規化します。
 * number[] や、ブロックごとの配列(number[][] / Uint8Array[])も受け付けます。
 * @param {Uint8Array|number[]|Array<Uint8Array|number[]>} image
 * @returns {Uint8Array}
 */
const sidToByteImage = (image) => {
  if (image instanceof Uint8Array) {
    return image;
  }
  if (Array.isArray(image) && image.length > 0 && (Array.isArray(image[0]) || image[0] instanceof Uint8Array)) {
    // ブロックごとの配列 → 連結
    const flat = [];
    image.forEach((block) => block.forEach((b) => flat.push(b)));
    return Uint8Array.from(flat);
  }
  return Uint8Array.from(image);
};

/**
 * バイト列を指定エンコーディングで文字列に変換します。
 * @param {Uint8Array} bytes 対象バイト列
 * @param {('ascii'|'hex'|'bcd')} encoding 変換方式
 * @returns {string}
 */
const sidDecodeBytes = (bytes, encoding) => {
  switch (encoding) {
    case 'ascii':
      // 表示可能文字のみを採用（制御文字やパディングは後段の trim で落ちる）
      return Array.from(bytes).map((b) => String.fromCharCode(b)).join('');
    case 'hex':
      return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    case 'bcd': {
      // 各バイトの上位/下位ニブルを 10 進の桁として読む。0xF ニブルはパディングとして打ち切る。
      let out = '';
      for (const b of bytes) {
        const hi = (b >> 4) & 0x0f;
        const lo = b & 0x0f;
        if (hi === 0x0f) { break; }
        out += String(hi);
        if (lo === 0x0f) { break; }
        out += String(lo);
      }
      return out;
    }
    default:
      throw new Error(`未知のエンコーディングです: ${encoding}`);
  }
};

/**
 * ASCII 文字列から、学籍番号として意味のない前後のパディングを取り除きます。
 * NUL(0x00) / 0xFF / 空白 / 制御文字を前後から除去します。
 * @param {string} str
 * @returns {string}
 */
const sidTrimPadding = (str) => {
  // 制御文字・DEL・0xFF 由来(ÿ)・空白を前後から除去
  return str.replace(/^[\u0000- \u007fÿ]+/, '').replace(/[\u0000- \u007fÿ]+$/, '');
};

/**
 * 学籍番号の格納場所設定。
 * @typedef {Object} StudentIdLocation
 * @property {number} sector      セクタ番号 (0-15)
 * @property {number} [block=0]   セクタ内ブロック番号 (0-3)
 * @property {number} [offset=0]  ブロック先頭からのバイトオフセット
 * @property {number} length      読み取るバイト数
 * @property {('ascii'|'hex'|'bcd')} [encoding='ascii'] 変換方式
 * @property {boolean} [trim=true] ASCII のときに前後パディングを除去するか
 * @property {RegExp}  [validate] 取得結果の検証用パターン（任意）
 */

/**
 * 全ブロックイメージから、指定場所の学籍番号を取り出します。
 * @param {Uint8Array|number[]|Array<Uint8Array|number[]>} image 全ブロックイメージ
 * @param {StudentIdLocation} location 格納場所設定
 * @returns {string} 取り出した学籍番号
 * @throws {Error} 設定不備・範囲外・検証失敗時
 */
const extractStudentId = (image, location) => {
  if (!location || typeof location !== 'object') {
    throw new Error('location が指定されていません。');
  }
  const { sector, block = 0, offset = 0, length, encoding = 'ascii', trim = true, validate } = location;

  if (!Number.isInteger(sector) || sector < 0 || sector > 15) {
    throw new Error(`sector は 0-15 の整数で指定してください: ${sector}`);
  }
  if (!Number.isInteger(block) || block < 0 || block > 3) {
    throw new Error(`block は 0-3 の整数で指定してください: ${block}`);
  }
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error(`length は 1 以上の整数で指定してください: ${length}`);
  }

  const bytes = sidToByteImage(image);
  const start = sidAbsoluteBlock(sector, block) * SID_BLOCK_SIZE + offset;
  const end = start + length;
  if (end > bytes.length) {
    throw new Error(`指定範囲がイメージ外です (start=${start}, length=${length}, image=${bytes.length}バイト)`);
  }

  const slice = bytes.subarray(start, end);
  let value = sidDecodeBytes(slice, encoding);
  if (encoding === 'ascii' && trim) {
    value = sidTrimPadding(value);
  }

  if (value === '') {
    throw new Error('指定場所から学籍番号を取得できませんでした（空）。格納場所の設定を確認してください。');
  }
  if (validate instanceof RegExp && !validate.test(value)) {
    throw new Error(`取得した学籍番号が検証パターンに一致しません: "${value}"`);
  }
  return value;
};

// Node(テスト)用エクスポート。ブラウザでは無視される。
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SID_BLOCK_SIZE,
    SID_BLOCKS_PER_SECTOR,
    sidAbsoluteBlock,
    sidToByteImage,
    sidDecodeBytes,
    sidTrimPadding,
    extractStudentId,
  };
}
