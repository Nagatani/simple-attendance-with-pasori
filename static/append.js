/**
 * @file 出席登録アプリケーションのフロントエンドロジック
 * @description Felicaカードリーダーとの連携、出席登録、新規カード登録、カード忘れ登録のUI操作とサーバー通信を担当します。
 */

/** @type {HTMLInputElement} カードID入力要素 (Felicaから読み取ったIDMがセットされる) */
let inputIdm = document.getElementById('input_idm');
/** @type {HTMLInputElement} 新規登録用学籍番号入力要素 */
let inputStudntId = document.getElementById('input_student_id');
/** @type {HTMLDialogElement} 新規カード登録/エラー表示用ダイアログ */
let favDialog = document.getElementById('favDialog');
/** @type {HTMLElement} 出席者リスト表示エリア */
let attendedList = document.getElementById('attendedList');
/** @type {HTMLElement} メイン見出しエリア (「出席: xxx」などを表示) */
let hedding1 = document.getElementById('hedding1');

/** @type {HTMLButtonElement} 「カード忘れ登録」ボタン */
let forgotCardLink = document.getElementById('forgotCard');
/** @type {HTMLDialogElement} カード忘れ登録用ダイアログ */
let forgotCardDialog = document.getElementById('forgotCardDialog');
/** @type {HTMLElement} カード忘れ登録ダイアログ内メッセージ表示エリア */
let forgotCardDialogMessage = document.getElementById('forgotCardDialogMessage');
/** @type {HTMLInputElement} カード忘れ登録用学籍番号入力要素 */
let inputForgotStudntId = document.getElementById('input_forgot_student_id');

/** @type {HTMLAudioElement} カード読み取り時サウンド要素 */
const readSound = document.getElementById('read_sound');
/** @type {HTMLAudioElement} 出席登録成功時サウンド要素 */
const attendSound = document.getElementById('attend_sound');


/** @type {Array<Array<string>>} サーバーから取得した出席情報全体を保持する配列。各要素は [timestamp, student_id, card_id] の形式。 */
let attends = [];
/** @type {Array<string>} 現在画面に表示されている出席者の学籍番号リスト。重複表示防止用。 */
let students = [];

/**
 * @summary 指定されたカードIDで出席を試みます。
 * @description '/attend' エンドポイントにPOSTリクエストを送信します。
 *              サーバーからの応答に応じて、未登録カードの場合は登録ダイアログを表示し、
 *              登録済みの場合は出席リストを更新します。
 * @param {string} card_id - 登録するFelicaカードのIDM。
 * @returns {void}
 * @sideeffects DOMの変更（ダイアログ表示、出席リスト更新、見出し更新）、音声再生。
 */
const attend = (card_id) => {
  console.log("attend func called with card_id:", card_id);
  let formData = new FormData();
  formData.append('card_id', card_id);

  fetch('/attend', { method: 'POST', body: formData })
    .then(response => {
      if (!response.ok) {
        // HTTPエラーの場合、レスポンスボディをJSONとして処理しようと試みる
        return response.json().then(errData => {
          throw new Error(errData.message || `HTTP error ${response.status}`);
        }).catch(jsonParseError => {
          // JSONパースエラー、またはresponse.json()自体が失敗した場合
          console.error("Error parsing JSON from error response or other fetch error:", jsonParseError);
          throw new Error(`HTTP error ${response.status} and failed to parse error JSON.`);
        });
      }
      return response.json();
    })
    .then(data => {
      console.log("attend response data:", data);
      if (data.status === 'error') {
        // サーバーが status: 'error' を返した場合
        // 未登録カードの場合の処理を想定
        if (data.message && data.message.toLowerCase().includes('未登録')) {
            if (inputIdm) inputIdm.value = card_id; // ダイアログにカードIDをセット
            if (favDialog) favDialog.showModal();
            if (inputStudntId) inputStudntId.focus();
        } else {
            // その他のサーバー定義エラー
            if (hedding1) hedding1.textContent = data.message || 'エラーが発生しました。';
        }
      } else if (data.student_id) {
        // 登録成功または既に出席済み
        addAttend(data.student_id, true);
        if (data.message && hedding1 && data.message.toLowerCase().includes('出席済')) {
             hedding1.textContent = data.message; // 「既に出席済みです」等のメッセージを表示
        }
      } else {
        // 予期しないレスポンス
        if (hedding1) hedding1.textContent = '不明なエラーが発生しました。';
        console.warn("Unexpected data format from /attend:", data);
      }
    })
    .catch(error => {
      console.error('Error in attend function:', error);
      if (hedding1) hedding1.textContent = error.message || '通信エラーが発生しました。';
    });
};

