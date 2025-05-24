/**
 * @file WebUSB経由でFeliCa/NFCカードリーダーと通信し、カードIDを取得するロジック。
 * @see {@link https://github.com/marioninc/webusb-felica} を元にしています。
 */

// --- 定数 ---
/**
 * @summary WebUSB APIで使用するデバイスフィルターのリスト。
 * @description Sony RC-S380 (PaSoRi) および RC-S300 (NFCポート-100) の Vendor ID と Product ID を定義します。
 * @type {Array<object>}
 */
const deviceFilters = [
  { vendorId: 0x054c, productId: 0x06C1, deviceModel: 380 }, // RC-S380
  { vendorId: 0x054c, productId: 0x06C3, deviceModel: 380 }, // RC-S380
  { vendorId: 0x054c, productId: 0x0dc8, deviceModel: 300 }, // RC-S300
  { vendorId: 0x054c, productId: 0x0dc9, deviceModel: 300 }, // RC-S300
];

/**
 * @summary Product ID とデバイスモデルのマッピング。
 * @type {object}
 */
const deviceModelList = {
  0x06C1: 380,
  0x06C3: 380,
  0x0dc8: 300,
  0x0dc9: 300,
};

// --- モジュールスコープ変数 ---
/** 
 * @summary 現在接続されているデバイスのモデル (380 または 300)。
 * @type {number|undefined} 
 */
let deviceModel;
/** 
 * @summary デバイスのエンドポイント情報を保持するオブジェクト。
 * @type {{in: number, out: number}} 
 */
let deviceEp = { in: 0, out: 0 };
/** 
 * @summary RC-S300で使用するシーケンス番号。
 * @type {number} 
 */
let seqNumber = 0;
/** 
 * @summary 前回読み取ったカードIDM。連続読み取り防止用。
 * @type {string} 
 */
let beforeIdm = '';
/** 
 * @summary カード読み取り音のHTMLAudioElement。
 * @type {HTMLAudioElement|null} 
 */
let readSound = null; 

// --- DOM要素への参照 (グローバルスコープで取得) ---
// これらは append.js でも参照される可能性があるため、append.js での取得を優先し、
// felica.js では直接参照しないのが望ましいが、元の構造に戻すため、ここで取得する。
// ただし、append.js との競合や初期化タイミングに注意が必要。
// モジュール化以前はグローバルスコープで暗黙的に共有されていた。
/** @type {HTMLButtonElement|null} FeliCaリーダー接続開始ボタン */
const startButton = document.getElementById('start');
/** @type {HTMLElement|null} 読み取ったIDMを表示するエリア */
const idmMessage = document.getElementById('idm');
/** @type {HTMLElement|null} カード読み取り待機中メッセージ表示エリア */
const waitingMessage = document.getElementById('waiting');
// inputIdm は append.js で定義・使用されるため、ここでは直接使用しない。

// --- ユーティリティ関数 ---
/**
 * @summary 数値を指定された桁数になるようにゼロパディングする。
 * @param {number|string} num - パディングする数値または文字列。
 * @param {number} p - パディング後の総桁数。
 * @returns {string} ゼロパディングされた文字列。
 */
const padding_zero = (num, p) => ("0".repeat(p * 1) + num).slice(-(p * 1));

/**
 * @summary 10進数を16進数文字列に変換する（2桁ゼロパディング付き）。
 * @param {number} n - 変換する10進数。
 * @returns {string} 変換された16進数文字列。
 */
const dec2HexString = (n) => padding_zero((n * 1).toString(16), 2);

/**
 * @summary 指定されたミリ秒だけ処理を待機する。
 * @async
 * @param {number} msec - 待機するミリ秒。
 * @returns {Promise<void>} 指定時間経過後に解決するPromise。
 */
const sleep = (msec) => new Promise((resolve) => setTimeout(resolve, msec));


