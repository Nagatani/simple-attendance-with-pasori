// --- ファイル概要 ---
/**
 * @file WebUSB経由でFeliCa/NFCカードリーダーと通信し、カードIDを取得するロジック。
 * @see {@link https://github.com/marioninc/webusb-felica} を元にしています。
 */

// --- 定数 ---
/**
 * @type {Array<object>}
 * @description WebUSB APIで使用するデバイスフィルターの配列。
 * サポートするFeliCa/NFCカードリーダーのベンダーIDとプロダクトIDを定義します。
 * `deviceModel` は内部で使用するモデル識別子です。
 */
const deviceFilters = [
  { vendorId: 0x054c, productId: 0x06C1, deviceModel: 380 }, // RC-S380
  { vendorId: 0x054c, productId: 0x06C3, deviceModel: 380 }, // RC-S380
  { vendorId: 0x054c, productId: 0x0dc8, deviceModel: 300 }, // RC-S300
  { vendorId: 0x054c, productId: 0x0dc9, deviceModel: 300 }, // RC-S300
];

/**
 * @type {object}
 * @description プロダクトIDをキーとしてデバイスモデル（RC-S380 or RC-S300）を特定するためのマッピングオブジェクト。
 * キーはプロダクトID（16進数）、値はモデル番号（380 or 300）。
 */
const deviceModelList = {
  0x06C1: 380,
  0x06C3: 380,
  0x0dc8: 300,
  0x0dc9: 300,
};

// --- モジュールスコープ変数 ---
/** @type {null | ((idm: string) => void)} カード読み取り時のコールバック関数 */
let cardReadCallback = null;
/** @type {null|HTMLAudioElement} カード読み取り音のAudio要素 */
let readSound = null; 
/**
 * @type {number|undefined}
 * @description 現在接続されているデバイスのモデル番号 (380 or 300)。
 * デバイス接続時に `deviceModelList` を参照して設定されます。
 */
let deviceModel;
/**
 * @type {{in: number, out: number}}
 * @description WebUSBデバイスのエンドポイント番号を保持するオブジェクト。
 * `in` はデータ受信用のエンドポイント番号、`out` はデータ送信用。
 */
let deviceEp = {
  in: 0,
  out: 0,
};
/**
 * @type {number}
 * @description RC-S300デバイスとの通信時に使用するシーケンス番号。
 * `send300` 関数内でインクリメントされます。
 */
let seqNumber = 0;
/**
 * @type {string}
 * @description 前回処理したカードのIDM。連続した同一カードの読み取り処理を防ぐために使用。
 */
let beforeIdm = '';

// --- DOM要素への参照 ---
// DOM要素の取得は initializeFelica 関数内で行う。トップレベルでの直接取得は行わない。

// --- ユーティリティ関数 ---
/**
 * @summary 数値を指定された桁数でゼロパディングします。
 * @param {number|string} num - パディングする数値または文字列。
 * @param {number} p - パディング後の総桁数。
 * @returns {string} ゼロパディングされた文字列。
 */
const padding_zero = (num, p) => ("0".repeat(p * 1) + num).slice(-(p * 1));

/**
 * @summary 10進数を16進数文字列（2桁ゼロパディング）に変換します。
 * @param {number} n - 変換する10進数。
 * @returns {string} 変換された16進数文字列。
 */
const dec2HexString = (n) => padding_zero((n * 1).toString(16), 2);

/**
 * @summary 指定されたミリ秒数だけ処理を待機します。
 * @async
 * @param {number} msec - 待機するミリ秒数。
 * @returns {Promise<void>} 指定時間経過後に解決されるPromise。
 */
const sleep = (msec) => new Promise((resolve) => setTimeout(resolve, msec));

// --- 共通USB通信関数 ---
/**
 * @summary WebUSBデバイスからデータを受信します。
 * @async
 * @param {USBDevice} device - WebUSBデバイスオブジェクト。
 * @param {number} len - 受信するデータの期待長（バイト数）。
 * @returns {Promise<Array<number>>} 受信したデータをバイト配列として返すPromise。
 * @sideEffects `device.transferIn` を呼び出し、指定されたエンドポイントからデータを受信します。受信後、10ms待機します。受信データはコンソールにも16進数文字列として出力されます。
 */
