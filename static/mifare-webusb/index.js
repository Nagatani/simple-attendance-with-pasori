// mifare-webusb / index.js
// Node / バンドラ向けの集約エントリ。3 モジュールを 1 つの名前空間にまとめる。
// ブラウザ(<script>)では各ファイルを直接読み込めば window.MifareWebUSB に入る。
'use strict';

module.exports = Object.assign(
  {},
  require('./mifare-classic.js'),
  require('./webusb-reader.js'),
  require('./student-id.js'),
);
