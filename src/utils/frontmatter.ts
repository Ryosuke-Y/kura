/**
 * YAML frontmatter パーサー
 *
 * Markdownファイルの先頭にある `---` で囲まれたYAMLブロックを
 * パースしてオブジェクトに変換する。
 *
 * 例:
 * ---
 * title: メモ
 * tags: [project]
 * ---
 * 本文がここに続く
 */

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { Frontmatter } from "../models/note.ts";

/** frontmatter区切り文字の正規表現 */
const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Markdownテキストからfrontmatterと本文を分離する */
export function parseFrontmatter(raw: string): {
  frontmatter: Frontmatter;
  content: string;
} {
  const match = raw.match(FRONTMATTER_REGEX);

  if (!match) {
    // frontmatterがない場合はデフォルト値で返す
    return {
      frontmatter: {
        title: "",
        tags: [],
        created: "",
        updated: "",
        confidential: false,
        security_flag: "clean",
      },
      content: raw,
    };
  }

  const yamlStr = match[1]!;
  const content = raw.slice(match[0].length);

  // YAMLをパースし、不足フィールドにデフォルト値を補完
  const parsed = parseYaml(yamlStr) as Record<string, unknown>;

  const frontmatter: Frontmatter = {
    title: typeof parsed.title === "string" ? parsed.title : "",
    tags: Array.isArray(parsed.tags)
      ? parsed.tags.filter((t): t is string => typeof t === "string")
      : [],
    created: typeof parsed.created === "string" ? parsed.created : "",
    updated: typeof parsed.updated === "string" ? parsed.updated : "",
    confidential: parsed.confidential === true,
    security_flag:
      parsed.security_flag === "suspicious" ? "suspicious" : "clean",
  };

  return { frontmatter, content };
}

/** frontmatterとMarkdown本文からファイル全体のテキストを生成する */
export function serializeFrontmatter(
  frontmatter: Frontmatter,
  content: string
): string {
  // yamlライブラリのstringifyはデフォルトでブロックスタイル
  // tagsは配列なのでフロースタイル（[a, b]形式）にしたい
  const yamlObj: Record<string, unknown> = {
    title: frontmatter.title,
    tags: frontmatter.tags,
    created: frontmatter.created,
    updated: frontmatter.updated,
    confidential: frontmatter.confidential,
    security_flag: frontmatter.security_flag,
  };

  const yamlStr = stringifyYaml(yamlObj, {
    // tagsをフロースタイル [a, b] で出力するための設定
    flowCollectionPadding: false,
  });

  return `---\n${yamlStr}---\n${content}`;
}
