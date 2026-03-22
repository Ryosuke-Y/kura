/**
 * ノート閲覧ビュー
 *
 * Markdownをサーバーサイドでレンダリングして表示する。
 */

import { marked } from "marked";

export interface NoteViewData {
  readonly filePath: string;
  readonly title: string;
  readonly content: string; // Markdown本文
  readonly tags: readonly string[];
  readonly created: string;
  readonly updated: string;
  readonly securityFlag: string;
}

export function noteView(data: NoteViewData): string {
  // Markdownをサーバー側でHTMLに変換
  const renderedContent = marked.parse(data.content, { async: false }) as string;

  const tags = data.tags.length > 0
    ? data.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join(" ")
    : "";

  const warningBadge = data.securityFlag === "suspicious"
    ? ' <span class="badge-warning">suspicious</span>'
    : "";

  const encodedPath = encodeURIComponent(data.filePath);

  return `
    <div id="note-area">
      <h2>${escapeHtml(data.title || data.filePath)}${warningBadge}</h2>
      <div class="note-meta">
        <span>${data.filePath}</span>
        <span>作成: ${formatDate(data.created)}</span>
        <span>更新: ${formatDate(data.updated)}</span>
        ${tags}
        <button class="btn-edit"
                hx-get="/notes/${encodedPath}/edit"
                hx-target="#note-area"
                hx-swap="outerHTML">編集</button>
      </div>
      <div class="note-content">
        ${renderedContent}
      </div>
    </div>`;
}

/** ノート編集フォーム */
export function noteEditView(data: NoteViewData): string {
  const encodedPath = encodeURIComponent(data.filePath);

  return `
    <div id="note-area">
      <h2>編集: ${escapeHtml(data.title || data.filePath)}</h2>
      <form hx-put="/notes/${encodedPath}"
            hx-target="#note-area"
            hx-swap="outerHTML">
        <textarea name="content" class="note-editor">${escapeHtml(data.content)}</textarea>
        <div class="edit-actions">
          <button type="submit" class="btn-save">保存</button>
          <button type="button" class="btn-cancel"
                  hx-get="/notes/${encodedPath}"
                  hx-target="#main"
                  hx-swap="innerHTML">キャンセル</button>
        </div>
      </form>
    </div>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}
