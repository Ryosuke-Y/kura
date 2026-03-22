/**
 * ダッシュボードルート
 *
 * GET / — 最近のノート、今日のデイリーノート、検索バー
 */

import { Hono } from "hono";
import type { VaultPaths } from "../../services/vault.ts";
import { listNotes, readNote } from "../../services/note.ts";
import { todayDateStr } from "../../services/daily.ts";
import { layout, fragment } from "../views/layout.ts";
import { dashboardView } from "../views/dashboard.ts";
import path from "path";
import { existsSync } from "fs";

export function dashboardRoute(paths: VaultPaths): Hono {
  const app = new Hono();

  app.get("/", (c) => {
    // 最近のノート（最大10件）
    const allNotes = listNotes(paths.root);
    const recentNotes = allNotes.slice(0, 10).map((filePath) => {
      try {
        const note = readNote(paths.root, filePath);
        return {
          filePath,
          title: note.frontmatter.title,
          updated: note.frontmatter.updated,
        };
      } catch {
        return { filePath, title: filePath, updated: "" };
      }
    });

    // 今日のデイリーノート
    const dailyPath = `daily/${todayDateStr()}.md`;
    const dailyExists = existsSync(path.join(paths.root, dailyPath));

    const content = dashboardView({
      recentNotes,
      dailyPath: dailyExists ? dailyPath : null,
    });

    // HTMXリクエストならフラグメントのみ返す
    if (c.req.header("HX-Request")) {
      return c.html(fragment(content));
    }

    return c.html(layout({ title: "ダッシュボード", content, currentPath: "/" }));
  });

  return app;
}