// --- 共通USB通信関数 ---
/**
 * @summary USBデバイスからデータを受信する。
 * @async
 * @param {USBDevice} device - WebUSBデバイスオブジェクト。
 * @param {number} len - 受信するデータの期待長。
 * @returns {Promise<Array<number>>} 受信したデータを数値の配列として返す。
 * @throws エラーが発生した場合は例外を投げる。
 */
const receive = async (device, len) => {
  // console.log("<<<<<<<<<<" + len);
  const data = await device.transferIn(deviceEp.in, len);
  await sleep(10); // 受信後のウェイト

  const arr = Array.from(new Uint8Array(data.data.buffer));
  // const arr_str = arr.map((v) => dec2HexString(v));
  // console.log("Received (hex):", arr_str.join(' '));
  return arr;
};

// --- RC-S380特有のUSB通信関数 ---
/**
 * @summary RC-S380デバイスにデータを送信する。
 * @async
 * @param {USBDevice} device - WebUSBデバイスオブジェクト。
 * @param {Array<number>} data - 送信するコマンドデータ（数値の配列）。
 * @returns {Promise<void>}
 * @throws エラーが発生した場合は例外を投げる。
 */
let send = async (device, data) => { // RC-S300の場合に上書きされるため let で宣言
  let uint8a = new Uint8Array(data);
  // console.log("Sending to S380 (hex):", Array.from(uint8a).map(v => dec2HexString(v)).join(' '));
  await device.transferOut(deviceEp.out, uint8a);
  await sleep(50); // 送信後のウェイト
};

/**
 * @summary RC-S380デバイスとの通信セッション（カードポーリング）。
 * @description デバイスを初期化し、NFC-F (FeliCa) および Type A (MIFAREなど) のカードをポーリングし続ける。
 *              カードが検出されると `updateIDm` を呼び出す。
 * @async
 * @param {USBDevice} device - WebUSBデバイスオブジェクト。
 * @returns {Promise<void>} カードが読み取られた場合は関数から抜ける。読み取られない場合は内部で処理を繰り返す（実際には呼び出し元がループ）。
 * @throws エラーが発生した場合は例外を投げる。
 */