/**
 * @summary 新規カードと学籍番号をサーバーに登録します。
 * @description '/register' エンドポイントにPOSTリクエストを送信します。
 *              登録成功後、ダイアログを閉じて出席リストを更新します。
 * @param {string} card_id - 登録するFelicaカードのIDM。
 * @param {string} student_id - 登録する学籍番号。
 * @returns {void}
 * @sideeffects DOMの変更（ダイアログクローズ、入力フィールドクリア、出席リスト更新）。
 */
const register = (card_id, student_id) => {
  let formData = new FormData();
  formData.append('card_id', card_id);
  formData.append('student_id', student_id);

  fetch('/register', { method: 'POST', body: formData })
    .then(response => response.json())
    .then(data => {
      console.log("register response data:", data);
      if (data.status === 'error') {
        // エラーメッセージを表示する処理が必要ならここに追加
        // favDialog.showModal(); // エラー内容によってはダイアログを閉じない方が良い場合も
        if (inputStudntId) inputStudntId.focus(); // 再入力を促す
        // エラーメッセージをダイアログ内などに表示する処理を追加するとより親切
        const dialogMessageElem = document.getElementById('dialogMessage');
        if (dialogMessageElem) dialogMessageElem.textContent = data.message || "登録エラー";

      } else {
        if (favDialog) favDialog.close();
        if (inputStudntId) inputStudntId.value = '';
        addAttend(data.student_id, true); // 新規登録後、そのまま出席扱い
      }
    })
    .catch(error => {
      console.error('Error in register function:', error);
      const dialogMessageElem = document.getElementById('dialogMessage');
      if (dialogMessageElem) dialogMessageElem.textContent = "登録処理中にエラーが発生しました。";
    });
};

/**
 * @summary ページ読み込み時に既存の出席情報をサーバーから取得し、リストに表示します。
 * @description '/get-attended' エンドポイントにGETリクエストを送信します。
 *              取得したデータで出席者リストをクリアし再構築します。
 * @returns {Promise<void>}
 * @sideeffects DOMの変更（出席リストのクリアと再描画）。グローバル変数 `attends`, `students` の更新。
 */
const showAllAttendance = async () => {
  try {
    const response = await fetch('/get-attended');
    const data = await response.json();
    console.log("showAllAttendance response data:", data);

    attends = data; // サーバーからのデータを保持
    students = []; // 表示済みリストをリセット
    if (attendedList) {
      while (attendedList.firstChild) {
        attendedList.removeChild(attendedList.firstChild);
      }
    }

    attends.forEach(element => {
      if (element.length >= 2) { // student_id があることを期待
        addAttend(element[1], false); // 初期表示ではサウンド再生なし
      }
    });
    if (hedding1) hedding1.textContent = ''; // 初期メッセージをクリア
  } catch (error) {
    console.error('Error fetching initial attendance data:', error);
    if (hedding1) hedding1.textContent = '出席データの読込に失敗しました。';
  }
};

/**
 * @summary 指定された学籍番号を出席者リストに追加し、表示を更新します。
 * @description リストに学籍番号のボタンを追加し、メイン見出しを更新します。
 *              重複する学籍番号は追加しません。必要に応じて出席音を再生します。
 * @param {string} student_id - 表示する学籍番号。
 * @param {boolean} playSound - trueの場合、出席音を再生します。
 * @returns {void}
 * @sideeffects DOMの変更（出席リストへの要素追加、見出し更新）。グローバル変数 `students` の更新。音声再生。
 */
