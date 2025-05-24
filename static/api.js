// サーバー通信(API呼び出し)関連の関数

/**
 * サーバーにカードIDを送信し、出席を試みます。
 * @param {string} card_id 学生のカードID
 * @returns {Promise<object>} サーバーからのレスポンスJSONデータ、またはエラーを含むPromise
 */
const callAttendApi = (card_id) => {
  let formData = new FormData();
  formData.append('card_id', card_id);
  console.log('API call /attend with formData:', formData);
  
  return fetch('/attend', {method: 'POST', body: formData}).then(response => {
    return response.json().then(data => {
      if (response.ok) {
        console.log('API response /attend OK:', data);
        return data; // dataには {status: 'success', student_id: 'xxx'} または {status: 'error', message: '...'} が入る想定
      } else {
        console.error('API response /attend Error:', data);
        return Promise.reject(data); // エラー時もJSON形式のデータ {status: 'error', message: '...'} を想定
      }
    });
  }).catch(error => {
    console.error('Fetch error in callAttendApi:', error);
    return Promise.reject(error); // ネットワークエラーなど
  });
};

/**
 * サーバーにカードIDと学籍番号を送信し、新規学生情報を登録します。
 * @param {string} card_id 学生のカードID
 * @param {string} student_id 学生の学籍番号
 * @returns {Promise<object>} サーバーからのレスポンスJSONデータ、またはエラーを含むPromise
 */
const callRegisterApi = (card_id, student_id) => {
  let formData = new FormData();
  formData.append('card_id', card_id);
  formData.append('student_id', student_id);
  console.log('API call /register with formData:', formData);

  return fetch('/register', {method: 'POST', body: formData}).then(response => {
    return response.json().then(data => {
      if (response.ok) {
        console.log('API response /register OK:', data);
        return data; // dataには {status: 'success', student_id: 'xxx'} または {status: 'error', message: '...'} が入る想定
      } else {
        console.error('API response /register Error:', data);
        return Promise.reject(data);
      }
    });
  }).catch(error => {
    console.error('Fetch error in callRegisterApi:', error);
    return Promise.reject(error);
  });
};

/**
 * サーバーから全ての出席情報を取得します。
 * @returns {Promise<Array<Array<string>>>} サーバーからのレスポンスJSONデータ (例: [["出席時刻", "学籍番号"], ...])、またはエラーを含むPromise
 */
const callGetAttendedApi = () => {
  console.log('API call /get-attended');
  return fetch('/get-attended').then(response => {
    return response.json().then(data => {
      if (response.ok) {
        console.log('API response /get-attended OK:', data);
        return data; // dataは出席情報の配列を想定
      } else {
        console.error('API response /get-attended Error:', data);
        return Promise.reject(data);
      }
    });
  }).catch(error => {
    console.error('Fetch error in callGetAttendedApi:', error);
    return Promise.reject(error);
  });
};

/**
 * サーバーに学籍番号を送信し、カード忘れとして登録します。
 * @param {string} student_id 学生の学籍番号
 * @returns {Promise<object>} サーバーからのレスポンスJSONデータ、またはエラーを含むPromise
 */
const callForgotCardApi = (student_id) => {
  let formData = new FormData();
  formData.append('student_id', student_id);
  console.log('API call /forgot_card with formData:', formData);

  return fetch('/forgot_card', {method: 'POST', body: formData}).then(response => {
    return response.json().then(data => {
      if (response.ok) {
        console.log('API response /forgot_card OK:', data);
        return data; // dataには {status: 'success', student_id: 'xxx'} または {status: 'error', message: '...'} が入る想定
      } else {
        console.error('API response /forgot_card Error:', data);
        return Promise.reject(data);
      }
    });
  }).catch(error => {
    console.error('Fetch error in callForgotCardApi:', error);
    return Promise.reject(error);
  });
};
