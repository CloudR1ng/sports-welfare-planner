import "./style.css";
import {
  calculate,
  CalculationError,
  formatCurrency,
  formatInteger,
} from "./calculate";
import {
  coverageOf,
  DataError,
  parseCsv,
  parseJson,
  SOURCE_URL,
  type Dataset,
  type SportRow,
} from "./data";
import { createScenario, state, type Scenario } from "./state";

const app = document.querySelector<HTMLDivElement>("#app")!;
let pendingFile: File | undefined;
const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const safeUrl = (value: string) => {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url.href : SOURCE_URL;
  } catch {
    return SOURCE_URL;
  }
};
const number = (value: number | null | bigint | undefined) =>
  value == null ? "자료 없음" : formatInteger(value);
const rowRate = (row: SportRow) =>
  row.CRRSPND_FLAG_TRGET_NMPR_CO && row.CRRSPND_FLAG_RECIPT_NMPR_CO !== null
    ? (Number(row.CRRSPND_FLAG_RECIPT_NMPR_CO) /
        row.CRRSPND_FLAG_TRGET_NMPR_CO) *
      100
    : null;
const provinceOptions = (data: Dataset) =>
  [...new Map(data.rows.map((r) => [r.CTPRVN_CD, r.CTPRVN_NM])).entries()].sort(
    (a, b) => a[0].localeCompare(b[0]),
  );
const selectedLabel = () =>
  state.selected
    ? `${state.selected.CTPRVN_NM} ${state.selected.SIGNGU_NM} · ${state.selected.RECIPT_FLAG_NM}`
    : "아직 선택한 지역이 없습니다";
const toast = (message: string) => {
  state.toast = message;
  render();
  window.setTimeout(() => {
    if (state.toast === message) {
      state.toast = undefined;
      render();
    }
  }, 3600);
};

function banner() {
  const data = state.dataset;
  if (!data)
    return `<section class="import-banner" aria-labelledby="import-title">
    <div class="import-copy"><span class="eyebrow">시작하기</span><h2 id="import-title">먼저 공단 자료를 불러와 주세요.</h2>
      <p>CSV 원본 또는 정규화 JSON을 선택하면 이 브라우저 안에서 자료를 확인하고 계산합니다. 파일은 서버로 전송되지 않습니다.</p>
      <button class="button button-primary" data-action="browse">자료 선택 <span aria-hidden="true">↗</span></button>
      <div class="file-note"><span class="lock-mark" aria-hidden="true">▧</span> CSV 또는 JSON · 10MB 이하 · 자료는 화면을 닫으면 사라집니다</div></div>
    <div class="import-visual" aria-hidden="true"><div class="donut"><span>DATA<br><b>LOCAL</b></span></div><div class="mini-bars"><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="visual-stamp">2026<br><strong>06</strong></div></div>
    <input type="file" id="data-file" accept=".csv,.json,text/csv,application/json" hidden>
    <div class="source-line"><span>필수 데이터</span><a href="${SOURCE_URL}" target="_blank" rel="noopener noreferrer">지역별 스포츠강좌이용권 활용정보 ↗</a><span>국민체육진흥공단</span></div>
  </section>`;
  const coverage = coverageOf(data.rows);
  const status = coverage.held
    ? `확인 필요 ${formatInteger(coverage.held)}행`
    : "기본 검증 완료";
  return `<section class="loaded-banner" aria-label="불러온 자료 정보">
    <div class="loaded-icon" aria-hidden="true">✓</div><div class="loaded-main"><span class="eyebrow">현재 자료</span><strong>${escapeHtml(data.sourceName)}</strong>
      <small>${escapeHtml(data.referencePeriod || "기준월 미확인")} 기준 · ${data.isPreview ? "미리보기 일부 자료" : data.fullDataset ? "다운로드 전체 파일" : "사용자 제공 자료"}</small></div>
    <div class="loaded-pills"><span>${formatInteger(data.rows.length)}행</span><span>${formatInteger(coverage.provinces)}개 시도</span><span>${formatInteger(coverage.districts)}개 지역</span><span class="${coverage.held ? "pill-warning" : ""}">${status}</span></div>
    <button class="button button-light" data-action="browse">자료 바꾸기</button>
    <p class="loaded-source"><a href="${escapeHtml(safeUrl(data.sourceUrl || SOURCE_URL))}" target="_blank" rel="noopener noreferrer">출처 확인 ↗</a><span>SHA-256 ${data.sourceSha256.slice(0, 12)}…</span><span>브라우저 안에서 처리</span></p>
    ${data.warnings.map((w) => `<p class="data-warning">${escapeHtml(w)}</p>`).join("")}</section>`;
}