let session = async (device) => { // RC-S300の場合に上書きされるため let で宣言
  // デバイス初期化シーケンス
  await send(device, [0x00, 0x00, 0xff, 0x00, 0xff, 0x00]);
  await send(device, [0x00, 0x00, 0xff, 0xff, 0xff, 0x03, 0x00, 0xfd, 0xd6, 0x2a, 0x01, 0xff, 0x00]);
  await receive(device, 6);
  await receive(device, 13);
  await send(device, [0x00,0x00,0xff,0xff,0xff,0x03,0x00,0xfd,0xd6,0x06,0x00,0x24,0x00,]);
  await receive(device, 6);
  await receive(device, 13);
  
  // --- FeliCa (NFC-F) ポーリング ---
  await send(device, [0x00,0x00,0xff,0xff,0xff,0x06,0x00,0xfa,0xd6,0x00,0x01,0x01,0x0f,0x01,0x18,0x00,]);
  await receive(device, 6);
  await receive(device, 13);
  await send(device, [0x00,0x00,0xff,0xff,0xff,0x28,0x00,0xd8,0xd6,0x02,0x00,0x18,0x01,0x01,0x02,0x01,0x03,0x00,0x04,0x00,0x05,0x00,0x06,0x00,0x07,0x08,0x08,0x00,0x09,0x00,0x0a,0x00,0x0b,0x00,0x0c,0x00,0x0e,0x04,0x0f,0x00,0x10,0x00,0x11,0x00,0x12,0x00,0x13,0x06,0x4b,0x00,]);
  await receive(device, 6);
  await receive(device, 13);
  await send(device, [0x00,0x00,0xff,0xff,0xff,0x04,0x00,0xfc,0xd6,0x02,0x00,0x18,0x10,0x00,]);
  await receive(device, 6);
  await receive(device, 13);
  await send(device, [0x00,0x00,0xff,0xff,0xff,0x0a,0x00,0xf6,0xd6,0x04,0x6e,0x00,0x06,0x00,0xff,0xff,0x01,0x00,0xb3,0x00,]);
  await receive(device, 6);
  let res = await receive(device, 37); 
  let idm = res.slice(17, 25); 
  
  if (idm && idm.length > 0 && idm.some(value => value !== 0)) { 
    const idmStr = idm.map(v => dec2HexString(v)).join('');
    if (idmMessage) {
        idmMessage.innerText = "Felica ID: " + idmStr;
        idmMessage.style.display = 'block';
    }
    if (waitingMessage) waitingMessage.style.display = 'none';
    updateIDm(idmStr);
    return; 
  }

  // --- MIFARE (NFC-A) ポーリング ---
  await send(device, [0x00,0x00,0xff,0xff,0xff,0x03,0x00,0xfd,0xd6,0x06,0x00,0x24,0x00,]);
  await receive(device, 6);
  await receive(device, 13);
  await send(device, [0x00,0x00,0xff,0xff,0xff,0x06,0x00,0xfa,0xd6,0x00,0x02,0x03,0x0f,0x03,0x13,0x00,]); 
  await receive(device, 6);
  await receive(device, 13);
  await send(device, [0x00,0x00,0xff,0xff,0xff,0x0c,0x00,0xf4,0xd6,0x02,0x01,0x00,0x02,0x00,0x05,0x01,0x00,0x06,0x07,0x07,0x0b,0x00,]); 
  await receive(device, 6);
  await receive(device, 13);
  await send(device, [0x00,0x00,0xff,0xff,0xff,0x05,0x00,0xfb,0xd6,0x04,0x36,0x01,0x26,0xc9,0x00,]); 
  await receive(device, 6);
  res = await receive(device, 20); 
  
  await send(device, [0x00,0x00,0xff,0xff,0xff,0x06,0x00,0xfa,0xd6,0x04,0x36,0x01,0x93,0x20,0x3c,0x00,]); 
  await receive(device,6);
  res = await receive(device,22); 
  let idt = res.slice(15, 19); 

  if (idt && idt.length > 0 && idt.some(value => value !== 0)) {
    const idtStr = idt.map(v => dec2HexString(v)).join('');
    if (idmMessage) {
        idmMessage.innerText = "MIFARE ID: " + idtStr;
        idmMessage.style.display = 'block';
    }
    if (waitingMessage) waitingMessage.style.display = 'none';
    updateIDm(idtStr);
    return; 
  }

  if (idmMessage) idmMessage.style.display = 'none';
  if (waitingMessage) waitingMessage.style.display = 'block';
};


// --- RC-S300特有のUSB通信関数 ---
/**
 * @summary RC-S300デバイスにデータを送信する。
 * @description RC-S300用のヘッダーを付加してコマンドを送信する。
 * @async
 * @param {USBDevice} device - WebUSBデバイスオブジェクト。
 * @param {Array<number>} data - 送信するコマンドデータ（数値の配列）。
 * @returns {Promise<void>}
 * @throws エラーが発生した場合は例外を投げる。
 */
const send300 = async (device, data) => {
  let argData = new Uint8Array(data);
  const dataLen = argData.length;
  const SLOTNUMBER = 0x00;
  let uint8a = new Uint8Array(10 + dataLen);

  uint8a[0] = 0x6b; 
  uint8a[1] = 255 & dataLen; 
  uint8a[2] = (dataLen >> 8) & 255;
  uint8a[3] = (dataLen >> 16) & 255;
  uint8a[4] = (dataLen >> 24) & 255;
  uint8a[5] = SLOTNUMBER;
  uint8a[6] = ++seqNumber; 

  if (dataLen !== 0) uint8a.set(argData, 10); 
  
  await device.transferOut(deviceEp.out, uint8a);
  await sleep(50); 
};

