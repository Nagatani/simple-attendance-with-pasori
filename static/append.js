// 機能追加

let inputIdm = document.getElementById("input_idm");
let inputStudntId = document.getElementById("input_student_id");
let favDialog = document.getElementById('favDialog');
let attendedList = document.getElementById("attendedList");
let hedding1 = document.getElementById("hedding1");

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
          favDialog.close()
          inputStudntId.value = ""

          // todo: 出席表示
          addAttend(data.student_id)
        }

        return data;
      } else {
        return Promise.reject(data);
      }
    })
  })
}


inputStudntId.addEventListener('keypress', (ev) => {
  if (ev.key === 'Enter' && inputStudntId.value !== "") {
    console.log("Enterが押されました。");
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    console.log(inputIdm.value, inputStudntId.value);
    register(inputIdm.value, inputStudntId.value);
  }  
})


let attends = []
let students = []
const showAllAttendance = () => {
  attends = []
  students = []
  fetch('/get-attended').then(response => {
    return response.json().then(data => {
      
      attends = data
      console.log(attends)

      while (attendedList.firstChild) {
        attendedList.removeChild(attendedList.firstChild);
      }
      attends.forEach(element => {
        if (element.length >= 2) {
          addAttend(element[1])
        }
      });
    })
  })
}

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

  //attendedList.appendChild(li)
  attendedList.insertBefore(li, attendedList.firstChild)

  hedding1.textContent = `出席: ${student_id}`
  students.push(student_id)
}


// 初回実行
showAllAttendance()