function emptyBlock(title: string, body: string, compact = false) {
  return `<div class="empty-state ${compact ? "empty-compact" : ""}"><span class="empty-icon" aria-hidden="true">◌</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(body)}</p></div>`;
}

function filteredRows(): SportRow[] {
  if (!state.dataset) return [];
  return state.dataset.rows.filter(
    (r) =>
      (!state.selectedProvince || r.CTPRVN_CD === state.selectedProvince) &&
      (!state.selectedCategory ||
        r.RECIPT_FLAG_CD === state.selectedCategory) &&
      (!state.selectedYear || r.BASE_YEAR === state.selectedYear) &&
      (!state.search ||
        `${r.SIGNGU_NM} ${r.SIGNGU_CD}`
          .toLocaleLowerCase("ko")
          .includes(state.search.toLocaleLowerCase("ko"))),
  );
}

function tableRows(rows: SportRow[]) {
  const sorted = [...rows].sort((a, b) => {
    if (state.sort === "ratio-asc")
      return (
        (rowRate(a) ?? 101) - (rowRate(b) ?? 101) ||
        a.SIGNGU_CD.localeCompare(b.SIGNGU_CD)
      );
    if (state.sort === "ratio-desc")
      return (
        (rowRate(b) ?? -1) - (rowRate(a) ?? -1) ||
        a.SIGNGU_CD.localeCompare(b.SIGNGU_CD)
      );
    return a.SIGNGU_CD.localeCompare(b.SIGNGU_CD);
  });
  return sorted
    .map((r) => {
      const rate = rowRate(r);
      const held = r.quality_status === "hold";
      const selected = state.selected?.source_row_id === r.source_row_id;
      return `<tr class="${selected ? "row-selected" : ""}">
      <td><strong class="district-name">${escapeHtml(r.SIGNGU_NM)}</strong><span class="district-code">${escapeHtml(r.SIGNGU_CD)}</span></td>
      <td class="numeric">${number(r.CRRSPND_FLAG_TRGET_NMPR_CO)}</td><td class="numeric">${number(r.CRRSPND_FLAG_RECIPT_NMPR_CO)}</td>
      <td><div class="rate-cell"><span class="rate-track"><i style="width:${rate === null ? 0 : Math.min(rate, 100)}%"></i></span><strong>${rate === null ? "자료 없음" : `${rate.toFixed(2)}%`}</strong></div></td>
      <td class="numeric secondary-col">${number(r.SIGNGU_ACCTO_FCLTY_CO)}</td><td class="numeric secondary-col">${number(r.SIGNGU_ACCTO_POPLTN_CO)}</td>
      <td>${held ? `<span class="quality-badge badge-hold" title="${escapeHtml(r.issues.join(", "))}">확인 필요</span>` : '<span class="quality-badge">확인됨</span>'}</td>
      <td><button class="button ${held ? "button-disabled" : "button-select"}" data-action="choose" data-row="${escapeHtml(r.source_row_id)}" ${held ? 'disabled title="결측 또는 품질 문제로 계산할 수 없습니다"' : ""} aria-label="${escapeHtml(r.CTPRVN_NM)} ${escapeHtml(r.SIGNGU_NM)} ${escapeHtml(r.RECIPT_FLAG_NM)} 선택">${selected ? "선택됨" : "비교"}</button></td></tr>`;
    })
    .join("");
}

