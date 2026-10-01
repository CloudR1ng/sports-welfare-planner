import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const prohibited = [
  "KS_AREA_ACCTO_SPORTS_VOUCH_PRCUSE_INFO_202607.csv",
];
// Private manifest augments the local scan; public CI never needs private data.
try {
  const manifest = JSON.parse(await readFile(path.join(root, "data/source_manifest.json"), "utf8"));
  for (const entry of manifest.files ?? []) {
    if (entry.sha256) prohibited.push(entry.sha256, entry.sha256.slice(0, 12));
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const files = [];
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await visit(full);
    else files.push(full);
  }
}
await visit(dist);
if (!files.some((file) => path.basename(file) === "index.html"))
  throw new Error("dist/index.html이 없습니다.");
for (const file of files) {
  const relative = path.relative(dist, file).replaceAll(path.sep, "/");
  if (relative !== "index.html" && !/^assets\/[^/]+\.(?:js|css)$/.test(relative))
    throw new Error(`배포 허용 목록에 없는 파일: ${relative}`);
  const contents = await readFile(file);
  const source = contents.toString("utf8");
  if (/(?:full|preview)-[a-f0-9]{12}-\d{4}/i.test(source) || /["']CRRSPND_FLAG_(?:TRGET|RECIPT)_NMPR_CO["']\s*:\s*\d/.test(source))
    throw new Error(`실제 행 또는 직렬화된 데이터 발견: ${relative}`);
  for (const value of prohibited) {
    if (contents.includes(Buffer.from(value, "utf8")))
      throw new Error(
        `공개 빌드에 제외 대상 문자열이 포함됐습니다: ${path.relative(root, file)}`,
      );
  }
}
console.log(`공개 빌드 확인 완료: ${files.length}개 허용 파일, 금지 자료 패턴 없음`);