const receive = async (device, len) => {
  // console.log("<<<<<<<<<<" + len);
  const data = await device.transferIn(deviceEp.in, len);
  await sleep(10);

  const arr = Array.from(new Uint8Array(data.data.buffer));
  const arr_str = arr.map((v) => dec2HexString(v));
  console.log('Felica.js < RECV:', arr_str); // ログ出力の可読性向上
  return arr;
};

// --- RC-S380特有のUSB通信関数 ---
/**
 * @summary WebUSBデバイスにデータを送信します（RC-S380向け汎用）。
 * @async
 * @param {USBDevice} device - WebUSBデバイスオブジェクト。
 * @param {Array<number>} data - 送信するデータのバイト配列。
 * @returns {Promise<void>} データ送信完了後に解決されるPromise。
 * @sideEffects `device.transferOut` を呼び出し、指定されたエンドポイントにデータを送信します。送信後、50ms待機します。
 */
let send = async (device, data) => { // RC-S300の場合、この関数はsend300に差し替えられる
  let uint8a = new Uint8Array(data);
  // console.log("Felica.js > SEND:", Array.from(uint8a).map(v => dec2HexString(v)));
  await device.transferOut(deviceEp.out, uint8a);
  await sleep(50);
};

/**
 * @summary RC-S380カードリーダーとの間でFeliCa/MIFAREカードのポーリングとID取得を行う通信セッションを処理します。
 * @description この関数は、RC-S380との初期設定コマンドの送受信、RF（無線周波数）設定、プロトコル設定、
 * そしてカードポーリング（SENSF_REQ）とID取得（InCommRF）の一連のシーケンスを実行します。
 * FeliCaカードまたはMIFAREカードが検出されると、そのIDM/UIDを `updateIDm` 関数経由で通知します。
 * @async
 * @param {USBDevice} device - WebUSBデバイスオブジェクト (RC-S380)。
 * @returns {Promise<void>} カードが検出されIDMが通知された場合、または一連のポーリングが完了した場合に解決されるPromise。
 * @sideEffects `send` および `receive` 関数を複数回呼び出してデバイスと通信します。
 */