function overview() {
  const data = state.dataset;
  if (!data)
    return `<section id="overview" class="section-card overview"><div class="section-heading"><div><span class="eyebrow">01 / 지역 현황</span><h2>지역별 지원 현황</h2></div><p>출처 자료에 기록된 대상과 수급 인원을 비교합니다.</p></div>${emptyBlock("자료를 불러오면 현황이 나타납니다", "공식 CSV 또는 정규화 JSON을 위의 자료 선택 버튼으로 불러와 주세요.")}</section>`;
  const years = [...new Set(data.rows.map((r) => r.BASE_YEAR))].sort();
  const categories = [
    ...new Map(
      data.rows.map((r) => [r.RECIPT_FLAG_CD, r.RECIPT_FLAG_NM]),
    ).entries(),
  ].sort((a, b) => a[0].localeCompare(b[0]));
  const provinces = provinceOptions(data);
  const rows = filteredRows();
  const validRates = rows.map(rowRate).filter((v): v is number => v !== null);
  const average = validRates.length
    ? validRates.reduce((a, b) => a + b, 0) / validRates.length
    : null;
  const held = rows.filter((r) => r.quality_status === "hold").length;
  const option = (value: string, label: string, current: string) =>
    `<option value="${escapeHtml(value)}" ${current === value ? "selected" : ""}>${escapeHtml(label)}</option>`;
  return `<section id="overview" class="section-card overview"><div class="section-heading"><div><span class="eyebrow">01 / 지역 현황</span><h2>지역별 지원 현황</h2></div><p>출처 자료에 기록된 대상과 수급 인원을 비교합니다.</p></div>
    <div class="filters" aria-label="지역 현황 필터">
      <label>기준 연도<select id="filter-year">${option("", "전체 연도", state.selectedYear)}${years.map((y) => option(y, y, state.selectedYear)).join("")}</select></label>
      <label>시도<select id="filter-province">${option("", "전체 시도", state.selectedProvince)}${provinces.map(([cd, nm]) => option(cd, nm, state.selectedProvince)).join("")}</select></label>
      <label>지원 구분<select id="filter-category">${option("", "전체 구분", state.selectedCategory)}${categories.map(([cd, nm]) => option(cd, nm, state.selectedCategory)).join("")}</select></label>
      <label class="search-field">지역 검색<input id="filter-search" type="search" value="${escapeHtml(state.search)}" placeholder="지역명 또는 코드" autocomplete="off"></label>
      <label>비율 정렬<select id="filter-sort"><option value="name" ${state.sort === "name" ? "selected" : ""}>지역 코드순</option><option value="ratio-asc" ${state.sort === "ratio-asc" ? "selected" : ""}>비율 낮은 순</option><option value="ratio-desc" ${state.sort === "ratio-desc" ? "selected" : ""}>비율 높은 순</option></select></label>
      <button class="text-button filter-reset" data-action="reset-filters">필터 초기화</button>
    </div>
    <div class="stat-strip"><div><span>검색 결과</span><strong>${formatInteger(rows.length)}<small> 행</small></strong></div><div><span>표시 행 평균 비율</span><strong>${average === null ? "—" : `${average.toFixed(2)}%`}</strong><small>단순 평균 · 비교용</small></div><div><span>확인 필요</span><strong class="${held ? "text-amber" : ""}">${formatInteger(held)}<small> 행</small></strong></div><p>구분 간 인원은 합산하지 않습니다. 평균은 표시 행의 단순 평균이며 인구 가중값이 아닙니다.</p></div>
    <div class="table-scroll"><table><caption>선택한 조건의 지역별 스포츠강좌이용권 현황</caption><thead><tr><th scope="col">지역</th><th scope="col" class="numeric">대상 인원</th><th scope="col" class="numeric">수급 인원</th><th scope="col">자료상 비율</th><th scope="col" class="numeric secondary-col">시설 수</th><th scope="col" class="numeric secondary-col">지역 인구</th><th scope="col">자료 상태</th><th scope="col">계획 비교</th></tr></thead>
    <tbody>${rows.length ? tableRows(rows) : `<tr><td colspan="8" class="no-results">조건에 맞는 지역이 없습니다. 필터를 초기화해 보세요.</td></tr>`}</tbody></table></div>
    <div class="table-foot"><span>표시 ${formatInteger(rows.length)}행 · 정렬 ${state.sort === "name" ? "지역 코드순" : state.sort === "ratio-asc" ? "비율 낮은 순" : "비율 높은 순"}</span><span>자료 수록 범위는 원본 파일에 따릅니다.</span></div>
  </section>`;
}

function resultMarkup(result: Scenario["result"]) {
  if (!result) return `<div class="result-empty">계산 전</div>`;
  return `<div class="result-grid"><div><span>목표 인원</span><strong>${formatInteger(result.targetCount)}<small>명</small></strong></div><div><span>추가 인원</span><strong class="result-accent">${formatInteger(result.additionalCount)}<small>명</small></strong></div><div><span>가정 비용</span><strong>${formatCurrency(result.cost)}</strong></div></div>`;
}

