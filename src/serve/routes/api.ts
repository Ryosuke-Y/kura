/**
 * REST APIルート
 *
 * エージェント/LLM連携用のJSON APIエンドポイント。
 * CLIの --format json と同じスキーマを返す。
 * サニタイズはデフォルトON（?sanitize=false で無効化可能）。
 *
 * GET  /api/search?q=...&limit=10&sanitize=true  — 全文検索
 * GET  /api/notes?limit=50                        — ノート一覧
 * GET  /api/notes/:path                           — ノート詳細
 * POST /api/audit                                 — セキュリティスキャン
 */

import { Hono } from "hono";
import type { VaultPaths } from "../../services/vault.ts";
import { searchNotes } from "../../services/search.ts";
import { listNotes, readNote } from "../../services/note.ts";
import { auditVault } from "../../services/scanner.ts";
import { sanitizeContent } from "../../services/sanitizer.ts";
import { loadConfig } from "../../services/config.ts";

export function apiRoute(paths: VaultPaths): Hono {
  const app = new Hono();
  const config = loadConfig(paths);

  // 検索API
  app.get("/search", async (c) => {
    const query = c.req.query("q") ?? "";
    const limit = parseInt(c.req.query("limit") ?? "10", 10);
    const shouldSanitize = c.req.query("sanitize") !== "false";

    if (!query.trim()) {
      return c.json({ results: [], query, meta: { excluded_confidential: 0 }, sanitized: shouldSanitize });
    }

    try {
      const { results, meta } = await searchNotes(paths, query, limit, config.search.decayRate);

      const jsonResults = results.map((r) => {
        const { sanitized: cleanSnippet, warnings } = shouldSanitize
          ? sanitizeContent(r.snippet)
          : { sanitized: r.snippet, warnings: [] as string[] };

        return {
          path: r.filePath,
          title: r.title,
          snippet: cleanSnippet,
          updated: r.updated,
          score: r.score,
          security_flag: r.securityFlag,
          ...(warnings.length > 0 ? { warnings } : {}),
        };
      });

      return c.json({
        results: jsonResults,
        query,
        meta: { excluded_confidential: meta.excludedConfidential },
        sanitized: shouldSanitize,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  // ノート一覧API
  app.get("/notes", (c) => {
    const limit = parseInt(c.req.query("limit") ?? "50", 10);

    try {
      const allNotes = listNotes(paths.root);
      const notes = allNotes.slice(0, limit).map((filePath) => {
        try {
          const note = readNote(paths.root, filePath);
          return {
            path: filePath,
            title: note.frontmatter.title,
            tags: note.frontmatter.tags,
            updated: note.frontmatter.updated,
            confidential: note.frontmatter.confidential,
            security_flag: note.frontmatter.security_flag,
          };
        } catch {
          return { path: filePath, title: filePath, tags: [], updated: "", confidential: false, security_flag: "clean" };
        }
      });

      return c.json({ notes, total: allNotes.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  // ノート詳細API
  // パスに / が含まれるためワイルドカード
  app.get("/notes/*", (c) => {
    const notePath = decodeURIComponent(c.req.path.replace(/^\/api\/notes\//, ""));
    const shouldSanitize = c.req.query("sanitize") !== "false";

    try {
      const note = readNote(paths.root, notePath);

      const content = shouldSanitize
        ? sanitizeContent(note.content)
        : { sanitized: note.content, warnings: [] as string[] };

      return c.json({
        path: notePath,
        title: note.frontmatter.title,
        content: content.sanitized,
        tags: note.frontmatter.tags,
        created: note.frontmatter.created,
        updated: note.frontmatter.updated,
        security_flag: note.frontmatter.security_flag,
        sanitized: shouldSanitize,
        ...(content.warnings.length > 0 ? { warnings: content.warnings } : {}),
      });
    } catch {
      return c.json({ error: `ノートが見つかりません: ${notePath}` }, 404);
    }
  });

  // セキュリティスキャンAPI
  app.post("/audit", (c) => {
    try {
      const result = auditVault(paths);
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  return app;
}
