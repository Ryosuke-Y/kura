/**
 * frontmatterパーサーのテスト
 */

import { describe, test, expect } from "bun:test";
import {
  parseFrontmatter,
  serializeFrontmatter,
} from "../src/utils/frontmatter.ts";
import type { Frontmatter } from "../src/models/note.ts";

describe("parseFrontmatter", () => {
  test("frontmatter付きMarkdownをパースできる", () => {
    const raw = `---
title: テストノート
tags: [project, memo]
created: "2026-03-18T10:00:00Z"
updated: "2026-03-18T10:00:00Z"
confidential: false
security_flag: clean
---
本文がここに入る。
`;

    const { frontmatter, content } = parseFrontmatter(raw);

    expect(frontmatter.title).toBe("テストノート");
    expect(frontmatter.tags).toEqual(["project", "memo"]);
    expect(frontmatter.created).toBe("2026-03-18T10:00:00Z");
    expect(frontmatter.confidential).toBe(false);
    expect(frontmatter.security_flag).toBe("clean");
    expect(content).toBe("本文がここに入る。\n");
  });

  test("frontmatterがないMarkdownはデフォルト値を返す", () => {
    const raw = "# タイトル\n本文です。";

    const { frontmatter, content } = parseFrontmatter(raw);

    expect(frontmatter.title).toBe("");
    expect(frontmatter.tags).toEqual([]);
    expect(content).toBe(raw);
  });

  test("不足フィールドにはデフォルト値が入る", () => {
    const raw = `---
title: 最小ノート
---
本文`;

    const { frontmatter } = parseFrontmatter(raw);

    expect(frontmatter.title).toBe("最小ノート");
    expect(frontmatter.tags).toEqual([]);
    expect(frontmatter.confidential).toBe(false);
    expect(frontmatter.security_flag).toBe("clean");
  });

  test("confidential: true をパースできる", () => {
    const raw = `---
title: 機密ノート
confidential: true
security_flag: suspicious
---
秘密の内容`;

    const { frontmatter } = parseFrontmatter(raw);

    expect(frontmatter.confidential).toBe(true);
    expect(frontmatter.security_flag).toBe("suspicious");
  });

  test("空文字列はデフォルト値を返す", () => {
    const { frontmatter, content } = parseFrontmatter("");

    expect(frontmatter.title).toBe("");
    expect(content).toBe("");
  });
});

describe("serializeFrontmatter", () => {
  test("frontmatterとコンテンツからMarkdownを生成できる", () => {
    const fm: Frontmatter = {
      title: "テスト",
      tags: ["a", "b"],
      created: "2026-03-18T10:00:00Z",
      updated: "2026-03-18T10:00:00Z",
      confidential: false,
      security_flag: "clean",
    };

    const result = serializeFrontmatter(fm, "本文\n");

    expect(result).toContain("---\n");
    expect(result).toContain("title: テスト");
    expect(result).toContain("本文\n");
  });

  test("parse → serialize のラウンドトリップでデータが保持される", () => {
    const fm: Frontmatter = {
      title: "ラウンドトリップ",
      tags: ["test"],
      created: "2026-03-18T10:00:00Z",
      updated: "2026-03-18T12:00:00Z",
      confidential: true,
      security_flag: "suspicious",
    };
    const content = "テスト本文\n";

    const serialized = serializeFrontmatter(fm, content);
    const { frontmatter, content: parsedContent } =
      parseFrontmatter(serialized);

    expect(frontmatter.title).toBe(fm.title);
    expect(frontmatter.tags).toEqual(["test"]);
    expect(frontmatter.confidential).toBe(true);
    expect(frontmatter.security_flag).toBe("suspicious");
    expect(parsedContent).toBe(content);
  });
});
