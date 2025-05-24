/**
 * @file サーバーAPIとの通信を担当する関数群
 * @version 1.0.0
 */

// DOM要素の参照 (append.jsから一時的に移動。最終的にはui.js経由での操作を検討)
// 注意: これらのDOM要素への直接アクセスはAPIモジュールの責務と少し異なるため、
//       将来的には呼び出し元(app.jsなど)から必要な情報を引数で受け取るか、
//       状態管理の仕組みを導入して疎結合にすることを推奨します。
/** @type {HTMLDialogElement} 新規カード登録用ダイアログ要素 */
const favDialog = document.getElementById('favDialog');
/** @type {HTMLInputElement} 学生証番号入力要素（登録ダイアログ内） */
const inputStudntId = document.getElementById('input_student_id');
// forgotCardDialogMessage と inputForgotStudntId は register_forgot で使われる
/** @type {HTMLElement} 「カード忘れ登録」ダイアログ内のメッセージ表示エリア要素 */
const forgotCardDialogMessage = document.getElementById('forgotCardDialogMessage');
/** @type {HTMLInputElement} 学生証番号入力要素（カード忘れ登録ダイアログ内） */
const inputForgotStudntId = document.getElementById('input_forgot_student_id');


/**
 * @summary 指定されたカードIDで出席を試みます。
 * @description '/attend' エンドポイントにPOSTリクエストを送信し、出席処理を行います。
 * 未登録カードの場合は登録ダイアログを表示します。
 * 既に登録済みの場合は出席リストを更新し、出席情報を表示します。
 * @param {string} card_id - 登録するFelicaカードのIDM。
 * @returns {Promise<object>} サーバーからのレスポンスJSON。
 * @throws {Error} fetchリクエストが失敗した場合、またはレスポンスがエラーを示した場合。
 * @sideEffects DOM操作: 未登録の場合、登録ダイアログを表示。UI更新は呼び出し元で行う想定。
 */
export const attend = async (card_id) => {
  let formData = new FormData();
  formData.append('card_id', card_id);
  console.log('API: attend - FormData:', formData.get('card_id'));
  
  const response = await fetch('/attend', {method: 'POST', body: formData});
  const data = await response.json();

  if (!response.ok) {
    console.error('API: attend - Error response:', data);
    throw new Error(data.message || 'Attend API request failed');
  }
  
  console.log('API: attend - Success response:', data);
  // UI操作は呼び出し元で行うため、ここではstatusに応じてfavDialogなどを直接操作しない
  return data;
};


/**
 * @summary 新規のカードIDと学生証番号をサーバーに登録します。
 * @description '/register' エンドポイントにPOSTリクエストを送信し、新規登録処理を行います。
 * @param {string} card_id - 登録するFelicaカードのIDM。
 * @param {string} student_id - 登録する学生の学生証番号。
 * @returns {Promise<object>} サーバーからのレスポンスJSON。
 * @throws {Error} fetchリクエストが失敗した場合、またはレスポンスがエラーを示した場合。
 * @sideEffects UI操作は呼び出し元で行う想定。
 */
export const register = async (card_id, student_id) => {
  let formData = new FormData();
  formData.append('card_id', card_id);
  formData.append('student_id', student_id);
  console.log('API: register - FormData:', formData.get('card_id'), formData.get('student_id'));
  
  const response = await fetch('/register', {method: 'POST', body: formData});
  const data = await response.json();

  if (!response.ok) {
    console.error('API: register - Error response:', data);
    throw new Error(data.message || 'Register API request failed');
  }
  
  console.log('API: register - Success response:', data);
  // UI操作は呼び出し元で行うため、ここではfavDialogなどを直接操作しない
  return data;
};

/**
 * @summary カード忘れ情報をサーバーに送信して登録します。
 * @description '/forgot_card' エンドポイントにPOSTリクエストを送信し、カード忘れ処理を行います。
 * @param {string} student_id - 登録する学生の学生証番号。
 * @returns {Promise<object>} サーバーからのレスポンスJSON。
 * @throws {Error} fetchリクエストが失敗した場合、またはレスポンスがエラーを示した場合。
 * @sideEffects UI操作は呼び出し元で行う想定。
 */
export const register_forgot = async (student_id) => {
  let formData = new FormData();
  formData.append('student_id', student_id);
  console.log('API: register_forgot - FormData:', formData.get('student_id'));
  
  const response = await fetch('/forgot_card', {method: 'POST', body: formData});
  const data = await response.json();

  if (!response.ok) {
    console.error('API: register_forgot - Error response:', data);
    // エラー時にもdataを返すことで、呼び出し元でメッセージなどを利用可能にする
    // throw new Error(data.message || 'Forgot Card API request failed');
    return data; // エラーでもdataを返すように変更 (呼び出し元でstatusを見て処理するため)
  }
  
  console.log('API: register_forgot - Success response:', data);
  // UI操作は呼び出し元で行うため、ここではforgotCardDialogMessageなどを直接操作しない
  return data;
};


/**
 * @summary サーバーから全ての出席情報を取得します。
 * @description '/get-attended' エンドポイントにGETリクエストを送信します。
 * @returns {Promise<Array<Array<string>>>} サーバーからのレスポンスJSON（出席者データの配列）。
 * @throws {Error} fetchリクエストが失敗した場合、またはレスポンスがエラーを示した場合。
 */
export async function getAttendedStudents() {
  console.log('API: getAttendedStudents - Fetching...');
  const response = await fetch('/get-attended');
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Failed to fetch attended students and parse error JSON.' }));
    console.error('API: getAttendedStudents - Error response:', errorData);
    throw new Error(errorData.message || 'Failed to fetch attended students');
  }
  const data = await response.json();
  console.log('API: getAttendedStudents - Success response:', data);
  return data;
}