function scenarioCard(s: Scenario, index: number) {
  const labels = ["A · 기준안", "B · 대안", "C · 대안"];
  const input = (
    key: keyof Scenario["assumptions"],
    label: string,
    suffix: string,
    placeholder: string,
  ) =>
    `<label>${label}<span class="input-unit"><input data-scenario="${s.id}" data-key="${key}" inputmode="decimal" type="text" value="${escapeHtml(s.assumptions[key])}" placeholder="${placeholder}" aria-describedby="hint-${s.id}-${key}"><i>${suffix}</i></span><small id="hint-${s.id}-${key}" class="field-hint">${key === "targetPercent" ? "0~100 · 소수 둘째 자리까지" : key === "monthlyCost" ? "0~1,000,000원 · 정수" : "1~12개월 · 정수"}</small></label>`;
  const latest = s.result && !s.stale;
  return `<article class="scenario-card ${index === 0 ? "scenario-base" : ""}" data-card="${s.id}">
    <div class="scenario-top"><div><span class="eyebrow">${labels[index]}</span><h3>${index === 0 ? "지원 목표 설정" : `${labels[index].split(" · ")[0]}안 비교`}</h3></div>${index > 0 ? `<button class="icon-button" data-action="remove-scenario" data-scenario="${s.id}" aria-label="${labels[index]} 삭제">삭제</button>` : ""}</div>
    <p class="scenario-basis">기준 지역 <strong>${escapeHtml(selectedLabel())}</strong></p>
    <div class="scenario-inputs">${input("targetPercent", "목표 비율", "%", "예: 10")}${input("monthlyCost", "월 단가", "원", "직접 입력")}${input("months", "지원 기간", "개월", "직접 입력")}</div>
    <div class="scenario-actions"><button class="button button-primary" data-action="calculate" data-scenario="${s.id}">이 안 계산</button>${index < 2 && state.scenarios.length < 3 ? `<button class="text-button" data-action="duplicate-scenario" data-scenario="${s.id}">＋ 안 복제</button>` : ""}<span class="scenario-status ${s.error ? "status-error" : s.stale ? "status-stale" : "status-ok"}" data-status="${s.id}" aria-live="polite">${s.error ? escapeHtml(s.error) : s.stale ? "계산 필요" : "계산 완료"}</span></div>
    <div class="scenario-result ${latest ? "" : "result-stale"}" data-result="${s.id}">${resultMarkup(latest ? s.result : undefined)}</div>
  </article>`;
}

function comparison() {
  const data = state.dataset;
  if (!data)
    return `<section id="compare" class="section-card compare"><div class="section-heading"><div><span class="eyebrow">02 / 목표 시나리오</span><h2>목표별 가정 비교</h2></div><p>지역을 고른 뒤 원하는 목표와 기간을 입력합니다.</p></div>${emptyBlock("먼저 비교할 지역을 선택해 주세요", "자료를 불러온 뒤 현황 표에서 계산할 지역을 선택합니다.")}</section>`;
  if (!state.selected)
    return `<section id="compare" class="section-card compare"><div class="section-heading"><div><span class="eyebrow">02 / 목표 시나리오</span><h2>목표별 가정 비교</h2></div><p>지역을 고른 뒤 원하는 목표와 기간을 입력합니다.</p></div>${emptyBlock("아직 선택한 지역이 없습니다", "지역 현황 표의 비교 버튼을 누르면 입력 항목이 열립니다.")}</section>`;
  return `<section id="compare" class="section-card compare"><div class="section-heading"><div><span class="eyebrow">02 / 목표 시나리오</span><h2>목표별 가정 비교</h2></div><button class="text-button" data-action="clear-selection">지역 다시 선택</button></div>
    <div class="scenario-intro"><span class="place-pin" aria-hidden="true">⌖</span><div><span>공통 기준 지역</span><strong>${escapeHtml(selectedLabel())}</strong><small>대안마다 같은 대상 인원과 수급 인원을 사용합니다.</small></div><span class="intro-basis">대상 ${number(state.selected.CRRSPND_FLAG_TRGET_NMPR_CO)}명 · 수급 ${number(state.selected.CRRSPND_FLAG_RECIPT_NMPR_CO)}명 · 자료상 비율 ${rowRate(state.selected) === null ? "자료 없음" : `${rowRate(state.selected)!.toFixed(2)}%`}</span></div>
    ${state.selected.quality_status === "hold" ? `<p class="data-warning">이 행은 확인이 필요한 자료입니다. ${escapeHtml(state.selected.issues.join(" · "))}. 대상·수급 인원이 유효한 경우에만 계산할 수 있습니다.</p>` : ""}
    <div class="scenario-grid">${state.scenarios.map(scenarioCard).join("")}</div>
    <p class="assumption-note"><span aria-hidden="true">ⓘ</span> 단가와 기간은 사용자가 입력하는 가정입니다. 실제 필요 예산, 집행액 또는 사업 성과를 뜻하지 않습니다.</p>
  </section>`;
}

