import sqlite3
import openpyxl

import config

import argparse
parser = argparse.ArgumentParser()
parser.add_argument("output_filename", help="出力ファイル名を入力してください。", type=str)
args = parser.parse_args()

con = sqlite3.connect(config.database_name)
cur = con.cursor()

def main():
  # WorkBookの作成
  wb = openpyxl.Workbook()
  sheet = wb.active
  wb.remove(sheet) # Sheet1の削除

  cur.execute("select section_id from attendance group by section_id")
  sections = cur.fetchall()
  for section in sections:
    # Sheetの作成
    ws = wb.create_sheet()
    ws.title = str(section[0])

    cur.execute("select id, card_id, student_id, create_datetime, update_datetime from attendance where section_id = ? order by student_id", (section[0], ))
    attended = cur.fetchall()
    for row in attended:
      ws.append(row)

  wb.save(args.output_filename)


if __name__ == "__main__":
  try:
    main()
  finally:
    cur.close()
    con.close()
