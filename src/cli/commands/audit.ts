/**
 * kura audit コマンド
 *
 * Vault全体をセキュリティスキャンし、
 * プロンプトインジェクションやドキュメントポイズニングの兆候を検知する。
 * 結果は .kura/audit.log にも記録される。
 */

import { Command } from "commander";
import { appendFileSync } from "fs";
import path from "path";
import { findVaultRoot, getVaultPaths } from "../../services/vault.ts";
import { auditVault } from "../../services/scanner.ts";

export const auditCommand = new Command("audit")
  .description("Vault全体のセキュリティスキャンを実行する")
  .option("--format <format>", "出力フォーマット（text|json）", "text")
  .action((options: { format: string }) => {
    const vaultRoot = findVaultRoot(process.cwd());
    if (!vaultRoot) {
      console.error("エラー: Vaultが見つかりません。");
      process.exit(1);
    }

    const paths = getVaultPaths(vaultRoot);

    console.log("セキュリティスキャンを実行中...");

    try {
      const result = auditVault(paths);

      // audit.logに記録
      const logPath = path.join(paths.kuraDir, "audit.log");
      const logEntry = formatLogEntry(result);
      appendFileSync(logPath, logEntry, "utf-8");

      if (options.format === "json") {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printTextResult(result);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`エラー: ${message}`);
      process.exit(1);
    }
  });

/** テキスト出力 */
function printTextResult(result: ReturnType<typeof auditVault>): void {
  console.log(
    `\nスキャン完了: ${result.scannedNotes}/${result.totalNotes}件 (${Math.round(result.elapsedMs)}ms)\n`
  );

  if (result.suspiciousNotes === 0) {
    console.log("問題は検出されませんでした。");
  } else {
    console.log(`⚠ ${result.suspiciousNotes}件の疑わしいノートを検出:\n`);

    for (const finding of result.findings) {
      console.log(`  ${finding.title}`);
      console.log(`  ${finding.filePath}`);
      for (const warning of finding.warnings) {
        console.log(`    - ${warning}`);
      }
      console.log();
    }

    console.log("注: security_flag を 'suspicious' に更新しました。");
    console.log("    --format json 検索時に warning フィールドで通知されます。");
  }

  if (result.errors.length > 0) {
    console.log(`\nエラー (${result.errors.length}件):`);
    for (const err of result.errors) {
      console.log(`  ${err}`);
    }
  }
}

/** audit.log用のフォーマット */
function formatLogEntry(result: ReturnType<typeof auditVault>): string {
  const timestamp = new Date().toISOString();
  const lines = [
    `\n[${timestamp}] audit scan`,
    `  scanned: ${result.scannedNotes}/${result.totalNotes}`,
    `  suspicious: ${result.suspiciousNotes}`,
    `  elapsed: ${Math.round(result.elapsedMs)}ms`,
  ];

  for (const finding of result.findings) {
    lines.push(`  SUSPICIOUS: ${finding.filePath}`);
    for (const warning of finding.warnings) {
      lines.push(`    - ${warning}`);
    }
  }

  for (const err of result.errors) {
    lines.push(`  ERROR: ${err}`);
  }

  return lines.join("\n") + "\n";
}
