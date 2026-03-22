/**
 * ノート一覧ビュー
 */

export interface NoteListData {
  readonly notes: readonly { filePath: string; title: string; updated: string }[];
  readonly total: number;
}

export function noteListView(data: NoteListData): string {
  if (data.notes.length === 0) {
    return '<div class="empty">ノートがありません。</div>';
  }

  const items = data.notes.map((n) => `
    <div class="card">
      <a href="/notes/${encodeURIComponent(n.filePath)}"
         hx-get="/notes/${encodeURIComponent(n.filePath)}"
         hx-target="#main" hx-push-url="true">
        <h3>${escapeHtml(n.title || n.filePath)}</h3>
        <span class="meta">${n.filePath} &middot; ${formatDate(n.updated)}</span>
      </a>
    </div>`).join("");

  return `
    <div class="section-title">ノート一覧 (${data.total}件)</div>
    ${items}`;
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
