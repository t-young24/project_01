/* ============================================================
   세라젬 웰라운지 셀프 문진 — 동작(app.js)
   · 문구·체험존·제품·설정값은 js/config.js 에서 수정
   · 화면 구조는 index.html, 스타일은 css/style.css
   ============================================================ */

/* ---------- 상태 ---------- */
const state = {
  step: 1,
  history: [],          // 뒤로가기용
  parts: [],            // [{id:'thigh-l', part:'다리', lv:2}] — 도형(id) 단위로 저장, 표시는 part 이름으로 묶음
  pending: null,        // 강도 선택 대기 중인 도형 {id, part}
  zones: [],            // 선택한 체험존 key 목록 (다중)
  phone: '',            // 3단계 입력한 휴대폰 번호 (숫자만)
  visitType: null,      // 2단계: 'reserved' 예약 | 'walkin' 일반 방문
  reservation: null,    // 예약 고객이면 조회된 예약 정보 {parts, ...}
  purpose: null,        // 3-1단계(일반 방문): 'experience' | 'consult' | 'both'
  soundOn: new URLSearchParams(location.search).get('mute') !== '1',   // ?mute=1 → 음성 안내 끔 (홍보영상 등 다른 화면에 끼워 넣을 때)
};

/* ============================================================
   음성 안내 (Web Speech API - SpeechSynthesis)
   실제 음성 인식(STT)은 프로토타입에서 더미 처리
   ============================================================ */
