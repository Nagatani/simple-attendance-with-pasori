// カード内（MIFARE Classic のセクタ）に書かれた学籍番号を読み取って
// 出席登録するフロー。各ライブラリを束ねる。
//
//   mifareReader.js (transceiver) → mifareClassic.js (全セクタ読み取り)
//   → studentId.js (学籍番号抽出) → /attend (出席登録)
//
// read_mode が 'student_id' のときに index.html のボタンから呼ばれる。

let appConfig = null;

/**
 * サーバから設定(/config)を取得してキャッシュします。
 * @returns {Promise<object>}
 */
const loadAppConfig = async () => {
  if (appConfig) { return appConfig; }
  const res = await fetch('/config');
  if (!res.ok) { throw new Error('設定(/config)を取得できませんでした。'); }
  appConfig = await res.json();
  return appConfig;
};

/**
 * サーバの student_id_location 設定を studentId.js 用の location に変換します。
 * validate は文字列の正規表現なので RegExp に変換します。
 * @param {object} loc
 * @returns {object}
 */
const locationFromConfig = (loc) => {
  const out = {
    sector: loc.sector,
    block: loc.block || 0,
    offset: loc.offset || 0,
    length: loc.length,
    encoding: loc.encoding || 'ascii',
  };
  if (loc.validate) {
    out.validate = new RegExp(loc.validate);
  }
  return out;
};

/**
 * カードから全セクタを読み取り、設定された場所の学籍番号を取り出します。
 * @returns {Promise<{studentId: string, uid: string, readSectors: number[], errors: Array}>}
 */
const readStudentIdFromCard = async () => {
  const cfg = await loadAppConfig();
  const loc = cfg.student_id_location;
  if (!loc) {
    throw new Error('student_id_location が設定されていません（config.py を確認してください）。');
  }

  const reader = cfg.offline ? await createOfflineReader() : createWebUsbReader();
  const { image, readSectors, errors } = await mcReadAllSectors(reader.transceiver);
  if (readSectors.length === 0) {
    const detail = errors.map((e) => e.message).join(' / ');
    throw new Error(`セクタを読み取れませんでした。${detail}`);
  }

  const studentId = extractStudentId(image, locationFromConfig(loc));
  return { studentId, uid: reader.uid, readSectors, errors };
};

/**
 * カードから学籍番号を読み取り、そのまま出席登録します。
 * UI 表示は ui.js / append.js の関数を利用します。
 */
const readAndAttendStudentId = async () => {
  try {
    const { studentId, uid, errors } = await readStudentIdFromCard();
    if (errors && errors.length) {
      console.warn('一部セクタの読み取りに失敗:', errors);
    }
    console.info(`カードから学籍番号を読み取りました: ${studentId}`);
    if (typeof playReadSound === 'function') { playReadSound(); }

    const data = await fetchApi('/attend', 'POST', { student_id: studentId, card_id: uid || '' });
    if (data.status === 'ok') {
      processNewAttend(data.student_id, true);
    } else {
      updateHeadingMessage(data.message || '出席登録に失敗しました。');
    }
  } catch (e) {
    console.error('学籍番号の読み取り/登録エラー:', e);
    updateHeadingMessage(`読み取りエラー: ${e.message}`);
  }
};

// read_mode が 'student_id' のときにボタンを有効化する。
document.addEventListener('DOMContentLoaded', async () => {
  const button = document.getElementById('readStudentId');
  if (!button) { return; }
  try {
    const cfg = await loadAppConfig();
    if (cfg.read_mode === 'student_id') {
      button.style.display = '';
      button.addEventListener('click', (ev) => {
        ev.preventDefault();
        readAndAttendStudentId();
      });
      // 学籍番号モードでは従来のUID用SETUPボタンは不要なので隠す。
      const setupButton = document.getElementById('start');
      if (setupButton) { setupButton.style.display = 'none'; }
    }
  } catch (e) {
    console.error('設定読み込みに失敗しました:', e);
  }
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { locationFromConfig };
}