function review() {
  const data = state.dataset;
  const computed = state.scenarios.filter((s) => s.result && !s.stale);
  const ready =
    !!state.selected && !!computed.find((s) => s.id === state.scenarios[0]?.id);
  if (!data || !ready)
    return `<section id="review" class="section-card review-section"><div class="section-heading"><div><span class="eyebrow">03 / 검토표</span><h2>근거를 담은 검토표</h2></div><p>인쇄하거나 브라우저에서 PDF로 저장합니다.</p></div>${emptyBlock("계산을 완료하면 검토표를 만들 수 있습니다", "먼저 지역과 비교 조건을 정하고 계산해 주세요.")}</section>`;
  const row = state.selected!;
  return `<section id="review" class="section-card review-section"><div class="section-heading no-print"><div><span class="eyebrow">03 / 검토표</span><h2>근거를 담은 검토표</h2></div><button class="button button-dark" data-action="print">인쇄 / PDF 저장 <span aria-hidden="true">↗</span></button></div>
    <div id="print-area" class="print-area"><div class="print-kicker"><span>SPORTS WELFARE PLANNER</span><span>기준 자료 ${escapeHtml(data.referencePeriod || "기준월 확인 필요")}</span></div>
    <h2 class="print-title">스포츠강좌이용권<br>목표 검토표</h2><p class="print-meta">${escapeHtml(row.CTPRVN_NM)} ${escapeHtml(row.SIGNGU_NM)} · ${escapeHtml(row.RECIPT_FLAG_NM)} · ${escapeHtml(row.BASE_YEAR)}</p>
    <div class="print-kpis"><div><span>대상 인원</span><strong>${number(row.CRRSPND_FLAG_TRGET_NMPR_CO)}<small>명</small></strong></div><div><span>수급 인원</span><strong>${number(row.CRRSPND_FLAG_RECIPT_NMPR_CO)}<small>명</small></strong></div><div><span>자료상 수급 비율</span><strong>${rowRate(row)!.toFixed(2)}%</strong></div></div>
    <div class="table-scroll review-table"><table><caption>시나리오별 목표 및 계산 결과. 각 안은 서로 대체하는 선택안입니다.</caption><thead><tr><th scope="col">구분</th><th scope="col">목표 비율</th><th scope="col">월 단가</th><th scope="col">기간</th><th scope="col">목표 인원</th><th scope="col">추가 인원</th><th scope="col">가정 비용</th><th scope="col">A안 대비</th></tr></thead><tbody>${computed
      .map((s, i) => {
        const result = s.result!;
        const base = computed[0]!.result!;
        return `<tr><th scope="row">${["A 기준안", "B 대안", "C 대안"][state.scenarios.findIndex((x) => x.id === s.id)]}</th><td>${escapeHtml(s.assumptions.targetPercent)}%</td><td>${formatInteger(Number(s.assumptions.monthlyCost))}원</td><td>${escapeHtml(s.assumptions.months)}개월</td><td>${formatInteger(result.targetCount)}명</td><td>${formatInteger(result.additionalCount)}명</td><td>${formatCurrency(result.cost)}</td><td>${i === 0 ? "기준" : `${result.additionalCount - base.additionalCount >= 0n ? "+" : ""}${formatInteger(result.additionalCount - base.additionalCount)}명 · ${result.cost - base.cost >= 0n ? "+" : ""}${formatCurrency(result.cost - base.cost)}`}</td></tr>`;
      })
      .join("")}</tbody></table></div>
    <div class="formula-note"><strong>계산 규칙</strong><span>목표 인원 = 올림(대상 인원 × 목표 비율)</span><span>추가 인원 = max(0, 목표 인원 − 수급 인원)</span><span>가정 비용 = 추가 인원 × 월 단가 × 개월 수</span></div>
    <div class="source-note"><div><strong>자료 출처</strong><a href="${escapeHtml(safeUrl(data.sourceUrl || SOURCE_URL))}">${escapeHtml(data.sourceUrl || SOURCE_URL)}</a><span>${escapeHtml(data.sourceName)} · 기준월 ${escapeHtml(data.referencePeriod || "확인 필요")} · ${data.isPreview ? "미리보기 일부" : "사용자 제공 자료"}</span></div><div><strong>원천 행 ID</strong><span>${escapeHtml(row.source_row_id)} · SHA-256 ${escapeHtml(data.sourceSha256)}</span></div><div><strong>계산 유의</strong><span>단가와 기간은 사용자 가정입니다. 국비·지방비 분담, 이용률·사용률, 행정 비용은 포함하지 않습니다. 수급구분 간 중복 여부와 실제 신청·이용 구분은 확인되지 않아 두 구분을 합산하지 않습니다. 이 계산은 실제 필요 예산이나 수요 예측을 뜻하지 않습니다.</span></div></div>
    <footer class="print-footer"><span>브라우저에서 생성 · ${escapeHtml(new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }))} KST</span><span>스포츠복지 플래너 · 검토용</span></footer></div></section>`;
}

