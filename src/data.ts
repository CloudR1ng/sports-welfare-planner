import Papa from "papaparse";

export const SOURCE_URL =
  "https://www.bigdata-culture.kr/bigdata/user/data_market/detail.do?id=5b30e290-2594-11eb-af9a-4b03f0a582d6";
export const FIELDS = [
  "BASE_YEAR",
  "CTPRVN_CD",
  "CTPRVN_NM",
  "SIGNGU_CD",
  "SIGNGU_NM",
  "SIGNGU_ACCTO_POPLTN_CO",
  "SIGNGU_ACCTO_FCLTY_CO",
  "RECIPT_FLAG_CD",
  "RECIPT_FLAG_NM",
  "CRRSPND_FLAG_TRGET_NMPR_CO",
  "CRRSPND_FLAG_RECIPT_NMPR_CO",
] as const;
const COUNTS = [
  "SIGNGU_ACCTO_POPLTN_CO",
  "SIGNGU_ACCTO_FCLTY_CO",
  "CRRSPND_FLAG_TRGET_NMPR_CO",
  "CRRSPND_FLAG_RECIPT_NMPR_CO",
] as const;
export type CountField = (typeof COUNTS)[number];
export type SportRow = {
  BASE_YEAR: string;
  CTPRVN_CD: string;
  CTPRVN_NM: string;
  SIGNGU_CD: string;
  SIGNGU_NM: string;
  SIGNGU_ACCTO_POPLTN_CO: number | null;
  SIGNGU_ACCTO_FCLTY_CO: number | null;
  RECIPT_FLAG_CD: string;
  RECIPT_FLAG_NM: string;
  CRRSPND_FLAG_TRGET_NMPR_CO: number | null;
  CRRSPND_FLAG_RECIPT_NMPR_CO: number | null;
  source_row_id: string;
  source_data_index: number;
  quality_status: "valid" | "hold";
  issues: string[];
};
export type Dataset = {
  rows: SportRow[];
  sourceSha256: string;
  sourceFileSha256: string;
  sourceName: string;
  sourceUrl: string;
  referencePeriod: string;
  scope: string;
  fullDataset: boolean;
  isPreview: boolean;
  warnings: string[];
};

export class DataError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "DataError";
  }
}

export function safeInteger(
  value: unknown,
  field: string,
  nullable = false,
): number | null {
  if (value === null || value === undefined || value === "") {
    if (nullable) return null;
    throw new DataError(`필수 항목 ${field}이 비어 있습니다.`);
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
    return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  throw new DataError(`${field}은(는) 0 이상의 안전한 정수여야 합니다.`);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "")
    throw new DataError(`필수 항목 ${field}이 비어 있습니다.`);
  return value.trim();
}

function normalize(
  raw: Record<string, unknown>,
  index: number,
  hash: string,
): SportRow {
  const issues: string[] = [];
  let t: number | null = null;
  let b: number | null = null;
  for (const field of COUNTS) {
    try {
      const value = safeInteger(
        raw[field],
        field,
        field === "CRRSPND_FLAG_TRGET_NMPR_CO" ||
          field === "CRRSPND_FLAG_RECIPT_NMPR_CO",
      );
      if (field === "CRRSPND_FLAG_TRGET_NMPR_CO") t = value;
      if (field === "CRRSPND_FLAG_RECIPT_NMPR_CO") b = value;
      if (value === null && field === "CRRSPND_FLAG_TRGET_NMPR_CO")
        issues.push("대상인원 결측");
      if (value === null && field === "CRRSPND_FLAG_RECIPT_NMPR_CO")
        issues.push("수급인원 결측");
      (raw as Record<string, unknown>)[field] = value;
    } catch {
      const label =
        field === "CRRSPND_FLAG_TRGET_NMPR_CO"
          ? "대상인원"
          : field === "CRRSPND_FLAG_RECIPT_NMPR_CO"
            ? "수급인원"
            : field === "SIGNGU_ACCTO_POPLTN_CO"
              ? "지역 인구"
              : "시설 수";
      issues.push(`${label} 값 오류`);
      (raw as Record<string, unknown>)[field] = null;
    }
  }
  if (typeof t === "number" && t === 0) issues.push("대상인원 0");
  if (typeof t === "number" && typeof b === "number" && b > t)
    issues.push("수급인원이 대상인원을 초과");
  const provinceCode = requiredText(raw.CTPRVN_CD, "CTPRVN_CD");
  const districtCode = requiredText(raw.SIGNGU_CD, "SIGNGU_CD");
  if (
    !/^\d{2}$/.test(provinceCode) ||
    !/^\d{5}$/.test(districtCode) ||
    !districtCode.startsWith(provinceCode)
  )
    issues.push("지역 코드 형식 확인 필요");
  return {
    BASE_YEAR: requiredText(raw.BASE_YEAR, "BASE_YEAR"),
    CTPRVN_CD: provinceCode,
    CTPRVN_NM: requiredText(raw.CTPRVN_NM, "CTPRVN_NM"),
    SIGNGU_CD: districtCode,
    SIGNGU_NM: requiredText(raw.SIGNGU_NM, "SIGNGU_NM"),
    SIGNGU_ACCTO_POPLTN_CO: raw.SIGNGU_ACCTO_POPLTN_CO as number | null,
    SIGNGU_ACCTO_FCLTY_CO: raw.SIGNGU_ACCTO_FCLTY_CO as number | null,
    RECIPT_FLAG_CD: requiredText(raw.RECIPT_FLAG_CD, "RECIPT_FLAG_CD"),
    RECIPT_FLAG_NM: requiredText(raw.RECIPT_FLAG_NM, "RECIPT_FLAG_NM"),
    CRRSPND_FLAG_TRGET_NMPR_CO: t,
    CRRSPND_FLAG_RECIPT_NMPR_CO: b,
    source_row_id: `${hash.slice(0, 12)}-${String(index + 1).padStart(4, "0")}`,
    source_data_index: index + 1,
    quality_status: issues.length ? "hold" : "valid",
    issues,
  };
}

