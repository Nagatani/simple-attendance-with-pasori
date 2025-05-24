/**
 * @file UI操作とDOM要素の管理を担当する関数群
 * @version 1.0.0
 */

/** @type {HTMLInputElement} カードID表示/入力要素 (Felicaから読み取ったIDMがセットされる) */
export const inputIdm = document.getElementById('input_idm');
/** @type {HTMLInputElement} 新規登録用学籍番号入力要素 */
export const inputStudntId = document.getElementById('input_student_id');
/** @type {HTMLDialogElement} 新規カード登録/エラー表示用ダイアログ */
export const favDialog = document.getElementById('favDialog');
/** @type {HTMLElement} 出席者リスト表示エリア */
export const attendedList = document.getElementById('attendedList');
/** @type {HTMLElement} メイン見出しエリア (「出席: xxx」などを表示) */
export const hedding1 = document.getElementById('hedding1');
/** @type {HTMLButtonElement} 「カード忘れ登録」ボタン */
export const forgotCardLink = document.getElementById('forgotCard');
/** @type {HTMLDialogElement} カード忘れ登録用ダイアログ */
export const forgotCardDialog = document.getElementById('forgotCardDialog');
/** @type {HTMLElement} カード忘れ登録ダイアログ内メッセージ表示エリア */
export const forgotCardDialogMessage = document.getElementById('forgotCardDialogMessage');
/** @type {HTMLInputElement} カード忘れ登録用学籍番号入力要素 */
export const inputForgotStudntId = document.getElementById('input_forgot_student_id');
/** @type {HTMLAudioElement} カード読み取り時サウンド要素 */
export const readSound = document.getElementById('read_sound');
/** @type {HTMLAudioElement} 出席登録成功時サウンド要素 */
export const attendSound = document.getElementById('attend_sound');

/** @type {Array<string>} 表示済みの学生IDを保持する配列。重複表示を防ぐために使用。 */
let students = [];

/**
 * @summary 指定されたタイプのサウンドを再生します。
 * @param {'read' | 'attend'} type - 再生するサウンドのタイプ ("read" または "attend")。
 * @sideEffects 指定されたタイプのサウンドを再生します。
 */
export function playSound(type) {
  const sound = type === 'read' ? readSound : attendSound;
  if (sound) {
    sound.currentTime = 0;
    sound.muted = false;
    sound.play().catch(error => console.error(`Error playing ${type} sound:`, error));
  }
}

/**
 * @summary メイン見出しのテキストを更新します。
 * @param {string} message - 表示するメッセージ。
 * @sideEffects `hedding1` 要素のテキストコンテンツを更新します。
 */
export function updateMainHeading(message) {
  if (hedding1) {
    hedding1.textContent = message;
  }
}

/**
 * @summary 出席者リストに指定された学生IDを追加し、関連情報を画面に表示します。
 * @description 指定された学生IDが出席済みでない場合、出席者リストの先頭にボタンとして追加し、
 * ヘッディングに出席情報を表示します。必要に応じて出席音を再生します。
 * @param {string} student_id - 表示する学生の学生証番号。
 * @param {boolean} shouldPlaySound - trueの場合、出席音を再生します。
 * @sideEffects DOM操作: `attendedList` に出席者ボタンを追加。`inputIdm` の値をクリア。
 * @sideEffects グローバル変数変更: `students` 配列に `student_id` を追加。
 * @sideEffects `updateMainHeading` および `playSound` を呼び出します。
 */
export function addStudentToAttendedList(student_id, shouldPlaySound) {
  if (shouldPlaySound) {
    playSound('attend');
  }

  if (students.includes(student_id)) {
    updateMainHeading(`出席済: ${student_id}`);
    if (inputIdm) inputIdm.value = ''; // カードID入力欄をクリア
    return;
  }

  if (attendedList) {
    let label = document.createElement('button');
    label.classList.add('uk-button'); // UIkitのクラスは当面残す
    label.classList.add('uk-button-default');
    label.textContent = student_id;
    attendedList.insertBefore(label, attendedList.firstChild); // リストの先頭に追加
  }
  
  updateMainHeading(`出席: ${student_id}`);
  students.push(student_id);
  if (inputIdm) inputIdm.value = ''; // カードID入力欄をクリア
}