/**
 * @summary RC-S300デバイスとの通信セッション（カードポーリング）。
 * @description デバイスを初期化し、FeliCa および Type A カードをポーリングし続ける。
 *              カードが検出されると `updateIDm` を呼び出す。
 * @async
 * @param {USBDevice} device - WebUSBデバイスオブジェクト。
 * @returns {Promise<void>} カードが読み取られた場合は関数から抜ける。読み取られない場合は内部で処理を繰り返す。
 * @throws エラーが発生した場合は例外を投げる。
 */
const session300 = async (device) => {
  const len = 50; 

  await send(device, [0xff, 0x56, 0x00, 0x00]); 
  await receive(device, len);
  await send(device, [0xff, 0x50, 0x00, 0x00, 0x02, 0x83, 0x00, 0x00]); 
  await receive(device, len);
  await send(device, [0xff, 0x50, 0x00, 0x00, 0x02, 0x84, 0x00, 0x00]); 
  await receive(device, len);

  // --- FeliCa (NFC-F) ポーリング ---
  await send(device, [0xff,0x50,0x00,0x02,0x04,0x8f,0x02,0x03,0x00,0x00,]); 
  await receive(device, len);
  await send(device, [0xff,0x50,0x00,0x01,0x00,0x00,0x11,0x5f,0x46,0x04,0xa0,0x86,0x01,0x00,0x95,0x82,0x00,0x06,0x06,0x00,0xff,0xff,0x01,0x00,0x00,0x00,0x00,]); 
  const poling_res_f = await receive(device, len);
  if (poling_res_f.length === 46 && poling_res_f[25] === 0x01) { 
    const idm = poling_res_f.slice(26, 34);
    if (idm.some(value => value !== 0)) {
        const idmStr = idm.map(v => dec2HexString(v)).join('');
        if (idmMessage) {
            idmMessage.innerText = "Felica IDm: " + idmStr;
            idmMessage.style.display = 'block';
        }
        if (waitingMessage) waitingMessage.style.display = 'none';
        updateIDm(idmStr);
        return;
    }
  }

  // --- MIFARE (NFC-A) ポーリング ---
  await send(device, [0xff,0x50,0x00,0x02,0x04,0x8f,0x02,0x00,0x03,0x00,]); 
  await receive(device, len);
  await send(device, [0xff, 0xca, 0x00, 0x00, 0x00]); 
  const poling_res_a = await receive(device, len);
  if (poling_res_a.length >= 6 && poling_res_a[poling_res_a.length - 2] === 0x90 && poling_res_a[poling_res_a.length - 1] === 0x00) {
    const idt = poling_res_a.slice(0, poling_res_a.length - 2); 
    if (idt.length > 0 && idt.some(value => value !== 0)) {
        const idtStr = idt.map(v => dec2HexString(v)).join('');
        if (idmMessage) {
            idmMessage.innerText = "MIFARE ID: " + idtStr;
            idmMessage.style.display = 'block';
        }
        if (waitingMessage) waitingMessage.style.display = 'none';
        updateIDm(idtStr);
        return;
    }
  }
  
  if (idmMessage) idmMessage.style.display = 'none';
  if (waitingMessage) waitingMessage.style.display = 'block';
};


// --- アプリケーション連携インターフェース ---
/**
 * @summary カードリーダーから読み取られたIDMを処理し、グローバルな`attend`関数を呼び出します。
 * @description 有効なIDM（nullや空でなく、一定以上の長さを持つ）が指定され、かつ前回処理したIDMと異なる場合にのみ処理を実行します。
 *              カード読み取り時には通知音を再生します。
 * @param {string} idm - 読み取られたカードIDM (16進文字列)。
 * @returns {void}
 * @global
 */
