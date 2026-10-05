// パンダさんパワー充電器 — クラウドセーブ同期（名前＋あいことば方式）
// ------------------------------------------------------------
// 愛生博士と同じSupabaseテーブルをApp名で共用（app: 'panda-charger'）。
// 設計の正本: 愛生博士/docs/クラウドセーブ_設計と準備手順.md
window.CloudSync = (function () {
  const CLOUD_CONFIG = {
    url: 'https://bpqrvmredwixhrjpcsud.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwcXJ2bXJlZHdpeGhyanBjc3VkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwNTQ0ODksImV4cCI6MjA5OTYzMDQ4OX0.F0s7j6E-28xh6LOQIBc1NtsPB5z17Kjpfo8D2AJ4voI',
    app: 'panda-charger'
  };
  const CRED_KEY = 'ppcCloud';       // { nickname, secretHash }
  const STORAGE_KEY = 'ppc_save_v2'; // 充電器のセーブキー

  function enabled() {
    return !!(CLOUD_CONFIG.url && CLOUD_CONFIG.anonKey);
  }

  async function sha256Hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // あいことばは app名+名前 を混ぜてハッシュ化してから送る（生のあいことばは保存・送信しない）
  async function hashSecret(nickname, secret) {
    return sha256Hex(CLOUD_CONFIG.app + '|' + nickname + '|' + secret);
  }

  function getCred() {
    try { return JSON.parse(localStorage.getItem(CRED_KEY)) || null; } catch (e) { return null; }
  }
  function saveCred(nickname, secretHash) {
    localStorage.setItem(CRED_KEY, JSON.stringify({ nickname: nickname, secretHash: secretHash }));
  }
  function clearCred() { localStorage.removeItem(CRED_KEY); }

  async function rpc(fn, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(CLOUD_CONFIG.url + '/rest/v1/rpc/' + fn, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'apikey': CLOUD_CONFIG.anonKey,
          'Authorization': 'Bearer ' + CLOUD_CONFIG.anonKey
        },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error('rpc ' + fn + ' ' + res.status);
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    } finally { clearTimeout(timeout); }
  }

  // ---- 保存（1.5秒デバウンスでまとめて送る） ----
  let pushTimer = null;
  let lastData = null;
  let pushChain = Promise.resolve();
  let epoch = 0;
  let paused = false;
  function schedulePush(saveObj) {
    lastData = saveObj;          // 最新の記録は常に保持しておく
    if (paused) return;
    if (!enabled()) return;
    if (!getCred()) return;      // あいことば未設定なら送信はしない
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { pushNow().catch(() => {}); }, 1500);
  }
  function pushNow(dataObj) {
    clearTimeout(pushTimer);
    pushTimer = null;
    const cred = getCred();
    if (dataObj) lastData = dataObj;
    if (!enabled() || !cred || !lastData) return Promise.reject(new Error('save unavailable'));
    const source = lastData, ticket = epoch;
    const snapshot = JSON.parse(JSON.stringify(source));
    const job = pushChain.then(async () => {
      if (ticket !== epoch) throw new Error('save superseded');
      snapshot._syncedAt = new Date().toISOString();
      await rpc('save_game', {
        p_app: CLOUD_CONFIG.app,
        p_nickname: cred.nickname,
        p_secret_hash: cred.secretHash,
        p_data: snapshot
      });
      // 成功した保存だけを同期済みとする。通信中のプレイ結果は保持する。
      if (ticket === epoch && source === lastData) {
        source._syncedAt = snapshot._syncedAt;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(source)); } catch (_) {}
      }
    });
    // 古いリクエストが遅れて新しい記録を上書きしないよう、順番に送る。
    pushChain = job.catch(() => {});
    return job;
  }
  function adopt(dataObj) {
    paused = false;
    epoch++;
    clearTimeout(pushTimer);
    pushTimer = null;
    lastData = dataObj;
  }
  function pause() {
    paused = true;
    epoch++;
    clearTimeout(pushTimer);
    pushTimer = null;
    return pushChain;
  }
  function resume(dataObj) {
    paused = false;
    schedulePush(dataObj || lastData);
  }

  // ---- 読み込み（名前＋あいことばが合った記録を返す。無ければnull） ----
  async function pull(nickname, secretHash) {
    if (!enabled()) return null;
    const data = await rpc('load_game', {
      p_app: CLOUD_CONFIG.app,
      p_nickname: nickname,
      p_secret_hash: secretHash
    });
    return data || null;
  }

  return {
    enabled: enabled,
    hashSecret: hashSecret,
    getCred: getCred,
    saveCred: saveCred,
    clearCred: clearCred,
    schedulePush: schedulePush,
    pushNow: pushNow,
    adopt: adopt,
    pause: pause,
    resume: resume,
    pull: pull,
    config: CLOUD_CONFIG
  };
})();
