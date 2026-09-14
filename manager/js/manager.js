/* ============================================================
   매니저 응대카드 대시보드 — 동작 (manager.js)
   A 대기 목록 → B 응대카드 상세 → C 근무 현황
   ============================================================ */

/* ---------- 상태 ---------- */
/* 기본은 data.js 의 시연용 mock 고객 + 고객 태블릿에서 실시간으로 들어오는 문진을 함께 표시.
   mock 고객은 _mock 표시로 구분되며 DB 에는 반영되지 않음. 주소 뒤에 ?mock=0 을 붙이면 실시간 문진만 표시 */
const USE_MOCK = new URLSearchParams(location.search).get('mock') !== '0';
const state = {
  view: 'queue',
  customers: USE_MOCK ? CUSTOMERS.map(c => ({ ...c, _mock: true, doneAt: Date.now() - c.doneAgo * 60000 })) : [],
  incoming: INCOMING.map(c => ({ ...c, _mock: true })),
  knownIds: new Set(),      // 실시간 대기열에서 이미 본 문진 키 → 새로 들어온 것만 슬라이드인·알림
  connected: false,
  selectedId: null,
  stats: { served: WORK_STATS.served.today, guided: WORK_STATS.guided.today },
};
const TYPE_LABEL = { walkin: '워크인', reserved: '예약' };
const VISIT_LABEL = { first: '첫방문', return: '재방문' };
/* 방문 목적 (고객용 3-1단계). 예약 고객은 null → '예약 체험' 으로 표시 */
const PURPOSE = {
  experience: { label: '제품 체험',        icon: '🛋️',   cls: 'p-exp' },
  consult:    { label: '구매/구독 상담',    icon: '💬',   cls: 'p-consult' },
  both:       { label: '체험 + 상담',       icon: '🛋️💬', cls: 'p-both' },
};
function purposeOf(c) { return c.purpose ? PURPOSE[c.purpose] : { label: '예약 체험', icon: '📅', cls: 'p-exp' }; }
function isConsultOnly(c) { return c.purpose === 'consult'; }
function wantsConsult(c) { return c.purpose === 'consult' || c.purpose === 'both'; }
const LV_NAME = { 1: '약함', 2: '보통', 3: '심함' };

/* ---------- 공통 ---------- */
function waitMin(c) { return Math.max(0, Math.floor((Date.now() - c.doneAt) / 60000)); }
/* 우선순위 = 대기시간 기준 (니즈 파악 지연 → 응대 건수 감소 데이터 반영)
   3 우선(10분 이상, 빨강) · 2 주의(5분 이상, 노랑) · 1 여유(초록) */
function priority(c) { const w = waitMin(c); return w >= 10 ? 3 : w >= 5 ? 2 : 1; }
function prioLabel(p) { return p === 3 ? '우선' : p === 2 ? '주의' : '여유'; }
function zonePill(key) { const z = ZONES[key]; return `<span class="zone-pill"><i style="background:${z.color}">${z.icon}</i>${z.name}</span>`; }
function badges(c) {
  return `
    <span class="badge ${c.type}">${c.type === 'walkin' ? '🚶 ' : '📅 '}${TYPE_LABEL[c.type]}</span>
    <span class="badge ${purposeOf(c).cls}">${purposeOf(c).icon} ${purposeOf(c).label}</span>
    <span class="badge ${c.visit}">${c.visit === 'return' ? '🔁 ' : ''}${VISIT_LABEL[c.visit]}</span>
    <span class="badge party">📱 ${c.phone}</span>
    ${c.measured ? '<span class="badge measured">✓ 측정 완료</span>' : '<span class="badge unmeasured">측정 전</span>'}
    ${c.status === 'serving' ? '<span class="badge serving">응대 중</span>' : ''}`;
}
/* 우선순위 정렬: 인원 많은 팀 → 오래 기다린 순. 응대 중인 고객은 맨 아래 */
function sortedQueue() {
  return [...state.customers].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'serving' ? 1 : -1;
    const pd = priority(b) - priority(a);
    if (pd !== 0) return pd;
    return a.doneAt - b.doneAt;
  });
}

/* ---------- 화면 전환 ---------- */
function showView(v) {
  state.view = v;
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.getElementById(v === 'queue' ? 'viewQueue' : v === 'detail' ? 'viewDetail' : 'viewStats').classList.add('active');
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === (v === 'detail' ? 'queue' : v)));
  if (v === 'queue') renderQueue();
  if (v === 'stats') renderStats();
}

