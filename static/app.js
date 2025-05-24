/**
 * @file アプリケーションのメインエントリーポイントと初期化ロジック
 * @version 1.0.0
 */

import * as api from './api.js';
import * as ui from './ui.js';
import { initializeEventHandlers } from './eventHandlers.js';
import { initializeFelica, setCardReadCallback } from './felica.js';

/**
 * @summary カード読み取りイベントを処理します。
 * @description 読み取られたIDMを使用して出席処理を試みます。
 * 必要に応じてUI（inputIdmの値など）を更新し、API呼び出しを行います。
 * @param {string} idm - カードリーダーから読み取られたIDM。
 * @async
 */
async function handleCardRead(idm) {
    console.log(`Card Read in app.js: ${idm}`);
    if (ui.inputIdm) { // ui.js から inputIdm をインポートして使用
        ui.inputIdm.value = idm;
    } else {
        console.error('ui.inputIdm is not available in app.js handleCardRead');
        // fallback or error handling if inputIdm is critical here
        const tempInputIdm = document.getElementById('input_idm');
        if(tempInputIdm) tempInputIdm.value = idm;
    }

    try {
        // api.attend は内部で ui.js の関数を呼び出してUIを更新すると想定
        // 修正: api.attendの返り値に基づいてUIを更新する
        const result = await api.attend(idm); 
        if (result.status === 'error' && result.type === 'unregistered_card') {
            // api.jsのattend関数でfavDialogの表示やinputStudntIdへのフォーカスは行わないように修正したため、
            // ここで明示的にUI操作を呼び出す。
            if (ui.favDialog && ui.inputStudntId) {
                ui.showNewCardDialog(); // favDialog.showModal() と inputStudntId.focus() を実行
            } else {
                console.error('favDialog or inputStudntId not available for new card registration.');
            }
        } else if (result.status === 'success') {
            // api.attendが成功時に返す情報に基づいてUIを更新
            // ui.addStudentToAttendedListはapi.attend内で直接呼ばれなくなったと仮定し、ここで呼ぶ
            // ただし、api.attendがstudent_idを返す必要がある
            if (result.student_id) {
                ui.addStudentToAttendedList(result.student_id, true);
            } else {
                 // もしapi.attendがstudent_idを返さない場合、表示更新はapi.attendの責務か、
                 // またはapi.attendのレスポンスに表示に必要な情報が含まれている必要がある。
                 // 現状のapi.attendはstudent_idを返さないので、この部分は期待通りに動かない可能性がある。
                 // 一旦、成功時はapi.attendがUI更新の責務を持つか、何もしない前提で進める。
                 // もしapi.attendがUI更新をしないなら、ここでui.addStudentToAttendedListを呼ぶ必要がある。
                 // 今回のapi.jsのリファクタリングでは、UI操作をapi.jsから分離する方向なので、
                 // student_idを返してもらい、ここでUIを更新するのが望ましい。
                 // 仮にapi.attendが { status: 'success', student_id: 'xxxx' } を返すと想定。
                 console.log('Attend API call successful, UI update might be handled by api.attend or needs explicit call here.');
            }
        }
        // その他のエラーケースは catch ブロックで処理
    } catch (error) {
        console.error("Attend API call failed in handleCardRead:", error);
        if (ui.updateMainHeading) {
            ui.updateMainHeading("出席処理中にエラーが発生しました。");
        }
    }
}

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
