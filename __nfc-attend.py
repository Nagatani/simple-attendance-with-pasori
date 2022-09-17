# こっちは使いません


import nfc
import time
import sqlite3
import binascii

import argparse
parser = argparse.ArgumentParser()
parser.add_argument("section_id", help="第何回かをパラメータで指定してください。", type=int)
args = parser.parse_args()

con = sqlite3.connect('attend_sub.db')
cur = con.cursor()

def on_connect_nfc(tag):
  # print(tag)
  
  card_id = binascii.hexlify(tag.identifier).decode('utf-8').upper()
  # print(card_id)

  student_id = ""

  cur.execute("select student_id from students where card_id = ?", (card_id, ))
  student = cur.fetchone()
  if student == None:
    # データなし
    print("学生証のバーコードを読み取るか、学籍番号を入力してください。")
    student_id = input()
    cur.execute('''insert into students (card_id, student_id) values (?, ?)''', (card_id, student_id))
    con.commit()
  else:
    student_id = student[0]


  cur.execute("select * from attendance where section_id = ? and card_id = ?", (args.section_id, card_id))
  if cur.fetchone() != None:
    print("出席登録済み: {}".format(student_id))
    return
  
  print("出席登録: {}".format(student_id))

  cur.execute('''insert into attendance (section_id, card_id, student_id) values (?, ?, ?)''', (args.section_id, card_id, student_id))
  con.commit()


def main():
  clf = nfc.ContactlessFrontend('usb')

  # cur.execute("drop table if exists students")
  # cur.execute("drop table if exists attendance")
  cur.execute('''create table if not exists students ( 
    id integer primary key autoincrement, 
    card_id nverchar(32), 
    student_id nverchar(32), 
    student_name nverchar(64) DEFAULT '', 
    create_datetime TIMESTAMP DEFAULT (datetime(CURRENT_TIMESTAMP,'localtime')), 
    update_datetime TIMESTAMP DEFAULT (datetime(CURRENT_TIMESTAMP,'localtime')) 
  )''')
  cur.execute('''create table if not exists attendance (
    id integer primary key autoincrement, 
    section_id nverchar(32), 
    card_id nverchar(32), 
    student_id nverchar(32), 
    create_datetime TIMESTAMP DEFAULT (datetime(CURRENT_TIMESTAMP,'localtime'))
  )''')
  con.commit()

  # print("講義回を入力:")
  # section_id = int(input())

  print("カードリーダーに学生証を近づけてください")

  while True:
    clf.connect(rdwr={'on-connect': on_connect_nfc})
    time.sleep(1)


if __name__ == "__main__":
  try:
    main()
  finally:
    cur.close()
    con.close()
  