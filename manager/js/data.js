/* ============================================================
   매니저 응대카드 대시보드 — mock 데이터 (data.js)
   · 실제 서비스에서는 고객 문진 화면 → AI 구조화 → 이 형태의 JSON 으로 전달됨
   · 문구 규칙: "효능을 단정하는 표현" 금지 (치료된다/낫는다/완치 등 X)
              → "도움이 될 수 있음을 안내", "체험 후 느낌을 여쭤보기" 식으로 작성
   ============================================================ */

/* 체험존 정보 (고객용 config.js 와 동일하게 유지) */
const ZONES = {
  spine:  { name: '척추존', icon: '🦴', color: '#fbe6e7', products: ['마스터 V11', '마스터 V9', '마스터 V7'] },
  rest:   { name: '휴식존', icon: '💺', color: '#efe8dc', products: ['파우제 M8', '파우제 M6', '파우제 M4'] },
  circ:   { name: '순환존', icon: '🦵', color: '#e3f4ea', products: ['셀루피아 레그', '웰카프 다리 마사지기', '발 온열 마사지기'] },
  beauty: { name: '뷰티존', icon: '✨', color: '#fbf1d4', products: ['셀루피아 페이스', 'LED 뷰티 마스크', '두피 케어기'] },
};

/* 매니저 정보 */
const MANAGER = { name: '김서연 매니저', store: '웰라운지 상무점' };

/* ---------- 대기 고객 (문진 완료 후 대기 중) ----------
   ★ 문진 화면에서 실제로 수집되는 것만 사용
     - 전화번호(2단계) → 첫방문/재방문, 예약 여부, 이전 방문 기록 조회
     - 부위 + 강도(3단계), 선택한 체험존(4단계), 세라체크 측정값(체험 후)
     직업·동반자·나이·통증 기간 같은 정보는 문진에 없으므로 쓰지 않음

   id        : 고유 번호
   no        : 대기번호
   type      : 'walkin' 워크인 | 'reserved' 사전예약 (고객용 2단계 선택 + 전화번호 대조)
   purpose   : 일반 방문의 방문 목적 (고객용 3-1단계) — 'experience' 제품 체험 | 'consult' 구매/구독 상담만 | 'both' 체험+상담
               예약 고객은 이 화면을 거치지 않으므로 null. 'consult' 는 부위·존 선택 없이 6-1 상담 대기로 넘어온 고객
   visit     : 'first' 첫방문 | 'return' 재방문 (전화번호로 식별)
   phone     : 고객이 문진 2단계에서 입력한 휴대폰 번호 (뒷자리만 표시)
   doneAgo   : 문진 완료 후 경과 시간(분) — 화면에서 대기시간으로 표시
   parts     : 선택 부위 + 강도(1 약함 / 2 보통 / 3 심함)
   need      : AI 한 줄 니즈 요약 — 부위·강도·선택 존·이전 기록만으로 생성
   zones     : 고객이 선택한 체험존 key
   recommended: 문진이 추천했던 존 (고객 선택과 다르면 응대 힌트가 됨)
   measured  : 오늘 세라체크존 측정 결과 (측정 전이면 null)
   script    : AI Sales Script (3줄 이내) — 위 데이터만으로 생성
   history   : 재방문 고객의 이전 방문 기록 (첫방문이면 null)
               { date, zones(이전에 쓴 존), measured(이전 세라체크 결과), summary(매니저가 남긴 상담 결과) }
   status    : 'waiting' 대기 | 'serving' 응대 중                        */
