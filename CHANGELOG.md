# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-03-22

### Added

#### CLI
- `kura init` — Vault initialization with `.kura/` directory and `config.toml`
- `kura create` — Create new notes with YAML frontmatter
- `kura edit` — Open notes in `$EDITOR`
- `kura show` — Display note content
- `kura list` — List all notes in the vault
- `kura search` — Full-text search with time-decay ranking
- `kura index` — Build/rebuild FTS5 search index (incremental and full rebuild)
- `kura audit` — Security scan for injection patterns
- `kura daily` — Auto-generate daily notes
- `kura serve` — Browser UI at `localhost:3847`

#### Search
- SQLite FTS5 full-text search engine
- Multilingual tokenization: English (default), Japanese (kuromoji.js), Chinese (Intl.Segmenter)
- Time-decay ranking — newer notes rank higher (`1/(1 + decay_rate * days)`)
- BM25 relevance scoring
- `--format json` output with sanitization for agent/LLM integration

#### Security
- Sanitization pipeline for `--format json` output (on by default)
- HTML comment and zero-width character stripping
- Prompt injection pattern detection (`ignore previous instructions`, etc.)
- `confidential: true` frontmatter flag to exclude notes from all output
- `kura audit` for vault-wide security scanning
- `security_flag` field in search results

#### Web UI
- Hono + HTMX browser interface
- Dashboard, note list, note viewer, search UI
- REST API: `GET /api/search`, `GET /api/notes`, `GET /api/notes/:path`, `POST /api/audit`

#### Infrastructure
- Bun runtime with built-in SQLite
- `bun build --compile` for single-binary distribution
- GitHub Actions CI (`bun test` on push/PR to main)
- 150 tests across 15 test files
- YAML frontmatter parser
- Layered architecture: `cli/` → `services/` → `models/` + `utils/`

[Unreleased]: https://github.com/Ryosuke-Y/kura/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Ryosuke-Y/kura/releases/tag/v0.1.0
