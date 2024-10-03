# simple-attendance-with-pasori
簡易出席登録

WebUSBでFelica使うコードは、以下のリポジトリを参考にしています。感謝感激。

- [marioninc/webusb-felica](https://github.com/marioninc/webusb-felica)

出席登録時の効果音は以下のサイトからいただきました。

- 効果音ラボ様 : [https://soundeffect-lab.info/sound/button/](https://soundeffect-lab.info/sound/button/)


## require

- Sony PaSoRi RC-S380
- Python 3 (with pipenv)
- Google Chrome

## setup (pipenv)

```
$ pip install pipenv
```

## usage

出席登録時

```
$ pipenv install
$ pipenv run start 講義名を入力 1 # 最後の数字は講義のセクションの第n回
# ブラウザを開いて http://127.0.0.1:8000/
```

出席登録後のExcel export

```
$ pipenv run export 1 # 最後の数字は講義のセクションの第n回 ※省略時全回
# Attend_1.xlsxが生成されています
```

### example

```
# 開始時
$ pipenv run start オブジェクト指向プログラミングおよび演習１ 1
# export
$ pipenv run export 1
```

## workflow

1. 初回講義で学生証のNFC（mifare classicで検証）を読み取らせる
1. データベース上に生徒情報が存在しないので、学籍番号の入力を求めるダイアログが表示されます
    - 未登録の生徒の学籍番号入力はキーボードからも可能だが、バーコードリーダーなどで簡略化できると良い
1. 2回目以降は生徒が教室に入室後、都度学生証を読み込ませるだけで良い
1. 学生証忘れの場合は、専用の用紙に学籍番号や氏名等を書き込んでもらうことで不正の対策を行う
    - 画面左下のカード忘れ登録リンクから、カード忘れの生徒の学籍番号を登録可能なので、紙に記入してもらった学籍番号は後ほど手動で登録する