/* ============================================================
   A. 대기 고객 목록
   ============================================================ */
function renderQueue() {
  const list = sortedQueue();
  const waiting = list.filter(c => c.status === 'waiting');
  const walkin = waiting.filter(c => c.type === 'walkin').length;
  const avgWait = waiting.length ? Math.round(waiting.reduce((s, c) => s + waitMin(c), 0) / waiting.length) : 0;
  const longest = waiting.length ? Math.max(...waiting.map(waitMin)) : 0;
  const consult = waiting.filter(wantsConsult).length;
  const consultOnly = waiting.filter(isConsultOnly).length;

  document.getElementById('queueCount').textContent = waiting.length;
  document.getElementById('summaryStrip').innerHTML = `
    <div class="sum-card"><span class="k">대기 중</span><span class="v">${waiting.length}<small>명</small></span></div>
    <div class="sum-card"><span class="k">워크인 / 예약</span><span class="v">${walkin}<small>/ ${waiting.length - walkin}</small></span></div>
    <div class="sum-card ${longest >= 10 ? 'alert' : ''}"><span class="k">최장 대기</span><span class="v">${longest}<small>분</small></span></div>
    <div class="sum-card"><span class="k">평균 대기</span><span class="v">${avgWait}<small>분</small></span></div>
    <div class="sum-card ${consultOnly ? 'consult' : ''}"><span class="k">💬 상담 희망</span><span class="v">${consult}<small>명 · 상담만 ${consultOnly}</small></span></div>`;

  const el = document.getElementById('queueList');
  if (!list.length) { el.innerHTML = '<div class="empty">대기 중인 고객이 없어요</div>'; return; }
  el.innerHTML = list.map(c => {
    const p = priority(c), w = waitMin(c);
    const wcls = w >= 10 ? 'long' : w >= 5 ? 'mid' : '';
    const parts = c.parts.map(x => `${x.part}${x.lv}`).join(' · ');
    const lead = isConsultOnly(c) ? '<span class="parts consult">[💬 상담만]</span>' : `<span class="parts">[${parts}]</span>`;
    return `
    <div class="qcard p${p} ${c.status} ${c._new ? 'new' : ''} ${isConsultOnly(c) ? 'consult-only' : ''}" onclick="openDetail('${c.id}')">
      <div class="q-no"><div class="n">${c.no}</div><div class="l">대기번호</div><span class="prio">${prioLabel(p)}</span></div>
      <div class="q-main">
        <div class="q-badges">${badges(c)}</div>
        <div class="q-need">${lead} ${c.need}</div>
      </div>
      <div class="q-side">
        <div class="q-zones">${c.zones.length ? c.zones.map(zonePill).join('') : '<span class="zone-pill consult-pill">💬 상담석</span>'}</div>
        <div class="q-wait ${wcls}">${w}<small>분 대기</small></div>
      </div>
    </div>`;
  }).join('');
  state.customers.forEach(c => { c._new = false; });
}

/* 실시간 도착 시뮬레이션: 새 문진 완료 고객이 슬라이드인 */
function simulateArrival() {
  if (!state.incoming.length) { toast('시뮬레이션용 고객을 모두 추가했어요'); return; }
  const c = { ...state.incoming.shift(), doneAt: Date.now(), _new: true };
  state.customers.push(c);
  toast(`🔔 ${c.no}번 고객 문진 완료 — ${TYPE_LABEL[c.type]} · ${VISIT_LABEL[c.visit]}`);
  if (state.view === 'queue') renderQueue(); else document.getElementById('queueCount').textContent = state.customers.filter(x => x.status === 'waiting').length;
}

/* ============================================================
   B. 응대카드 상세
   ============================================================ */
