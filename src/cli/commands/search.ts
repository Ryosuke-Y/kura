/**
 * kura search コマンド
 *
 * FTS5インデックスを使って全文検索する。
 * --format json 時はサニタイズパイプラインを適用し、
 * エージェント連携に安全な出力を返す。
 */

import { Command } from "commander";
import { findVaultRoot, getVaultPaths } from "../../services/vault.ts";
import { searchNotes } from "../../services/search.ts";
import { sanitizeContent } from "../../services/sanitizer.ts";
import { loadConfig } from "../../services/config.ts";

export const searchCommand = new Command("search")
  .description("ノートを全文検索する")
  .argument("<query>", "検索クエリ")
  .option("-n, --limit <number>", "最大結果件数", "10")
  .option("--format <format>", "出力フォーマット（text|json）", "text")
  .option("--no-sanitize", "サニタイズを無効化する（デフォルトON）")
  .action(async (query: string, options: { limit: string; format: string; sanitize: boolean }) => {
    const vaultRoot = findVaultRoot(process.cwd());
    if (!vaultRoot) {
      console.error("エラー: Vaultが見つかりません。");
      process.exit(1);
    }

    const paths = getVaultPaths(vaultRoot);
    const limit = parseInt(options.limit, 10);
    const config = loadConfig(paths);

    try {
      const { results, meta } = await searchNotes(paths, query, limit, config.search.decayRate);

      if (results.length === 0) {
        if (options.format === "json") {
          console.log(JSON.stringify({
            results: [],
            query,
            meta: { excluded_confidential: meta.excludedConfidential },
            sanitized: options.sanitize,
          }));
        } else {
          console.log("検索結果がありません。");
          console.log("ヒント: `kura index` でインデックスを再構築してみてください。");
          if (meta.excludedConfidential > 0) {
            console.log(`（confidentialノート ${meta.excludedConfidential}件を除外）`);
          }
        }
        return;
      }

      if (options.format === "json") {
        // エージェント連携用JSON出力（サニタイズ付き）
        const jsonResults = results.map((r) => {
          // サニタイズが有効な場合のみスニペットをサニタイズ
          const { sanitized: cleanSnippet, warnings } = options.sanitize
            ? sanitizeContent(r.snippet)
            : { sanitized: r.snippet, warnings: [] as string[] };

          return {
            path: r.filePath,
            title: r.title,
            snippet: cleanSnippet,
            score: r.score,
            updated: r.updated,
            security_flag: r.securityFlag,
            ...(warnings.length > 0 ? { warnings } : {}),
          };
        });

        console.log(
          JSON.stringify(
            {
              results: jsonResults,
              query,
              meta: { excluded_confidential: meta.excludedConfidential },
              sanitized: options.sanitize,
            },
            null,
            2
          )
        );
      } else {
        // 人間向けテキスト出力（サニタイズ不要）
        console.log(`「${query}」の検索結果 (${results.length}件):\n`);

        for (const r of results) {
          console.log(`  ${r.title}`);
          console.log(`  ${r.filePath}  (updated: ${r.updated})`);
          console.log(`  ${r.snippet}`);
          console.log();
        }

        if (meta.excludedConfidential > 0) {
          console.log(`（confidentialノート ${meta.excludedConfidential}件を除外）`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`エラー: ${message}`);
      process.exit(1);
    }
  });