const CUSTOMERS = [
  {
    id: 101, no: 12, phone: '010-****-4821', type: 'walkin', purpose: 'both', visit: 'return', doneAgo: 14,
    parts: [{ part: '허리', lv: 3 }, { part: '무릎', lv: 2 }, { part: '다리', lv: 2 }],
    need: '허리 3단계(심함) + 무릎·다리 2단계 → 척추존·순환존 선택 · 재방문(이전 척추존) · 지난 측정 혈압 주의',
    zones: ['spine', 'circ'],
    recommended: ['spine', 'circ'],
    measured: { bp: [142, 91], stress: 58, bodyFat: 33.2, muscle: 21.4 },
    script: [
      '척추존 먼저 안내 → 지난 방문(8/2) 척추존 체험 느낌부터 여쭤보기',
      '허리 3단계이므로 온열·강도는 낮게 시작, 무릎 부담 적은 자세 안내',
      '혈압 주의 구간 → 체험 후 천천히 일어나도록 안내 (효능 단정 표현 금지)',
    ],
    history: { date: '2026-08-02', zones: ['spine'], measured: { bp: [146, 93], stress: 64, bodyFat: 33.8, muscle: 21.0 }, summary: '척추존 30분 체험 · 가격 확인 후 상의해 보겠다고 함' },
    status: 'waiting',
  },
  {
    id: 102, no: 13, phone: '010-****-7730', type: 'reserved', purpose: null, visit: 'first', doneAgo: 9,
    parts: [{ part: '어깨', lv: 2 }, { part: '목', lv: 2 }],
    need: '어깨·목 2단계(보통) → 휴식존 선택 (문진 추천은 척추존·휴식존) · 첫방문 · 예약 고객',
    zones: ['rest'],
    recommended: ['spine', 'rest'],
    measured: null,
    script: [
      '휴식존 안마의자로 안내, 어깨·목 집중 코스 시연',
      '추천됐던 척추존은 고르지 않음 → 체험 후 "어깨가 시원했는지" 여쭙고 필요 시 척추존 추가 제안',
      '측정 전이므로 체험 후 세라체크존 안내',
    ],
    history: null,
    status: 'waiting',
  },
  {
    id: 103, no: 14, phone: '010-****-1092', type: 'walkin', purpose: 'experience', visit: 'first', doneAgo: 6,
    parts: [{ part: '등', lv: 2 }, { part: '허리', lv: 1 }],
    need: '등 2단계 + 허리 1단계(약함) → 척추존 선택 · 첫방문 · 측정 완료(스트레스 주의)',
    zones: ['spine'],
    recommended: ['spine'],
    measured: { bp: [128, 82], stress: 71, bodyFat: 24.1, muscle: 30.2 },
    script: [
      '척추존 안내, 등 부위 위주로 온열 세기 보통에서 시작',
      '스트레스 71점(주의) → 이완 모드 위주로 설정하고 조용한 자리 배정',
      '체험 후 결과표 QR 안내, 재방문 시 같은 번호로 기록 이어짐을 설명',
    ],
    history: null,
    status: 'waiting',
  },
  {
    id: 104, no: 15, phone: '010-****-3356', type: 'walkin', purpose: 'experience', visit: 'return', doneAgo: 4,
    parts: [{ part: '다리', lv: 3 }, { part: '무릎', lv: 3 }],
    need: '다리·무릎 3단계(심함) → 순환존·휴식존 선택 · 재방문(이전 순환존, 리모컨 시연 요청 기록)',
    zones: ['circ', 'rest'],
    recommended: ['circ', 'rest'],
    measured: null,
    script: [
      '입구에서 가까운 순환존 자리로 안내, 앉은 자세로 다리 마사지 체험',
      '지난 기록에 리모컨 시연 요청 있음 → 전원·시작·강도 3버튼만 먼저 천천히 시연',
      '측정 전 → 체험 후 세라체크존 안내 (혈압은 앉아서 5분 휴식 후)',
    ],
    history: { date: '2026-07-19', zones: ['circ'], measured: null, summary: '순환존 20분 체험 · 리모컨 사용법 어려워함, 재방문 시 시연 요청' },
    status: 'waiting',
  },
  {
    id: 105, no: 16, phone: '010-****-9014', type: 'reserved', purpose: null, visit: 'first', doneAgo: 2,
    parts: [{ part: '머리', lv: 2 }, { part: '어깨', lv: 1 }],
    need: '머리 2단계 + 어깨 1단계 → 뷰티존 선택 · 첫방문 · 예약 고객 · 측정 전',
    zones: ['beauty'],
    recommended: ['beauty', 'rest'],
    measured: null,
    script: [
      '뷰티존으로 안내, 사용감 위주로 설명 (피부 개선 등 단정 표현 X)',
      '어깨 1단계 선택 있음 → 체험 후 휴식존 10분 추가 제안',
      '측정 전이므로 체험 후 세라체크존 안내',
    ],
    history: null,
    status: 'waiting',
  },
  {
    id: 106, no: 17, phone: '010-****-6278', type: 'walkin', purpose: 'both', visit: 'first', doneAgo: 1,
    parts: [{ part: '허리', lv: 2 }, { part: '골반', lv: 2 }, { part: '어깨', lv: 1 }],
    need: '허리·골반 2단계 + 어깨 1단계 → 척추존·휴식존 2곳 선택 · 첫방문 · 워크인 · 체험 후 구매/구독 상담 희망',
    zones: ['spine', 'rest'],
    recommended: ['spine', 'rest'],
    measured: null,
    script: [
      '허리·골반 강도가 높으므로 척추존 먼저, 이어서 휴식존 순서로 안내',
      '첫방문 워크인 → 문진 내용 확인만 하고 처음부터 다시 묻지 않기',
      '체험 후 구매/구독(렌탈) 상담 희망 → 제품 비교표·렌탈 조건 미리 준비 (효능 단정 표현 금지)',
    ],
    history: null,
    status: 'waiting',
  },
  {
    /* 구매/구독 상담만 원하는 고객 — 3-1단계에서 상담 선택 → 부위·존 선택 없이 6-1 대기 */
    id: 107, no: 18, phone: '010-****-5510', type: 'walkin', purpose: 'consult', visit: 'first', doneAgo: 3,
    parts: [],
    need: '구매/구독(렌탈) 상담만 희망 · 체험 없이 바로 상담 · 첫방문 · 워크인',
    zones: [],
    recommended: [],
    measured: null,
    script: [
      '체험 안내 없이 상담석으로 바로 안내, 관심 제품군부터 여쭤보기',
      '구매 vs 렌탈 조건 비교표·AS 안내 자료 준비',
      '원하시면 상담 후 짧은 체험 제안 (효능 단정 표현 금지)',
    ],
    history: null,
    status: 'waiting',
  },
];

