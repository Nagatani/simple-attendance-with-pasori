// mifare-webusb / student-id.js
// ------------------------------------------------------------------
// 読み取った全ブロックイメージから、指定場所の文字列（学籍番号など）を
// 取り出すヘルパー。MIFARE Classic コアとは独立して使える付属機能。
// 格納場所・形式(ascii/hex/bcd)は location で外から与える。
// ------------------------------------------------------------------
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    factory(module.exports);
  } else {
    factory((root.MifareWebUSB = root.MifareWebUSB || {}));
  }
})(typeof self !== 'undefined' ? self : this, function (exports) {
  'use strict';

  const BLOCK_SIZE = 16;
  const BLOCKS_PER_SECTOR = 4;

  const absoluteBlock = (sector, block) => sector * BLOCKS_PER_SECTOR + block;

  const toByteImage = (image) => {
    if (image instanceof Uint8Array) { return image; }
    if (Array.isArray(image) && image.length > 0 && (Array.isArray(image[0]) || image[0] instanceof Uint8Array)) {
      const flat = [];
      image.forEach((block) => block.forEach((b) => flat.push(b)));
      return Uint8Array.from(flat);
    }
    return Uint8Array.from(image);
  };

  const decodeBytes = (bytes, encoding) => {
    switch (encoding) {
      case 'ascii':
        return Array.from(bytes).map((b) => String.fromCharCode(b)).join('');
      case 'hex':
        return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
      case 'bcd': {
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

  const trimPadding = (str) => String(str)
    .replace(/^[\u0000- \u007fÿ]+/, '')
    .replace(/[\u0000- \u007fÿ]+$/, '');

  /**
   * @typedef {Object} Location
   * @property {number} sector 0-15
   * @property {number} [block=0] 0-3
   * @property {number} [offset=0]
   * @property {number} length
   * @property {('ascii'|'hex'|'bcd')} [encoding='ascii']
   * @property {boolean} [trim=true]
   * @property {RegExp} [validate]
   */

  /**
   * 全ブロックイメージから指定場所の文字列を取り出す。
   * @param {Uint8Array|number[]|Array<Uint8Array|number[]>} image
   * @param {Location} location
   * @returns {string}
   */
  const extractString = (image, location) => {
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

    const bytes = toByteImage(image);
    const start = absoluteBlock(sector, block) * BLOCK_SIZE + offset;
    const end = start + length;
    if (end > bytes.length) {
      throw new Error(`指定範囲がイメージ外です (start=${start}, length=${length}, image=${bytes.length}バイト)`);
    }

    let value = decodeBytes(bytes.subarray(start, end), encoding);
    if (encoding === 'ascii' && trim) { value = trimPadding(value); }

    if (value === '') {
      throw new Error('指定場所から文字列を取得できませんでした（空）。格納場所の設定を確認してください。');
    }
    if (validate instanceof RegExp && !validate.test(value)) {
      throw new Error(`取得した文字列が検証パターンに一致しません: "${value}"`);
    }
    return value;
  };

  exports.decodeBytes = decodeBytes;
  exports.trimPadding = trimPadding;
  exports.extractString = extractString;
  // 後方互換 / 用途明示の別名
  exports.extractStudentId = extractString;
});