function openDetail(id) {
  state.selectedId = id;
  renderDetail();
  showView('detail');
}
/* 측정값 → 상태(ok/warn/danger) + 게이지 위치 (고객용 판정 기준과 동일) */
function measureSummary(m) {
  const rows = [];
  const bp = m.bp; const bpSt = (bp[0] >= 140 || bp[1] >= 90) ? 'danger' : (bp[0] >= 130 || bp[1] >= 85) ? 'warn' : 'ok';
  rows.push({ k: '혈압', v: `${bp[0]}/${bp[1]}`, st: bpSt, pos: (bp[0] - 90) / 80 * 100 });
  const stSt = m.stress >= 75 ? 'danger' : m.stress >= 50 ? 'warn' : 'ok';
  rows.push({ k: '스트레스', v: `${m.stress}점`, st: stSt, pos: m.stress });
  const bfSt = m.bodyFat >= 35 ? 'danger' : m.bodyFat >= 28 ? 'warn' : 'ok';
  rows.push({ k: '체지방', v: `${m.bodyFat}%`, st: bfSt, pos: (m.bodyFat - 10) / 35 * 100 });
  const muSt = m.muscle < 20 ? 'danger' : m.muscle < 24 ? 'warn' : 'ok';
  rows.push({ k: '근육량', v: `${m.muscle}kg`, st: muSt, pos: 100 - (m.muscle - 15) / 20 * 100 });
  return rows;
}
function gaugeRows(m) {
  return measureSummary(m).map(r => `
    <div class="gauge-row">
      <span class="k">${r.k}</span>
      <div class="gauge"><i class="g"></i><i class="y"></i><i class="r"></i><span class="m ${r.st}" style="left:${Math.max(3, Math.min(97, r.pos))}%"></span></div>
      <span class="v">${r.v}</span>
    </div>`).join('');
}
function renderDetail() {
  const c = state.customers.find(x => x.id === state.selectedId);
  if (!c) return;
  const p = priority(c);

  /* 3번 칸: 실사용자 · 이전 방문 기록 (재방문이면 이전 존 + 이전 세라체크 요약) */
  let userBlock;
  if (c.history) {
    const h = c.history;
    const prevMeasure = h.measured
      ? `<div class="prev-measure">${measureSummary(h.measured).map(m => `<span class="chip ${m.st}">${m.k} ${m.v}</span>`).join('')}</div>`
      : `<div class="sub" style="font-size:13px">이전 방문 시 세라체크 측정 없음</div>`;
    userBlock = `
      <div class="role-box return">
        <div class="hist-row"><span class="role">🔁 이전 방문</span><b>${h.date}</b></div>
        <div class="hist-row"><span class="role">이전에 쓴 존</span><span class="zones">${h.zones.map(zonePill).join('')}</span></div>
        <div class="hist-row col"><span class="role">이전 세라체크 결과</span>${prevMeasure}</div>
        <div class="hist-row col"><span class="role">지난 상담 결과</span><span class="hist-summary">${h.summary}</span></div>
      </div>`;
  } else {
    userBlock = `
      <div class="role-box first">
        <b class="who">첫 방문 고객</b>
        <span class="sub" style="font-size:13.5px;line-height:1.5">이전 방문·측정 기록이 없어요.<br>오늘 문진 내용(2번)과 체험 후 세라체크 결과(5번)가 첫 기록으로 저장돼요.</span>
      </div>`;
  }

  document.getElementById('detailBody').innerHTML = `
    <div class="d-head">
      <button class="btn btn-ghost btn-back" onclick="showView('queue')">◀ 목록</button>
      <div class="d-title"><span class="no">${c.no}<small>번</small></span><span class="badge ${p === 3 ? 'walkin' : 'party'}" style="${p === 3 ? 'background:var(--red);color:#fff' : ''}">${prioLabel(p)} · ${waitMin(c)}분 대기</span></div>
      <div class="d-badges">${badges(c)}</div>
      <div class="d-actions">
        ${c.status === 'waiting'
          ? `<button class="btn btn-primary btn-lg" onclick="startServing('${c.id}')">응대 시작</button>`
          : `<button class="btn btn-secondary btn-lg" onclick="finishGuide('${c.id}')">${isConsultOnly(c) ? '상담 완료' : '체험 안내 완료'}</button>`}
      </div>
    </div>
    <div class="d-grid">
      <!-- 1 기본 정보 + 2 니즈 구조화 -->
      <div class="d-card">
        <h3><span class="num">1</span>기본 정보 &nbsp;·&nbsp; <span class="num">2</span>니즈 구조화</h3>
        <div class="basic-grid">
          <div><div class="k">휴대폰</div><div class="v">${c.phone}</div></div>
          <div><div class="k">방문유형</div><div class="v">${VISIT_LABEL[c.visit]}</div></div>
          <div><div class="k">접수유형</div><div class="v">${TYPE_LABEL[c.type]}${c.type === 'walkin' ? ' <span class="badge walkin" style="font-size:11px">니즈파악 평균 2.1배</span>' : ''}</div></div>
          <div><div class="k">방문 목적</div><div class="v">${purposeOf(c).icon} ${purposeOf(c).label}</div></div>
        </div>
        <div class="parts-row" style="margin-top:10px">
          ${c.parts.length
            ? c.parts.map(x => `<span class="chip lv${x.lv}">${x.part} ${x.lv}단계 · ${LV_NAME[x.lv]}</span>`).join('')
            : '<span class="chip none">부위 선택 없음 · 상담만 희망</span>'}
        </div>
        <div class="need-line">🤖 ${c.need}</div>
      </div>
      <!-- 3 실사용자 · 이전 방문 기록 -->
      <div class="d-card">
        <h3><span class="num">3</span>실사용자 · 이전 방문 기록 ${c.history ? '<span class="badge return" style="font-size:11px">재방문</span>' : '<span class="badge first" style="font-size:11px">첫방문</span>'}</h3>
        ${userBlock}
      </div>
      <!-- 4 추천 체험존 + 제품 -->
      <div class="d-card">
        <h3><span class="num">4</span>선택 체험존 · 비치 제품 ${wantsConsult(c) ? '<span class="badge p-consult" style="font-size:11px">💬 상담 희망</span>' : ''}</h3>
        <div class="zone-block">
          ${c.zones.length
            ? c.zones.map(k => `
            <div class="zone-line">${zonePill(k)}<div class="products">${ZONES[k].products.map(pn => `<span>${pn}</span>`).join('')}</div></div>`).join('')
            : `<div class="unmeasured-box"><b>💬 상담석으로 안내</b><span>체험존 선택 없이 구매/구독(렌탈) 상담만 원하는 고객이에요.<br>관심 제품군을 먼저 여쭤보세요.</span></div>`}
        </div>
        ${(() => {
          if (isConsultOnly(c)) return '';
          const rec = c.recommended || [];
          const skipped = rec.filter(k => !c.zones.includes(k));
          const extra = c.zones.filter(k => !rec.includes(k));
          if (!skipped.length && !extra.length) return `<div class="sub compare">문진 추천과 동일하게 선택</div>`;
          return `<div class="sub compare">문진 추천: ${rec.map(k => ZONES[k].name).join(', ')}${skipped.length ? ` · <b>${skipped.map(k => ZONES[k].name).join(', ')}은 고르지 않음</b>` : ''}${extra.length ? ` · 추천 외 ${extra.map(k => ZONES[k].name).join(', ')} 직접 선택` : ''}</div>`;
        })()}
      </div>
      <!-- 5 세라체크존 측정 -->
      <div class="d-card">
        <h3><span class="num">5</span>세라체크존 측정 ${c.measured ? '<span class="badge measured" style="font-size:11px">완료</span>' : ''}</h3>
        ${c.measured ? `<div class="gauges">${gaugeRows(c.measured)}</div>`
                     : `<div class="unmeasured-box"><b>측정 전</b><span>체험 후 세라체크존 측정 안내<br>(혈압은 5분 휴식 후 측정)</span></div>`}
        ${c.measured && c.history && c.history.measured
          ? `<div class="sub compare">지난 방문 대비: 혈압 ${c.history.measured.bp.join('/')} → <b>${c.measured.bp.join('/')}</b> · 스트레스 ${c.history.measured.stress} → <b>${c.measured.stress}</b></div>`
          : ''}
      </div>
      <!-- 6 AI Sales Script -->
      <div class="d-card" style="grid-column: span 2">
        <h3><span class="num">6</span>AI Sales Script — 바로 쓰는 상담 포인트</h3>
        <ul class="script-list">${c.script.map((s, i) => `<li><span class="step">${i + 1}</span><span>${s}</span></li>`).join('')}</ul>
        <div class="compliance">⚠ 효능·치료 효과를 단정하는 표현 금지 — "도움이 될 수 있어요", "체험 후 느낌을 여쭤보세요"로 안내</div>
      </div>
    </div>`;
}
function startServing(id) {
  const c = state.customers.find(x => x.id === id);
  if (!c) return;
  c.status = 'serving';
  state.stats.served += 1;
  if (!c._mock) setQueueStatus(id, 'serving');      // 고객 태블릿에 "담당 매니저 배정" 안내가 바로 뜸
  toast(`${c.no}번 고객 응대 시작`);
  renderDetail();
}
function finishGuide(id) {
  const c = state.customers.find(x => x.id === id);
  if (!c) return;
  if (!isConsultOnly(c)) state.stats.guided += 1;   // 상담만 한 고객은 체험 안내 횟수에 넣지 않음
  state.customers = state.customers.filter(x => x.id !== id);
  if (!c._mock) {
    setQueueStatus(id, 'done');
    const what = isConsultOnly(c) ? '구매/구독 상담 진행' : `${c.zones.map(k => ZONES[k].name).join('·')} 체험 안내 완료`;
    saveVisitSummary(c.phoneDigits, what);
  }
  toast(`${c.no}번 고객 ${isConsultOnly(c) ? '상담 완료' : '체험 안내 완료'}`);
  showView('queue');
}