const updateIDm = (idm) => {
  if (!idm || typeof idm !== 'string' || idm.length < 8) {
    return;
  }

  if (readSound) { 
    readSound.currentTime = 0;
    readSound.muted = false;
    readSound.play().catch(e => console.error("Error playing read_sound:", e));
  } else {
    // console.warn("readSound element not initialized in felica.js updateIDm");
  }

  if (idm !== beforeIdm) {
    beforeIdm = idm; 

    if (typeof attend === 'function') {
      attend(idm);
    } else {
      console.error("attend function is not defined globally or not imported.");
    }
  } else {
    // console.debug("updateIDm: Duplicate IDm received, skipping call to attend:", idm);
  }
};


// --- 初期化関数 ---
/**
 * @summary FeliCaリーダーの初期化とポーリング開始を行う。
 * @description 「SETUP」ボタンのクリックイベントリスナーを登録し、クリックされると
 *              WebUSBデバイスの選択、設定、インターフェースの確保、ポーリングループの開始を行う。
 * @async
 * @returns {Promise<void>}
 * @throws エラーが発生した場合はアラートを表示し、コンソールにエラーを出力する。
 */
async function initializeFelica() {
  const localStartButton = document.getElementById('start'); 
  const localIdmMessage = document.getElementById('idm');
  const localWaitingMessage = document.getElementById('waiting');
  readSound = document.getElementById('read_sound'); 

  if (!localStartButton) {
    console.error("Start button not found. Felica initialization aborted.");
    return;
  }

  localStartButton.addEventListener('click', async () => {
    let device;
    try {
      let pairedDevices = await navigator.usb.getDevices();
      pairedDevices = pairedDevices.filter(d => deviceFilters.map(p => p.productId).includes(d.productId));
      
      if (pairedDevices.length === 1) {
        device = pairedDevices[0];
      } else {
        device = await navigator.usb.requestDevice({ filters: deviceFilters });
      }
      
      deviceModel = deviceModelList[device.productId];

      if (deviceModel === 300) {
        send = send300; 
        session = session300; 
      } else {
        // RC-S380 is default, no need to reassign send/session if they were already set to S380 versions
      }

      await device.open();

      if (device.configuration === null) { 
        await device.selectConfiguration(1);
      }

      const anInterface = device.configuration.interfaces.find(iface => 
        iface.alternates.some(alt => alt.interfaceClass === 0xff) 
      );
      if (!anInterface) {
        throw new Error("Interface with class 255 not found.");
      }
      await device.claimInterface(anInterface.interfaceNumber);

      const alternate = anInterface.alternates.find(alt => alt.interfaceClass === 0xff);
      if (!alternate || !alternate.endpoints) {
          throw new Error("Suitable alternate interface with endpoints not found.");
      }
      deviceEp.out = alternate.endpoints.find(e => e.direction === 'out').endpointNumber;
      deviceEp.in = alternate.endpoints.find(e => e.direction === 'in').endpointNumber;
      
      if (localStartButton) localStartButton.style.display = 'none';
      if (localWaitingMessage) localWaitingMessage.style.display = 'block';
      if (localIdmMessage) localIdmMessage.style.display = 'none';

      while (true) {
        if (!device.opened) {
            console.warn("Device is not opened. Exiting polling loop.");
            if (localStartButton) localStartButton.style.display = 'block';
            if (localWaitingMessage) localWaitingMessage.style.display = 'none';
            if (localIdmMessage) localIdmMessage.style.display = 'none';
            break; 
        }
        await session(device); 
        await sleep(200); 
      }

    } catch (e) {
      console.error("Error in Felica initialization or polling loop:", e);
      alert("カードリーダーの接続または処理中にエラーが発生しました: " + e.message);
      if (device && device.opened) {
        try {
          await device.close();
        } catch (close_error) {
          console.error("Error closing device:", close_error);
        }
      }
      if (localStartButton) localStartButton.style.display = 'block';
      if (localWaitingMessage) localWaitingMessage.style.display = 'none';
      if (localIdmMessage) localIdmMessage.style.display = 'none';
    }
  });
}

// --- 初期化処理の呼び出し ---
// DOMContentLoadedを待ってから初期化を実行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeFelica);
} else {
    initializeFelica();
}
