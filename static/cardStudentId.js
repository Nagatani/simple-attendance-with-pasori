// カード内（MIFARE Classic のセクタ）の学籍番号を読み取って出席登録する
// アプリ側グルー。読み取りロジックは mifare-webusb ライブラリ(MifareWebUSB)に
// 委譲し、このファイルはアプリ固有の処理だけを持つ:
//   - サーバ設定 /config の取得
//   - オフライン時の /card-image 取得
//   - DOM ボタン配線と /attend 呼び出し、UI 更新(ui.js/append.js)
//
// read_mode が 'student_id' のときだけ動作する。

let appConfig = null;

/** サーバ設定(/config)を取得してキャッシュ。 */
const loadAppConfig = async () => {
  if (appConfig) { return appConfig; }
  const res = await fetch('/config');
  if (!res.ok) { throw new Error('設定(/config)を取得できませんでした。'); }
  appConfig = await res.json();
  return appConfig;
};

/** サーバの student_id_location 設定を studentId 用の location に変換（validate を RegExp 化）。 */
const locationFromConfig = (loc) => {
  const out = {
    sector: loc.sector,
    block: loc.block || 0,
    offset: loc.offset || 0,
    length: loc.length,
    encoding: loc.encoding || 'ascii',
  };
  if (loc.validate) { out.validate = new RegExp(loc.validate); }
  return out;
};

/**
 * オフライン(デモ)リーダー: サーバの /card-image のダンプから
 * ライブラリのイメージ transceiver を作る。
 * @returns {Promise<{uidHex: string, transceiver: object}>}
 */
const createOfflineReader = async () => {
  const res = await fetch('/card-image');
  if (!res.ok) {
    throw new Error('カードイメージを取得できませんでした。config.offline_dump を確認してください。');
  }
  const data = await res.json();
  if (!data || !Array.isArray(data.image)) {
    throw new Error('カードイメージの形式が不正です。');
  }
  const image = Uint8Array.from(data.image);
  return { uidHex: data.uid || '', transceiver: MifareWebUSB.createImageTransceiver(image) };
};

/**
 * 実機(WebUSB)リーダー: ライブラリの WebUSB リーダーを接続して transceiver を得る。
 * ※ connect() はユーザー操作(クリック)内で呼ぶ必要がある。
 * @returns {Promise<{uidHex: string, transceiver: object}>}
 */
const createLiveReader = async () => {
  const reader = MifareWebUSB.createWebUsbReader();
  await reader.connect();
  const polled = await reader.pollUid();
  return { uidHex: polled ? polled.uidHex : '', transceiver: reader.transceiver };
};

/**
 * カードから全セクタを読み取り、設定場所の学籍番号を取り出す。
 * @returns {Promise<{studentId: string, uidHex: string, readSectors: number[], errors: Array}>}
 */
const readStudentIdFromCard = async () => {
  const cfg = await loadAppConfig();
  const loc = cfg.student_id_location;
  if (!loc) {
    throw new Error('student_id_location が設定されていません（config.py を確認してください）。');
  }

  const reader = cfg.offline ? await createOfflineReader() : await createLiveReader();
  const { image, readSectors, errors } = await MifareWebUSB.readAllSectors(reader.transceiver);
  if (readSectors.length === 0) {
    throw new Error(`セクタを読み取れませんでした。${errors.map((e) => e.message).join(' / ')}`);
  }

  const studentId = MifareWebUSB.extractString(image, locationFromConfig(loc));
  return { studentId, uidHex: reader.uidHex, readSectors, errors };
};

/** カードから学籍番号を読み取り、そのまま出席登録する。 */
const readAndAttendStudentId = async () => {
  try {
    const { studentId, uidHex, errors } = await readStudentIdFromCard();
    if (errors && errors.length) { console.warn('一部セクタの読み取りに失敗:', errors); }
    console.info(`カードから学籍番号を読み取りました: ${studentId}`);
    if (typeof playReadSound === 'function') { playReadSound(); }

    const data = await fetchApi('/attend', 'POST', { student_id: studentId, card_id: uidHex || '' });
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
