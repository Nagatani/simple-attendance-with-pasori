/**
 * 汎用的なAPI呼び出し関数。
 * fetchを使用してリクエストを送信し、JSONレスポンスを処理します。
 * @param {string} endpoint APIのエンドポイントURL (例: '/attend')
 * @param {string} [method='POST'] HTTPメソッド (例: 'GET', 'POST')
 * @param {Object|null} [bodyParams=null] POSTリクエストの場合に送信するパラメータのオブジェクト。
 *                                       このオブジェクトは関数内でFormDataに変換されます。
 *                                       GETリクエストの場合はnullまたは未指定。
 * @returns {Promise<Object>} APIからのレスポンスボディ（JSONオブジェクト）。
 * @throws {Error} ネットワークエラーまたはAPIがエラーレスポンスを返した場合。
 */
async function fetchApi(endpoint, method = 'POST', bodyParams = null) {
  const options = {
    method: method.toUpperCase(),
    headers: {
      // 必要に応じて共通ヘッダーを追加 (例: 'X-Requested-With': 'XMLHttpRequest')
    }
  };

  if (options.method === 'POST' && bodyParams) {
    const formData = new FormData();
    for (const key in bodyParams) {
      if (Object.prototype.hasOwnProperty.call(bodyParams, key)) {
        formData.append(key, bodyParams[key]);
      }
    }
    options.body = formData;
  }

  try {
    const response = await fetch(endpoint, options);
    const data = await response.json(); // 先にjson()を試みる

    if (!response.ok) {
      // dataオブジェクトにエラーメッセージが含まれていることを期待
      // なければ一般的なエラーメッセージ
      const errorMessage = data?.message || `HTTP error! status: ${response.status}`;
      console.error(`API error for endpoint ${endpoint}:`, data);
      // エラーオブジェクトにレスポンスデータを含めることで、呼び出し元で詳細なエラー情報を利用できるようにする
      const error = new Error(errorMessage);
      error.data = data; // エラーオブジェクトにAPIからのレスポンスデータを添付
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    // ネットワークエラーや上記でthrowされたエラーをキャッチ
    console.error(`Fetch API failed for endpoint ${endpoint}:`, error);
    // エラーを再throwして、呼び出し元で処理できるようにする
    throw error;
  }
}

// サーバー通信(API呼び出し)関連の関数

/**
 * 出席を登録するAPIを呼び出します。
 * @param {string} card_id カードID
 * @returns {Promise<Object>} APIからのレスポンスオブジェクト
 * @throws {Error} API呼び出しに失敗した場合
 */
const callAttendApi = async (card_id) => {
  try {
    console.log('API call /attend with card_id:', card_id); // formDataログの代わり
    return await fetchApi('/attend', 'POST', { card_id });
  } catch (error) {
    // エラーログはfetchApi内で出力されるので、ここでは再throwするか、
    // UI固有のエラー処理が必要ならここで行う（今回は再throwでOK）
    console.error('callAttendApi failed:', error.message, error.data || '');
    throw error;
  }
};

/**
 * 新規学生を登録するAPIを呼び出します。
 * @param {string} card_id カードID
 * @param {string} student_id 学籍番号
 * @returns {Promise<Object>} APIからのレスポンスオブジェクト
 * @throws {Error} API呼び出しに失敗した場合
 */
const callRegisterApi = async (card_id, student_id) => {
  try {
    console.log('API call /register with card_id:', card_id, 'student_id:', student_id); // formDataログの代わり
    return await fetchApi('/register', 'POST', { card_id, student_id });
  } catch (error) {
    console.error('callRegisterApi failed:', error.message, error.data || '');
    throw error;
  }
};

/**
 * 出席者リストを取得するAPIを呼び出します。
 * @returns {Promise<Object>} APIからのレスポンスオブジェクト
 * @throws {Error} API呼び出しに失敗した場合
 */
const callGetAttendedApi = async () => {
  try {
    console.log('API call /get-attended');
    return await fetchApi('/get-attended', 'GET');
  } catch (error) {
    console.error('callGetAttendedApi failed:', error.message, error.data || '');
    throw error;
  }
};

/**
 * カード忘れ登録を行うAPIを呼び出します。
 * @param {string} student_id 学籍番号
 * @returns {Promise<Object>} APIからのレスポンスオブジェクト
 * @throws {Error} API呼び出しに失敗した場合
 */
const callForgotCardApi = async (student_id) => {
  try {
    console.log('API call /forgot_card with student_id:', student_id); // formDataログの代わり
    return await fetchApi('/forgot_card', 'POST', { student_id });
  } catch (error) {
    console.error('callForgotCardApi failed:', error.message, error.data || '');
    throw error;
  }
};
