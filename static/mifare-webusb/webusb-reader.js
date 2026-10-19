// mifare-webusb / webusb-reader.js
// ------------------------------------------------------------------
// Sony PaSoRi (RC-S380 / RC-S300) を WebUSB で制御し、MIFARE Classic の
// transceiver(authenticate / readBlock) を提供するリーダー。
//
// 実装状況:
//   - デバイス接続・Type A 有効化・UID 取得:  実装済み（felica.js の実績ある
//     コマンド列を移植。DOM/音などアプリ依存は除去）。
//   - crypto1 セクタ認証 / ブロック読み取り:  ★実機未検証★。生 WebUSB
//     (Port-100) で crypto1 が可能かは確証が無いため、既定では無効にして
//     説明付きエラーを投げる。実機検証を行う際は enableUnvalidatedSectorAuth
//     を true にして、下記 SEAM 部のコマンド列を実機ログで詰める。
//
// このファイルは DOM や navigator 以外のアプリ資源に依存しない。navigator.usb
// は関数実行時にのみ参照する（Node での require 時には触れない）。
// ------------------------------------------------------------------
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    factory(module.exports, require('./mifare-classic.js'));
  } else {
    const ns = (root.MifareWebUSB = root.MifareWebUSB || {});
    factory(ns, ns);
  }
})(typeof self !== 'undefined' ? self : this, function (exports, core) {
  'use strict';

  const DEVICE_FILTERS = [
    { vendorId: 0x054c, productId: 0x06c1, deviceModel: 380 },
    { vendorId: 0x054c, productId: 0x06c3, deviceModel: 380 },
    { vendorId: 0x054c, productId: 0x0dc8, deviceModel: 300 },
    { vendorId: 0x054c, productId: 0x0dc9, deviceModel: 300 },
  ];
  const DEVICE_MODEL = { 0x06c1: 380, 0x06c3: 380, 0x0dc8: 300, 0x0dc9: 300 };

  const sleep = (msec) => new Promise((resolve) => setTimeout(resolve, msec));

  /**
   * 連続ポーリング時に「新しいカードがかざされた瞬間」だけを検出するための
   * 重複抑止ヘルパー。同じカードがリーダー上に留まっている間は再発火せず、
   * カードが離れる(UID が一定回数取れない)と状態をリセットして再読取を許す。
   * @param {Object} [opts]
   * @param {number} [opts.removalPolls=3] カード離脱と見なす連続ミス回数
   */
  const createCardDeduper = ({ removalPolls = 3 } = {}) => {
    let lastUid = null;
    let misses = 0;
    return {
      /** @returns {boolean} 新しいカードとして発火すべきなら true */
      accept(uidHex) {
        if (!uidHex) {
          if (lastUid !== null && (misses += 1) >= removalPolls) { lastUid = null; }
          return false;
        }
        misses = 0;
        if (uidHex === lastUid) { return false; }
        lastUid = uidHex;
        return true;
      },
      reset() { lastUid = null; misses = 0; },
    };
  };

  const padZero = (num, p) => ('0'.repeat(p) + num).slice(-p);
  const dec2hex = (n) => padZero((n * 1).toString(16), 2);
  const toHex = (bytes) => Array.from(bytes).map(dec2hex).join('');

  // --- 低レベル送受信 ------------------------------------------------
  const send380 = async (ep, device, data) => {
    await device.transferOut(ep.out, new Uint8Array(data));
    await sleep(50);
  };

  let seqNumber = 0;
  const send300 = async (ep, device, data) => {
    const argData = new Uint8Array(data);
    const dataLen = argData.length;
    const buf = new Uint8Array(10 + dataLen);
    buf[0] = 0x6b;
    buf[1] = 255 & dataLen;
    buf[2] = (dataLen >> 8) & 255;
    buf[3] = (dataLen >> 16) & 255;
    buf[4] = (dataLen >> 24) & 255;
    buf[5] = 0x00;            // slot
    buf[6] = ++seqNumber;     // seq
    if (dataLen !== 0) { buf.set(argData, 10); }
    await device.transferOut(ep.out, buf);
    await sleep(50);
  };

  const receive = async (ep, device, len) => {
    const data = await device.transferIn(ep.in, len);
    await sleep(10);
    return Array.from(new Uint8Array(data.data.buffer));
  };

  // --- Type A 有効化 + UID 取得 (RC-S380) ----------------------------
  const pollUid380 = async (ep, device) => {
    const s = (d) => send380(ep, device, d);
    const r = (n) => receive(ep, device, n);

    // 初期化
    await s([0x00, 0x00, 0xff, 0x00, 0xff, 0x00]);
    await s([0x00, 0x00, 0xff, 0xff, 0xff, 0x03, 0x00, 0xfd, 0xd6, 0x2a, 0x01, 0xff, 0x00]); // SetCommandType 01
    await r(6); await r(13);
    await s([0x00, 0x00, 0xff, 0xff, 0xff, 0x03, 0x00, 0xfd, 0xd6, 0x06, 0x00, 0x24, 0x00]); // SwitchRF 00
    await r(6); await r(13);

    // Type A (106kbps) 設定
    await s([0x00, 0x00, 0xff, 0xff, 0xff, 0x06, 0x00, 0xfa, 0xd6, 0x00, 0x02, 0x03, 0x0f, 0x03, 0x13, 0x00]);
    await r(6); await r(13);
    await s([0x00, 0x00, 0xff, 0xff, 0xff, 0x28, 0x00, 0xd8, 0xd6, 0x02, 0x00, 0x18, 0x01, 0x01, 0x02, 0x01, 0x03, 0x00, 0x04, 0x00, 0x05, 0x00, 0x06, 0x00, 0x07, 0x08, 0x08, 0x00, 0x09, 0x00, 0x0a, 0x00, 0x0b, 0x00, 0x0c, 0x00, 0x0e, 0x04, 0x0f, 0x00, 0x10, 0x00, 0x11, 0x00, 0x12, 0x00, 0x13, 0x06, 0x4b, 0x00]);
    await r(6); await r(13);
    await s([0x00, 0x00, 0xff, 0xff, 0xff, 0x0c, 0x00, 0xf4, 0xd6, 0x02, 0x01, 0x00, 0x02, 0x00, 0x05, 0x01, 0x00, 0x06, 0x07, 0x07, 0x0b, 0x00]);
    await r(6); await r(13);

    // REQA(0x26)
    await s([0x00, 0x00, 0xff, 0xff, 0xff, 0x05, 0x00, 0xfb, 0xd6, 0x04, 0x36, 0x01, 0x26, 0xc9, 0x00]);
    await r(6); await r(20);
    await s([0x00, 0x00, 0xff, 0xff, 0xff, 0x06, 0x00, 0xfa, 0xd6, 0x02, 0x04, 0x01, 0x07, 0x08, 0x14, 0x00]);
    await r(6); await r(13);
    await s([0x00, 0x00, 0xff, 0xff, 0xff, 0x06, 0x00, 0xfa, 0xd6, 0x02, 0x01, 0x00, 0x02, 0x00, 0x25, 0x00]);
    await r(6); await r(13);

    // anticollision (0x93 0x20)
    await s([0x00, 0x00, 0xff, 0xff, 0xff, 0x06, 0x00, 0xfa, 0xd6, 0x04, 0x36, 0x01, 0x93, 0x20, 0x3c, 0x00]);
    await r(6);
    const resp = await r(22);
    const uid = resp.slice(15, 19);
    return uid.length >= 4 ? uid.slice(0, 4) : null;
  };

  // --- Type A 有効化 + UID 取得 (RC-S300) ----------------------------
  const pollUid300 = async (ep, device) => {
    const s = (d) => send300(ep, device, d);
    const r = (n) => receive(ep, device, n);
    const len = 50;

    await s([0xff, 0x56, 0x00, 0x00]); await r(len);                        // firmware
    await s([0xff, 0x50, 0x00, 0x00, 0x02, 0x82, 0x00, 0x00]); await r(len); // end transparent
    await s([0xff, 0x50, 0x00, 0x00, 0x02, 0x81, 0x00, 0x00]); await r(len); // start transparent
    await s([0xff, 0x50, 0x00, 0x00, 0x02, 0x83, 0x00, 0x00]); await r(len); // rf off
    await s([0xff, 0x50, 0x00, 0x00, 0x02, 0x84, 0x00, 0x00]); await r(len); // rf on
    await s([0xff, 0x50, 0x00, 0x02, 0x04, 0x8f, 0x02, 0x00, 0x03, 0x00]); await r(len); // SwitchProtocolTypeA
    await s([0xff, 0xca, 0x00, 0x00]); // Get UID
    const res = await r(len);
    if (res.length >= 14) {
      const uid = res.slice(10, 14);
      if (uid.length === 4) { return uid; }
    }
    return null;
  };

  // --- crypto1 セクタ認証 / ブロック読み取り (SEAM: 実機未検証) --------
  // 下記は Load Authentication Keys -> Authentication -> Read Block の 3 段階を
  // 送る「継ぎ目」。RC-S380(Port-100)/RC-S300 で生 WebUSB からこれを行う正確な
  // コマンド列は実機とカードでの検証が前提のため、既定では無効化している。
  // 実機検証時は reader を enableUnvalidatedSectorAuth:true で生成し、ここに
  // 実機ログで確認したコマンド列を実装する。
  const unvalidatedError = () => new Error(
    '実機(WebUSB)での MIFARE Classic セクタ認証(crypto1)は未検証・未実装です。'
    + '実機検証時は createWebUsbReader({ enableUnvalidatedSectorAuth: true }) とし、'
    + 'webusb-reader.js の SEAM 部に実機ログで確認したコマンド列を実装してください。',
  );

  const authenticateSeam = async (ctx, params) => {
    void ctx; void params;
    throw unvalidatedError();
    // 実装の足がかり:
    //   1. Load Authentication Keys: 鍵をリーダーに登録
    //   2. Authentication: {keyType(0x60/0x61), block, uid} でセクタ認証
    //   3. 成功応答を確認して true を返す
  };

  const readBlockSeam = async (ctx, absBlock) => {
    void ctx; void absBlock;
    throw unvalidatedError();
    // 実装の足がかり:
    //   認証済みセクタに対し MIFARE READ (0x30 <block>) を送り 16 バイトを取得
  };

  /**
   * WebUSB MIFARE Classic リーダーを生成する。
   * @param {Object} [options]
   * @param {boolean} [options.enableUnvalidatedSectorAuth=false]
   *   true のとき SEAM 部(crypto1 認証/読み取り)を呼ぶ。既定(false)は未検証として
   *   authenticate/readBlock が明示エラーを投げる。
   * @returns {{
   *   connect: function(): Promise<number>,
   *   pollUid: function(): Promise<{uid:number[], uidHex:string}|null>,
   *   transceiver: {authenticate: function, readBlock: function},
   *   disconnect: function(): Promise<void>,
   *   deviceModel: function(): (number|null)
   * }}
   */
  const createWebUsbReader = (options = {}) => {
    const { enableUnvalidatedSectorAuth = false } = options;
    let device = null;
    let ep = { in: 0, out: 0 };
    let model = null;
    let polling = false;

    const requireNavigatorUsb = () => {
      if (typeof navigator === 'undefined' || !navigator.usb) {
        throw new Error('この環境では WebUSB(navigator.usb) が使えません。');
      }
    };

    /**
     * リーダーに接続する。
     * @param {Object} [opts]
     * @param {boolean} [opts.interactive=true]
     *   true: 許可済みが無ければ requestDevice() で選択ダイアログを出す
     *         （ユーザー操作内でのみ呼べる）。
     *   false: 許可済みデバイスだけを使い、無ければ NO_PERMITTED_DEVICE を投げる
     *         （ページ読み込み時の自動接続用。ユーザー操作不要）。
     * @returns {Promise<number|null>} 機種(380/300)
     */
    const connect = async ({ interactive = true } = {}) => {
      requireNavigatorUsb();
      const permitted = (await navigator.usb.getDevices())
        .filter((d) => DEVICE_FILTERS.map((f) => f.productId).includes(d.productId));
      if (permitted.length >= 1) {
        device = permitted[0];
      } else if (interactive) {
        device = await navigator.usb.requestDevice({ filters: DEVICE_FILTERS });
      } else {
        const err = new Error('許可済みのリーダーが見つかりません。初回はユーザー操作(クリック)で接続してください。');
        err.code = 'NO_PERMITTED_DEVICE';
        throw err;
      }
      model = DEVICE_MODEL[device.productId] || null;

      await device.open();
      await device.selectConfiguration(1);
      const iface = device.configuration.interfaces
        .filter((v) => v.alternate.interfaceClass === 255)[0];
      await device.claimInterface(iface.interfaceNumber);
      ep = {
        in: iface.alternate.endpoints.filter((e) => e.direction === 'in')[0].endpointNumber,
        out: iface.alternate.endpoints.filter((e) => e.direction === 'out')[0].endpointNumber,
      };
      return model;
    };

    const pollUid = async () => {
      if (!device) { throw new Error('connect() を先に呼んでください。'); }
      const uid = model === 300 ? await pollUid300(ep, device) : await pollUid380(ep, device);
      return uid ? { uid, uidHex: toHex(uid) } : null;
    };

    const ctx = {
      get device() { return device; },
      get ep() { return ep; },
      get model() { return model; },
      send: (data) => (model === 300 ? send300(ep, device, data) : send380(ep, device, data)),
      receive: (n) => receive(ep, device, n),
    };

    const transceiver = {
      authenticate: async (params) => {
        if (!enableUnvalidatedSectorAuth) { throw unvalidatedError(); }
        return authenticateSeam(ctx, params);
      },
      readBlock: async (absBlock) => {
        if (!enableUnvalidatedSectorAuth) { throw unvalidatedError(); }
        return readBlockSeam(ctx, absBlock);
      },
    };

    /**
     * 接続後、カードを連続ポーリングし、新しいカードがかざされるたびに
     * onCard を呼ぶ。ボタンを押さずに「かざすだけ」で読み取るための仕組み。
     * @param {function({uid:number[], uidHex:string}): (void|Promise<void>)} onCard
     * @param {Object} [opts]
     * @param {number} [opts.intervalMs=200] カード無し時の待機間隔
     * @param {number} [opts.removalPolls=3] カード離脱と見なす連続ミス回数
     * @returns {function(): void} 停止関数
     */
    const startPolling = (onCard, opts = {}) => {
      if (!device) { throw new Error('connect() を先に呼んでください。'); }
      const { intervalMs = 200, removalPolls = 3 } = opts;
      const dedupe = createCardDeduper({ removalPolls });
      polling = true;
      (async () => {
        while (polling) {
          try {
            // eslint-disable-next-line no-await-in-loop
            const polled = await pollUid();
            const uidHex = polled && polled.uidHex;
            if (dedupe.accept(uidHex)) {
              try {
                // eslint-disable-next-line no-await-in-loop
                await onCard(polled);
              } catch (e) {
                console.error('onCard でエラー:', e);
              }
            } else if (!uidHex) {
              // eslint-disable-next-line no-await-in-loop
              await sleep(intervalMs);
            }
          } catch (e) {
            console.error('ポーリング中エラー:', e);
            // eslint-disable-next-line no-await-in-loop
            await sleep(intervalMs * 2);
          }
        }
      })();
      return () => { polling = false; };
    };

    const disconnect = async () => {
      polling = false;
      if (device) {
        try { await device.close(); } catch (e) { /* noop */ }
        device = null;
      }
    };

    return { connect, pollUid, startPolling, transceiver, disconnect, deviceModel: () => model };
  };

  exports.DEVICE_FILTERS = DEVICE_FILTERS;
  exports.createWebUsbReader = createWebUsbReader;
  exports.createCardDeduper = createCardDeduper;
});
