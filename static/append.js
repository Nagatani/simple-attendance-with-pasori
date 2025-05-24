// 機能追加

// `static/ui.js` で定義されたUI操作関数を利用します。
// `static/api.js` で定義されたAPI呼び出し関数を利用します。
// `static/felica.js` のコールバック設定関数を利用します。

let inputIdm = document.getElementById('input_idm');
// inputStudntId は favDialog 内にあるため、ui.js 側で必要に応じて取得・操作されます。
// favDialog, attendedList, hedding1 も ui.js で操作されます。

/**
 * サーバーにカードIDを送信し、出席を登録します。
 * API呼び出しの結果に基づいてUIを更新します。
 * @param {string} card_id カードのIDM
 */
 const attend = (card_id) => {
  callAttendApi(card_id)
    .then(data => {
      console.log('attend API success:', data);
      if (data.status === 'error') {
        showRegisterErrorDialogAndFocus(); // 未登録カードの場合、登録ダイアログ表示
      } else {
        processNewAttend(data.student_id, true); // 登録済みの場合、出席表示
      }
    })
    .catch(error => {
      console.error('attend API error:', error);
      // ここで汎用的なエラーメッセージをUIに表示することも検討
      updateHeadingMessage('エラーが発生しました。');
    });
};


/**
 * サーバーにカードIDと学籍番号を送信し、新規登録します。
 * API呼び出しの結果に基づいてUIを更新します。
 * @param {string} card_id カードのIDM
 * @param {string} student_id 学籍番号
 */
const register = (card_id, student_id) => {
  callRegisterApi(card_id, student_id)
    .then(data => {
      console.log('register API success:', data);
      if (data.status === 'error') {
        focusStudentIdInRegisterDialog(); // おそらくエラーメッセージはサーバーから返る想定
                                          // 必要であれば ui.js に data.message を渡して表示
        if (data.message) {
            // 例: showErrorInRegisterDialog(data.message); のような関数をui.jsに作る
            console.log("Register API error message:", data.message); // とりあえずコンソールに
        }
      } else {
        closeRegisterDialogAndClearStudentId();
        processNewAttend(data.student_id, true);
      }
    })
    .catch(error => {
      console.error('register API error:', error);
      updateHeadingMessage('登録エラーが発生しました。');
    });
};

// inputStudntId のイベントリスナーは変更なし。 register 関数を呼び出す。
const inputStudntIdFromDialog = document.getElementById('input_student_id');
if (inputStudntIdFromDialog) {
  inputStudntIdFromDialog.addEventListener('keypress', (ev) => {
    if (ev.key === 'Enter' && inputStudntIdFromDialog.value !== '') {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      // inputIdm.value はグローバルスコープの inputIdm を参照
      register(inputIdm.value, inputStudntIdFromDialog.value);
    }
  });
}


let attends = []; // サーバーから取得した出席情報（APIのレスポンス形式に依存）
let students = []; // 現在画面に表示されている学籍番号のリスト

/**
 * サーバーから全ての出席情報を取得し、表示を更新します。
 * API呼び出しの結果に基づいてUIを更新します。
 */
const showAllAttendance = () => {
  attends = [];
  students = []; // students リストを初期化
  callGetAttendedApi()
    .then(data => {
      console.log('getAttended API success:', data);
      attends = data; // サーバーからのデータを保持 (形式は [[timestamp, student_id], ...])

      clearAttendedListDisplay();
      attends.forEach(element => {
        if (element.length >= 2) {
          const student_id = element[1]; // 学籍番号は配列の2番目の要素
          if (!students.includes(student_id)) {
            students.push(student_id);
            uiAddAttendToList(student_id, false); // APIからのリスト表示時は音なし
          }
        }
      });
      resetHeadingMessage();
    })
    .catch(error => {
      console.error('getAttended API error:', error);
      updateHeadingMessage('出席情報の取得に失敗しました。');
    });
};


/**
 * 新しい出席情報を処理し、画面に表示します。
 * students 配列を更新し、UI関数を呼び出します。
 * @param {string} student_id 学籍番号
 * @param {boolean} playsound 出席音を再生するかどうか
 */
const processNewAttend = (student_id, playsound) => {
  if (students.includes(student_id)) {
    showAlreadyAttendedMessage(student_id);
    if (inputIdm) inputIdm.value = ''; // inputIdmのクリアはここで行う
    return;
  }
  students.push(student_id);
  uiAddAttendToList(student_id, playsound);
  if (inputIdm) inputIdm.value = ''; // inputIdmのクリアはここで行う
};


