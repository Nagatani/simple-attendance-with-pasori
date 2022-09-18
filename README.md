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