/* ---------- 실시간 도착 시뮬레이션용 고객 (버튼/자동으로 하나씩 추가) ---------- */
const INCOMING = [
  {
    id: 201, no: 19, phone: '010-****-2205', type: 'walkin', purpose: 'experience', visit: 'first', doneAgo: 0,
    parts: [{ part: '목', lv: 3 }, { part: '어깨', lv: 2 }],
    need: '목 3단계(심함) + 어깨 2단계 → 척추존 선택 · 첫방문 · 워크인 · 측정 전',
    zones: ['spine'],
    recommended: ['spine', 'rest'],
    measured: null,
    script: [
      '척추존 안내, 목 부위 온열 세기 낮게 시작',
      '리모컨 사용법 천천히 시연',
      '체험 후 세라체크존 측정 안내',
    ],
    history: null, status: 'waiting',
  },
  {
    id: 202, no: 20, phone: '010-****-8841', type: 'reserved', purpose: null, visit: 'return', doneAgo: 0,
    parts: [{ part: '허리', lv: 2 }],
    need: '허리 2단계(보통) → 척추존 선택 · 재방문(이전 척추존, 재방문 약속 기록) · 측정 완료',
    zones: ['spine'],
    recommended: ['spine'],
    measured: { bp: [131, 84], stress: 45, bodyFat: 27.8, muscle: 28.9 },
    script: [
      '지난 방문(8/25) 척추존 체험 이어서 안내, 지난 상담 내용부터 확인',
      '혈압 주의 구간이었으나 오늘은 다소 개선 → 비교 수치 공유 (효능 단정 X)',
      '지난번 "상의 후 재방문" 기록 → 오늘 결정 부담 주지 않기',
    ],
    history: { date: '2026-08-25', zones: ['spine'], measured: { bp: [134, 86], stress: 52, bodyFat: 28.4, muscle: 28.1 }, summary: '척추존 체험 · 가격 안내 · 상의 후 재방문 약속' },
    status: 'waiting',
  },
];

/* ---------- 근무 현황 (C 화면) ----------
   today : 오늘 수치 / lastMonthAvg : 전월 일평균                        */
const WORK_STATS = {
  served:      { label: '응대 건수',           today: 9,    lastMonthAvg: 11.2, unit: '건',  betterWhen: 'up' },
  guided:      { label: '체험 안내 횟수',       today: 7,    lastMonthAvg: 7.8,  unit: '회',  betterWhen: 'up' },
  needMinutes: { label: '니즈파악 평균 소요시간', today: 7.4,  lastMonthAvg: 15.9, unit: '분',  betterWhen: 'down' },
};

/* 매니저 도움말 (C 화면 하단 안내) — 응대할 때 바로 쓰는 팁 */
const INSIGHTS = [
  { icon: '💡', text: '응대카드에 이미 불편 부위·강도·선택한 존이 정리돼 있어요. 고객에게 처음부터 다시 묻지 말고 "허리가 많이 불편하시다고 하셨죠?"처럼 카드 내용을 확인하는 말로 시작하면 니즈 파악 시간이 크게 줄어요.' },
  { icon: '🚶', text: '워크인 고객은 예약 고객보다 원하는 게 정리되지 않은 경우가 많아요. 카드의 "니즈 한 줄"과 Sales Script 를 먼저 훑어본 뒤 안내를 시작하고, 재방문 고객은 지난 방문 기록부터 이어서 이야기해 주세요.' },
];
