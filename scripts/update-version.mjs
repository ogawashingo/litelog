// Git コミット情報（ハッシュおよびコミット日時）を抽出し version.json を自動生成するスクリプト
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const versionFilePath = path.join(rootDir, "src", "lib", "version.json");

try {
  // Git から直近コミットの短縮ハッシュと日時（YYYY/MM/DD HH:mm）を取得
  const commitHash = execSync("git rev-parse --short HEAD", { cwd: rootDir, stdio: ["pipe", "pipe", "ignore"] })
    .toString()
    .trim();
  const commitDate = execSync('git log -1 --format="%cd" --date=format:"%Y/%m/%d %H:%M"', {
    cwd: rootDir,
    stdio: ["pipe", "pipe", "ignore"],
  })
    .toString()
    .trim();

  if (commitHash && commitDate) {
    const versionString = `ver: ${commitHash} (${commitDate})`;
    const data = {
      commitHash,
      commitDate,
      version: versionString,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(versionFilePath, JSON.stringify(data, null, 2) + "\n", "utf8");
    console.log(`[Version] 生成完了: ${versionString}`);
  }
} catch {
  // Git が利用できない環境（Dockerコンテナ等）では既存ファイルを保持
  if (fs.existsSync(versionFilePath)) {
    console.log("[Version] 既存の version.json を維持します");
  } else {
    // 初回フォールバック
    const fallback = {
      commitHash: "unknown",
      commitDate: "unknown",
      version: "ver: unknown",
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(versionFilePath, JSON.stringify(fallback, null, 2) + "\n", "utf8");
  }
}
