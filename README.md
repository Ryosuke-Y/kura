# Kura（蔵）

[日本語](README.ja.md)

**Your Markdown notes are your agent's knowledge base.
Are they safe to hand over?**

Kura is a local-first knowledge management tool for developers and
researchers who run local LLMs. Plain Markdown in, sanitized JSON out.

## What Kura Does

- **Stores notes as plain Markdown** — no lock-in, works with vim, VS Code, Obsidian
- **Full-text search** — English and Japanese supported (Chinese coming soon). SQLite FTS5 with language-aware tokenization
- **Ranks by freshness** — time-decay ranking so recent notes surface first
- **Sanitizes before serving** — strips hidden instructions and flags injection patterns before your agent sees them

## How it Works

```bash
# 1. Point Kura at a folder
kura init ~/knowledge

# 2. Build the search index
kura index

# 3. Your agent queries Kura
kura search "RAG security" --format json
```

That last command returns:

```json
{
  "results": [
    {
      "path": "references/rag-security.md",
      "title": "RAG Security Threats",
      "snippet": "Document poisoning can manipulate LLM output...",
      "updated": "2026-03-20T10:00:00+09:00",
      "security_flag": "clean"
    }
  ],
  "meta": { "excluded_confidential": 2 },
  "sanitized": true
}
```

Two notes marked `confidential: true` were silently excluded.
The snippet was scanned for hidden instructions. The agent
gets clean data with provenance.

## Lightweight Enough for Local LLM

When a 9B model uses 5-6GB of RAM, your tools need to stay small.

```
OS + apps              ~10 GB
Local LLM (9B Q4)      ~6 GB
Available              ~16 GB
────────────────────────────
Kura serve              ~80 MB  (Web UI)
Kura CLI (indexing)    ~400 MB  (temporary)
```

Compare: Obsidian ~300MB, Notion ~400MB resident.

## Security

Kura treats your vault as a RAG knowledge base — same data,
same attack surface.

| Threat | What Kura Does |
|--------|---------------|
| Document poisoning | `kura audit` scans for injection patterns |
| Hidden instructions | Strips HTML comments and zero-width characters |
| Prompt injection | Detects "ignore previous instructions" and similar |
| Data exfiltration | `confidential: true` excludes notes from all output |

Sanitization is on by default. See [docs/security.md](docs/security.md)
for the threat model.

## HTTP API

Available while `kura serve` is running:

| Endpoint | Description |
|---------|------------|
| `GET /api/search?q=...` | Full-text search |
| `GET /api/notes` | Note list |
| `GET /api/notes/:path` | Note content |
| `POST /api/audit` | Security scan |

## CLI

| Command | |
|---------|--|
| `kura init` | Create a vault |
| `kura create` | New note |
| `kura index` | Build search index |
| `kura search` | Search (time-decay ranked) |
| `kura audit` | Security scan |
| `kura daily` | Daily note |
| `kura serve` | Browser UI at localhost:3847 |
| `kura show`, `edit`, `list` | Read, edit, list notes |

## Install

```bash
git clone https://github.com/Ryosuke-Y/Project-kura.git
cd Project-kura && bun install
bun run kura --help
```

Or build a single binary:

```bash
bun run build    # → ./kura
```

Requires [Bun](https://bun.sh).

## Configuration

`.kura/config.toml`:

```toml
[search]
decay_rate = 0.01  # Higher = older notes rank lower

[serve]
port = 3847
```

## Architecture

```
src/
├── cli/        # CLI (Commander.js)
├── serve/      # Web UI (Hono + HTMX) + REST API
├── services/   # Business logic (shared across all interfaces)
├── models/     # Types
└── utils/      # Utilities
```

**Stack:** Bun, SQLite FTS5, kuromoji.js (Japanese), Intl.Segmenter (Chinese), Hono, HTMX

## License

AGPL-3.0 — see [LICENSE](LICENSE)