const addAttend = (student_id, playSound) => {
  if (playSound && attendSound) {
    attendSound.currentTime = 0;
    attendSound.muted = false;
    attendSound.play().catch(e => console.error("Error playing attend_sound:", e));
  }

  if (students.includes(student_id)) {
    if (hedding1) hedding1.textContent = `出席済: ${student_id}`;
    // inputIdm のクリアは attend 関数や updateIDm でFelica読み取り後に制御される想定
    return;
  }

  if (attendedList) {
    let label = document.createElement('button');
    // 以前のカスタムCSSで .uk-button, .uk-button-default にスタイルを定義していたので、それを踏襲
    label.classList.add('uk-button'); 
    label.classList.add('uk-button-default');
    // グリッド表示用のスタイルは #attendedList > .uk-button で適用される
    label.textContent = student_id;
    attendedList.insertBefore(label, attendedList.firstChild);
  }

  if (hedding1) hedding1.textContent = `出席: ${student_id}`;
  students.push(student_id);
  // inputIdm のクリアはFelica読み取りフローの中で制御
};

/**
 * @summary カード忘れ情報をサーバーに登録します。
 * @description '/forgot_card' エンドポイントにPOSTリクエストを送信します。
 *              登録成功後、ダイアログを閉じて出席リストを更新します。
 * @param {string} student_id - カードを忘れた学生の学籍番号。
 * @returns {void}
 * @sideeffects DOMの変更（ダイアログクローズ、入力フィールドクリア、出席リスト更新、ダイアログメッセージ更新）。
 */
const register_forgot = (student_id) => {
  let formData = new FormData();
  formData.append('student_id', student_id);

  fetch('/forgot_card', { method: 'POST', body: formData })
    .then(response => response.json())
    .then(data => {
      console.log("register_forgot response data:", data);
      if (data.status === 'error') {
        if (forgotCardDialogMessage) forgotCardDialogMessage.textContent = data.message || "登録エラー";
        if (inputForgotStudntId) inputForgotStudntId.focus();
      } else {
        if (forgotCardDialog) forgotCardDialog.close();
        if (inputForgotStudntId) inputForgotStudntId.value = '';
        addAttend(data.student_id, false); // カード忘れ登録ではサウンド再生なし
      }
    })
    .catch(error => {
      console.error('Error in register_forgot function:', error);
      if (forgotCardDialogMessage) forgotCardDialogMessage.textContent = "処理中にエラーが発生しました。";
    });
};


// --- イベントリスナー設定 ---

/**
 * @listens {keypress} inputStudntId - Enterキー押下で新規カード登録処理を呼び出す。
 * @description 新規登録ダイアログ内の学籍番号入力フィールドでEnterキーが押された際に、
 *              入力値と`inputIdm`の値を基に`register`関数を呼び出します。
 */
if (inputStudntId && inputIdm) {
  inputStudntId.addEventListener('keypress', (ev) => {
    if (ev.key === 'Enter' && inputStudntId.value !== '') {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      console.log("Registering new card. IDM:", inputIdm.value, "Student ID:", inputStudntId.value);
      register(inputIdm.value, inputStudntId.value);
    }
  });
} else {
  console.warn("inputStudntId or inputIdm element not found. New card registration event listener not attached.");
}

/**
 * @listens {click} forgotCardLink - 「カード忘れ登録」ボタンクリックでダイアログを表示する。
 */
if (forgotCardLink && forgotCardDialog) {
  forgotCardLink.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    forgotCardDialog.showModal();
    if (inputForgotStudntId) inputForgotStudntId.focus();
  });
} else {
  console.warn("forgotCardLink or forgotCardDialog element not found. Forgot card event listener not attached.");
}

/**
 * @listens {keypress} inputForgotStudntId - Enterキー押下でカード忘れ登録処理を呼び出す。
 * @description カード忘れ登録ダイアログ内の学籍番号入力フィールドでEnterキーが押された際に、
 *              入力値を基に`register_forgot`関数を呼び出します。
 */
if (inputForgotStudntId) {
  inputForgotStudntId.addEventListener('keypress', (ev) => {
    if (ev.key === 'Enter' && inputForgotStudntId.value !== '') {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      console.log("Registering forgotten card for Student ID:", inputForgotStudntId.value);
      register_forgot(inputForgotStudntId.value);
    }
  });
} else {
  console.warn("inputForgotStudntId element not found. Forgot card keypress event listener not attached.");
}

// --- 初期化処理 ---
/**
 * @summary アプリケーション初期化時に実行される処理。
 * @description 現在の出席者一覧を取得・表示します。
 */
showAllAttendance();
