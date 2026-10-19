// mifareClassic.js の mcReadAllSectors() に渡す transceiver（リーダー固有の
// 低レベル実装）を生成するファイル。
//
//   - オフライン(デモ)モード: サーバの /card-image が返すダンプ(1024バイト)を
//     「読み取ったカード」とみなし、イメージ由来の transceiver を返す。
//     実機が無くても出席登録フロー全体を検証できる。
//   - 実機(WebUSB)モード: RC-S380 / RC-S300 で crypto1 セクタ認証を行う
//     transceiver を返す。これは実機とカードでの検証が必要なため、現段階では
//     未実装であることを明示的に通知する（黙って失敗させない方針）。

/**
 * サーバからオフライン用カードイメージ(.mfd 由来)を取得します。
 * @returns {Promise<{uid: string, image: Uint8Array}>}
 */
const fetchCardImage = async () => {
  const res = await fetch('/card-image');
  if (!res.ok) {
    throw new Error('カードイメージを取得できませんでした。config.offline_dump の設定を確認してください。');
  }
  const data = await res.json();
  if (!data || !Array.isArray(data.image)) {
    throw new Error('カードイメージの形式が不正です。');
  }
  return { uid: data.uid || '', image: Uint8Array.from(data.image) };
};

/**
 * オフライン(デモ)用リーダーを生成します。
 * サーバのダンプを読み、イメージ由来の transceiver を返します。
 * @returns {Promise<{uid: string, transceiver: object}>}
 */
const createOfflineReader = async () => {
  const { uid, image } = await fetchCardImage();
  // ダンプは既に平文なので鍵照合はしない（verifyKeys: false）。
  const transceiver = mcCreateImageTransceiver(image);
  return { uid, transceiver };
};

/**
 * 実機(WebUSB)用リーダーの生成。
 *
 * MIFARE Classic の全セクタ読み取りには crypto1 認証が必要で、以下の 3 段階を
 * リーダーに送る必要があります（Load Authentication Keys → Authentication →
 * Read Block）。RC-S380(Port-100)/RC-S300 で生の WebUSB からこれを行う正確な
 * コマンド列は実機とカードでの検証が前提のため、ここでは未実装とし、呼び出し元に
 * 明確に通知します。実機ログ（console / USB通信）が得られ次第、felica.js の
 * 低レベル処理を使って authenticate()/readBlock() を実装します。
 *
 * @returns {{uid: string, transceiver: object}}
 */
const createWebUsbReader = () => {
  throw new Error(
    '実機(WebUSB)でのMIFARE Classicセクタ認証(crypto1)は未実装です。'
    + '現在はオフライン(ダンプ)モードのみ対応しています。'
    + 'config.offline_dump を設定してオフラインで動作確認してください。',
  );
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { fetchCardImage, createOfflineReader, createWebUsbReader };
}
