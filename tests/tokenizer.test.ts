/**
 * 日本語分かち書きテスト
 *
 * kuromoji.jsのトークナイズが検索に適した粒度で動作することを検証する。
 */

import { describe, test, expect, beforeAll } from "bun:test";
import kuromoji from "kuromoji";
import { getTokenizer, tokenize } from "./setup";

describe("kuromoji.js 分かち書き", () => {
  let tok: kuromoji.Tokenizer<kuromoji.IpadicFeatures>;

  beforeAll(async () => {
    tok = await getTokenizer();
  });

  test("辞書がロードできる", () => {
    expect(tok).toBeDefined();
    // tokenize()が関数として存在する
    expect(typeof tok.tokenize).toBe("function");
  });

  test("日本語テキストを形態素に分割できる", () => {
    const tokens = tok.tokenize("知識管理ツール");
    const surfaces = tokens.map((t) => t.surface_form);

    // 「知識」「管理」「ツール」に分割されることを期待
    expect(surfaces).toContain("知識");
    expect(surfaces).toContain("管理");
    expect(surfaces).toContain("ツール");
  });

  test("品詞情報が取得できる", () => {
    const tokens = tok.tokenize("知識管理ツールは軽量です");

    const noun = tokens.find((t) => t.surface_form === "知識");
    expect(noun?.pos).toBe("名詞");

    const particle = tokens.find((t) => t.surface_form === "は");
    expect(particle?.pos).toBe("助詞");
  });

  test("tokenize()が助詞・助動詞を除外する", () => {
    const result = tokenize(tok, "知識管理ツールは情報を効率的に整理する");
    const words = result.split(" ");

    // 名詞・動詞が含まれる
    expect(words).toContain("知識");
    expect(words).toContain("管理");
    expect(words).toContain("整理");

    // 助詞「は」「を」「に」が含まれない
    expect(words).not.toContain("は");
    expect(words).not.toContain("を");
    expect(words).not.toContain("に");
  });

  test("英語テキストもトークナイズできる", () => {
    const result = tokenize(tok, "Bunは高速なJavaScriptランタイム");
    const words = result.split(" ");

    expect(words).toContain("Bun");
    expect(words).toContain("高速");
    expect(words).toContain("JavaScript");
  });

  test("空文字列はエラーにならない", () => {
    const result = tokenize(tok, "");
    expect(result).toBe("");
  });

  test("記号のみのテキストは空になる", () => {
    const result = tokenize(tok, "。、！？");
    // 記号は除外されるので空になる
    expect(result.trim()).toBe("");
  });
});
