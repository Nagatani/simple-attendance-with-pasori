// UI操作関連の関数

// DOM要素の取得 (append.jsと重複するものはコメントアウト、必要に応じてui.js内で直接取得)
// let inputIdm = document.getElementById('input_idm'); // append.jsで引き続き使用
// let inputStudntId = document.getElementById('input_student_id'); // append.jsで引き続き使用、またはダイアログ表示関数内で取得
let favDialog = document.getElementById('favDialog');
let attendedList = document.getElementById('attendedList');
let hedding1 = document.getElementById('hedding1');
let forgotCardDialog = document.getElementById('forgotCardDialog');
let forgotCardDialogMessage = document.getElementById('forgotCardDialogMessage');
// const attendSound = document.getElementById('attend_sound'); // addAttend内で取得

/**
 * 指定された学籍番号の出席情報を画面のリストに追加し、ヘッダーメッセージを更新します。
 * オプションで出席音を再生します。
 * この関数は画面表示のみを担当し、既に出席済みかどうかのチェックや学生リスト(students配列)の管理は呼び出し元で行います。
 * @param {string} student_id 表示する学籍番号
 * @param {boolean} playsound 出席音を再生するかどうか
 */
const uiAddAttendToList = (student_id, playsound) => {
  if (playsound) {
    const sound = document.getElementById('attend_sound'); // 音声要素はその都度取得
    if (sound) {
      sound.currentTime = 0;
      sound.muted = false;
      sound.play();
    }
  }

  let label = document.createElement('button');
  label.classList.add('uk-button');
  label.classList.add('uk-button-default');
  label.textContent = student_id;
  attendedList.insertBefore(label, attendedList.firstChild);

  hedding1.textContent = `出席: ${student_id}`;
  // inputIdm.value = ''; // inputIdmはappend.jsで操作
};

/**
 * ヘッダーに出席済みであることを示すメッセージを表示します。
 * @param {string} student_id 学籍番号
 */
const showAlreadyAttendedMessage = (student_id) => {
  hedding1.textContent = `出席済: ${student_id}`;
  // inputIdm.value = ''; // inputIdmはappend.jsで操作
};

/**
 * 出席者リストの表示を全てクリアします。
 */
const clearAttendedListDisplay = () => {
  while (attendedList.firstChild) {
    attendedList.removeChild(attendedList.firstChild);
  }
};

/**
 * ヘッダーメッセージを初期状態（空）に戻します。
 */
const resetHeadingMessage = () => {
  hedding1.textContent = ``;
};

/**
 * 新規登録エラーダイアログを表示し、学籍番号入力欄にフォーカスします。
 * favDialog（出席登録時のエラーダイアログ）を使用します。
 */
const showRegisterErrorDialogAndFocus = () => {
  favDialog.showModal();
  const inputStudntId = document.getElementById('input_student_id');
  if (inputStudntId) {
    inputStudntId.focus();
  }
};

/**
 * 新規登録成功後、ダイアログを閉じ、学籍番号入力欄をクリアします。
 * favDialog（出席登録時のエラーダイアログ）を使用します。
 */
const closeRegisterDialogAndClearStudentId = () => {
  favDialog.close();
  const inputStudntId = document.getElementById('input_student_id');
  if (inputStudntId) {
    inputStudntId.value = '';
  }
};

/**
 * 新規登録処理中のエラー時に、学籍番号入力欄にフォーカスします。
 * favDialog（出席登録時のエラーダイアログ）内のinputStudntIdを対象とします。
 */
const focusStudentIdInRegisterDialog = () => {
  const inputStudntId = document.getElementById('input_student_id');
  if (inputStudntId) {
    inputStudntId.focus();
  }
};


/**
 * カード忘れダイアログを表示します。
 */
const showForgotCardDialog = () => {
  forgotCardDialog.showModal();
};

/**
 * カード忘れ登録成功後、ダイアログを閉じ、学籍番号入力欄をクリアします。
 */
const closeForgotCardDialogAndClearStudentId = () => {
  forgotCardDialog.close();
  const inputForgotStudntId = document.getElementById('input_forgot_student_id');
  if (inputForgotStudntId) {
    inputForgotStudntId.value = '';
  }
};

/**
 * カード忘れ登録エラー時、ダイアログにメッセージを表示し、学籍番号入力欄にフォーカスします。
 * @param {string} message 表示するエラーメッセージ
 */
const showForgotCardErrorMessageAndFocus = (message) => {
  forgotCardDialogMessage.textContent = message;
  const inputForgotStudntId = document.getElementById('input_forgot_student_id');
  if (inputForgotStudntId) {
    inputForgotStudntId.focus();
  }
};

/**
 * IDm入力フィールドの値をクリアします。
 * felica.js からの呼び出しを想定しています。
 */
const clearIdmInput = () => {
    const inputIdm = document.getElementById('input_idm'); // felica.jsからは直接操作できないためここで取得
    if (inputIdm) {
        inputIdm.value = '';
    }
};

/**
 * FeliCa/MIFAREカード読み取り時にIDMとメッセージを表示エリアに表示します。
 * この関数は felica.js から呼び出されることを想定しています。
 * @param {string} idOrMessage 表示するIDまたはメッセージ
 * @param {boolean} isWaiting trueの場合「Waiting...」、falseの場合ID/メッセージを表示
 */
const displayFelicaMessage = (idOrMessage, isWaiting) => {
  const idmDisplay = document.getElementById('idm'); // felica.jsから直接操作できないためここで取得
  const waitingDisplay = document.getElementById('waiting'); // felica.jsから直接操作できないためここで取得

  if (isWaiting) {
    if (idmDisplay) idmDisplay.style.display = 'none';
    if (waitingDisplay) waitingDisplay.style.display = 'block';
  } else {
    if (idmDisplay) {
      idmDisplay.innerText = idOrMessage;
      idmDisplay.style.display = 'block';
    }
    if (waitingDisplay) waitingDisplay.style.display = 'none';
  }
};

/**
 * FeliCaリーダーの開始ボタンを非表示にし、待機メッセージを表示します。
 * この関数は felica.js から呼び出されることを想定しています。
 */
const hideStartButtonAndShowWaiting = () => {
  const startButton = document.getElementById('start');
  const waitingMessage = document.getElementById('waiting');
  if (startButton) startButton.style.display = 'none';
  if (waitingMessage) waitingMessage.style.display = 'block';
};

/**
 * FeliCaリーダーの開始ボタンを表示し、待機メッセージとIDMメッセージを非表示にします。
 * この関数は felica.js でエラー発生時や初期化時に呼び出されることを想定しています。
 */
const showStartButtonAndHideMessages = () => {
  const startButton = document.getElementById('start');
  const waitingMessage = document.getElementById('waiting');
  const idmMessage = document.getElementById('idm');
  if (startButton) startButton.style.display = 'block';
  if (waitingMessage) waitingMessage.style.display = 'none';
  if (idmMessage) idmMessage.style.display = 'none';
};

/**
 * FeliCaカード読み取り成功時の効果音を再生します。
 * この関数は felica.js から呼び出されることを想定しています。
 */
const playReadSound = () => {
  const sound = document.getElementById('read_sound');
  if (sound) {
    sound.currentTime = 0;
    sound.muted = false;
    sound.play();
  }
};