/**
 * @summary サーバーから取得した出席情報に基づいて出席者リストを再描画します。
 * @param {Array<Array<string>>} attendedDataArray - 出席者データの配列。各要素は [timestamp, student_id] の形式を想定。
 * @sideEffects DOM操作: `attendedList` の内容をクリアし、取得した出席者で再構築。
 * @sideEffects グローバル変数変更: `students` 配列をクリアし、リストに追加された学生IDで更新。
 * @sideEffects `addStudentToAttendedList` を内部で呼び出します。
 */
export function renderAttendedList(attendedDataArray) {
  students = []; // 表示済み学生リストをクリア
  if (attendedList) {
    while (attendedList.firstChild) {
      attendedList.removeChild(attendedList.firstChild);
    }
  }

  if (Array.isArray(attendedDataArray)) {
    attendedDataArray.forEach(element => {
      if (element && element.length >= 2) {
        addStudentToAttendedList(element[1], false); // 既存の出席情報なので音は鳴らさない
      }
    });
  }
  updateMainHeading(``); // 初期化時はヘッディングをクリア
}

/**
 * @summary 新規カード登録ダイアログを表示し、学籍番号入力フィールドにフォーカスします。
 * @sideEffects `favDialog` を表示し、`inputStudntId` にフォーカスします。
 */
export function showNewCardDialog() {
  if (favDialog) favDialog.showModal();
  if (inputStudntId) inputStudntId.focus();
}

/**
 * @summary 新規カード登録ダイアログを閉じ、学籍番号入力フィールドをクリアします。
 * @sideEffects `favDialog` を閉じ、`inputStudntId` の値をクリアします。
 */
export function closeNewCardDialog() {
  if (favDialog) favDialog.close();
  if (inputStudntId) inputStudntId.value = '';
}

/**
 * @summary カード忘れ登録ダイアログを表示し、学籍番号入力フィールドにフォーカスします。
 * @sideEffects `forgotCardDialog` を表示し、`inputForgotStudntId` にフォーカスします。
 */
export function showForgotCardDialog() {
  if (forgotCardDialog) forgotCardDialog.showModal();
  if (inputForgotStudntId) inputForgotStudntId.focus();
}

/**
 * @summary カード忘れ登録ダイアログを閉じ、学籍番号入力フィールドをクリアし、メッセージをデフォルトに戻します。
 * @sideEffects `forgotCardDialog` を閉じ、`inputForgotStudntId` の値をクリアし、`forgotCardDialogMessage` のテキストを更新します。
 */
export function closeForgotCardDialog() {
  if (forgotCardDialog) forgotCardDialog.close();
  if (inputForgotStudntId) inputForgotStudntId.value = '';
  if (forgotCardDialogMessage) forgotCardDialogMessage.textContent = '学籍番号を入力してEnterKeyを押下してください。'; // メッセージをデフォルトに戻す
}

/**
 * @summary カード忘れ登録ダイアログ内のメッセージを更新します。
 * @param {string} message - 表示するメッセージ。
 * @sideEffects `forgotCardDialogMessage` 要素のテキストコンテンツを更新します。
 */
export function updateForgotCardDialogMessage(message) {
  if (forgotCardDialogMessage) {
    forgotCardDialogMessage.textContent = message;
  }
}

/**
 * @summary 新規登録用学籍番号入力フィールドにフォーカスします。
 * @sideEffects `inputStudntId` にフォーカスします。
 */
export function focusStudentIdInput() {
  if (inputStudntId) inputStudntId.focus();
}

/**
 * @summary 新規登録用学籍番号入力フィールドをクリアします。
 * @sideEffects `inputStudntId` の値をクリアします。
 */
export function clearStudentIdInput() {
  if (inputStudntId) inputStudntId.value = '';
}

/**
 * @summary カード忘れ登録用学籍番号入力フィールドにフォーカスします。
 * @sideEffects `inputForgotStudntId` にフォーカスします。
 */
export function focusForgotStudentIdInput() {
  if (inputForgotStudntId) inputForgotStudntId.focus();
}

/**
 * @summary カード忘れ登録用学籍番号入力フィールドをクリアします。
 * @sideEffects `inputForgotStudntId` の値をクリアします。
 */
export function clearForgotStudentIdInput() {
  if (inputForgotStudntId) inputForgotStudntId.value = '';
}