function uploadDialog() {
  return `<dialog id="upload-dialog" aria-labelledby="upload-title"><form method="dialog" class="dialog-head"><div><span class="eyebrow">자료 불러오기</span><h2 id="upload-title">파일 범위 확인</h2></div><button class="icon-button" value="cancel" aria-label="닫기">닫기</button></form><div id="upload-form"></div></dialog>`;
}

function render() {
  app.innerHTML = `<header class="site-header"><a class="brand" href="#top" aria-label="스포츠복지 플래너 홈"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>SPORTS WELFARE<br><b>PLANNER</b></span></a><nav aria-label="주요 화면"><a href="#overview">지역 현황 <span>01</span></a><a href="#compare">목표 비교 <span>02</span></a><a href="#review">검토표 <span>03</span></a></nav><button class="header-action" data-action="browse">자료 불러오기 <span aria-hidden="true">↗</span></button></header>
    <main id="top"><section class="hero"><div class="hero-copy"><div class="hero-tag"><span class="tag-dot"></span> LOCAL DATA · PUBLIC SPORTS</div><h1>지역의 현황에서<br><em>지원의 다음 목표</em>를<br>그려보세요.</h1><p>공단 자료를 살펴보고, 원하는 지원 목표와 가정 비용을 비교해 근거가 남는 검토표를 만듭니다.</p><a class="hero-link" href="#overview">현황부터 살펴보기 <span aria-hidden="true">↓</span></a></div>
      <div class="hero-art" aria-hidden="true"><div class="orb orb-large"></div><div class="orb orb-small"></div><div class="art-ring"></div><div class="art-copy"><span>PLAN WITH</span><strong>LOCAL<br>CONTEXT</strong></div><div class="art-index">26<span> / 06</span></div><div class="art-cross cross-a">＋</div><div class="art-cross cross-b">＋</div></div></section>
    ${banner()}<div class="content-stack">${overview()}${comparison()}${review()}</div>
    <section class="closing-note"><span class="closing-mark">i</span><p>자료상 비율과 사용자 가정에 따른 산출값을 제공합니다. 개인 지원 자격 판정이나 실제 예산 결정에는 사용할 수 없습니다.</p><a href="${SOURCE_URL}" target="_blank" rel="noreferrer">데이터 출처 ↗</a></section></main>
    <footer class="site-footer"><span>SPORTS WELFARE PLANNER <small>· 검토용 도구</small></span><span>공공데이터의 범위와 기준을 함께 보여줍니다</span></footer>
    ${uploadDialog()}${state.toast ? `<div class="toast" role="status" aria-live="polite">${escapeHtml(state.toast)}</div>` : ""}`;
  bindEvents();
}

function openUpload() {
  const dialog = document.querySelector<HTMLDialogElement>("#upload-dialog")!;
  if (!dialog.open) dialog.showModal();
  document.querySelector<HTMLDivElement>("#upload-form")!.innerHTML =
    `<label class="file-drop"><span class="drop-icon">↑</span><strong>${pendingFile ? escapeHtml(pendingFile.name) : "CSV 또는 JSON 파일을 선택하세요"}</strong><small>${pendingFile ? `${formatInteger(pendingFile.size)} bytes` : "10MB 이하 · 자료는 브라우저 안에서 처리됩니다"}</small><input type="file" id="dialog-file" accept=".csv,.json,text/csv,application/json"></label>
    ${pendingFile?.name.toLowerCase().endsWith(".csv") ? `<div class="metadata-fields"><label>통계 기준 월<input id="meta-period" type="month" value="${/2026.?07/.test(pendingFile.name) ? "2026-06" : ""}" required></label><label>확인한 출처 URL<input id="meta-url" type="url" value="${SOURCE_URL}" required></label><label>자료 범위<select id="meta-scope"><option value="full">다운로드 전체 파일</option><option value="preview">공식 미리보기 일부</option><option value="user">사용자 제공 파일</option></select></label></div>` : ""}
    <p class="privacy-note">업로드한 파일은 브라우저 안에서 읽고 계산합니다. 새로고침하거나 화면을 닫으면 불러온 자료가 초기화됩니다.</p>
    <div id="upload-error" class="upload-error" role="alert"></div><div class="dialog-actions"><button class="button button-light" data-action="close-dialog">취소</button>${pendingFile ? `<button class="button button-primary" data-action="load-file" ${pendingFile.name.toLowerCase().endsWith(".csv") ? "" : 'data-json="true"'}>자료 확인 후 사용</button>` : ""}</div>`;
  const input = document.querySelector<HTMLInputElement>("#dialog-file")!;
  input.addEventListener("change", () => {
    const f = input.files?.[0];
    if (f) {
      pendingFile = f;
      openUpload();
    }
  });
  document
    .querySelector<HTMLButtonElement>('[data-action="load-file"]')
    ?.addEventListener("click", async () => {
      await loadFile();
    });
  document
    .querySelector<HTMLButtonElement>('[data-action="close-dialog"]')
    ?.addEventListener("click", () => {
      pendingFile = undefined;
      dialog.close();
    });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      pendingFile = undefined;
    }
  });
}