// カード忘れ関連のDOM要素取得とイベントリスナー
const forgotCardLink = document.getElementById('forgotCard');
// forgotCardDialog, forgotCardDialogMessage は ui.js で操作
const inputForgotStudntId = document.getElementById('input_forgot_student_id');

if (forgotCardLink) {
  forgotCardLink.addEventListener('click', (ev) => {
    // UI操作を ui.js の関数経由で行う
    showForgotCardDialog();
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
  });
}

if (inputForgotStudntId) {
  inputForgotStudntId.addEventListener('keypress', (ev) => {
    if (ev.key === 'Enter' && inputForgotStudntId.value !== '') {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      register_forgot(inputForgotStudntId.value);
    }
  });
}


/**
 * サーバーに学籍番号を送信し、カード忘れとして登録します。
 * API呼び出しの結果に基づいてUIを更新します。
 * @param {string} student_id 学籍番号
 */
 const register_forgot = (student_id) => {
  callForgotCardApi(student_id)
    .then(data => {
      console.log('forgotCard API success:', data);
      if (data.status === 'error') {
        // UI操作を ui.js の関数経由で行う
        showForgotCardErrorMessageAndFocus(data.message);
      } else {
        // UI操作を ui.js の関数経由で行う
        closeForgotCardDialogAndClearStudentId();
        // 出席表示処理を呼び出し (カード忘れの場合は音を鳴らさないことが多いが、既存ロジックに合わせる)
        processNewAttend(data.student_id, false); // カード忘れは音なしで追加
      }
    })
    .catch(error => {
      console.error('forgotCard API error:', error);
      updateHeadingMessage('カード忘れ登録エラーが発生しました。');
    });
};

// 初回実行
showAllAttendance();

/**
 * FeliCaカードリーダーからIDmが読み取られた際に呼び出されるコールバック関数。
 * 読み取られたIDmを使って出席処理を開始します。
 * @param {string} idm FeliCaカードから読み取られたIDm
 */
const handleCardRead = (idm) => {
  console.log("handleCardRead called with IDm:", idm);
  if (inputIdm) {
    inputIdm.value = idm; // グローバルな inputIdm 要素に値を設定
  } else {
    console.error("inputIdm element not found in handleCardRead.");
    return;
  }
  
  // favDialog が表示されている（＝新規登録ダイアログが開いている）場合は、
  // カード読み取りによる出席処理は行わないのが一般的。
  // ただし、現在の favDialog はエラー時または未登録カード時に表示されるため、
  // このチェックが常に適切かは仕様による。
  // ここでは、ダイアログが開いていない場合のみ attend を呼び出すようにする。
  const favDialog = document.getElementById('favDialog'); // ui.js で操作される要素だが、状態確認のために取得
  if (favDialog && favDialog.open) {
    console.log("Registration dialog is open, skipping attend process for new card read.");
    return;
  }

  attend(idm); // 出席処理を実行
};

// felica.js にカード読み取り時のコールバック関数を設定
if (typeof setCardReadCallback === 'function') {
  setCardReadCallback(handleCardRead);
} else {
  console.error("setCardReadCallback is not defined in felica.js or not loaded yet.");
}

// 登録ダイアログが閉じられた際のイベントリスナー
const favDialogElement = document.getElementById('favDialog');
if (favDialogElement) {
  favDialogElement.addEventListener('close', () => {
    console.log('Registration dialog (favDialog) closed.');
    if (typeof clearBeforeIdm === 'function') {
      clearBeforeIdm(); // felica.jsの関数を呼び出す
    }
    // ダイアログが閉じたときに inputIdm の値をクリアする処理は
    // ui.js の closeRegisterDialogAndClearStudentId に集約されたのでここでは不要。
    // ただし、ユーザーがESCキーや閉じるボタンで明示的に閉じた場合、
    // closeRegisterDialogAndClearStudentId が呼ばれない可能性があるので、
    // inputIdm のクリアはここでも行う方が堅牢かもしれない。
    // 今回はまず beforeIdm のクリアに集中する。
    // 必要であれば、inputIdm のクリアも ui.js 側で行う。
    // → ui.js の closeRegisterDialogAndClearStudentId で input_idm もクリアするようにしたので、
    // append.js 側での inputIdm クリアは不要。
  });
}