let session = async (device) => { // RC-S300の場合、この関数はsession300に差し替えられる
  // --- デバイス初期化とコマンドタイプ設定 ---
  // ACK応答シーケンス (nfcpyの模倣)
  await send(device, [0x00, 0x00, 0xff, 0x00, 0xff, 0x00]);
  // SetCommandTypeコマンド
  await send(device, [0x00, 0x00, 0xff, 0xff, 0xff, 0x03, 0x00, 0xfd, 0xd6, 0x2a, 0x01, 0xff, 0x00]);
  await receive(device, 6); // ACK
  await receive(device, 13); // レスポンス

  // --- RF電界OFF ---
  await send(device, [0x00, 0x00, 0xff, 0xff, 0xff, 0x03, 0x00, 0xfd, 0xd6, 0x06, 0x00, 0x24, 0x00]);
  await receive(device, 6);
  await receive(device, 13);

  // --- 再度RF電界OFF (nfcpyのシーケンスに準拠) ---
  await send(device, [0x00, 0x00, 0xff, 0xff, 0xff, 0x03, 0x00, 0xfd, 0xd6, 0x06, 0x00, 0x24, 0x00]);
  await receive(device, 6);
  await receive(device, 13);

  // --- FeliCaカードポーリング準備 ---
  // RF設定: 212kbps FeliCa (InSetRF)
  await send(device, [0x00, 0x00, 0xff, 0xff, 0xff, 0x06, 0x00, 0xfa, 0xd6, 0x00, 0x01, 0x01, 0x0f, 0x01, 0x18, 0x00]);
  await receive(device, 6);
  await receive(device, 13);
  // プロトコル設定 (InSetProtocol)
  await send(device, [0x00, 0x00, 0xff, 0xff, 0xff, 0x28, 0x00, 0xd8, 0xd6, 0x02, 0x00, 0x18, 0x01, 0x01, 0x02, 0x01, 0x03, 0x00, 0x04, 0x00, 0x05, 0x00, 0x06, 0x00, 0x07, 0x08, 0x08, 0x00, 0x09, 0x00, 0x0a, 0x00, 0x0b, 0x00, 0x0c, 0x00, 0x0e, 0x04, 0x0f, 0x00, 0x10, 0x00, 0x11, 0x00, 0x12, 0x00, 0x13, 0x06, 0x4b, 0x00]);
  await receive(device, 6);
  await receive(device, 13);
  // 再度プロトコル設定 (InSetProtocol)
  await send(device, [0x00, 0x00, 0xff, 0xff, 0xff, 0x04, 0x00, 0xfc, 0xd6, 0x02, 0x00, 0x18, 0x10, 0x00]);
  await receive(device, 6);
  await receive(device, 13);

  // --- FeliCaカードポーリング実行 (SENSF_REQ) ---
  // InCommRFコマンドでSENSF_REQ (00ffff0100) を送信
  await send(device, [0x00, 0x00, 0xff, 0xff, 0xff, 0x0a, 0x00, 0xf6, 0xd6, 0x04, 0x6e, 0x00, 0x06, 0x00, 0xff, 0xff, 0x01, 0x00, 0xb3, 0x00]);
  await receive(device, 6); // ACK
  let idm_response = await receive(device, 37); // SENSF_RESを含むレスポンス
  // IDMはレスポンスの18バイト目から8バイト (インデックス17から24)
  let idm = idm_response.slice(17, 25);
  if (idm.length === 8 && idm.some(v => v !== 0)) { // IDMがゼロでないことを確認
    const idmStr = idm.map(v => dec2HexString(v)).join('');
    updateIDm(idmStr); // IDm処理関数を呼び出し
    return; // カード検出、処理終了
  }

  // --- MIFAREカードポーリング準備 (FeliCaが見つからなかった場合) ---
  // RF電界OFF
  await send(device, [0x00, 0x00, 0xff, 0xff, 0xff, 0x03, 0x00, 0xfd, 0xd6, 0x06, 0x00, 0x24, 0x00]);
  await receive(device, 6);
  await receive(device, 13);
  // MIFARE等のためのRF設定やプロトコル設定 (InSetRF, InSetProtocol)
  await send(device, [0x00, 0x00, 0xff, 0xff, 0xff, 0x06, 0x00, 0xfa, 0xd6, 0x00, 0x02, 0x03, 0x0f, 0x03, 0x13, 0x00]);
  await receive(device, 6);
  await receive(device, 13);
  await send(device, [0x00, 0x00, 0xff, 0xff, 0xff, 0x28, 0x00, 0xd8, 0xd6, 0x02, 0x00, 0x18, 0x01, 0x01, 0x02, 0x01, 0x03, 0x00, 0x04, 0x00, 0x05, 0x00, 0x06, 0x00, 0x07, 0x08, 0x08, 0x00, 0x09, 0x00, 0x0a, 0x00, 0x0b, 0x00, 0x0c, 0x00, 0x0e, 0x04, 0x0f, 0x00, 0x10, 0x00, 0x11, 0x00, 0x12, 0x00, 0x13, 0x06, 0x4b, 0x00]);
  await receive(device, 6);
  await receive(device, 13);
  await send(device, [0x00, 0x00, 0xff, 0xff, 0xff, 0x0c, 0x00, 0xf4, 0xd6, 0x02, 0x01, 0x00, 0x02, 0x00, 0x05, 0x01, 0x00, 0x06, 0x07, 0x07, 0x0b, 0x00]);
  await receive(device, 6);
  await receive(device, 13);

  // --- MIFAREカードポーリング実行 ---
  // InCommRFコマンド
  await send(device, [0x00, 0x00, 0xff, 0xff, 0xff, 0x05, 0x00, 0xfb, 0xd6, 0x04, 0x36, 0x01, 0x26, 0xc9, 0x00]);
  await receive(device, 6);
  await receive(device, 20); // MIFARE ID応答期待
  // さらなるプロトコル設定
  await send(device, [0x00, 0x00, 0xff, 0xff, 0xff, 0x06, 0x00, 0xfa, 0xd6, 0x02, 0x04, 0x01, 0x07, 0x08, 0x14, 0x00]);
  await receive(device, 6);
  await receive(device, 13);
  await send(device, [0x00, 0x00, 0xff, 0xff, 0xff, 0x06, 0x00, 0xfa, 0xd6, 0x02, 0x01, 0x00, 0x02, 0x00, 0x25, 0x00]);
  await receive(device, 6);
  await receive(device, 13);
  // MIFARE ID取得試行
  await send(device, [0x00, 0x00, 0xff, 0xff, 0xff, 0x06, 0x00, 0xfa, 0xd6, 0x04, 0x36, 0x01, 0x93, 0x20, 0x3c, 0x00]);
  await receive(device, 6);
  let idt_response = await receive(device, 22);
  // IDt (MIFARE UID) はレスポンスの16バイト目から4バイト (インデックス15から18)
  let idt = idt_response.slice(15, 19);
  if (idt.length === 4 && idt.some(v => v !== 0)) { // IDがゼロでないことを確認
    const idtStr = idt.map(v => dec2HexString(v)).join('');
    updateIDm(idtStr); // IDt処理関数を呼び出し
    return; // カード検出、処理終了
  }
  
  // --- カードが見つからなかった場合のUI更新 ---
  // DOM要素の直接操作はコールバック側に委譲するため、ここでは行わない。
  // 呼び出し元(app.jsのポーリングループ内)でタイムアウトやUI更新を制御する。
  // ポーリング継続のため、waitingMessageの表示が必要な場合があるが、
  // これは session ループの外側の initializeFelica 内で制御されるべき。
  const waitingMessageElem = document.getElementById('waiting'); // UI状態更新はapp.jsが担うべきだが、ポーリング中の表示のため暫定的に残す
  if(waitingMessageElem) waitingMessageElem.style.display = 'block';
  const idmMessageElem = document.getElementById('idm');
  if(idmMessageElem) idmMessageElem.style.display = 'none';
};