async function loadFile() {
  if (!pendingFile) return;
  const file = pendingFile;
  const button = document.querySelector<HTMLButtonElement>(
    '[data-action="load-file"]',
  );
  if (file.size > 10 * 1024 * 1024) {
    showUploadError("파일은 10MB 이하로 선택해 주세요.");
    return;
  }
  if (file.name.toLowerCase().endsWith(".csv")) {
    const period =
      document.querySelector<HTMLInputElement>("#meta-period")?.value ?? "";
    const url =
      document.querySelector<HTMLInputElement>("#meta-url")?.value ?? "";
    const scope = document.querySelector<HTMLSelectElement>("#meta-scope")
      ?.value as "full" | "preview" | "user" | undefined;
    if (!period || !url || !scope) {
      showUploadError("기준 월, 출처 URL, 자료 범위를 확인해 주세요.");
      return;
    }
    try {
      new URL(url);
      if (!/^https?:$/.test(new URL(url).protocol)) throw new Error();
    } catch {
      showUploadError("http 또는 https 출처 URL을 입력해 주세요.");
      return;
    }
    button?.setAttribute("disabled", "");
    button?.classList.add("button-loading");
    if (button) button.textContent = "자료 확인 중…";
    try {
      state.dataset = await parseCsv(file, {
        referencePeriod: period,
        sourceUrl: url,
        scope,
      });
    } catch (error) {
      showUploadError(
        error instanceof DataError
          ? `${error.message}${error.detail ? `\n${error.detail}` : ""}`
          : "CSV 파일을 읽지 못했습니다.",
      );
      restoreLoadButton();
      return;
    }
  } else if (file.name.toLowerCase().endsWith(".json")) {
    try {
      state.dataset = await parseJson(file);
    } catch (error) {
      showUploadError(
        error instanceof DataError
          ? error.message
          : "JSON 파일을 읽지 못했습니다.",
      );
      restoreLoadButton();
      return;
    }
  } else {
    showUploadError("CSV 또는 JSON 파일만 불러올 수 있습니다.");
    return;
  }
  state.selectedProvince = "";
  state.selectedCategory = "";
  state.selectedYear = "";
  state.search = "";
  state.sort = "name";
  state.selected = undefined;
  state.scenarios = [];
  pendingFile = undefined;
  const years = [
    ...new Set(state.dataset!.rows.map((row) => row.BASE_YEAR)),
  ].sort();
  state.selectedYear = years.at(-1) ?? "";
  const provinces = provinceOptions(state.dataset!);
  state.selectedProvince =
    provinces.find(([, name]) => name === "서울특별시")?.[0] ??
    provinces[0]?.[0] ??
    "";
  state.selectedCategory = state.dataset!.rows.some(
    (row) => row.RECIPT_FLAG_CD === "N",
  )
    ? "N"
    : ([
        ...new Set(state.dataset!.rows.map((row) => row.RECIPT_FLAG_CD)),
      ].sort()[0] ?? "");
  document.querySelector<HTMLDialogElement>("#upload-dialog")?.close();
  render();
  document
    .querySelector("#overview")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
  const held = state.dataset.rows.filter(
    (r) => r.quality_status === "hold",
  ).length;
  toast(
    `${formatInteger(state.dataset.rows.length)}행을 확인했습니다${held ? ` · 확인 필요 ${formatInteger(held)}행` : ""}.`,
  );
}
function restoreLoadButton() {
  const b = document.querySelector<HTMLButtonElement>(
    '[data-action="load-file"]',
  );
  if (b) {
    b.removeAttribute("disabled");
    b.classList.remove("button-loading");
    b.textContent = "자료 확인 후 사용";
  }
}
function showUploadError(message: string) {
  const el = document.querySelector<HTMLDivElement>("#upload-error");
  if (el) el.innerHTML = escapeHtml(message).replace(/\n/g, "<br>");
}

