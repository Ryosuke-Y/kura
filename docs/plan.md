# Kura（蔵）— 実装計画

## 現在のフェーズ: 本格開発 Phase 1（コアCLI）

POC完了（設計変更付きGo）→ コアCLI実装中。セキュリティパイプラインが残りの主要タスク。

### POCで検証すること

1. bun:sqliteでFTS5が動作するか
2. kuromoji.jsで日本語テキストを分かち書きできるか
3. 分かち書きテキストをFTS5に登録し、日本語検索が機能するか
4. kuromoji.js辞書ロード時間の実測と、キャッシュ戦略の検討
5. 全体のメモリ消費量が目標に収まるか

### 成功基準

| 項目 | 基準 |
|------|------|
| FTS5動作 | bun:sqliteでFTS5仮想テーブルが作成・検索できる |
| 日本語検索 | 「知識管理」で検索して「知識管理ツール」を含むノートがヒットする |
| 辞書ロード | 5秒以下（キャッシュ使用時） |
| メモリ | 1000件ノート登録後のプロセスメモリが100MB以下 |
| 検索速度 | 1000件から100ms以下で検索結果を返す |

### POC後の判断

- **Go:** 全ての成功基準をクリア → 本格開発Phase 1へ
- **設計変更:** 辞書ロードが遅い → Budouxに切り替え or trigram方式を検討
- **設計変更:** bun:sqliteでFTS5が使えない → better-sqlite3に切り替え
- **No-Go:** メモリ消費が目標の2倍以上 → アーキテクチャ再検討

---

## POC実装ステップ

### Phase 2: スキャフォールディング
- Bunプロジェクト初期化
- TypeScript設定
- ディレクトリ構造: `src/poc/`, `tests/`

### Phase 3: コア実装

**Step 3-1: bun:sqlite + FTS5 基本動作**
- bun:sqliteでSQLiteデータベース作成
- FTS5仮想テーブル作成（unicode61トークナイザー）
- 英語テキストでFTS5の基本的なINSERT/MATCH動作確認

**Step 3-2: kuromoji.js統合**
- kuromoji.jsインストール・辞書ロード
- 辞書ロード時間の計測（cold start）
- 日本語テキスト → 分かち書き変換の動作確認
- Budouxも代替として試し、ロード時間・精度を比較

**Step 3-3: 日本語FTS5検索の統合**
- 分かち書きテキストをFTS5に登録
- 検索クエリも分かち書きしてからMATCH
- 検索精度の確認（部分一致、複合語など）

**Step 3-4: パフォーマンス計測**
- メモリ消費量の計測（`process.memoryUsage()`）
- 100件、1000件のノート登録時の検索速度
- kuromoji辞書キャッシュ戦略の検討

### Phase 4: テスト
- FTS5基本動作のテスト
- 日本語分かち書きのテスト
- 日本語検索の統合テスト
- パフォーマンスベンチマーク

### Phase 5: 判断
- POC結果をdocs/poc-result.mdにまとめる
- Go / No-Go / 設計変更の判断

### POC検証方法

```bash
bun run src/poc/fts5-test.ts      # FTS5基本動作
bun run src/poc/tokenizer.ts      # トークナイザー比較
bun run src/poc/search.ts         # 日本語検索統合
bun run src/poc/benchmark.ts      # パフォーマンス計測
bun test                          # テスト実行
```

---

## 本格開発ロードマップ（POC通過後）

### Phase 1: 自分で毎日使えるもの（3週間）

**Week 1 — コアCLI + セキュリティ基盤**
- ✅ `kura init` — Vault初期化
- ✅ `kura create / edit / show / list` — ノートCRUD
- ✅ YAML frontmatter パーサー
- ✅ SQLite FTS5 インデックス構築 + kuromoji.js統合
- ✅ `kura search` — 全文検索（日本語対応）+ 時間減衰ランキング
- `--format json` + サニタイズパイプライン ← **次のタスク**
- confidentialフィルタ ← **次のタスク**

**Week 2 — ブラウザUI**
- `kura serve` — Honoベースlocalhostサーバー
- ダッシュボード、ノート閲覧/編集、検索UI

**Week 3 — デイリーノート + セキュリティ + 仕上げ**
- `kura daily` — デイリーノート自動生成
- `kura index` / `kura audit` — セキュリティスキャン
- ファイル変更検知、エラーハンドリング

### Phase 2: エージェント対応（1-2週間） ← 完了

- JSON出力スキーマの安定化（spec.mdとの整合）
- HTTP API（`/api/search`, `/api/notes`, `/api/audit`）
- セキュリティ検証テスト（ポイズニング、confidential、インジェクション検知）

### Phase 3: 公開準備（1-2ヶ月） ← 完了
### Phase 4: マネタイズ検討

※ 各フェーズの詳細は `docs/archive/initial-plan.md` を参照