// --- RC-S300特有のUSB通信関数 ---
/**
 * @summary RC-S300デバイスにデータを送信します。
 * @description RC-S300特有のヘッダーを付加してデータを送信します。
 * @async
 * @param {USBDevice} device - WebUSBデバイスオブジェクト。
 * @param {Array<number>} data - 送信するコマンドデータのバイト配列。
 * @returns {Promise<void>} データ送信完了後に解決されるPromise。
 * @sideEffects `device.transferOut` を呼び出し、RC-S300用のヘッダーを付加したデータを送信します。送信後、50ms待機します。グローバル変数 `seqNumber` をインクリメントします。
 */
const send300 = async (device, data) => {
  let argData = new Uint8Array(data);
  const dataLen = argData.length;
  const SLOTNUMBER = 0x00;
  let uint8a = new Uint8Array(10 + dataLen);

  uint8a[0] = 0x6b;                // ヘッダー作成
  uint8a[1] = 255 & dataLen;       // length をリトルエンディアン
  uint8a[2] = dataLen >> 8 & 255;
  uint8a[3] = dataLen >> 16 & 255;
  uint8a[4] = dataLen >> 24 & 255;
  uint8a[5] = SLOTNUMBER;          // タイムスロット番号
  uint8a[6] = ++seqNumber;         // 認識番号

  0 != dataLen && uint8a.set(argData, 10); // コマンド追加
  // console.log("Felica.js (S300) > SEND:", Array.from(uint8a).map(v => dec2HexString(v)));
  await device.transferOut(deviceEp.out, uint8a);
  await sleep(50);
};