/* ============================================================
   C. 근무 현황
   ============================================================ */
function renderStats() {
  const live = { ...WORK_STATS };
  live.served = { ...WORK_STATS.served, today: state.stats.served };
  live.guided = { ...WORK_STATS.guided, today: state.stats.guided };
  document.getElementById('statGrid').innerHTML = Object.values(live).map(s => {
    const diff = s.today - s.lastMonthAvg;
    const pct = s.lastMonthAvg ? Math.round(Math.abs(diff) / s.lastMonthAvg * 100) : 0;
    const good = s.betterWhen === 'up' ? diff > 0 : diff < 0;
    const cls = Math.abs(diff) < 0.05 ? 'flat' : good ? 'good' : 'bad';
    const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '—';
    return `
    <div class="stat-card">
      <span class="k">${s.label}</span>
      <span class="v">${s.today}<small>${s.unit}</small></span>
      <span class="delta ${cls}">${arrow} ${pct}% <span style="font-weight:700">전월 평균 대비</span></span>
      <span class="cmp">전월 일평균 ${s.lastMonthAvg}${s.unit}</span>
    </div>`;
  }).join('');
  document.getElementById('insightBox').innerHTML = INSIGHTS.map(i => `<div class="insight"><span class="ic">${i.icon}</span><span>${i.text}</span></div>`).join('');
}

