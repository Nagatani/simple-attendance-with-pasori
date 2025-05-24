/**
 * @file イベントハンドラを管理し、初期化するモジュール
 * @version 1.0.0
 */

import * as api from './api.js';
import * as ui from './ui.js';

/**
 * @summary アプリケーションの主要なイベントハンドラを初期化します。
 * @description 以下の要素にイベントリスナーを設定します:
 *  - `ui.inputStudntId`: Enterキー押下で新規カード登録処理を実行。
 *  - `ui.forgotCardLink`: クリックでカード忘れ登録ダイアログを表示。
 *  - `ui.inputForgotStudntId`: Enterキー押下でカード忘れ登録処理を実行。
 * @sideEffects DOM要素にイベントリスナーを登録します。
 */
export function initializeEventHandlers() {
  /**
   * @listens {keypress} ui.inputStudntId - 学生証番号入力フィールドでのキー押下イベント。
   * @description Enterキーが押下され、かつ入力フィールドが空でない場合に、新規カード登録処理 `api.register` を呼び出します。
   * 登録成功後はダイアログを閉じ、出席リストを更新します。エラー時はUIに通知します。
   */
  if (ui.inputStudntId) {
    ui.inputStudntId.addEventListener('keypress', async (ev) => {
      if (ev.key === 'Enter' && ui.inputStudntId.value !== '') {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();

        const cardId = ui.inputIdm.value; // inputIdm は ui.js からエクスポートされている想定
        const studentId = ui.inputStudntId.value;
        console.log('新規登録 Enter:', cardId, studentId);
        
        try {
          const result = await api.register(cardId, studentId);
          if (result.status === 'success') {
            ui.closeNewCardDialog();
            ui.addStudentToAttendedList(result.student_id, true);
            ui.clearStudentIdInput(); // 成功したら入力欄をクリア
          } else {
            // API側でエラーメッセージをdata.messageにセットする想定
            // ui.showErrorInDialog(result.message || '登録に失敗しました。'); // 例: ダイアログ内にエラー表示するUI関数
            console.error('登録エラー:', result.message);
            ui.focusStudentIdInput(); // エラー後もフォーカスは維持
          }
        } catch (error) {
          console.error('新規登録API呼び出しエラー:', error);
          // ui.showErrorInDialog('サーバーとの通信に失敗しました。');
        }
      }
    });
  }

  /**
   * @listens {click} ui.forgotCardLink - 「カード忘れ登録」リンクのクリックイベント。
   * @description 「カード忘れ登録」ダイアログを表示します。
   */
  if (ui.forgotCardLink) {
    ui.forgotCardLink.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      
      console.log('「カード忘れ登録」リンククリック');
      ui.showForgotCardDialog();
    });
  }

  /**
   * @listens {keypress} ui.inputForgotStudntId - 「カード忘れ登録」ダイアログ内の学生証番号入力フィールドでのキー押下イベント。
   * @description Enterキーが押下され、かつ入力フィールドが空でない場合に、カード忘れ登録処理 `api.register_forgot` を呼び出します。
   * 登録成功後はダイアログを閉じ、出席リストを更新します。エラー時はUIに通知します。
   */
  if (ui.inputForgotStudntId) {
    ui.inputForgotStudntId.addEventListener('keypress', async (ev) => {
      if (ev.key === 'Enter' && ui.inputForgotStudntId.value !== '') {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();

        const studentId = ui.inputForgotStudntId.value;
        console.log('カード忘れ登録 Enter:', studentId);

        try {
          const result = await api.register_forgot(studentId);
          if (result.status === 'success') {
            ui.closeForgotCardDialog();
            ui.addStudentToAttendedList(result.student_id, false); // カード忘れなので音は鳴らさない
          } else {
            ui.updateForgotCardDialogMessage(result.message || '登録に失敗しました。');
            ui.focusForgotStudentIdInput();
          }
        } catch (error) {
          console.error('カード忘れ登録API呼び出しエラー:', error);
          ui.updateForgotCardDialogMessage('サーバーとの通信に失敗しました。');
        }
      }
    });
  }
}
