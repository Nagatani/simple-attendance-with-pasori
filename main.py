from flask import Flask, render_template, jsonify, request, g, abort, Response
import sqlite3
import os
import json
import time
import queue
import threading

import config
import pcsc_reader
import student_id_extract
from events_hub import hub

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


def _upsert_attendance(cur, section_id, card_id, student_id):
  """(section_id, card_id) で出席を1件 upsert する。ルートとスレッド双方で共用。"""
  cur.execute("select student_id from attendance where section_id = ? COLLATE NOCASE and card_id = ? COLLATE NOCASE", (section_id, card_id, ))
  if cur.fetchone() is None:
    cur.execute("insert into attendance (section_id, card_id, student_id) values (?, ?, ?)", (section_id, card_id, student_id, ))
  else:
    cur.execute("update attendance set student_id = ?, update_datetime = datetime(CURRENT_TIMESTAMP,'localtime') where section_id = ? COLLATE NOCASE and card_id = ? COLLATE NOCASE", (student_id, section_id, card_id, ))


def register_attendance_threadsafe(card_id, student_id):
  """バックグラウンドスレッドから使う出席登録（専用のSQLite接続を開く）。"""
  con = sqlite3.connect(config.database_name)
  try:
    _upsert_attendance(con.cursor(), args.section_id, card_id, student_id)
    con.commit()
  finally:
    con.close()


@app.route("/")
def base():
  return render_template("index.html",
                         section_title=args.section_title,
                         section_id=args.section_id)


@app.route("/config")
def get_config():
  """ブラウザ側のカード読み取りパイプラインが必要とする設定を返す。
  鍵(keys_file)などの秘密情報は含めない。"""
  read_mode = getattr(config, "read_mode", "uid")
  # student_id モードのときだけ学籍番号の場所・オフライン有無を返す。
  is_student_id = read_mode == "student_id"
  return jsonify({
    "read_mode": read_mode,
    "student_id_location": getattr(config, "student_id_location", None) if is_student_id else None,
    "offline": bool(getattr(config, "offline_dump", None)) if is_student_id else False,
    # pcsc(サーバー側読み取り)モード用
    "pcsc_simulate": bool(getattr(config, "pcsc_simulate", None)) if read_mode == "pcsc" else False,
  })


@app.route("/keys")
def get_keys():
  """実機でのセクタ認証(crypto1)用に、keys_file の候補鍵をブラウザへ返す。
  read_mode が 'student_id' のときのみ。鍵は秘密情報のため 127.0.0.1 専用の想定。"""
  if getattr(config, "read_mode", "uid") != "student_id":
    abort(404)
  path = getattr(config, "keys_file", None)
  if not path or not os.path.exists(path):
    return jsonify({"status": "error", "keys": [], "message": "keys_file が見つかりません: {}".format(path)}), 404

  keys = []
  seen = set()
  with open(path, "r", encoding="utf-8", errors="ignore") as f:
    for raw in f:
      line = raw.split("#")[0].strip().replace(":", "").replace(" ", "")
      if len(line) == 12 and all(c in "0123456789abcdefABCDEF" for c in line):
        low = line.lower()
        if low not in seen:
          seen.add(low)
          keys.append(low)
  return jsonify({"status": "ok", "keys": keys})


@app.route("/card-image")
def card_image():
  """オフライン(デモ)用に、設定された .mfd ダンプを「読み取ったカード」として返す。
  read_mode が 'student_id' かつ config.offline_dump 設定時のみ。それ以外は 404。
  個人情報を含むため 127.0.0.1 専用の想定。"""
  if getattr(config, "read_mode", "uid") != "student_id":
    abort(404)
  dump_path = getattr(config, "offline_dump", None)
  if not dump_path:
    abort(404)
  if not os.path.exists(dump_path):
    return jsonify({"status": "error", "message": "offline_dump が見つかりません: {}".format(dump_path)}), 404

  with open(dump_path, "rb") as f:
    raw = f.read()

  uid = list(raw[0:4]) if len(raw) >= 4 else []
  return jsonify({
    "status": "ok",
    "uid": "".join("{:02x}".format(b) for b in uid),
    "image": list(raw),  # 1024 バイトの配列
  })


@app.route("/get-students")
def get_students():
  with app.app_context():
    cur = get_db().cursor()
    cur.execute("select card_id, student_id from students where student_id <> '' COLLATE NOCASE "  ) # 一応、学籍番号が空のものは除外
    students = cur.fetchall()
    print(students)
    return jsonify(students)


