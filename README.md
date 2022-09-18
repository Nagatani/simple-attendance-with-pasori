# simple-attendance-with-pasori
簡易出席登録

WebUSBでFelica使うコードは、以下のリポジトリを参考にしています。感謝感激。

- [marioninc/webusb-felica](https://github.com/marioninc/webusb-felica)


## require

- Sony PaSoRi RC-S380
- Python(pipenv)
- Google Chrome

## usage

```
$ pipenv install
$ pipenv run start 講義名を入力 1 # 最後の数字は講義のセクションの第n回
# ブラウザを開いて http://127.0.0.1:8000/
```

## workflow

1. 初回講義で学生証のNFC(mifare classicで検証)を読み取らせる
2. データベース上に生徒情報が存在しないので、学籍番号の入力を求めるダイアログを表示される
3. 学籍番号の入力は、バーコードリーダーなどで簡略化できると良い
4. 2回目以降は生徒が教室に入室後、都度学生証を読み込ませるだけで良い
5. 学生証忘れの場合は、専用の用紙に学籍番号や氏名等を書き込んでもらうことで不正の対策を行う
