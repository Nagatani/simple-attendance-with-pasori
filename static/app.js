/**
 * @file アプリケーションのメインエントリーポイントと初期化ロジック
 * @version 1.0.0
 */

import * as api from './api.js';
import * as ui from './ui.js';
import { initializeEventHandlers } from './eventHandlers.js';
import { initializeFelica, setCardReadCallback } from './felica.js';
// (他の必要なインポートも同様)

/**
 * @summary カードリーダーから読み取られたIDMを処理するコールバック関数。
 * @description api.attend を呼び出し、その結果に基づいてUIを更新する。
 *              未登録カードの場合は登録ダイアログを表示し、
 *              登録成功/既出席の場合は出席者リストを更新しメッセージを表示する。
 * @async
 * @param {string} idm - 読み取られたカードIDM。
 * @returns {void}
 */
async function handleCardRead(idm) {
  console.log(`app.handleCardRead: Received IDM = ${idm}`);
  
  // ui.inputIdm にIDMをセット (ダイアログ表示時に参照されるため)
  // ui.jsがDOM要素を正しくエクスポートし、ここでインポートされていれば利用可能
  if (ui.inputIdm && typeof ui.inputIdm.value !== 'undefined') {
    ui.inputIdm.value = idm;
  } else {
    console.error("app.handleCardRead: ui.inputIdm is not available or not an input element!");
    // 緊急フォールバックとして直接DOM操作を試みるが、これはモジュール設計上は非推奨
    const tempInputIdm = document.getElementById('input_idm');
    if (tempInputIdm) {
        tempInputIdm.value = idm;
    }
  }

  try {
    const result = await api.attend(idm);
    console.log("app.handleCardRead: api.attend result:", result);

    switch (result.status) {
      case 'success':
        if (ui.updateMainHeading) ui.updateMainHeading(result.message || `出席: ${result.studentId}`);
        if (ui.addStudentToAttendedList) ui.addStudentToAttendedList(result.studentId, true); // trueでサウンド再生
        break;
      case 'unregistered_card':
        if (ui.updateMainHeading) ui.updateMainHeading(result.message || "このカードは未登録です。学籍番号を入力してください。");
        if (ui.showNewCardDialog) ui.showNewCardDialog(); 
        break;
      case 'already_attended':
        if (ui.updateMainHeading) ui.updateMainHeading(result.message || `出席済: ${result.studentId}`);
        // リストへの追加は addStudentToAttendedList 内の重複チェックに任せる
        if (ui.addStudentToAttendedList) ui.addStudentToAttendedList(result.studentId, false); // サウンドなしでリスト更新試行
        break;
      case 'error':
        if (ui.updateMainHeading) ui.updateMainHeading(result.message || "エラーが発生しました。");
        console.error("app.handleCardRead: API error:", result.message, result.rawData);
        break;
      case 'network_error':
        if (ui.updateMainHeading) ui.updateMainHeading(result.message || "ネットワークエラーが発生しました。");
        console.error("app.handleCardRead: Network error:", result.message);
        break;
      default:
        if (ui.updateMainHeading) ui.updateMainHeading("不明な応答です。");
        console.warn("app.handleCardRead: Unknown status from api.attend:", result);
    }
  } catch (error) {
    // api.attend自体が例外を投げた場合など
    console.error("app.handleCardRead: Critical error calling api.attend or processing result:", error);
    if (ui.updateMainHeading) ui.updateMainHeading("致命的なエラーが発生しました。");
  }
}

// `initializeApp` 関数内で `setCardReadCallback(handleCardRead);` が呼ばれていることを確認してください。
// これは前回のモジュール分割ステップで実施済みのはずです。
// また、`handleCardRead` が `setCardReadCallback` より前に定義されていることを確認してください。

/**
 * @summary アプリケーションを初期化します。
 * @description 初期出席データを取得してUIに表示し、イベントハンドラを登録します。
 * @async
 */
async function initializeApp() {
    try {
        const attendedData = await api.getAttendedStudents();
        if (attendedData) {
            ui.renderAttendedList(attendedData);
        }
    } catch (error) {
        console.error("Failed to load initial attendance data:", error);
        ui.updateMainHeading("出席データの読込に失敗しました。");
    }
    initializeEventHandlers();
    setCardReadCallback(handleCardRead); // コールバックを設定
    initializeFelica(); // Felicaリーダーの初期化を開始
}

// アプリケーション初期化を実行
initializeApp();

// felica.js の updateIDm から呼び出される attend 関数はグローバルスコープに公開する必要があるか、
// または felica.js が app.js の関数を呼び出すようにリファクタリングする必要がある。
// → setCardReadCallback を使用することで、グローバルスコープへの公開は不要になった。
console.log('app.js initialized. Felica callback registered.');