@app.route("/get-attended")
def get_attended():
  with app.app_context():
    cur = get_db().cursor()
    cur.execute("select card_id, student_id from attendance where section_id = ? COLLATE NOCASE", (args.section_id, ))
    attended = cur.fetchall()

    print(attended)
    return jsonify(attended)


@app.route("/attend", methods=["POST"])
def attend():
  with app.app_context():
    con = get_db()
    cur = con.cursor()

    card_id = request.form.get("card_id", None)
    student_id_param = request.form.get("student_id", None)
    print(card_id, student_id_param)

    # --- カード内学籍番号モード ---
    # カードのセクタから読み取った学籍番号を直接登録する。事前のカード登録は不要。
    # attendance.card_id には、UID があればそれを、無ければ学籍番号を入れる。
    if student_id_param:
      student_id = student_id_param
      key = card_id if card_id else student_id
      _upsert_attendance(cur, args.section_id, key, student_id)
      con.commit()
      return jsonify({
        "status": "ok",
        "student_id": student_id,
        "message": "出席登録完了しました: {}".format(student_id)
      })

    # --- 従来の UID モード ---
    if card_id == None:
      return jsonify({
        "status": "error",
        "student_id": "",
        "message": "card_id is required."
      })

    student_id = ""
    message = ""

    cur.execute("select student_id from students where card_id = ? COLLATE NOCASE", (card_id, ))
    student = cur.fetchone()
    if student == None:
      return jsonify({
        "status": "error",
        "student_id": "",
        "message": "学生証のバーコードを読み取るか、学籍番号を入力してください。"
      })
    else:
      student_id = student[0]


      cur.execute("select student_id from attendance where section_id = ? COLLATE NOCASE and card_id = ? COLLATE NOCASE", (args.section_id, card_id, ))
      attend = cur.fetchone()
      if attend == None:  
        cur.execute("insert into attendance (section_id, card_id, student_id) values (?, ?, ?)", (args.section_id, card_id, student_id, ))
        con.commit()
      else:
        cur.execute("update attendance set student_id = ?, update_datetime = datetime(CURRENT_TIMESTAMP,'localtime') where section_id = ? COLLATE NOCASE and card_id = ? COLLATE NOCASE", (student_id, args.section_id, card_id, ))
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
    if not card_id or not student_id:
      return jsonify({
        "status": "error",
        "student_id": "",
        "message": "card_id or student_id is empty."
      })

    # 既に登録済みのカードはUNIQUE制約違反になるため、事前にチェックする
    cur.execute("select student_id from students where card_id = ? COLLATE NOCASE", (card_id, ))
    student = cur.fetchone()
    if student != None:
      return jsonify({
        "status": "error",
        "student_id": student[0],
        "message": "このカードは登録済みです: {}".format(student[0])
      })

    cur.execute('''insert into students (card_id, student_id) values (?, ?)''', (card_id, student_id))

    cur.execute("select student_id from attendance where section_id = ? COLLATE NOCASE and card_id = ? COLLATE NOCASE", (args.section_id, card_id, ))
    attend = cur.fetchone()
    if attend == None:
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

    cur.execute("select card_id from students where student_id = ? COLLATE NOCASE", (student_id, ))
    student = cur.fetchone()
    if student == None:
      card_id = student_id # カード忘れの場合、かつ未登録学生の場合はカードIDは学籍番号と同じとする
    else:
      card_id = student[0]

    cur.execute("select student_id from attendance where section_id = ? COLLATE NOCASE and card_id = ? COLLATE NOCASE", (args.section_id, card_id, ))
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


# ---------------------------------------------------------------------------
# サーバー側 PC/SC 読み取りモード (read_mode == 'pcsc')
# ---------------------------------------------------------------------------
pcsc_state = {"running": False, "thread": None, "last_error": None}


def _candidate_keys():
  """keys_file から候補鍵(6バイト列のリスト)を読む。無ければ既定鍵。"""
  keys = []
  path = getattr(config, "keys_file", None)
  if path and os.path.exists(path):
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
      for raw in f:
        line = raw.split("#")[0].strip().replace(":", "").replace(" ", "")
        if len(line) == 12 and all(c in "0123456789abcdefABCDEF" for c in line):
          keys.append([int(line[i:i + 2], 16) for i in range(0, 12, 2)])
  return keys or [[0xFF] * 6]


def _make_reader():
  sim = getattr(config, "pcsc_simulate", None)
  if sim:
    return pcsc_reader.SimulatedReader(sim)
  return pcsc_reader.PcscReader()


