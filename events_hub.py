"""ブラウザへのプッシュ(SSE)用の簡易 pub/sub。

バックグラウンドの読み取りスレッドが publish し、各 SSE 接続が自分のキューから
受け取る。スレッドセーフ。
"""

import queue
import threading


class EventsHub:
  def __init__(self):
    self._subscribers = set()
    self._lock = threading.Lock()

  def subscribe(self):
    """新しい購読キューを作って登録する。"""
    q = queue.Queue(maxsize=100)
    with self._lock:
      self._subscribers.add(q)
    return q

  def unsubscribe(self, q):
    with self._lock:
      self._subscribers.discard(q)

  def publish(self, event):
    """全購読者へイベント(dict)を配る。詰まっている購読者はスキップ。"""
    with self._lock:
      subscribers = list(self._subscribers)
    for q in subscribers:
      try:
        q.put_nowait(event)
      except queue.Full:
        pass

  def subscriber_count(self):
    with self._lock:
      return len(self._subscribers)


hub = EventsHub()
