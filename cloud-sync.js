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
    const res = await fetch(CLOUD_CONFIG.url + '/rest/v1/rpc/' + fn, {
      method: 'POST',
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
  }

  // ---- 保存（1.5秒デバウンスでまとめて送る） ----
  let pushTimer = null;
  let lastData = null;
  function schedulePush(saveObj) {
    lastData = saveObj;          // 最新の記録は常に保持しておく
    if (!enabled()) return;
    if (!getCred()) return;      // あいことば未設定なら送信はしない
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 1500);
  }
  async function pushNow(dataObj) {
    if (!enabled()) return;
    const cred = getCred();
    if (dataObj) lastData = dataObj;
    if (!cred || !lastData) return;
    try {
      lastData._syncedAt = new Date().toISOString(); // last-write-wins 用の目印
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lastData)); // _syncedAtをローカルにも反映
      await rpc('save_game', {
        p_app: CLOUD_CONFIG.app,
        p_nickname: cred.nickname,
        p_secret_hash: cred.secretHash,
        p_data: lastData
      });
    } catch (e) { /* ローカルは生きているので黙って諦める（次の保存で再送される） */ }
  }

  // ---- 読み込み（名前＋あいことばが合った記録を返す。無ければnull） ----
  async function pull(nickname, secretHash) {
    if (!enabled()) return null;
    try {
      const data = await rpc('load_game', {
        p_app: CLOUD_CONFIG.app,
        p_nickname: nickname,
        p_secret_hash: secretHash
      });
      return data || null;
    } catch (e) { return null; }
  }

  return {
    enabled: enabled,
    hashSecret: hashSecret,
    getCred: getCred,
    saveCred: saveCred,
    clearCred: clearCred,
    schedulePush: schedulePush,
    pushNow: pushNow,
    pull: pull,
    config: CLOUD_CONFIG
  };
})();
