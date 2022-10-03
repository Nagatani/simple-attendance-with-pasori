import sqlite3
import openpyxl

import config

import argparse
parser = argparse.ArgumentParser()
parser.add_argument("section_id", help="第何回かをパラメータで指定してください。", type=int)
args = parser.parse_args()

con = sqlite3.connect(config.database_name)
cur = con.cursor()

def main():
  # WorkBookの作成
  wb = openpyxl.Workbook()
  sheet = wb.active
  wb.remove(sheet) # Sheet1の削除

  ws = wb.create_sheet() # 第何回かのシートを作成
  ws.title = str(args.section_id)

  cur.execute("select id, card_id, student_id, forgot_card, create_datetime, update_datetime from attendance where section_id = ? order by student_id", (args.section_id, ))

  ws.append(['ROWNUMBER', 'カードID', '学籍番号', 'カード忘れ', '登録日時', '更新日時'])
  attended = cur.fetchall()
  for row in attended:
    ws.append(row)

  wb.save(f"Attend_{ args.section_id }.xlsx")


if __name__ == "__main__":
  try:
    main()
  finally:
    cur.close()
    con.close()
