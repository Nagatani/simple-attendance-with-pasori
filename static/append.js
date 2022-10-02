// 機能追加

let inputIdm = document.getElementById("input_idm")
let inputStudntId = document.getElementById("input_student_id")
let favDialog = document.getElementById('favDialog')
let attendedList = document.getElementById("attendedList")
let hedding1 = document.getElementById("hedding1")

/**
 * 出席登録
 * @param {Felica IDM} card_id 
 */
 const attend = (card_id) => {

  let formData = new FormData()
  formData.append('card_id', card_id) // cardId のみ送信する 学籍番号はデータベースから取得する
  console.log(formData)
  
  fetch('/attend', {method: "POST", body: formData}).then(response => {
    return response.json().then(data => {
      if (response.ok) {
        console.log(data);
        if (data.status === "error") {
          favDialog.showModal();
          inputStudntId.focus();
        } else {
          // 出席表示
          addAttend(data.student_id)
        }
        return data;
      } else {
        return Promise.reject(data);
      }
    })
  })
}


/**
 * 新規生徒情報をサーバー側に送信する
 */
const register = (card_id, student_id) => {

  let formData = new FormData()
  formData.append('card_id', card_id)
  formData.append('student_id', student_id)
  //console.log(formData)
  
  fetch('/register', {method: "POST", body: formData}).then(response => {
    return response.json().then(data => {
      if (response.ok) {
        console.log(data);
        if (data.status === "error") {
          //favDialog.showModal()
          inputStudntId.focus()
        } else {
          // 正常登録が終わったはずなので、dialogを閉じて学籍番号の入力欄をクリアして出席表示
          favDialog.close()
          inputStudntId.value = ""

          // 出席表示
          addAttend(data.student_id)
        }

        return data;
      } else {
        return Promise.reject(data);
      }
    })
  })
}


/**
 * ダイアログ上で学籍番号を入力(バーコードリーダーでスキャン)した際に発火させるキーイベント
 */
inputStudntId.addEventListener('keypress', (ev) => {
  if (ev.key === 'Enter' && inputStudntId.value !== "") {
    // console.log("Enterが押されました。");
    // keypressイベントの消去
    ev.preventDefault()
    ev.stopPropagation()
    ev.stopImmediatePropagation()

    console.log(inputIdm.value, inputStudntId.value);
    register(inputIdm.value, inputStudntId.value);
  }  
})


let attends = []
let students = []

/**
 * 出席情報を取得して表示する（エラーにより再起動した際の対策）
 */
const showAllAttendance = () => {
  attends = []
  students = []
  fetch('/get-attended').then(response => {
    return response.json().then(data => {
      if (response.ok) {
        console.log(data)
        attends = data

        while (attendedList.firstChild) {
          attendedList.removeChild(attendedList.firstChild);
        }
        attends.forEach(element => {
          if (element.length >= 2) {
            addAttend(element[1])
          }
        });
        hedding1.textContent = ``

        return data;
      } else {
        return Promise.reject(data);
      }
    })
  })
}


/**
 * 出席表示
 * 
 * @param {student_id} student_id 
 */
const addAttend = (student_id) => {

  if (students.includes(student_id)) {
    hedding1.textContent = `出席済: ${student_id}`
    return
  }

  let div = document.createElement("div")
  //<div class="uk-card uk-card-default uk-card-body uk-text-center">Item 1</div>
  div.classList.add("uk-card")
  div.classList.add("uk-card-small")
  div.classList.add("uk-card-default")
  div.classList.add("uk-card-body")
  div.classList.add("uk-text-center")
  // let h3 = document.createElement("h3")
  // h3.classList.add("uk-card-title")
  // h3.textContent = student_id
  // div.appendChild(h3)
  div.textContent = student_id
  let li = document.createElement("li")
  li.appendChild(div)

  attendedList.insertBefore(li, attendedList.firstChild)

  hedding1.textContent = `出席: ${student_id}`
  students.push(student_id)
}

let forgotCardLink = document.getElementById("forgotCard")
let forgotCardDialog = document.getElementById("forgotCardDialog")
let forgotCardDialogMessage = document.getElementById("forgotCardDialogMessage")

forgotCardLink.addEventListener('click', (ev) => {
  forgotCardDialog.showModal()

  ev.preventDefault()
  ev.stopPropagation()
  ev.stopImmediatePropagation()
})

let inputForgotStudntId = document.getElementById("input_forgot_student_id")

/**
 * ダイアログ上で学籍番号を入力(バーコードリーダーでスキャン)した際に発火させるキーイベント
 */
 inputForgotStudntId.addEventListener('keypress', (ev) => {
  if (ev.key === 'Enter' && inputForgotStudntId.value !== "") {
    // keypressイベントの消去
    ev.preventDefault()
    ev.stopPropagation()
    ev.stopImmediatePropagation()

    console.log(inputForgotStudntId.value);
    register_forgot(inputForgotStudntId.value);
  }  
})


/**
 * カード忘れ情報をサーバー側に送信する
 */
 const register_forgot = (student_id) => {

  let formData = new FormData()
  formData.append('student_id', student_id)
  
  fetch('/forgot_card', {method: "POST", body: formData}).then(response => {
    return response.json().then(data => {
      if (response.ok) {
        console.log(data);
        if (data.status === "error") {
          //favDialog.showModal()
          forgotCardDialogMessage.textContent = data.message
          inputForgotStudntId.focus()
        } else {
          // 正常登録が終わったはずなので、dialogを閉じて学籍番号の入力欄をクリアして出席表示
          forgotCardDialog.close()
          inputForgotStudntId.value = ""

          // 出席表示
          addAttend(data.student_id)
        }

        return data;
      } else {
        return Promise.reject(data);
      }
    })
  })
}

// 初回実行
showAllAttendance()