/* ---------- 토스트 · 시계 ---------- */
let toastTimer = null;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}
function tickClock() {
  const d = new Date();
  document.getElementById('clock').textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* ---------- 시작 ---------- */
document.getElementById('managerName').textContent = `${MANAGER.store} · ${MANAGER.name}`;
tickClock(); setInterval(tickClock, 15000);
showView('queue');
setInterval(() => { if (state.view === 'queue') renderQueue(); }, 30000);   // 대기시간 갱신
if (USE_MOCK) setTimeout(simulateArrival, 25000);                            // mock 모드: 25초 뒤 새 고객 1명 자동 추가

/* ============================================================
   실시간 대기열 (live.js) — 고객 태블릿 문진이 들어오면 바로 카드 생성
   ============================================================ */
function setConnStatus(ok) {
  state.connected = ok;
  const el = document.getElementById('connStatus');
  if (!el) return;
  el.textContent = ok ? '● 실시간 연결됨' : '○ 연결 안 됨';
  el.classList.toggle('on', ok);
}
function onLiveQueue(list) {
  // 서버 상태를 기준으로 하되, 이 화면에서 방금 바꾼 상태(응대 시작)가 되돌아가지 않도록 로컬 serving 유지
  const local = new Map(state.customers.filter(c => !c._mock).map(c => [c.id, c]));
  const live = list.map(raw => {
    const prev = local.get(raw.id);
    const isNew = !state.knownIds.has(raw.id);
    state.knownIds.add(raw.id);
    const status = prev && prev.status === 'serving' && raw.status === 'waiting' ? 'serving' : raw.status;
    return { ...raw, status, need: buildNeed(raw), script: buildScript(raw), _new: isNew && state._liveReady };   // 처음 불러온 목록은 알림 없이, 그 뒤 들어온 것만 슬라이드인
  });
  const arrived = live.filter(c => c._new);
  state.customers = [...state.customers.filter(c => c._mock), ...live];
  state._liveReady = true;
  arrived.forEach(c => toast(`🔔 ${c.no}번 고객 문진 완료 — ${TYPE_LABEL[c.type]} · ${VISIT_LABEL[c.visit]}`));
  if (state.view === 'queue') renderQueue();
  else if (state.view === 'detail') {
    if (state.customers.some(c => c.id === state.selectedId)) renderDetail(); else showView('queue');
  }
  document.getElementById('queueCount').textContent = state.customers.filter(x => x.status === 'waiting').length;
}
if (typeof connectQueue === 'function') connectQueue(onLiveQueue, setConnStatus);

/* ---------- 응대카드 문구 생성 (문진에서 수집된 것만 사용 · 효능 단정 표현 금지) ---------- */
function zoneNames(keys) { return keys.map(k => ZONES[k].name).join('·'); }
function firstZone(c) { return c.recommended.find(k => c.zones.includes(k)) || c.zones[0]; }
function buildNeed(c) {
  const who = `${VISIT_LABEL[c.visit]}${c.history && c.history.zones.length ? `(이전 ${zoneNames(c.history.zones)})` : ''}`;
  const src = c.type === 'reserved' ? '예약 고객' : '워크인';
  if (isConsultOnly(c)) return `구매/구독(렌탈) 상담만 희망 · 체험 없이 바로 상담 · ${who} · ${src}`;
  const parts = c.parts.map(p => `${p.part} ${p.lv}단계(${LV_NAME[p.lv]})`).join(' + ') || '부위 미선택';
  const bits = [`${parts} → ${zoneNames(c.zones) || '존 미선택'} 선택`];
  const skipped = c.recommended.filter(k => !c.zones.includes(k));
  if (skipped.length) bits.push(`문진 추천 ${zoneNames(skipped)}은 고르지 않음`);
  bits.push(who, src);
  if (c.purpose === 'both') bits.push('체험 후 구매/구독 상담 희망');
  if (c.recalledAt) bits.push('🔔 매니저 재호출');
  bits.push(c.measured ? '측정 완료' : '측정 전');
  return bits.join(' · ');
}
function buildScript(c) {
  if (isConsultOnly(c)) return [
    '체험 안내 없이 상담석으로 바로 안내, 관심 제품군부터 여쭤보기',
    '구매 vs 렌탈 조건 비교표·AS 안내 자료 준비',
    '원하시면 상담 후 짧은 체험 제안 (효능 단정 표현 금지)',
  ];
  const lines = [];
  const first = firstZone(c);
  const rest = c.zones.filter(k => k !== first);
  let l1 = first ? `${ZONES[first].name} 먼저 안내` : '선택 존 확인 후 안내';
  if (rest.length) l1 += `, 이어서 ${zoneNames(rest)} 순서로`;
  if (c.history && c.history.date) l1 += ` → 지난 방문(${c.history.date}) 체험 느낌부터 여쭤보기`;
  lines.push(l1);
  const top = [...c.parts].sort((a, b) => b.lv - a.lv)[0];
  if (top) {
    lines.push(top.lv === 3
      ? `${top.part} 3단계(심함) → 온열·강도는 낮게 시작, 불편하면 바로 멈추도록 안내`
      : top.lv === 2
        ? `${top.part} 2단계(보통) → 강도 보통에서 시작, 체험 후 느낌 여쭤보기`
        : `${top.part} 1단계(약함) → 편안한 코스 위주로, 리모컨 사용법 천천히 시연`);
  }
  const skipped = c.recommended.filter(k => !c.zones.includes(k));
  if (c.purpose === 'both') lines.push('체험 후 구매/구독(렌탈) 상담 희망 → 제품 비교표·렌탈 조건 미리 준비 (효능 단정 표현 금지)');
  else if (skipped.length) lines.push(`추천됐던 ${zoneNames(skipped)}은 고르지 않음 → 체험 후 느낌 여쭙고 필요 시 추가 제안`);
  else if (c.visit === 'first') lines.push('첫방문 → 문진 내용 확인만 하고 처음부터 다시 묻지 않기, 체험 후 세라체크존 안내');
  else lines.push('측정 전 → 체험 후 세라체크존 측정 안내 (효능 단정 표현 금지)');
  return lines.slice(0, 3);
}
