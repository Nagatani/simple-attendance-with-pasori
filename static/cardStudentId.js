// カード内（MIFARE Classic のセクタ）の学籍番号を読み取って出席登録する
// アプリ側グルー。読み取りロジックは mifare-webusb ライブラリ(MifareWebUSB)に
// 委譲し、このファイルはアプリ固有の処理だけを持つ:
//   - サーバ設定 /config の取得
//   - オフライン時の /card-image 取得
//   - 読み取り結果の /attend 登録と UI 更新(ui.js/append.js)
//   - 「ボタンを押さずに読み取る」ための起動配線
//
// read_mode が 'student_id' のときだけ動作する。
//
// ボタンクリックについて:
//   WebUSB はデバイス選択ダイアログ(requestDevice)にユーザー操作が必須。
//   このため「初回だけ」接続クリックが要る。一度許可すれば次回以降は
//   ページ読み込み時に自動接続し、以降はかざすだけ(連続ポーリング)で登録する。
//   オフライン(ダンプ)モードは読み込み時に自動実行する。

let appConfig = null;

/** サーバ設定(/config)を取得してキャッシュ。 */
const loadAppConfig = async () => {
  if (appConfig) { return appConfig; }
  const res = await fetch('/config');
  if (!res.ok) { throw new Error('設定(/config)を取得できませんでした。'); }
  appConfig = await res.json();
  return appConfig;
};

let candidateKeys = null;

/** 実機のセクタ認証用に /keys から候補鍵を取得してキャッシュ（byte 配列の配列）。 */
const loadKeys = async () => {
  if (candidateKeys) { return candidateKeys; }
  try {
    const res = await fetch('/keys');
    const data = res.ok ? await res.json() : { keys: [] };
    candidateKeys = (data.keys || []).map((hex) => MifareWebUSB.hexToKey(hex));
  } catch (e) {
    console.warn('鍵(/keys)の取得に失敗。既定鍵のみで試行します:', e);
    candidateKeys = [];
  }
  if (candidateKeys.length === 0) { candidateKeys = [MifareWebUSB.DEFAULT_KEY]; }
  return candidateKeys;
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
 * transceiver から全セクタを読み、学籍番号を抽出して出席登録する。
 * @param {object} transceiver MifareWebUSB の transceiver
 * @param {{uidHex?: string, uid?: number[]}} [card] カード識別情報
 */
const attendFromTransceiver = async (transceiver, card = {}) => {
  const cfg = await loadAppConfig();
  const loc = cfg.student_id_location;
  if (!loc) {
    throw new Error('student_id_location が設定されていません（config.py を確認してください）。');
  }

  const readOptions = { uid: card.uid || [] };
  if (!cfg.offline) {
    // 実機モードはセクタ認証に実鍵が要る（オフラインはダンプから直読みのため不要）。
    readOptions.keyProvider = MifareWebUSB.keyProviderFromCandidates(await loadKeys());
  }
  const { image, readSectors, errors } = await MifareWebUSB.readAllSectors(transceiver, readOptions);
  if (readSectors.length === 0) {
    updateHeadingMessage(`セクタを読み取れませんでした: ${errors.map((e) => e.message).join(' / ')}`);
    return;
  }

  const studentId = MifareWebUSB.extractString(image, locationFromConfig(loc));
  console.info(`カードから学籍番号を読み取りました: ${studentId}`);
  if (typeof playReadSound === 'function') { playReadSound(); }

  const data = await fetchApi('/attend', 'POST', { student_id: studentId, card_id: card.uidHex || '' });
  if (data.status === 'ok') {
    processNewAttend(data.student_id, true);
  } else {
    updateHeadingMessage(data.message || '出席登録に失敗しました。');
  }
};

/**
 * オフライン(デモ): /card-image のダンプを 1 回読み取って登録する。
 */
const runOfflineOnce = async () => {
  try {
    const res = await fetch('/card-image');
    if (!res.ok) {
      throw new Error('カードイメージを取得できませんでした。config.offline_dump を確認してください。');
    }
    const data = await res.json();
    if (!data || !Array.isArray(data.image)) {
      throw new Error('カードイメージの形式が不正です。');
    }
    const image = Uint8Array.from(data.image);
    const transceiver = MifareWebUSB.createImageTransceiver(image);
    await attendFromTransceiver(transceiver, { uidHex: data.uid || '' });
  } catch (e) {
    console.error('オフライン読み取りエラー:', e);
    updateHeadingMessage(`読み取りエラー: ${e.message}`);
  }
};

/**
 * 実機(WebUSB): リーダーに接続し、連続ポーリングでかざすたびに登録する。
 * @param {boolean} interactive 初回の選択ダイアログを許可するか（クリック内で true）
 * @returns {Promise<object>} reader
 */
const startLiveReading = async (interactive) => {
  const reader = MifareWebUSB.createWebUsbReader();
  await reader.connect({ interactive });
  reader.startPolling(async (polled) => {
    try {
      await attendFromTransceiver(reader.transceiver, { uidHex: polled.uidHex, uid: polled.uid });
    } catch (e) {
      console.error('読み取り/登録エラー:', e);
      updateHeadingMessage(`読み取りエラー: ${e.message}`);
    }
  });
  return reader;
};

// 起動配線（student_id モードのみ）
document.addEventListener('DOMContentLoaded', async () => {
  let cfg;
  try {
    cfg = await loadAppConfig();
  } catch (e) {
    console.error('設定読み込みに失敗しました:', e);
    return;
  }
  if (cfg.read_mode !== 'student_id') { return; }

  // UID 用の SETUP ボタンは使わない
  const setupButton = document.getElementById('start');
  if (setupButton) { setupButton.style.display = 'none'; }
  const button = document.getElementById('readStudentId');

  // --- オフライン: 読み込み時に自動実行（クリック不要）。再読込用ボタンも残す ---
  if (cfg.offline) {
    if (button) {
      button.textContent = 'もう一度読み取る';
      button.style.display = '';
      button.addEventListener('click', (ev) => { ev.preventDefault(); runOfflineOnce(); });
    }
    runOfflineOnce();
    return;
  }

  // --- 実機: 許可済みなら自動接続して連続読み取り（クリック不要） ---
  const showConnectButton = () => {
    if (!button) { return; }
    button.textContent = 'リーダーに接続して開始';
    button.style.display = '';
    button.onclick = async (ev) => {
      ev.preventDefault();
      try {
        await startLiveReading(true); // クリック=ユーザー操作内なので requestDevice 可
        button.style.display = 'none';
        updateHeadingMessage('リーダー接続済み。カードをかざしてください。');
      } catch (err) {
        console.error('接続エラー:', err);
        updateHeadingMessage(`接続エラー: ${err.message}`);
      }
    };
  };

  try {
    await startLiveReading(false); // 許可済みデバイスへ自動接続（操作不要）
    if (button) { button.style.display = 'none'; }
    updateHeadingMessage('リーダー接続済み。カードをかざしてください。');
  } catch (e) {
    // 初回や自動接続不可時は、1 回だけ接続クリックを求める
    console.info('自動接続できなかったため、クリックでの接続に切り替えます:', e && e.message);
    showConnectButton();
  }
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { locationFromConfig };
}
