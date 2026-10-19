// サーバー側 PC/SC 読み取りモード (read_mode == 'pcsc') のブラウザ側。
//
// サーバーがバックグラウンドでカードを読み、登録したら SSE(/events) で
// このページへプッシュしてくる。ここではその通知を受けて画面を更新し、
// 読み取りの開始やシミュレーション操作のボタンを配線するだけ。
// 表示・音・出席者リストは ui.js / append.js の関数を利用する。
//
// 他モードのスクリプトと衝突しないよう IIFE で閉じる。

(function () {
  'use strict';

  const getConfig = async () => {
    const res = await fetch('/config');
    return res.ok ? res.json() : {};
  };

  const handleEvent = (ev) => {
    if (ev.type === 'attend') {
      if (ev.status === 'ok') {
        if (typeof playReadSound === 'function') { playReadSound(); }
        processNewAttend(ev.student_id, true);
      } else {
        updateHeadingMessage(ev.message || '読み取りエラーが発生しました。');
      }
    } else if (ev.type === 'reader' && ev.status === 'error') {
      updateHeadingMessage(`リーダーエラー: ${ev.message}`);
    }
  };

  const connectEvents = () => {
    const es = new EventSource('/events');
    es.onmessage = (e) => {
      let ev;
      try { ev = JSON.parse(e.data); } catch (_) { return; }
      handleEvent(ev);
    };
    // 接続断は EventSource が自動再接続する。
    es.onerror = () => { console.info('SSE 再接続待ち…'); };
    return es;
  };

  document.addEventListener('DOMContentLoaded', async () => {
    let cfg;
    try { cfg = await getConfig(); } catch (e) { console.error(e); return; }
    if (cfg.read_mode !== 'pcsc') { return; }

    // UID 用の SETUP ボタンは使わない
    const setupButton = document.getElementById('start');
    if (setupButton) { setupButton.style.display = 'none'; }

    connectEvents();
    try {
      await fetch('/pcsc/start', { method: 'POST' });
      updateHeadingMessage('サーバー側リーダーで読み取り中。カードをかざしてください。');
    } catch (e) {
      console.error('読み取り開始に失敗:', e);
      updateHeadingMessage('読み取り開始に失敗しました。');
    }

    const button = document.getElementById('readStudentId');
    if (button) {
      if (cfg.pcsc_simulate) {
        button.textContent = 'テスト読み取り（シミュレーション）';
        button.style.display = '';
        button.onclick = (ev) => {
          ev.preventDefault();
          fetch('/pcsc/simulate-tap', { method: 'POST' });
        };
      } else {
        button.style.display = 'none';
      }
    }
  });
}());