function flagDuplicates(rows: SportRow[]): number {
  const counts = new Map<string, number>();
  const key = (r: SportRow) =>
    `${r.BASE_YEAR}\u0000${r.CTPRVN_CD}\u0000${r.SIGNGU_CD}\u0000${r.RECIPT_FLAG_CD}`;
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  let duplicateRows = 0;
  for (const row of rows)
    if ((counts.get(key(row)) ?? 0) > 1) {
      row.issues.push("기준연도·지역·수급구분 중복");
      row.quality_status = "hold";
      duplicateRows++;
    }
  return duplicateRows;
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

function dataset(
  rows: SportRow[],
  file: File,
  fileHash: string,
  options: {
    referencePeriod: string;
    sourceUrl: string;
    scope: string;
    fullDataset: boolean;
    sourceSha256?: string;
    isPreview: boolean;
  },
): Dataset {
  const rowPrefix =
    options.scope === "full" || options.scope === "user_downloaded_full_file"
      ? "full-"
      : options.scope === "preview" || options.scope.includes("preview")
        ? "preview-"
        : "user-";
  rows.forEach((row, index) => {
    row.source_row_id = `${rowPrefix}${(options.sourceSha256 ?? fileHash).slice(0, 12)}-${String(index + 1).padStart(4, "0")}`;
  });
  const duplicateRows = flagDuplicates(rows);
  const warnings: string[] = [];
  if (duplicateRows)
    warnings.push(`중복 논리키 ${duplicateRows}행을 계산 보류했습니다.`);
  const groups = new Map<string, SportRow[]>();
  for (const row of rows) {
    const key = `${row.BASE_YEAR}/${row.CTPRVN_CD}/${row.SIGNGU_CD}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const inconsistent = [...groups.values()].filter((group) => {
    const populations = new Set(group.map((r) => r.SIGNGU_ACCTO_POPLTN_CO));
    const facilities = new Set(group.map((r) => r.SIGNGU_ACCTO_FCLTY_CO));
    return populations.size > 1 || facilities.size > 1;
  }).length;
  if (inconsistent)
    warnings.push(
      `지역 내 인구·시설 값이 일치하지 않는 지역 ${inconsistent}곳이 있습니다. 원인을 확인하세요.`,
    );
  return {
    rows,
    sourceSha256: options.sourceSha256 ?? fileHash,
    sourceFileSha256: fileHash,
    sourceName: file.name,
    sourceUrl: options.sourceUrl,
    referencePeriod: options.referencePeriod,
    scope: options.scope,
    fullDataset: options.fullDataset,
    isPreview: options.isPreview,
    warnings,
  };
}

export async function parseCsv(
  file: File,
  metadata: {
    referencePeriod: string;
    sourceUrl: string;
    scope: "full" | "preview" | "user";
  },
): Promise<Dataset> {
  if (file.size === 0)
    throw new DataError("빈 파일입니다. CSV 내용을 확인해 주세요.");
  const fileHash = await sha256(file);
  const text = await file.text();
  if (text.includes("\uFFFD"))
    throw new DataError(
      "문자 인코딩을 읽을 수 없습니다. UTF-8 CSV로 저장해 주세요.",
    );
  const parsed = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });
  if (parsed.errors.length)
    throw new DataError(
      "CSV 행을 읽지 못했습니다.",
      parsed.errors
        .slice(0, 3)
        .map((e) => `행 ${e.row ?? "?"}: ${e.message}`)
        .join("\n"),
    );
  const table = parsed.data;
  if (table.length < 2)
    throw new DataError("헤더와 데이터 행이 있는 CSV를 선택해 주세요.");
  const header = table[0]?.map((value, i) =>
    i === 0 ? value.replace(/^\uFEFF/, "") : value,
  );
  if (
    !header ||
    header.length !== FIELDS.length ||
    FIELDS.some((name, i) => header[i] !== name)
  ) {
    throw new DataError(
      "CSV 열 이름 또는 순서가 맞지 않습니다.",
      `필요한 열: ${FIELDS.join(", ")}`,
    );
  }
  const rows = table.slice(1).map((values, index) => {
    if (values.length !== FIELDS.length)
      throw new DataError(
        `CSV ${index + 2}행의 열 수가 ${FIELDS.length}개가 아닙니다.`,
      );
    return normalize(
      Object.fromEntries(FIELDS.map((name, i) => [name, values[i] ?? ""])),
      index,
      fileHash,
    );
  });
  if (!rows.length) throw new DataError("유효한 데이터 행이 없습니다.");
  return dataset(rows, file, fileHash, {
    ...metadata,
    fullDataset: metadata.scope === "full",
    isPreview: metadata.scope === "preview",
  });
}

export async function parseJson(file: File): Promise<Dataset> {
  if (file.size === 0)
    throw new DataError("빈 파일입니다. JSON 내용을 확인해 주세요.");
  const fileHash = await sha256(file);
  let input: unknown;
  try {
    input = JSON.parse(await file.text());
  } catch {
    throw new DataError("JSON 형식을 읽을 수 없습니다.");
  }
  if (!input || typeof input !== "object")
    throw new DataError("인식할 수 있는 데이터 형식이 아닙니다.");
  const source = input as Record<string, unknown>;
  if (!Array.isArray(source.records))
    throw new DataError("JSON에 records 배열이 없습니다.");
  if (source.records.length === 0)
    throw new DataError("JSON에 데이터 행이 없습니다.");
  if (!source.coverage || typeof source.coverage !== "object")
    throw new DataError("JSON에 coverage 메타데이터가 없습니다.");
  const sourceHash =
    typeof source.source_sha256 === "string" &&
    /^[\da-f]{64}$/i.test(source.source_sha256)
      ? source.source_sha256
      : fileHash;
  const ref =
    typeof source.reference_period === "string" ? source.reference_period : "";
  const url = typeof source.source_url === "string" ? source.source_url : "";
  const scope =
    typeof source.acquisition_scope === "string"
      ? source.acquisition_scope
      : "user_supplied";
  const rows = (source.records as unknown[]).map((record, index) => {
    if (!record || typeof record !== "object" || Array.isArray(record))
      throw new DataError(`JSON ${index + 1}행 형식이 올바르지 않습니다.`);
    const raw = record as Record<string, unknown>;
    for (const name of FIELDS)
      if (!(name in raw))
        throw new DataError(`JSON에 원천 열 ${name}이 없습니다.`);
    return normalize({ ...raw }, index, sourceHash);
  });
  return dataset(rows, file, fileHash, {
    referencePeriod: ref,
    sourceUrl: url,
    scope,
    fullDataset: source.full_dataset === true,
    sourceSha256: sourceHash,
    isPreview: scope.includes("preview"),
  });
}

export function coverageOf(rows: SportRow[]) {
  return {
    years: new Set(rows.map((r) => r.BASE_YEAR)).size,
    provinces: new Set(rows.map((r) => r.CTPRVN_CD)).size,
    districts: new Set(rows.map((r) => `${r.CTPRVN_CD}:${r.SIGNGU_CD}`)).size,
    categories: new Set(rows.map((r) => r.RECIPT_FLAG_CD)).size,
    held: rows.filter((r) => r.quality_status === "hold").length,
  };
}
