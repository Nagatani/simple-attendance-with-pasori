from flask import Flask, render_template, jsonify, request, g
import sqlite3

import config

import argparse
parser = argparse.ArgumentParser()
parser.add_argument("section_title", help="講義タイトルを入力してください。", type=str)
parser.add_argument("section_id", help="第何回かをパラメータで指定してください。", type=int)
args = parser.parse_args()

app = Flask(__name__)


def get_db():
  db = getattr(g, '_database', None)
  if db is None:
      db = g._database = sqlite3.connect(config.database_name)
  return db


@app.teardown_appcontext
def close_connection(exception):
  db = getattr(g, '_database', None)
  if db is not None:
    db.close()


@app.route("/")
def base():
  return render_template("index.html",
                         section_title=args.section_title,
                         section_id=args.section_id)


@app.route("/get-students")
def get_students():
  with app.app_context():
    cur = get_db().cursor()
    cur.execute("select card_id, student_id from students where student_id <> ''") # 一応、学籍番号が空のものは除外
    students = cur.fetchall()
    print(students)
    return jsonify(students)


@app.route("/get-attended")
def get_attended():
  with app.app_context():
    cur = get_db().cursor()
    cur.execute("select card_id, student_id from attendance where section_id = ?", (args.section_id, ))
    attended = cur.fetchall()

    print(attended)
    return jsonify(attended)


@app.route("/attend", methods=["POST"])
def attend():
  with app.app_context():
    con = get_db()
    cur = con.cursor()

    card_id = request.form.get("card_id", None)
    print(card_id)
    if card_id == None:
      return jsonify({
        "status": "error",
        "student_id": "",
        "message": "card_id is required."
      })

    student_id = ""
    message = ""
    
    cur.execute("select student_id from students where card_id = ?", (card_id, ))
    student = cur.fetchone()
    if student == None:
      return jsonify({
        "status": "error",
        "student_id": "",
        "message": "学生証のバーコードを読み取るか、学籍番号を入力してください。"
      })
    else:
      student_id = student[0]


      cur.execute("select student_id from attendance where section_id = ? and card_id = ?", (args.section_id, card_id, ))
      attend = cur.fetchone()
      if attend == None:  
        cur.execute("insert into attendance (section_id, card_id, student_id) values (?, ?, ?)", (args.section_id, card_id, student_id, ))
        con.commit()
      else:
        cur.execute("update attendance set student_id = ?, update_datetime = datetime(CURRENT_TIMESTAMP,'localtime') where section_id = ? and card_id = ?", (student_id, args.section_id, card_id, ))
        con.commit()


      message = "出席登録完了しました: {}".format(student_id)

    return jsonify({
      "status": "ok",
      "student_id": student_id,
      "message": message}
    )


@app.route("/register", methods=["POST"])
def register_student():
  with app.app_context():
    con = get_db()
    cur = con.cursor()

    card_id = request.form.get("card_id", None)
    student_id = request.form.get("student_id", None)
    print(card_id)
    print(student_id)
    if card_id == None or student_id == None:
      return jsonify({
        "status": "error",
        "student_id": "",
        "message": "card_id or student_id is empty."
      })

    cur.execute('''insert into students (card_id, student_id) values (?, ?)''', (card_id, student_id))
    cur.execute('''insert into attendance (section_id, card_id, student_id) values (?, ?, ?)''', (args.section_id, card_id, student_id))
    con.commit()

    message = "出席登録完了しました: {}".format(student_id)

    return jsonify({
      "status": "ok",
      "student_id": student_id,
      "message": message}
    )


@app.route("/forgot_card", methods=["POST"])
def register_forgot():
  with app.app_context():
    con = get_db()
    cur = con.cursor()

    student_id = request.form.get("student_id", None)
    print(student_id)

    if student_id == None:
      return jsonify({
        "status": "error",
        "card_id": "",
        "message": "student_id is empty."
      })

    cur.execute("select card_id from students where student_id = ?", (student_id, ))
    student = cur.fetchone()
    if student == None:
      card_id = student_id # カード忘れの場合、カードIDは学籍番号と同じとする
    else:
      card_id = student[0]

      cur.execute("select student_id from attendance where section_id = ? and card_id = ?", (args.section_id, card_id, ))
      attend = cur.fetchone()
      if attend == None:
        cur.execute("insert into attendance (section_id, card_id, student_id, forgot_card) values (?, ?, ?, 'FORGOT')", (args.section_id, card_id, student_id, ))
        con.commit()
      else:
        return jsonify({
          "status": "error",
          "card_id": card_id,
          "message": "{}は出席登録済みです。".format(student_id)
        })

    message = "出席登録完了しました: {}".format(student_id)

    return jsonify({
      "status": "ok",
      "student_id": student_id,
      "message": message}
    )


if __name__ == '__main__':

  # init database
  with app.app_context():
    con = get_db()
    cur = con.cursor()

    # データベースのテーブルをドロップさせる場合はConfigファイルから設定可能
    if config.init_tables:
      cur.execute("drop table if exists students")
      cur.execute("drop table if exists attendance")
    
    # 生徒とカードIDを管理するテーブルの作成
    cur.execute('''create table if not exists students ( 
      id integer primary key autoincrement, 
      card_id nverchar(32) not null, 
      student_id nverchar(32), 
      student_name nverchar(64) DEFAULT '', 
      create_datetime TIMESTAMP DEFAULT (datetime(CURRENT_TIMESTAMP,'localtime')), 
      update_datetime TIMESTAMP DEFAULT (datetime(CURRENT_TIMESTAMP,'localtime'))
    )''')

    # 出席を管理するテーブルの作成
    cur.execute('''create table if not exists attendance (
      id integer primary key autoincrement, 
      section_id nverchar(32) not null, 
      card_id nverchar(32) not null, 
      student_id nverchar(32), 
      forgot_card nverchar(32), 
      create_datetime TIMESTAMP DEFAULT (datetime(CURRENT_TIMESTAMP,'localtime')), 
      update_datetime TIMESTAMP DEFAULT (datetime(CURRENT_TIMESTAMP,'localtime'))
    )''')

    # UNIQUEインデックスの作成（データ件数が少なければなくても良いかも）
    cur.execute('''create unique index if not exists studentindex on students(card_id)''')
    cur.execute('''create unique index if not exists attendanceindex on attendance(section_id, card_id)''')
    
    con.commit()

  # Flaskの起動
  app.run(port=config.run_port,
          host=config.run_host,
          debug=True)