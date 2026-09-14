/* ============================================================
   고객 문진 → 매니저 대시보드 전달 (handoff.js)
   · Firebase Realtime Database 를 "대기열 저장소"로 사용
     (GitHub Pages 처럼 서버가 없는 곳에서도 두 사이트가 같은 DB 를 보면 연동됨)
   · 여기 있는 FIREBASE_CONFIG 는 manager/js/live.js 와 동일하게 유지
   · Firebase 연결이 안 되면(오프라인 · 설정 없음) 모든 함수가 null 을 돌려주고
     app.js 는 기존 방식(콘솔 출력 · 임의 대기번호)으로 동작

   DB 구조
     queue/{key}          문진 1건 (status: waiting → serving → done)
     counter/{YYYYMMDD}   그날의 대기번호 카운터 (매일 1번부터)
     visits/{전화번호}     첫방문/재방문 판별용 방문 기록
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

const HANDOFF_TIMEOUT_MS = 6000;   // 이 시간 안에 DB 응답이 없으면 기존 방식으로 fallback

let handoffDb = null;
try {
  if (window.firebase && FIREBASE_CONFIG.databaseURL) {
    firebase.initializeApp(FIREBASE_CONFIG);
    handoffDb = firebase.database();
  }
} catch (e) {
  console.warn('[매니저 전달] Firebase 초기화 실패 — 콘솔 출력 방식으로 동작', e);
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/* 문진 결과를 대기열에 올림.
   payload: { phoneDigits, visitType, purpose, fromReservation, parts, zones(key), recommended(key) }
   성공 → { no: 대기번호, key: DB 키 } / 실패·미연결 → null                     */
async function sendHandoff(payload) {
  if (!handoffDb) return null;
  try {
    return await withTimeout((async () => {
      const phone = payload.phoneDigits || 'unknown';
      const now = Date.now();

      // 1) 이전 방문 기록 → 첫방문/재방문 (이번 방문을 기록하기 전에 읽어야 "이전" 기록이 됨)
      const prev = (await handoffDb.ref('visits/' + phone).once('value')).val();

      // 2) 대기번호 발급 — 날짜별 카운터, 동시 접수돼도 겹치지 않도록 transaction
      const tx = await handoffDb.ref('counter/' + todayKey()).transaction(n => (n || 0) + 1);
      const no = tx.snapshot.val();

      // 3) 대기열에 추가
      const ref = handoffDb.ref('queue').push();
      await ref.set({
        no,
        phone,
        type: payload.visitType || 'walkin',
        purpose: payload.purpose || null,
        fromReservation: !!payload.fromReservation,
        parts: payload.parts || [],
        zones: payload.zones || [],
        recommended: payload.recommended || [],
        visit: prev ? 'return' : 'first',
        history: prev ? { date: prev.lastDate || '', zones: prev.lastZones || [], summary: prev.lastSummary || '' } : null,
        status: 'waiting',
        doneAt: now,
      });

      // 4) 방문 기록 갱신 (다음 방문 때 "재방문"으로 보이게)
      await handoffDb.ref('visits/' + phone).set({
        count: (prev && prev.count ? prev.count : 0) + 1,
        lastAt: now,
        lastDate: new Date(now).toISOString().slice(0, 10),
        lastZones: payload.zones || [],
        lastSummary: prev && prev.lastSummary ? prev.lastSummary : '',
      });

      return { no: String(no), key: ref.key };
    })(), HANDOFF_TIMEOUT_MS);
  } catch (e) {
    console.warn('[매니저 전달] DB 전송 실패 — 콘솔 출력 방식으로 동작', e);
    return null;
  }
}

/* 내 문진의 상태를 실시간으로 구독 — 매니저가 "응대 시작"을 누르면 cb('serving') 호출 */
let handoffWatchRef = null;
function watchHandoff(key, cb) {
  stopHandoffWatch();
  if (!handoffDb || !key) return;
  handoffWatchRef = handoffDb.ref('queue/' + key + '/status');
  handoffWatchRef.on('value', snap => { const s = snap.val(); if (s) cb(s); });
}
function stopHandoffWatch() {
  if (handoffWatchRef) { handoffWatchRef.off(); handoffWatchRef = null; }
}

/* 매니저 재호출 — 카드에 표시할 시각만 기록 */
function sendRecall(key) {
  if (!handoffDb || !key) return;
  handoffDb.ref('queue/' + key + '/recalledAt').set(Date.now()).catch(() => {});
}