def _process_card(reader, location, keys):
  """1枚読み取り→学籍番号抽出→出席登録し、配信用イベントを返す。"""
  uid_hex, image = reader.read_sector(location["sector"], keys)
  student_id = student_id_extract.extract_student_id(image, location)
  register_attendance_threadsafe(uid_hex or student_id, student_id)
  return {"type": "attend", "status": "ok", "student_id": student_id, "uid": uid_hex,
          "message": "出席登録完了しました: {}".format(student_id)}


def pcsc_loop():
  """実機モードの読み取りループ。新しいカードのたびに登録してプッシュ配信する。"""
  location = config.student_id_location
  keys = _candidate_keys()
  reader = _make_reader()
  last_uid = None
  misses = 0
  while pcsc_state["running"]:
    try:
      uid_hex, image = reader.read_sector(location["sector"], keys)
      misses = 0
      if uid_hex and uid_hex != last_uid:
        last_uid = uid_hex
        try:
          student_id = student_id_extract.extract_student_id(image, location)
          register_attendance_threadsafe(uid_hex or student_id, student_id)
          hub.publish({"type": "attend", "status": "ok", "student_id": student_id, "uid": uid_hex,
                       "message": "出席登録完了しました: {}".format(student_id)})
        except Exception as e:  # noqa: BLE001
          hub.publish({"type": "attend", "status": "error", "message": str(e)})
      time.sleep(0.3)
    except pcsc_reader.NoCardError:
      if last_uid is not None:
        misses += 1
        if misses >= 5:
          last_uid = None
      time.sleep(0.2)
    except pcsc_reader.AuthError as e:
      last_uid = None
      hub.publish({"type": "attend", "status": "error", "message": str(e)})
      time.sleep(0.5)
    except pcsc_reader.ReaderError as e:
      pcsc_state["last_error"] = str(e)
      hub.publish({"type": "reader", "status": "error", "message": str(e)})
      time.sleep(1.0)
    except Exception as e:  # noqa: BLE001
      pcsc_state["last_error"] = str(e)
      time.sleep(1.0)


def _start_pcsc():
  if pcsc_state["running"]:
    return
  pcsc_state["running"] = True
  pcsc_state["last_error"] = None
  # シミュレーション時はループを回さず、/pcsc/simulate-tap で駆動する。
  if getattr(config, "pcsc_simulate", None):
    return
  t = threading.Thread(target=pcsc_loop, daemon=True)
  pcsc_state["thread"] = t
  t.start()


@app.route("/events")
def events():
  """Server-Sent Events。読み取り結果をブラウザへプッシュする。"""
  def stream():
    q = hub.subscribe()
    try:
      yield "retry: 3000\n\n"
      while True:
        try:
          ev = q.get(timeout=15)
        except queue.Empty:
          yield ": keepalive\n\n"
          continue
        yield "data: " + json.dumps(ev, ensure_ascii=False) + "\n\n"
    finally:
      hub.unsubscribe(q)
  return Response(stream(), mimetype="text/event-stream",
                  headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.route("/pcsc/status")
def pcsc_status():
  return jsonify({"running": pcsc_state["running"], "last_error": pcsc_state["last_error"],
                  "simulate": bool(getattr(config, "pcsc_simulate", None))})


@app.route("/pcsc/start", methods=["POST"])
def pcsc_start():
  if getattr(config, "read_mode", "uid") != "pcsc":
    abort(404)
  _start_pcsc()
  return jsonify({"status": "ok", "running": pcsc_state["running"]})


@app.route("/pcsc/stop", methods=["POST"])
def pcsc_stop():
  pcsc_state["running"] = False
  return jsonify({"status": "ok", "running": False})


@app.route("/pcsc/simulate-tap", methods=["POST"])
def pcsc_simulate_tap():
  """シミュレーション用: ダンプを1回読んで登録し、プッシュ配信する。"""
  if getattr(config, "read_mode", "uid") != "pcsc" or not getattr(config, "pcsc_simulate", None):
    abort(404)
  try:
    ev = _process_card(pcsc_reader.SimulatedReader(config.pcsc_simulate), config.student_id_location, _candidate_keys())
  except Exception as e:  # noqa: BLE001
    ev = {"type": "attend", "status": "error", "message": str(e)}
  hub.publish(ev)
  return jsonify(ev)


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

  # PC/SC(サーバー側読み取り)モードならバックグラウンド読み取りを開始
  if getattr(config, "read_mode", "uid") == "pcsc":
    _start_pcsc()

  # Flaskの起動（SSEとバックグラウンド読み取りのため threaded=True）
  app.run(port=config.run_port,
          host=config.run_host,
          debug=config.run_debug,
          threaded=True)