let koVoice = null;
function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const voices = speechSynthesis.getVoices();
  koVoice = voices.find(v => v.lang === 'ko-KR') || voices.find(v => v.lang.startsWith('ko')) || null;
}
if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}
/* onEnd: 재생이 끝났을 때(또는 재생할 수 없을 때 즉시) 호출 */
function speak(text, onEnd) {
  const canSpeak = state.soundOn && ('speechSynthesis' in window);
  if (!canSpeak) { if (onEnd) onEnd(); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR';
  u.rate = 0.88;   // 고령층 고려: 조금 천천히
  u.pitch = 1.0;
  if (koVoice) u.voice = koVoice;
  let done = false;
  const finish = () => { if (done) return; done = true; if (onEnd) onEnd(); };
  u.onend = finish;
  u.onerror = finish;
  speechSynthesis.speak(u);
  // 일부 브라우저에서 onend가 오지 않는 경우 대비 (글자 수 기준 최대 대기)
  setTimeout(finish, Math.min(25000, 2500 + text.length * 180));
}
function toggleSound() {
  state.soundOn = !state.soundOn;
  document.getElementById('btnSound').textContent = state.soundOn ? '🔊' : '🔇';
  if (!state.soundOn && 'speechSynthesis' in window) speechSynthesis.cancel();
  toast(state.soundOn ? '음성 안내를 켰어요' : '음성 안내를 껐어요');
}

/* ============================================================
   화면 전환
   ============================================================ */
function go(step, { push = true } = {}) {
  if (push && state.step !== step) state.history.push(state.step);
  const prev = document.querySelector('.screen.active');
  if (prev) {
    prev.classList.remove('active');
    prev.classList.add('leaving');
    setTimeout(() => prev.classList.remove('leaving'), 600);
  }
  state.step = step;
  document.getElementById('s' + step).classList.add('active');
  const major = parseInt(step, 10);   // '3b' → 3, '6b' → 6 (부속 화면은 같은 번호 점을 켬)
  document.querySelectorAll('.step-dot').forEach(d => {
    const n = +d.dataset.step;
    d.classList.toggle('active', n === major);
    d.classList.toggle('done', n < major);
  });
  document.getElementById('btnBack').disabled = (step === 1);
  onEnter(step);
}
function goBack() {
  if (state.history.length === 0) return;
  const prev = state.history.pop();
  go(prev, { push: false });
}
function goHome() {
  // 상태 초기화
  state.history = [];
  state.parts = []; state.pending = null; state.zones = []; state.phone = '';
  state.visitType = null; state.reservation = null; state.purpose = null;
  document.getElementById('phoneAgree').checked = false;
  ticketNo = null; resultCode = null; managerAssigned = false;
  if (typeof stopHandoffWatch === 'function') stopHandoffWatch();
  handoffKey = null;
  renderSelected(); clearPending();
  document.querySelectorAll('.part').forEach(p => p.classList.remove('selected', 'pending', 'lv1', 'lv2', 'lv3'));
  go(1, { push: false });
}

/* 화면 진입 시 동작 */
function onEnter(step) {
  clearInterval(guideTimer);
  clearTimeout(managerTimer);
  clearTimeout(consultTimer);
  closeManagerModal();
  closeNotReadyModal();
  closeQrModal();
  if (step === 1) startWelcome();
  if (step === 2) startVisitStep();
  if (step === 3) startPhoneStep();
  if (step === '3b') startPurposeStep();
  if (step === '6b') startConsultWait();
  if (step === '6c') speak('담당자를 배정하였습니다. 문진에 응해 주셔서 감사합니다.');
  if (step === 4) speak('그림에서 아픈 부위를 눌러 주세요.');
  if (step === 5) renderZones();
  if (step === 6) renderManagerInfo();
  if (step === 7) { renderLegend(); replayRemoteGuide(); }
  if (step === 8) loadMeasurements();
}

/* ---------- 1단계: 음성 안내 (자동 전환 없음 · 시작하기 버튼으로만 진행) ---------- */
let welcomeToken = 0;
function startWelcome() {
  const token = ++welcomeToken;
  const hint = document.getElementById('autoHint');
  hint.textContent = '음성 안내를 들려드리고 있어요…';
  speak(WELCOME_TEXT, () => {
    if (token !== welcomeToken || state.step !== 1) return;
    hint.textContent = '준비되시면 시작하기 버튼을 눌러 주세요';
  });
}
function startSurvey() { welcomeToken++; go(2); }

/* ============================================================
   2단계 — 방문 유형 (예약 / 일반 방문)
   · 예약 고객: 3단계 전화번호로 예약 정보를 찾아 예약 시 체크한 부위를 불러오고
                4단계(부위 선택)를 건너뛰어 바로 5단계(체험 추천)로 이동
   · 일반 방문: 3단계 → 4단계 순서대로 진행
   ============================================================ */
function chooseVisit(type) {
  state.visitType = type;
  document.querySelectorAll('.visit-card').forEach(el => el.classList.toggle('chosen', el.dataset.visit === type));
  speak(type === 'reserved' ? '예약 고객으로 진행할게요.' : '일반 방문으로 진행할게요.');
  setTimeout(() => go(3), 350);   // 선택 표시가 보인 뒤 이동
}
function startVisitStep() {
  document.querySelectorAll('.visit-card').forEach(el => el.classList.toggle('chosen', el.dataset.visit === state.visitType));
  speak('예약하고 오셨나요? 예약 고객 또는 일반 방문 중에 눌러 주세요.');
}
/* 예약 정보 조회 (프로토타입: config.js 의 RESERVATIONS 에서 전화번호로 찾음) */
function findReservation(digits) {
  return (typeof RESERVATIONS === 'object' && RESERVATIONS[digits]) || null;
}
/* 예약 시 체크한 부위를 문진 상태에 그대로 적용 (인체모형 하이라이트 포함) */
function applyReservationParts(parts) {
  state.parts = [];
  document.querySelectorAll('.part').forEach(p => p.classList.remove('selected', 'pending', 'lv1', 'lv2', 'lv3'));
  parts.forEach(({ part, lv }) => {
    const el = document.querySelector(`.part[data-part="${part}"]`);   // 같은 이름 도형 중 첫 번째
    if (!el) return;
    state.parts.push({ id: el.dataset.id, part, lv });
    el.classList.add('selected', 'lv' + lv);
  });
  renderSelected();
}

/* ============================================================
   3단계 — 전화번호 입력 (데이터 수집용)
   · 숫자 키패드만 제공 → 숫자 외 입력 불가
   · 010-1234-5678 형식으로 자동 하이픈, 11자리 + 동의 체크 시 다음 단계
   ============================================================ */
function phoneDigits() { return state.phone || ''; }
function formatPhone(d) {
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`;
}
function phoneKey(k) {
  let d = phoneDigits();
  if (k === 'del') d = d.slice(0, -1);
  else if (k === 'clear') d = '';
  else if (d.length < 11) d += k;
  state.phone = d;
  renderPhone();
}
function renderPhone() {
  const d = phoneDigits();
  const box = document.getElementById('phoneDisplay');
  box.textContent = d ? formatPhone(d) : '010-0000-0000';
  box.classList.toggle('placeholder', !d);
  const valid = /^01[016789]\d{7,8}$/.test(d) && d.length === 11;
  const agreed = document.getElementById('phoneAgree').checked;
  document.getElementById('btnS3Next').disabled = !(valid && agreed);
  document.getElementById('s3Status').textContent =
    !d ? '휴대폰 번호 11자리를 눌러주세요'
    : !valid ? `${d.length} / 11자리`
    : !agreed ? '아래 동의에 체크해주세요'
    : '입력이 완료되었어요';
}
function finishPhone() {
  if (document.getElementById('btnS3Next').disabled) return;
  console.log('[데이터 수집] 전화번호', formatPhone(phoneDigits()), '· 방문 유형:', state.visitType);
  if (state.visitType === 'reserved') {
    const rsv = findReservation(phoneDigits());
    if (rsv) {
      state.reservation = rsv;
      applyReservationParts(rsv.parts);
      toast('📅 예약 정보를 불러왔어요 · 체크하신 부위로 바로 추천해 드릴게요');
      go(5);                     // 4단계(부위 선택) 건너뛰기
      return;
    }
    state.reservation = null;
    toast('예약 정보를 찾지 못했어요 · 불편한 부위를 직접 선택해주세요');
    speak('예약 정보를 찾지 못했어요. 불편한 부위를 직접 선택해 주세요.');
    go(4);
    return;
  }
  go('3b');   // 일반 방문 → 3-1 방문 목적 선택
}

/* ============================================================
   3-1단계 — 방문 목적 (일반 방문 고객만)
   · experience : 제품 체험 먼저            → 4단계(부위 선택)
   · consult    : 구매/구독(렌탈) 상담       → 6-1 상담 대기 화면 (문진 종료)
   · both       : 체험 + 상담               → 4단계, 매니저에게 상담 희망 전달
   ============================================================ */
const PURPOSE_LABEL = { experience: '제품 체험', consult: '구매/구독(렌탈) 상담', both: '체험 + 구매/구독(렌탈) 상담' };
function startPurposeStep() {
  document.querySelectorAll('.purpose-card').forEach(el => el.classList.toggle('chosen', el.dataset.purpose === state.purpose));
  speak('방문 목적을 선택해 주세요.');
}
function choosePurpose(p) {
  state.purpose = p;
  document.querySelectorAll('.purpose-card').forEach(el => el.classList.toggle('chosen', el.dataset.purpose === p));
  setTimeout(() => go(p === 'consult' ? '6b' : 4), 350);
}

/* ---------- 6-1단계 — 상담 대기 (구매/구독 상담만 원하는 고객) ---------- */
let consultTimer = null;
async function startConsultWait() {
  clearTimeout(consultTimer);
  document.getElementById('consultWaitNo').textContent = '…';
  if (!ticketNo) {
    // 매니저 대시보드로 상담 요청 전달 (부위·존 없음) → 대기번호 발급
    await deliverToManager({
      time: new Date().toLocaleString('ko-KR'),
      phone: formatPhone(phoneDigits()), phoneDigits: phoneDigits(),
      visitType: state.visitType, purpose: state.purpose, fromReservation: false,
      parts: [], zones: [], recommended: [],
    });
    if (state.step !== '6b') return;            // 기다리는 동안 다른 화면으로 이동했으면 중단
    if (!ticketNo) ticketNo = newTicketNo();
  }
  document.getElementById('consultWaitNo').textContent = ticketNo;
  console.log('[매니저 전달] 상담 요청', {
    time: new Date().toLocaleString('ko-KR'), ticket: ticketNo,
    phone: formatPhone(phoneDigits()), visitType: state.visitType, purpose: PURPOSE_LABEL[state.purpose],
  });
  speak(`구매 상담 요청이 담당 매니저에게 전달되었어요. 고객님의 대기번호는 ${ticketNo}번입니다. 담당 매니저가 곧 안내해 드릴 예정이니 잠시만 기다려 주세요.`);
  // 담당자 배정은 매니저 화면에서 "응대 시작"을 누를 때 (watchHandoff). 매니저 연동이 안 됐을 때만 시간 경과로 진행
  if (!handoffKey) consultTimer = setTimeout(() => { if (state.step === '6b') go('6c'); }, MANAGER_WAIT_MS);
}
function startPhoneStep() {
  renderPhone();
  const reserved = state.visitType === 'reserved';
  document.getElementById('phoneSub').textContent = reserved
    ? '예약하실 때 등록한 휴대폰 번호를 눌러주세요 · 예약 정보를 찾아드려요'
    : '체험 안내와 결과표 전송, 체험 이력에만 사용';
  speak(reserved
    ? '예약하실 때 등록한 휴대폰 번호를 눌러 주세요.'
    : '휴대폰 번호를 눌러 주세요. 체험 안내와 결과표 전송, 체험 이력에만 사용돼요.');
}

/* ============================================================
   한국어 조사 처리 — 받침 유무에 따라 "등이/다리가", "등을/다리를" 자동 선택
   ============================================================ */
function hasBatchim(word) {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xAC00 || code > 0xD7A3) return false;   // 한글이 아니면 받침 없음으로 처리
  return (code - 0xAC00) % 28 !== 0;
}
function josa(word, pair) {          // pair: '이가' | '을를' | '은는' | '과와'
  const [withB, withoutB] = [pair[0], pair[1]];
  return word + (hasBatchim(word) ? withB : withoutB);
}

/* ============================================================
   2단계 — 인체모형
   · 도형(data-id) 하나하나를 개별 터치/하이라이트
   · 목록·음성에는 통일된 이름(data-part)만 노출, 같은 이름은 한 줄로 묶음
   ============================================================ */
document.querySelectorAll('#bodySvg .part').forEach(g => {
  g.addEventListener('click', () => onPartTap(g.dataset.id, g.dataset.part));
});
const LV_NAME = { 1: '약함', 2: '보통', 3: '심함' };

/* 같은 이름끼리 묶기 → [{part, lv(가장 높은 단계), ids}] (처음 선택한 순서 유지) */
function groupedParts() {
  const map = new Map();
  state.parts.forEach(({ id, part, lv }) => {
    if (!map.has(part)) map.set(part, { part, lv, ids: [] });
    const g = map.get(part);
    g.lv = Math.max(g.lv, lv);
    g.ids.push(id);
  });
  return [...map.values()];
}
function partEl(id) { return document.querySelector(`.part[data-id="${id}"]`); }

function onPartTap(id, part) {
  const exists = state.parts.find(p => p.id === id);
  if (exists) { removeRegion(id); return; }          // 선택된 도형을 다시 누르면 그 도형만 취소
  const names = new Set(state.parts.map(p => p.part));
  if (!names.has(part) && names.size >= MAX_PARTS) {
    toast('최대 5곳까지만 선택할 수 있어요');
    speak('최대 다섯 곳까지만 선택할 수 있어요.');
    return;
  }
  // 강도 선택 대기
  state.pending = { id, part };
  document.querySelectorAll('.part').forEach(p => p.classList.toggle('pending', p.dataset.id === id));
  document.getElementById('pendingTitle').textContent = `${josa(part, '이가')} 얼마나 불편하세요?`;
  document.getElementById('intensityCard').hidden = false;
  document.getElementById('hintCard').hidden = true;
  speak(`${josa(part, '이가')} 얼마나 불편하세요? 약함, 보통, 심함 중에 골라 주세요.`);
}
function setIntensity(lv) {
  if (!state.pending) return;
  const { id, part } = state.pending;
  state.parts.push({ id, part, lv });
  const g = partEl(id);
  g.classList.remove('pending'); g.classList.add('selected', 'lv' + lv);
  clearPending();
  renderSelected();
  speak(`${josa(part, '은는')} ${LV_NAME[lv]}으로 선택했어요. 더 고르시거나 선택 완료를 눌러 주세요.`);
}
function clearPending() {
  state.pending = null;
  document.querySelectorAll('.part.pending').forEach(p => p.classList.remove('pending'));
  document.getElementById('intensityCard').hidden = true;
  document.getElementById('hintCard').hidden = false;
}
/* 도형 하나만 취소 */
function removeRegion(id) {
  state.parts = state.parts.filter(p => p.id !== id);
  partEl(id).classList.remove('selected', 'lv1', 'lv2', 'lv3');
  renderSelected();
}
/* 목록의 ✕ — 같은 이름의 도형을 모두 취소 */
function removePart(part) {
  state.parts.filter(p => p.part === part).forEach(p => partEl(p.id).classList.remove('selected', 'lv1', 'lv2', 'lv3'));
  state.parts = state.parts.filter(p => p.part !== part);
  renderSelected();
}
function renderSelected() {
  const groups = groupedParts();
  const ul = document.getElementById('selectedList');
  ul.innerHTML = groups.map(g => `
    <li>
      <span class="p-name">${josa(g.part, '이가')} 아파요</span>
      <span class="chip lv${g.lv}">${g.lv}단계 · ${LV_NAME[g.lv]}</span>
      <button class="remove-btn" onclick="removePart('${g.part}')" aria-label="${g.part} 취소">✕</button>
    </li>`).join('');
  document.getElementById('selCount').textContent = groups.length;
  document.getElementById('emptyMsg').hidden = groups.length > 0;
  const ok = groups.length > 0;
  document.getElementById('btnS4Next').disabled = !ok;
  document.getElementById('s4Status').textContent = ok
    ? `${groups.length}곳 선택됨 · 더 고르거나 완료를 눌러주세요`
    : '부위를 1곳 이상 선택해주세요';
}
function finishBody() {
  if (state.parts.length === 0) return;
  clearPending();
  state.zones = [];
  go(5);
}

/* ============================================================
   3단계 — 체험존 추천 (다중 선택)  · ZONES, PART_WEIGHT 는 config.js
   ============================================================ */
function recommend() {
  const score = {}; const reasons = {};
  groupedParts().forEach(({ part, lv }) => {
    Object.entries(PART_WEIGHT[part] || {}).forEach(([z, w]) => {
      score[z] = (score[z] || 0) + w * lv;
      (reasons[z] = reasons[z] || []).push(part);
    });
  });
  let ranked = Object.entries(score).sort((a, b) => b[1] - a[1]).map(([z]) => z);
  if (ranked.length === 0) ranked = ['rest', 'spine'];
  // 점수가 1위 대비 절반 미만이면 2번째 추천에서 제외
  const top = ranked.slice(0, 2).filter((z, i) => i === 0 || score[z] >= score[ranked[0]] * 0.5);
  return top.map(z => ({ key: z, reasons: [...new Set(reasons[z] || [])] }));
}
let recKeys = [];
/* 존 카드 1장 — badge: '가장 추천' | '함께 추천' | null */
function zoneCard(key, badge, reasons, big) {
  const z = ZONES[key];
  return `
    <div class="zone-card ${big ? 'big' : ''}" data-zone="${key}" onclick="toggleZone('${key}')">
      <div class="zone-icon" style="background:${z.color}">${z.icon}</div>
      <div class="zone-text">
        ${badge ? `<span class="rec-badge ${badge === '가장 추천' ? '' : 'sub'}">${badge}</span>` : ''}
        <h2>${z.name}</h2>
        <p>${z.short}</p>
        ${reasons && reasons.length ? `<div class="zone-reason">${reasons.join(' · ')} 불편에 도움이 돼요</div>` : ''}
      </div>
      <div class="zone-check">✓</div>
    </div>`;
}
/* 모든 존을 처음부터 표시: 위 = 가장 추천 1개(크게), 아래 = 나머지 존 2열 */
function renderZones() {
  const recs = recommend();
  recKeys = recs.map(r => r.key);
  const top = recs[0];
  const reasonOf = key => (recs.find(r => r.key === key) || {}).reasons || [];

  // 추천 근거 표시: 예약 시 체크한 부위 / 방금 선택한 부위
  const basis = document.getElementById('zoneBasis');
  const chips = groupedParts().map(g => `<span class="chip lv${g.lv}">${g.part} ${g.lv}단계</span>`).join('');
  basis.innerHTML = state.reservation
    ? `<span class="basis-label">📅 예약 시 체크하신 부위</span>${chips}<button class="btn btn-ghost basis-edit" onclick="go(4)">부위 바꾸기</button>`
    : `<span class="basis-label">선택하신 부위</span>${chips}`;

  document.getElementById('zoneTop').innerHTML = zoneCard(top.key, '가장 추천', top.reasons, true);
  document.getElementById('zoneGrid').innerHTML = Object.keys(ZONES)
    .filter(key => key !== top.key)
    .map(key => zoneCard(key, recKeys.includes(key) ? '함께 추천' : null, reasonOf(key), false))
    .join('');

  updateZoneUI();
  const names = recs.map(r => ZONES[r.key].name).join('과 ');
  speak(`${josa(names, '을를')} 추천드려요. 원하시는 체험을 모두 눌러 주세요. 다른 체험도 함께 고르실 수 있어요.`);
}
function toggleZone(key) {
  const idx = state.zones.indexOf(key);
  if (idx >= 0) { state.zones.splice(idx, 1); speak(`${ZONES[key].name} 선택을 취소했어요.`); }
  else { state.zones.push(key); speak(`${josa(ZONES[key].name, '을를')} 선택했어요.`); }
  updateZoneUI();
}
function updateZoneUI() {
  document.querySelectorAll('[data-zone]').forEach(el => el.classList.toggle('chosen', state.zones.includes(el.dataset.zone)));
  const ok = state.zones.length > 0;
  document.getElementById('btnS5Next').disabled = !ok;
  const strip = document.getElementById('chosenStrip');
  strip.innerHTML = ok
    ? `<span class="label">선택한 체험</span>` + state.zones.map(k => `<span class="chip blue">${ZONES[k].icon} ${ZONES[k].name}</span>`).join('')
    : `<span class="label">체험존을 하나 이상 골라주세요</span>`;
}
async function confirmZones() {
  if (state.zones.length === 0) return;
  const payload = {
    time: new Date().toLocaleString('ko-KR'),
    phone: formatPhone(phoneDigits()),
    phoneDigits: phoneDigits(),
    visitType: state.visitType,                       // 'reserved' | 'walkin'
    purpose: state.purpose,                           // 일반 방문의 방문 목적 key ('experience' | 'consult' | 'both')
    fromReservation: !!state.reservation,             // 부위 정보가 예약 시 체크한 것인지
    parts: groupedParts().map(g => ({ part: g.part, lv: g.lv })),
    zones: [...state.zones],                          // 체험존 key (매니저 화면과 공통)
    recommended: [...recKeys],
  };
  console.log('[매니저 전달] 문진 결과', payload);
  // 매니저 대시보드(Firebase)로 전달 → 대기번호 발급. 연결 안 되면 기존처럼 임의 번호
  const btn = document.getElementById('btnS5Next');
  btn.disabled = true; btn.textContent = '전달 중…';
  await deliverToManager(payload);
  btn.disabled = false; btn.textContent = '선택 완료 ▶';
  go(6);
}

/* ---------- 매니저 전달 공통 (handoff.js) ----------
   · 전송 성공 → 서버가 발급한 대기번호를 ticketNo 로 사용하고, 매니저가 "응대 시작"을
     누르는 순간을 실시간으로 받아 배정 안내창을 띄움 (20초 타이머는 fallback 으로 유지)  */
let handoffKey = null;
async function deliverToManager(payload) {
  if (typeof sendHandoff !== 'function') return;
  const res = await sendHandoff(payload);
  if (!res) return;
  ticketNo = res.no;
  handoffKey = res.key;
  watchHandoff(handoffKey, status => {
    if (status !== 'serving') return;
    if (state.step === 6 && !managerAssigned) { clearTimeout(managerTimer); showManagerModal(); }
    if (state.step === '6b') { clearTimeout(consultTimer); go('6c'); }
  });
}

/* ============================================================
   4단계 — 매니저 전달 확인 (신규)
   ============================================================ */
function renderManagerInfo() {
  // 대기번호 발급 (한 고객당 하나 · 프로토타입은 1~20 사이 임의 번호, 실제는 서버 발급)
  if (!ticketNo) ticketNo = newTicketNo();
  document.getElementById('waitNo').textContent = ticketNo;
  const grid = document.getElementById('infoGrid');
  grid.classList.toggle('single', state.zones.length === 1);
  grid.innerHTML = state.zones.map(k => {
    const z = ZONES[k];
    return `
    <div class="card info-card">
      <div class="info-head">
        <div class="zone-icon" style="background:${z.color}">${z.icon}</div>
        <div><h2>${z.name}</h2><span class="sub" style="font-size:20px;">${z.short}</span></div>
      </div>
      <p>${z.detail}</p>
      <div class="product-title">이 존에 준비된 세라젬 제품</div>
      <div class="product-list">${z.products.map(p => `<span>${p}</span>`).join('')}</div>
    </div>`;
  }).join('');
  const names = state.zones.map(k => ZONES[k].name).join(', ');
  speak(`선택하신 ${names} 체험이 담당 매니저에게 전달되었어요. 고객님의 대기번호는 ${ticketNo}번입니다. 잠시만 기다려 주시면 매니저가 안내해 드릴게요.`);
  // 담당 매니저 배정 = 매니저 화면에서 "응대 시작"을 누르는 순간 (watchHandoff 가 showManagerModal 호출). 그 전에는 체험 시작 불가
  // 매니저 연동이 안 됐을 때(오프라인 · 설정 없음)만 MANAGER_WAIT_MS 뒤 자동 배정으로 시연 가능
  if (!managerAssigned) {
    document.getElementById('s6Status').textContent = '담당 직원을 배정하고 있어요…';
    if (!handoffKey) managerTimer = setTimeout(() => { if (state.step === 6) showManagerModal(); }, MANAGER_WAIT_MS);
  } else {
    document.getElementById('s6Status').textContent = '담당 매니저가 배정되었어요 · 체험을 시작하세요';
  }
}

/* ---------- 매니저 배정 · 호출 안내창 (테이블오더 방식) ---------- */
let managerTimer = null;
let managerAssigned = false;   // 매니저 호출 안내창이 뜬 뒤 true → 체험 시작 가능
let ticketNo = null;           // 대기번호 — 한 고객(한 번의 문진)당 하나
function newTicketNo() {   // 1 ~ TICKET_MAX (config.js 에 없으면 20)
  const max = typeof TICKET_MAX === 'number' ? TICKET_MAX : 20;
  return String(Math.floor(Math.random() * max) + 1);
}
function showManagerModal() {
  if (!ticketNo) ticketNo = newTicketNo();
  managerAssigned = true;
  closeNotReadyModal();
  document.getElementById('ticketNo').textContent = ticketNo + '번';
  document.getElementById('ticketZones').textContent = state.zones.map(k => ZONES[k].name).join(' · ');
  document.getElementById('managerModal').hidden = false;
  document.getElementById('s6Status').textContent = '담당 매니저가 배정되었어요 · 체험을 시작하세요';
  console.log('[매니저 호출]', { ticket: ticketNo, zones: state.zones.map(k => ZONES[k].name), time: new Date().toLocaleString('ko-KR') });
  speak('잠시 후 담당 매니저가 체험 안내를 도와드리겠습니다. 자리에서 편안히 기다려 주세요.');
}
function closeManagerModal() {
  document.getElementById('managerModal').hidden = true;
}
/* 체험 시작 버튼: 매니저 배정 전이면 대기 안내창, 배정 후면 6단계로 */
function startExperience() {
  if (!managerAssigned) {
    document.getElementById('notReadyModal').hidden = false;
    speak('아직 담당 직원이 배정되지 않았어요. 잠시만 기다려 주세요.');
    return;
  }
  go(7);
}
function closeNotReadyModal() {
  document.getElementById('notReadyModal').hidden = true;
}
function callManagerAgain() {
  console.log('[매니저 재호출]', { ticket: ticketNo, time: new Date().toLocaleString('ko-KR') });
  if (typeof sendRecall === 'function') sendRecall(handoffKey);
  toast('🔔 매니저를 다시 호출했어요');
  speak('매니저를 다시 호출했어요. 곧 도와드릴게요.');
}

/* ============================================================
   5단계 — 리모컨 안내  · REMOTE_GUIDE 는 config.js
   ============================================================ */
function renderLegend() {
  document.getElementById('remoteLegend').innerHTML = REMOTE_GUIDE.map(g => `
    <div class="legend-item" data-r="${g.n}">
      <div class="legend-num" style="background:${g.color}">${g.n}</div>
      <div class="legend-icon">${g.icon}</div>
      <div class="legend-text"><b>${g.name}</b><span>${g.desc}</span></div>
    </div>`).join('');
}
let guideTimer = null;
function replayRemoteGuide() {
  clearInterval(guideTimer);
  document.querySelectorAll('.glow').forEach(el => el.classList.remove('glow'));
  speak('리모컨 사용법을 안내해 드릴게요. ' + REMOTE_GUIDE.map(g => `${g.n}번 ${g.name} 버튼은 ${g.desc}.`).join(' ') + ' 도움이 필요하시면 매니저 호출 버튼을 눌러 주세요.');
  // 버튼을 순서대로 하나씩 강조
  let i = 0;
  const highlight = () => {
    document.querySelectorAll('.glow').forEach(el => el.classList.remove('glow'));
    if (i >= REMOTE_GUIDE.length) { clearInterval(guideTimer); return; }
    const n = REMOTE_GUIDE[i].n;
    document.querySelectorAll(`[data-r="${n}"]`).forEach(el => el.classList.add('glow'));
    i++;
  };
  highlight();
  guideTimer = setInterval(highlight, 2600);
}

/* ============================================================
   6단계 — 세라체크존 결과 리포트
   · MEASURE_API_URL(config.js) 에서 실제 측정 데이터를 fetch 로 불러옴
   · 불러오지 못하면(파일 없음, 서버 꺼짐, file:// 로 열어서 fetch 차단 등)
     FALLBACK_MEASUREMENTS(config.js) 를 쓰고 화면에 "예시 데이터"라고 표시
   ============================================================ */

/* 기기 데이터 형식 검사 — 필수 항목이 숫자인지 확인 */
function isValidMeasurement(d) {
  return d && d.bloodPressure
    && Number.isFinite(d.bloodPressure.sys) && Number.isFinite(d.bloodPressure.dia)
    && ['pulse', 'stress', 'bodyFat', 'muscle', 'bodyTemp'].every(k => Number.isFinite(d[k]));
}

/* 실제 데이터 불러오기 → { data, source: 'live' | 'fallback', measuredAt } */
async function fetchMeasurements() {
  const url = MEASURE_API_URL + (MEASURE_API_URL.includes('?') ? '&' : '?') + 't=' + Date.now(); // 캐시 방지
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!isValidMeasurement(data)) throw new Error('데이터 형식이 맞지 않음');
    return { data, source: 'live', measuredAt: data.measuredAt || null };
  } catch (e) {
    console.warn('[세라체크존] 측정 데이터를 불러오지 못해 예시 데이터를 표시합니다:', e.message, '(주소: ' + MEASURE_API_URL + ')');
    return { data: FALLBACK_MEASUREMENTS, source: 'fallback', measuredAt: null };
  }
}
function clamp(v) { return Math.max(3, Math.min(97, v)); }
const ST_LABEL = { ok: '정상', warn: '주의', danger: '위험' };

/* 측정값 → 상태(ok/warn/danger) + 쉬운 설명 + 게이지 위치 + 보고서용 상세 정보 */
function interpret(m) {
  const items = [];
  // 혈압
  {
    const s = m.bloodPressure.sys, d = m.bloodPressure.dia;
    let st = 'ok', desc = '혈압이 정상 범위예요. 좋아요!';
    if (s >= 140 || d >= 90) { st = 'danger'; desc = '혈압이 높은 편이에요. 일어나실 때 천천히 움직이시고, 오늘은 무리하지 마세요.'; }
    else if (s >= 130 || d >= 85) { st = 'warn'; desc = '혈압이 다소 높은 편이에요. 댁에서도 편안하게 쉬어주시면 좋아요.'; }
    items.push({
      icon: '❤️', title: '혈압', value: `${s} / ${d}`, unit: 'mmHg', st, desc,
      pos: clamp((s - 90) / (170 - 90) * 100),
      normal: '수축기 90~129 · 이완기 60~84 mmHg', scale: ['90', '170'],
      position: st === 'ok' ? '정상 범위 안에 있어요' : st === 'warn' ? '정상보다 조금 높은 "주의" 구간이에요' : '"위험" 구간에 들어와 있어요',
      tip: '짠 음식을 줄이고, 하루 30분 정도 천천히 걷기를 꾸준히 해보세요. 혈압은 아침에 일어나서 한 번 더 재보시면 좋아요.',
    });
  }
  // 맥박
  {
    const p = m.pulse;
    let st = 'ok', desc = '심장 박동이 안정적이에요.';
    if (p > 100 || p < 50) { st = 'danger'; desc = '심장 박동이 평소와 달라요. 바로 나가지 마시고 잠시 앉아서 쉬었다 가세요.'; }
    else if (p > 90 || p < 55) { st = 'warn'; desc = '심장이 조금 빠르게 뛰고 있어요. 잠시 앉아서 숨을 고르고 가세요.'; }
    items.push({
      icon: '💓', title: '맥박', value: `${p}`, unit: '회/분', st, desc,
      pos: clamp((p - 40) / (120 - 40) * 100),
      normal: '1분에 55~90회', scale: ['40', '120'],
      position: st === 'ok' ? '정상 범위 한가운데에 있어요' : st === 'warn' ? '정상 범위를 살짝 벗어난 "주의" 구간이에요' : '"위험" 구간이에요',
      tip: '카페인 음료를 줄이고, 숨을 천천히 깊게 쉬는 연습이 도움이 돼요.',
    });
  }
  // 스트레스
  {
    const v = m.stress;
    let st = 'ok', desc = '스트레스가 낮은 편이에요. 편안한 상태예요.';
    if (v >= 75) { st = 'danger'; desc = '스트레스가 많이 쌓여 있어요. 오늘 밤은 일찍 푹 주무세요.'; }
    else if (v >= 50) { st = 'warn'; desc = '스트레스가 조금 쌓여 있어요. 집에서도 쉬는 시간을 가져보세요.'; }
    items.push({
      icon: '🧠', title: '스트레스', value: `${v}`, unit: '점', st, desc,
      pos: clamp(v),
      normal: '0~49점 (낮을수록 편안한 상태)', scale: ['0점', '100점'],
      position: st === 'ok' ? '편안한 "정상" 구간이에요' : st === 'warn' ? '조금 쌓인 "주의" 구간이에요' : '많이 쌓인 "위험" 구간이에요',
      tip: '하루 10분이라도 조용히 눈을 감고 쉬는 시간을 가져보세요. 오늘처럼 몸을 풀어주는 시간을 자주 가지시면 긴장이 줄어들어요.',
    });
  }
  // 체지방률
  {
    const v = m.bodyFat;
    let st = 'ok', desc = '체지방이 적당해요.';
    if (v >= 35) { st = 'danger'; desc = '체지방이 많은 편이에요. 가벼운 걷기부터 시작해보세요.'; }
    else if (v >= 28) { st = 'warn'; desc = '체지방이 조금 많은 편이에요. 순환 관리가 도움이 돼요.'; }
    items.push({
      icon: '⚖️', title: '체지방', value: `${v}`, unit: '%', st, desc,
      pos: clamp((v - 10) / (45 - 10) * 100),
      normal: '18~27 %', scale: ['10%', '45%'],
      position: st === 'ok' ? '정상 범위 안에 있어요' : st === 'warn' ? '정상보다 조금 높은 "주의" 구간이에요' : '"위험" 구간이에요',
      tip: '저녁 식사를 조금 가볍게 하고, 식사 후 15분 정도 걷는 습관을 들여보세요.',
    });
  }
  // 근육량 (많을수록 좋으므로 게이지 방향 반전)
  {
    const v = m.muscle;
    let st = 'ok', desc = '근육량이 잘 유지되고 있어요.';
    if (v < 20) { st = 'danger'; desc = '근육이 많이 부족해요. 단백질 섭취와 가벼운 운동이 필요해요.'; }
    else if (v < 24) { st = 'warn'; desc = '근육이 조금 부족한 편이에요. 꾸준한 움직임이 도움이 돼요.'; }
    items.push({
      icon: '💪', title: '근육량', value: `${v}`, unit: 'kg', st, desc,
      pos: clamp(100 - (v - 15) / (35 - 15) * 100),
      normal: '24 kg 이상 (많을수록 좋아요)', scale: ['35kg 이상', '15kg 이하'],
      position: st === 'ok' ? '정상 범위 안에 있어요' : st === 'warn' ? '정상보다 조금 적은 "주의" 구간이에요' : '많이 부족한 "위험" 구간이에요',
      tip: '매 끼니 두부·달걀·생선 같은 단백질 반찬을 챙기고, 의자에서 일어났다 앉기를 하루 10번씩 해보세요.',
    });
  }
  // 체온
  {
    const v = m.bodyTemp;
    let st = 'ok', desc = '체온이 정상이에요.';
    if (v >= 37.8 || v < 35.5) { st = 'danger'; desc = '체온이 평소와 달라요. 가시기 전에 매니저에게 말씀해주세요.'; }
    else if (v >= 37.3) { st = 'warn'; desc = '체온이 살짝 높아요. 방금 온열 체험을 하셔서 그럴 수 있으니 잠시 쉬었다 가세요.'; }
    items.push({
      icon: '🌡️', title: '체온', value: `${v}`, unit: '°C', st, desc,
      pos: clamp((v - 35) / (39 - 35) * 100),
      normal: '35.5~37.2 °C', scale: ['35°C', '39°C'],
      position: st === 'ok' ? '정상 범위 안에 있어요' : st === 'warn' ? '살짝 높은 "주의" 구간이에요' : '"위험" 구간이에요',
      tip: '따뜻한 물을 자주 드시고, 나가실 때 바로 찬 바람을 쐬지 않도록 겉옷을 챙기세요.',
    });
  }
  return items;
}

async function loadMeasurements() {
  const content = document.getElementById('s8Content');
  document.getElementById('s8Loading').hidden = false;
  content.hidden = true;
  document.getElementById('btnS8Next').hidden = true;
  document.getElementById('btnTakeResult').hidden = true;
  document.getElementById('s8Status').textContent = '';
  document.getElementById('report').classList.remove('open');
  document.getElementById('btnDetail').textContent = '📋 자세히 보기 ▼';

  const { data, source, measuredAt } = await fetchMeasurements();
  if (state.step !== 8) return;
  const items = interpret(data);

  // 1) 간단 설명
  document.getElementById('measureGrid').innerHTML = items.map((it, i) => `
    <div class="card measure-card">
      <div class="measure-head">
        <div class="m-icon">${it.icon}</div>
        <h2>${it.title}</h2>
        <span class="chip ${it.st}">${ST_LABEL[it.st]}</span>
      </div>
      <div class="measure-value">${it.value}<small>${it.unit}</small></div>
      <div class="gauge">
        <i class="g"></i><i class="y"></i><i class="r"></i>
        <div class="gauge-marker ${it.st}" data-i="${i}" style="left:3%"></div>
      </div>
      <div class="measure-desc ${it.st}">${it.desc}</div>
    </div>`).join('');

  // 2) 자세한 설명 (보고서 · 아코디언)
  document.getElementById('reportList').innerHTML = items.map((it, i) => `
    <details class="report-item">
      <summary>
        <span class="m-icon">${it.icon}</span>
        <span>${it.title}</span>
        <span class="chip ${it.st}">${ST_LABEL[it.st]}</span>
        <span class="sum-val">${it.value} ${it.unit}</span>
        <span class="arrow">▼</span>
      </summary>
      <div class="report-body">
        <div class="report-row"><span class="k">이번 측정값</span><span class="v">${it.value} ${it.unit}</span></div>
        <div class="report-row"><span class="k">정상 범위</span><span class="v">${it.normal}</span></div>
        <div class="report-row full">
          <span class="k">내 위치</span>
          <div class="range-bar">
            <div class="gauge">
              <i class="g"></i><i class="y"></i><i class="r"></i>
              <div class="gauge-marker ${it.st}" data-i="${i}" style="left:3%"></div>
            </div>
            <div class="range-zones"><span class="zg">정상</span><span class="zy">주의</span><span class="zr">위험</span></div>
            <div class="range-labels"><span>${it.scale[0]}</span><span>${it.scale[1]}</span></div>
          </div>
          <span class="v">${it.position}</span>
        </div>
        <div class="report-row full"><span class="k">이렇게 관리해보세요</span><div class="tip-box">💡 ${it.tip}</div></div>
      </div>
    </details>`).join('');

  document.getElementById('s8Loading').hidden = true;
  content.hidden = false;
  document.getElementById('btnS8Next').hidden = false;
  document.getElementById('btnTakeResult').hidden = false;
  if (source === 'live') {
    const when = measuredAt ? new Date(measuredAt).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
    document.getElementById('s8Status').textContent = `측정 시각 ${when} · 결과는 매니저에게도 전달되었어요`;
  } else {
    document.getElementById('s8Status').textContent = '⚠ 측정기기와 연결되지 않아 예시 데이터를 보여드리고 있어요';
  }

  // 게이지 마커 애니메이션 (간단/자세히 모두)
  requestAnimationFrame(() => {
    content.querySelectorAll('.gauge-marker').forEach(m => { m.style.left = items[+m.dataset.i].pos + '%'; });
  });

  const warnItems = items.filter(i => i.st !== 'ok').map(i => i.title);
  speak(warnItems.length
    ? `측정 결과가 나왔어요. ${warnItems.join(', ')}은 조금 신경 쓰시면 좋겠어요. 더 자세한 내용은 자세히 보기 버튼을 눌러 확인하실 수 있어요.`
    : '측정 결과가 모두 정상이에요. 더 자세한 내용은 자세히 보기 버튼을 눌러 확인하실 수 있어요.');
}
/* ---------- 결과표 가져가기 (QR) ----------
   프로토타입: 실제 QR이 아니라 QR처럼 보이는 가짜 패턴을 그림.
   실제 연동 시 결과표 URL을 만들어 QR 라이브러리(예: qrcode.js)로 교체하면 됨. */
let resultCode = null;   // 결과표 번호 — 한 고객당 하나
function showQrModal() {
  if (!resultCode) {
    const d = new Date();
    resultCode = `${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    drawFakeQr(document.getElementById('qrSvg'), resultCode);
  }
  document.getElementById('qrCode').textContent = resultCode;
  document.getElementById('qrModal').hidden = false;
  console.log('[결과표 QR]', { code: resultCode, url: `https://wellounge.example/result/${resultCode}` });
  speak('휴대폰 카메라를 켜고 화면의 네모를 비추면 오늘의 결과표를 가져가실 수 있어요.');
}
function closeQrModal() {
  document.getElementById('qrModal').hidden = true;
}
/* 29×29 격자에 QR 모양(위치 찾기 패턴 3개 + 타이밍 선 + 시드 기반 랜덤 점)을 그림 */
function drawFakeQr(svg, seedText) {
  const N = 29;
  let seed = 0;
  for (const ch of seedText) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  const cells = Array.from({ length: N }, () => Array(N).fill(0));
  const finder = (x0, y0) => {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const ring = x === 0 || y === 0 || x === 6 || y === 6;
      const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
      cells[y0 + y][x0 + x] = (ring || core) ? 1 : 0;
    }
  };
  finder(0, 0); finder(N - 7, 0); finder(0, N - 7);
  const reserved = (x, y) =>
    (x < 8 && y < 8) || (x >= N - 8 && y < 8) || (x < 8 && y >= N - 8);   // 위치 패턴 + 여백
  for (let i = 8; i < N - 8; i++) { cells[6][i] = i % 2 === 0 ? 1 : 0; cells[i][6] = i % 2 === 0 ? 1 : 0; }   // 타이밍 선
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (reserved(x, y) || x === 6 || y === 6) continue;
    cells[y][x] = rand() < 0.47 ? 1 : 0;
  }
  // 정렬 패턴(오른쪽 아래 작은 네모)
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
    const ring = x === 0 || y === 0 || x === 4 || y === 4;
    cells[N - 9 + y][N - 9 + x] = (ring || (x === 2 && y === 2)) ? 1 : 0;
  }

  let out = '';
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (cells[y][x]) out += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
  }
  svg.innerHTML = out;
}

function toggleReport() {
  const rep = document.getElementById('report');
  const open = rep.classList.toggle('open');
  document.getElementById('btnDetail').textContent = open ? '📋 간단히 보기 ▲' : '📋 자세히 보기 ▼';
  if (open) {
    rep.scrollIntoView({ behavior: 'smooth', block: 'start' });
    speak('상세 보고서예요. 항목을 누르면 정상 범위와 관리 방법을 볼 수 있어요.');
  }
}

/* ============================================================
   토스트
   ============================================================ */
let toastTimer = null;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ============================================================
   시작
   ============================================================ */
renderSelected();
if (!state.soundOn) document.getElementById('btnSound').textContent = '🔇';   // ?mute=1 로 열렸을 때 아이콘 상태 맞춤
go(1, { push: false });
// 브라우저 자동재생 정책: 첫 터치 시 음성 안내를 다시 시도
document.addEventListener('pointerdown', function firstTouch() {
  if (state.step === 1 && 'speechSynthesis' in window && !speechSynthesis.speaking) {
    startWelcome();
  }
  document.removeEventListener('pointerdown', firstTouch);
}, { once: true });