/**
 * @summary RC-S300カードリーダーとの間でFeliCa/MIFAREカードのポーリングとID取得を行う通信セッションを処理します。
 * @description この関数は、RC-S300特有のコマンド（`send300`を使用）を用いて、デバイスの初期設定、
 * プロトコルタイプ（FeliCa/Type-A）の切り替え、カードポーリング、ID取得の一連のシーケンスを実行します。
 * FeliCaカードまたはMIFAREカードが検出されると、そのIDM/UIDを `updateIDm` 関数経由で通知します。
 * @async
 * @param {USBDevice} device - WebUSBデバイスオブジェクト (RC-S300)。
 * @returns {Promise<void>} カードが検出されIDMが通知された場合、または一連のポーリングが完了した場合に解決されるPromise。
 * @sideEffects `send300` (実体は `send` が置き換えられる) および `receive` 関数を複数回呼び出してデバイスと通信します。
 */
const session300 = async (device) => {
  const len = 50; // 受信バッファ長

  // --- RC-S300 初期化シーケンス ---
  // ファームウェアバージョン取得
  await send(device, [0xFF, 0x56, 0x00, 0x00]);
  await receive(device, len);
  // 透明モード終了
  await send(device, [0xFF, 0x50, 0x00, 0x00, 0x02, 0x82, 0x00, 0x00]);
  await receive(device, len);
  // 透明モード開始
  await send(device, [0xFF, 0x50, 0x00, 0x00, 0x02, 0x81, 0x00, 0x00]);
  await receive(device, len);
  // RF電界OFF
  await send(device, [0xFF, 0x50, 0x00, 0x00, 0x02, 0x83, 0x00, 0x00]);
  await receive(device, len);
  // RF電界ON
  await send(device, [0xFF, 0x50, 0x00, 0x00, 0x02, 0x84, 0x00, 0x00]);
  await receive(device, len);

  // --- FeliCaカードポーリング ---
  // プロトコルタイプをFeliCa (Type F) に設定
  await send(device, [0xff, 0x50, 0x00, 0x02, 0x04, 0x8f, 0x02, 0x03, 0x00, 0x00]);
  await receive(device, len);
  // FeliCaカードポーリングコマンド
  await send(device, [0xFF, 0x50, 0x00, 0x01, 0x00, 0x00, 0x11, 0x5F, 0x46, 0x04, 0xA0, 0x86, 0x01, 0x00, 0x95, 0x82, 0x00, 0x06, 0x06, 0x00, 0xFF, 0xFF, 0x01, 0x00, 0x00, 0x00, 0x00]);
  const poling_res_f = await receive(device, len);
  // RC-S300のFeliCaポーリング応答は複雑。応答の特定バイト(例: インデックス25がカード枚数)でカード検出を判断
  if (poling_res_f.length == 46 && poling_res_f[25] === 0x01) {
    // IDmは応答の27バイト目から8バイト (インデックス26から33)
    const idm_val = poling_res_f.slice(26, 34).map(v => dec2HexString(v));
    const idmStr = idm_val.join('');
    updateIDm(idmStr); // IDm処理関数を呼び出し
    return; // カード検出、処理終了
  }

  // --- MIFAREカードポーリング (FeliCaが見つからなかった場合) ---
  // プロトコルタイプをType A (MIFAREなど) に設定
  await send(device, [0xff, 0x50, 0x00, 0x02, 0x04, 0x8f, 0x02, 0x00, 0x03, 0x00]);
  await receive(device, len);
  // Type AカードのUID取得コマンド (Get Data - UID)
  await send(device, [0xff, 0xCA, 0x00, 0x00]);
  const poling_res_a = await receive(device, len);
  // MIFARE UID応答の確認 (例: UID 4バイト + ステータスワード 90 00)
  // 応答構造とUIDの位置はデバイス仕様に依存するため、正確なオフセットと長さが必要
  // ここでは仮のオフセットと長さで処理
  const uidStartIndex = 10; // 仮のUID開始インデックス
  const uidLength = 4; // 仮のUID長 (例: MIFARE Classic)
  if (poling_res_a.length >= (uidStartIndex + uidLength + 2) &&
      poling_res_a[poling_res_a.length - 2] === 0x90 &&
      poling_res_a[poling_res_a.length - 1] === 0x00) {
    const id_val = poling_res_a.slice(uidStartIndex, uidStartIndex + uidLength).map(v => dec2HexString(v));
    const idStr = id_val.join('');
    updateIDm(idStr); // IDt処理関数を呼び出し
    return; // カード検出、処理終了
  }
  
  // --- カードが見つからなかった場合のUI更新 ---
  const waitingMessageElem = document.getElementById('waiting'); // UI状態更新はapp.jsが担うべきだが、ポーリング中の表示のため暫定的に残す
  if(waitingMessageElem) waitingMessageElem.style.display = 'block';
  const idmMessageElem = document.getElementById('idm');
  if(idmMessageElem) idmMessageElem.style.display = 'none';
};

