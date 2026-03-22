/**
 * ダッシュボードビュー
 *
 * 最近のノート、今日のデイリーノート、検索バーを表示する。
 */

import type { Note } from "../../models/note.ts";

export interface DashboardData {
  readonly recentNotes: readonly { filePath: string; title: string; updated: string }[];
  readonly dailyPath: string | null; // 今日のデイリーノートのパス（なければnull）
}

export function dashboardView(data: DashboardData): string {
  const searchBar = `
    <form class="search-form" action="/search" method="get"
          hx-get="/search" hx-target="#main" hx-push-url="true">
      <input type="search" name="q" placeholder="ノートを検索..." autofocus>
      <button type="submit">検索</button>
    </form>`;

  const dailySection = data.dailyPath
    ? `<div class="card">
        <a href="/notes/${encodeURIComponent(data.dailyPath)}"
           hx-get="/notes/${encodeURIComponent(data.dailyPath)}"
           hx-target="#main" hx-push-url="true">
          <h3>今日のデイリーノート</h3>
          <span class="meta">${data.dailyPath}</span>
        </a>
      </div>`
    : `<div class="card">
        <span class="meta">今日のデイリーノートはまだありません</span>
      </div>`;

  const recentItems = data.recentNotes.length > 0
    ? data.recentNotes.map((n) => `
      <div class="card">
        <a href="/notes/${encodeURIComponent(n.filePath)}"
           hx-get="/notes/${encodeURIComponent(n.filePath)}"
           hx-target="#main" hx-push-url="true">
          <h3>${escapeHtml(n.title || n.filePath)}</h3>
          <span class="meta">${n.filePath} &middot; ${formatDate(n.updated)}</span>
        </a>
      </div>`).join("")
    : '<div class="empty">ノートがありません。`kura create` で作成してください。</div>';

  return `
    ${searchBar}
    <div class="section-title">デイリーノート</div>
    ${dailySection}
    <div class="section-title">最近のノート</div>
    ${recentItems}`;
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
