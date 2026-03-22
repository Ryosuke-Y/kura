/**
 * ノートルート
 *
 * GET  /notes           — ノート一覧
 * GET  /notes/:path     — ノート閲覧（Markdownレンダリング）
 * GET  /notes/:path/edit — ノート編集フォーム（HTMX部分更新）
 * PUT  /notes/:path     — ノート保存
 */

import { Hono } from "hono";
import type { VaultPaths } from "../../services/vault.ts";
import { listNotes, readNote, updateNote } from "../../services/note.ts";
import { layout, fragment } from "../views/layout.ts";
import { noteListView } from "../views/note-list.ts";
import { noteView, noteEditView } from "../views/note-view.ts";
import type { NoteViewData } from "../views/note-view.ts";

/** ノートパスからNoteViewDataを作る共通ヘルパー */
function readNoteViewData(vaultRoot: string, notePath: string): NoteViewData {
  const note = readNote(vaultRoot, notePath);
  return {
    filePath: notePath,
    title: note.frontmatter.title,
    content: note.content,
    tags: note.frontmatter.tags,
    created: note.frontmatter.created,
    updated: note.frontmatter.updated,
    securityFlag: note.frontmatter.security_flag,
  };
}

export function notesRoute(paths: VaultPaths): Hono {
  const app = new Hono();

  // ノート一覧
  app.get("/", (c) => {
    const allNotes = listNotes(paths.root);
    const notes = allNotes.map((filePath) => {
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

    const content = noteListView({ notes, total: notes.length });

    if (c.req.header("HX-Request")) {
      return c.html(fragment(content));
    }
    return c.html(layout({ title: "ノート一覧", content, currentPath: "/notes" }));
  });

  // ノート閲覧・編集・保存
  // パスに / が含まれるため、ワイルドカードでキャッチし、
  // /edit サフィックスとHTTPメソッドで分岐する
  app.get("/*", (c) => {
    const rawPath = decodeURIComponent(c.req.path.replace(/^\/notes\//, ""));

    if (!rawPath) {
      return c.redirect("/notes");
    }

    // /edit サフィックスの判定
    const isEdit = rawPath.endsWith("/edit");
    const notePath = isEdit ? rawPath.replace(/\/edit$/, "") : rawPath;

    try {
      const data = readNoteViewData(paths.root, notePath);

      if (isEdit) {
        // 編集フォーム（HTMX部分更新のみ）
        return c.html(noteEditView(data));
      }

      const content = noteView(data);

      if (c.req.header("HX-Request")) {
        return c.html(fragment(content));
      }
      return c.html(
        layout({
          title: data.title || notePath,
          content,
          currentPath: "/notes",
        })
      );
    } catch {
      const errorContent = `<div class="empty">ノートが見つかりません: ${notePath}</div>`;
      if (c.req.header("HX-Request")) {
        return c.html(fragment(errorContent), 404);
      }
      return c.html(layout({ title: "Not Found", content: errorContent }), 404);
    }
  });

  // ノート保存
  app.put("/*", async (c) => {
    const notePath = decodeURIComponent(c.req.path.replace(/^\/notes\//, ""));

    try {
      const body = await c.req.parseBody();
      const newContent = typeof body.content === "string" ? body.content : "";

      updateNote(paths.root, notePath, newContent);

      // 保存後は閲覧ビューに戻す
      const data = readNoteViewData(paths.root, notePath);
      return c.html(noteView(data));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const errorHtml = `<div id="note-area"><div class="empty">保存に失敗しました: ${message}</div></div>`;
      return c.html(errorHtml, 500);
    }
  });

  return app;
}
