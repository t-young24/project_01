/* ============================================================
   매니저 대시보드 — 실시간 대기열 연결 (live.js)
   · 고객 문진 태블릿(js/handoff.js)이 Firebase Realtime Database 에 올린
     문진을 실시간으로 받아 응대카드로 만듦
   · FIREBASE_CONFIG 는 고객용 js/handoff.js 와 동일하게 유지
   · 연결이 안 되면 상단에 "연결 안 됨" 표시, 화면은 비어 있는 대기열로 동작
     (mock 데이터로 시연하려면 주소 뒤에 ?mock=1)
   ============================================================ */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBWM6TepIJibv1bICbjvwPuc89U_KSSFS4",
  authDomain: "cerazem-wellounge.firebaseapp.com",
  databaseURL: "https://cerazem-wellounge-default-rtdb.firebaseio.com",
  projectId: "cerazem-wellounge",
  storageBucket: "cerazem-wellounge.firebasestorage.app",
  messagingSenderId: "440716889729",
  appId: "1:440716889729:web:a76708b68d5953c9d90780",
};

let liveDb = null;
try {
  // ?live=0 → DB 연결 없이 화면만 (홍보영상·오프라인 시연용)
  if (window.firebase && FIREBASE_CONFIG.databaseURL && new URLSearchParams(location.search).get('live') !== '0') {
    firebase.initializeApp(FIREBASE_CONFIG);
    liveDb = firebase.database();
  }
} catch (e) {
  console.warn('[실시간 대기열] Firebase 초기화 실패', e);
}

/* 전화번호 마스킹: 01012345678 → 010-****-5678 */
function maskPhone(digits) {
  const d = String(digits || '').replace(/\D/g, '');
  if (d.length < 8) return '번호 없음';
  return `${d.slice(0, 3)}-****-${d.slice(-4)}`;
}

/* 대기열 구독 — 상태가 done 이 아닌 문진만 [{...}] 로 만들어 onList(list) 호출
   onConn(true/false) 는 연결 상태 표시용                                       */
function connectQueue(onList, onConn) {
  if (!liveDb) { onConn(false); return; }
  liveDb.ref('.info/connected').on('value', s => onConn(!!s.val()));
  liveDb.ref('queue').on('value', snap => {
    const raw = snap.val() || {};
    const list = Object.entries(raw)
      .filter(([, v]) => v && v.status !== 'done')
      .map(([key, v]) => ({
        id: key,
        no: v.no,
        phone: maskPhone(v.phone),
        phoneDigits: v.phone,
        type: v.type || 'walkin',
        purpose: v.purpose || null,
        visit: v.visit || 'first',
        doneAt: v.doneAt || Date.now(),
        parts: Array.isArray(v.parts) ? v.parts : [],
        zones: Array.isArray(v.zones) ? v.zones.filter(k => ZONES[k]) : [],
        recommended: Array.isArray(v.recommended) ? v.recommended.filter(k => ZONES[k]) : [],
        measured: null,                                      // 세라체크 측정은 체험 후 → 아직 연동 전
        history: v.history ? { date: v.history.date || '', zones: (v.history.zones || []).filter(k => ZONES[k]), measured: null, summary: v.history.summary || '' } : null,
        recalledAt: v.recalledAt || null,
        status: v.status || 'waiting',
      }));
    onList(list);
  }, err => { console.warn('[실시간 대기열] 읽기 실패', err); onConn(false); });
}

/* 응대 시작 / 완료 → DB 상태 변경 (구독 중인 모든 매니저 화면에 반영) */
function setQueueStatus(id, status) {
  if (!liveDb) return Promise.resolve();
  return liveDb.ref('queue/' + id + '/status').set(status).catch(e => console.warn('[실시간 대기열] 상태 변경 실패', e));
}

/* 체험 안내 완료 시 방문 기록에 한 줄 남김 → 다음 방문 때 "지난 상담 결과"로 표시 */
function saveVisitSummary(phoneDigits, summary) {
  if (!liveDb || !phoneDigits) return;
  liveDb.ref('visits/' + phoneDigits + '/lastSummary').set(summary).catch(() => {});
}
