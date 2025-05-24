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

// ui.js のインポートは、この関数内では原則不要になります。
// DOM要素の直接参照も削除します (例: favDialog, inputStudntId など)

/**
 * @summary 指定されたカードIDで出席処理を試み、結果を返す。
 * @description '/attend' エンドポイントにPOSTリクエストを送信する。
 *              サーバーからの応答に基づき、処理の成否、カードの状態（未登録、登録済、出席済など）を示すオブジェクトを返す。
 * @async
 * @param {string} card_id - 出席を試みるFelicaカードのIDM。
 * @returns {Promise<object>} 処理結果を示すオブジェクト。例:
 *   - 成功: `{ status: 'success', studentId: '...', message: '...' }`
 *   - 未登録: `{ status: 'unregistered_card', cardId: '...', message: '...' }`
 *   - 出席済: `{ status: 'already_attended', studentId: '...', message: '...' }`
 *   - エラー: `{ status: 'error', message: '...', rawData?: any }`
 *   - 通信エラー: `{ status: 'network_error', message: '...' }`
 */
export async function attend(card_id) {
  const formData = new FormData();
  formData.append('card_id', card_id);
  console.log("api.attend: Sending card_id:", card_id);

  try {
    const response = await fetch('/attend', { method: 'POST', body: formData });
    const data = await response.json(); // レスポンスがJSONでない場合も考慮が必要だが、ここではJSONを期待

    console.log("api.attend: Server response data:", data);

    if (!response.ok) {
      // HTTPエラー (4xx, 5xx)
      // data.message があればそれを使用し、なければ一般的なエラーメッセージ
      return { 
        status: 'error', 
        message: data.message || `サーバーエラーが発生しました (HTTP ${response.status})。`, 
        httpStatus: response.status,
        rawData: data 
      };
    }

    // response.ok === true (HTTP 2xx)
    // サーバー側のレスポンス仕様に基づいて分岐を調整する必要がある
    if (data.status === 'error') {
      // サーバーがエラーを返してきたが、HTTPステータスは2xxだった場合
      // "このカードは未登録です。" のようなメッセージで判定するか、専用のtypeフィールドが望ましい
      if (data.message && data.message.toLowerCase().includes('未登録')) { // メッセージ内容に依存するのは不安定
        return { status: 'unregistered_card', cardId: card_id, message: data.message, rawData: data };
      } else if (data.message && data.message.toLowerCase().includes('出席済')) {
        return { status: 'already_attended', studentId: data.student_id, message: data.message, rawData: data };
      } else {
        return { status: 'error', message: data.message || 'サーバー処理エラーが発生しました。', rawData: data };
      }
    } else if (data.student_id) {
      // おそらく成功。メッセージがあるか確認
       if (data.message && data.message.toLowerCase().includes('出席済')) { // 新規登録後の自動出席なども考慮
         return { status: 'already_attended', studentId: data.student_id, message: data.message, rawData: data };
       }
      return { status: 'success', studentId: data.student_id, message: data.message || '出席登録が完了しました。', rawData: data };
    } else {
      // student_id も status === 'error' もない予期しない形式
      console.warn("api.attend: Unexpected server response format:", data);
      return { status: 'error', message: 'サーバーからの応答形式が不正です。', rawData: data };
    }

  } catch (error) {
    console.error("Fetch error in api.attend:", error);
    return { status: 'network_error', message: `通信エラーが発生しました: ${error.message}` };
  }
}

// attend関数以外の api.js 内の他の関数 (register, register_forgot, getAttendedStudents) も、
// 同様にUI操作を直接行わず、処理結果のデータを返すように修正するのが望ましいが、
// 今回の指示は attend 関数に限定する。

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