// --- アプリケーション連携インターフェース ---
/**
 * @summary カードが読み取られた際に呼び出されるコールバック関数を設定します。
 * @param {(idm: string) => void} callback - カードのIDMを引数として受け取るコールバック関数。
 */
export function setCardReadCallback(callback) {
    cardReadCallback = callback;
}

/**
 * @summary 新しく読み取られたIDMを処理し、登録されたコールバック関数を呼び出します。
 * @description 読み取り音を再生し、IDMが有効（空でなく、前回と異なる）であればコールバックを実行します。
 * @param {string} idm - カードリーダーから読み取られたIDM（16進数文字列）。
 * @sideEffects 音声再生: `read_sound` の音声を再生（カード読み取り成功時の即時フィードバック）。
 * @sideEffects グローバル変数変更: `beforeIdm` の値を更新。
 * @sideEffects 登録されていれば `cardReadCallback` を呼び出します。
 */
const updateIDm = (idm) => {
  // カード読み取り成功時の即時フィードバックとして音声を再生
  // IDMが有効かチェック (null, undefined, 空文字列でなく、一定の長さがあるか)
  // FeliCa IDMは16文字(8バイト)、MIFARE UIDは通常8文字(4バイト)または14文字(7バイト)。
  // ここでは最小の有効な長さとして8文字（16進で4バイト分）を仮定。
  if (!idm || typeof idm !== 'string' || idm.length < 8) {
    // console.debug("updateIDm: Invalid or too short IDM received, or not a string. Skipping. IDM:", idm);
    return;
  }

  // カード読み取り音を再生 (readSound が initializeFelica で初期化されている前提)
  if (readSound) {
    readSound.currentTime = 0;
    readSound.muted = false;
    readSound.play().catch(e => console.error("Error playing read_sound:", e));
  } else {
    console.warn("readSound element not initialized in felica.js updateIDm");
  }

  // 前回と同じIDMでなければ処理 (連続読み取り防止)
  if (idm !== beforeIdm) {
    // console.log("updateIDm: New IDm received:", idm);
    beforeIdm = idm; // 今回処理するIDMとして記憶

    if (cardReadCallback) {
      cardReadCallback(idm);
    } else {
      console.warn("updateIDm: Card read callback is not set.");
    }
  } else {
    // console.debug("updateIDm: Duplicate IDm received, skipping callback:", idm);
  }
};

// --- 初期化関数 ---
/**
 * @summary FeliCa/NFCカードリーダーの初期化とポーリングループを開始します。
 * @description WebUSB APIを使用してFeliCa/NFCカードリーダーに接続し、設定を行います。
 * 接続成功後、無限ループで `session` (または `session300`) 関数を呼び出し、カードのポーリングを開始します。
 * エラー発生時にはアラートを表示し、関連するUIをリセットします。
 * この関数は `app.js` から呼び出されることを想定しています。
 * @export
 * @async
 * @sideEffects DOM操作: `startButton`, `waitingMessage`, `idmMessage` の表示状態を変更します。
 *              これらのDOM要素はHTMLに存在することが前提です。
 * @sideEffects グローバル変数変更: `deviceModel`, `send`, `session`, `deviceEp` を接続デバイスに応じて設定・変更する可能性があります。
 * @throws エラーが発生した場合、コンソールにエラーを出力し、アラートを表示後、再度エラーをスローする可能性があります。
 */