function bindEvents() {
  app.querySelectorAll<HTMLElement>("[data-action]").forEach((el) =>
    el.addEventListener("click", async (event) => {
      const target = event.currentTarget as HTMLElement;
      const action = target.dataset.action!;
      const id = target.dataset.scenario;
      if (action === "browse") {
        pendingFile = undefined;
        openUpload();
      }
      if (action === "close-dialog") {
        pendingFile = undefined;
        document.querySelector<HTMLDialogElement>("#upload-dialog")?.close();
      }
      if (action === "load-file") await loadFile();
      if (action === "reset-filters") {
        state.selectedProvince = "";
        state.selectedCategory = "";
        state.selectedYear = "";
        state.search = "";
        state.sort = "name";
        render();
      }
      if (action === "choose") {
        const row = state.dataset?.rows.find(
          (r) => r.source_row_id === target.dataset.row,
        );
        if (!row) return;
        if (
          state.selected &&
          state.selected.source_row_id !== row.source_row_id &&
          !window.confirm(
            "지역을 바꾸면 기존 시나리오가 초기화됩니다. 이동할까요?",
          )
        )
          return;
        state.selected = row;
        state.scenarios = [createScenario()];
        render();
        document
          .querySelector("#compare")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (action === "clear-selection") {
        state.selected = undefined;
        state.scenarios = [];
        render();
        document
          .querySelector("#overview")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (action === "duplicate-scenario") {
        const source = state.scenarios.find((s) => s.id === id);
        if (source && state.scenarios.length < 3) {
          state.scenarios.push({
            ...createScenario(),
            assumptions: { ...source.assumptions },
            stale: true,
          });
          render();
        }
      }
      if (action === "remove-scenario") {
        if (state.scenarios.length > 1) {
          state.scenarios = state.scenarios.filter((s) => s.id !== id);
          render();
        }
      }
      if (action === "calculate") {
        const scenario = state.scenarios.find((s) => s.id === id);
        if (!scenario || !state.selected) return;
        scenario.error = undefined;
        try {
          scenario.result = calculate(state.selected, scenario.assumptions);
          scenario.stale = false;
        } catch (error) {
          scenario.result = undefined;
          scenario.stale = true;
          scenario.error =
            error instanceof CalculationError
              ? error.message
              : "계산할 수 없습니다. 입력값과 자료를 확인해 주세요.";
        }
        render();
        if (!scenario.error)
          document
            .querySelector("#review")
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      if (action === "print") {
        window.print();
      }
    }),
  );
  app
    .querySelector<HTMLSelectElement>("#filter-year")
    ?.addEventListener("change", (e) => {
      state.selectedYear = (e.target as HTMLSelectElement).value;
      render();
    });
  app
    .querySelector<HTMLSelectElement>("#filter-province")
    ?.addEventListener("change", (e) => {
      state.selectedProvince = (e.target as HTMLSelectElement).value;
      render();
    });
  app
    .querySelector<HTMLSelectElement>("#filter-category")
    ?.addEventListener("change", (e) => {
      state.selectedCategory = (e.target as HTMLSelectElement).value;
      render();
    });
  app
    .querySelector<HTMLSelectElement>("#filter-sort")
    ?.addEventListener("change", (e) => {
      state.sort = (e.target as HTMLSelectElement).value as typeof state.sort;
      render();
    });
  app
    .querySelector<HTMLInputElement>("#filter-search")
    ?.addEventListener("input", (e) => {
      const input = e.target as HTMLInputElement;
      state.search = input.value;
      const start = input.selectionStart;
      const end = input.selectionEnd;
      render();
      const next = app.querySelector<HTMLInputElement>("#filter-search");
      next?.focus();
      next?.setSelectionRange(start, end);
    });
  app
    .querySelectorAll<HTMLInputElement>("[data-scenario][data-key]")
    .forEach((input) =>
      input.addEventListener("input", (e) => {
        const el = e.currentTarget as HTMLInputElement;
        const scenario = state.scenarios.find(
          (s) => s.id === el.dataset.scenario,
        );
        if (!scenario) return;
        scenario.assumptions[el.dataset.key as keyof Scenario["assumptions"]] =
          el.value;
        scenario.stale = true;
        scenario.result = undefined;
        scenario.error = undefined;
        const status = app.querySelector<HTMLElement>(
          `[data-status="${scenario.id}"]`,
        );
        if (status) {
          status.textContent = "다시 계산 필요";
          status.className = "scenario-status status-stale";
        }
        const result = app.querySelector<HTMLElement>(
          `[data-result="${scenario.id}"]`,
        );
        if (result) {
          result.innerHTML = resultMarkup(undefined);
          result.classList.add("result-stale");
        }
        const print = app.querySelector<HTMLButtonElement>(
          '[data-action="print"]',
        );
        if (print)
          print.disabled = !state.scenarios.some(
            (s) => s === state.scenarios[0] && s.result && !s.stale,
          );
      }),
    );
}

render();