export async function initializeFelica() {
  // DOM要素は、この初期化関数が呼び出された時点で存在することを前提とする
  const startButton = document.getElementById('start'); 
  const idmMessage = document.getElementById('idm');     // app.js がUIを制御するため、ここでの直接操作は最小限に
  const waitingMessage = document.getElementById('waiting'); // 同上
  readSound = document.getElementById('read_sound'); // readSoundを初期化

  if (!startButton) {
    console.error("Felica.js: startButton not found. Felica initialization cannot proceed.");
    return;
  }
  // startButton が存在する場合のみイベントリスナーを設定
  startButton.addEventListener('click', async () => {
    let device;
    try {
      console.log("Felica.js: Attempting to connect to USB device via WebUSB", navigator.usb);
    // ペアリング済みの対応デバイスが1つだったら、自動選択にする
    let pearedDevices = await navigator.usb.getDevices();
    pearedDevices = pearedDevices.filter(d => deviceFilters.map(p => p.productId).includes(d.productId));
    // 自動選択 or 選択画面
    device = pearedDevices.length == 1 ? pearedDevices[0] : await navigator.usb.requestDevice({ filters: deviceFilters });
    deviceModel = deviceModelList[device.productId];

    // デバイスモデルに応じてsend/session関数を切り替える
    if (deviceModel == 300) {
      console.log("Felica.js: RC-S300 detected. Using S300 specific functions.");
      send = send300; 
      session = session300;
    } else {
      console.log("Felica.js: RC-S380 (or compatible) detected.");
      // send と session はデフォルトで RC-S380 用なので、再代入は不要
    }

    console.log("Felica.js: Opening device...");
    await device.open();
    console.log("Felica.js: Device opened:", device);
  } catch (e) {
    console.error("Felica.js: Error during device selection/opening:", e);
    alert("NFCリーダーの接続に失敗しました: " + e.message); // よりユーザーフレンドリーなエラー表示
    return; // エラー時は以降の処理を実行しない
  }
  try {
    console.log("Felica.js: Selecting configuration...");
    await device.selectConfiguration(1);
    console.log("Felica.js: Claiming interface...");
    const interfaceNumber = device.configuration.interfaces.filter(v => v.alternate.interfaceClass == 255)[0].interfaceNumber;
    await device.claimInterface(interfaceNumber);
    const currentInterface = device.configuration.interfaces.find(iface => iface.interfaceNumber === interfaceNumber);
    deviceEp = {
      in: currentInterface.alternate.endpoints.filter(e => e.direction == 'in')[0].endpointNumber,
      out: currentInterface.alternate.endpoints.filter(e => e.direction == 'out')[0].endpointNumber,
    };
    
    // UI更新は app.js に委ねる (例: ui.showWaitingState())
    if(startButton) startButton.style.display = 'none';
    if(waitingMessage) waitingMessage.style.display = 'block'; // ポーリング開始をユーザーに通知
    if(idmMessage) idmMessage.style.display = 'none';

    console.log("Felica.js: Starting polling loop...");
    while (true) { // 無限ポーリングループ
      if (!device.opened) { // デバイスが何らかの理由で閉じた場合の安全策
        console.warn("Felica.js: Device is no longer open. Stopping poll loop.");
        break;
      }
      await session(device); // カードセッション処理（ポーリング含む）
      await sleep(200); // ポーリング間隔（適宜調整）
    }

  } catch (e) {
    console.error("Felica.js: Error during USB communication/session:", e);
    alert("NFCリーダーとの通信中にエラーが発生しました: " + e.message);
    try {
      if (device && device.opened) device.close();
    } catch (e_close) {
      console.error("Felica.js: Error closing device:", e_close);
    }
    // UIリセットは app.js に委ねる (例: ui.showDisconnectedState())
    if(startButton) startButton.style.display = 'block';
    if(waitingMessage) waitingMessage.style.display = 'none';
    if(idmMessage) idmMessage.style.display = 'none';
  }
  });
}