import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import { readdirSync, lstatSync } from "node:fs";
import chalk from "chalk";
import { createHighlighter } from "shiki";
import shikiColorizedBrackets from "..";
import {
  parseActualBrackets,
  parseExpectedBrackets,
  prettifyBrackets,
} from "./utils";

describe("File-driven tests", async () => {
  let testCaseFiles: [string][] = readdirSync("./tests/samples", {
    recursive: true,
  })
    .filter(
      (fileName): fileName is string =>
        typeof fileName === "string" &&
        lstatSync(join("./tests/samples", fileName)).isFile()
    )
    .map<[string]>((fileName) => [fileName]);
  const langs = Array.from(
    new Set(testCaseFiles.map((fileName) => fileName[0].split("/")[0]))
  );
  const highlighter = await createHighlighter({
    langs: langs,
    themes: ["dark-plus"],
  });

  test.each(testCaseFiles)("%s", async (fileName) => {
    const path = join("./tests/samples", fileName);
    const lang = fileName.split("/").at(0) ?? "text";
    const content = await Bun.file(path).text();
    const expectedBrackets = parseExpectedBrackets(content);
    const html = highlighter.codeToHtml(content, {
      lang,
      theme: "dark-plus",
      transformers: [
        shikiColorizedBrackets({
          themes: { "dark-plus": ["Y", "P", "B", "R"] },
        }),
      ],
    });
    const actualBrackets = parseActualBrackets(html);
    console.log(chalk.bold(fileName));
    console.log("  Expected:", prettifyBrackets(expectedBrackets));
    console.log("  Actual:  ", prettifyBrackets(actualBrackets));
    expect(prettifyBrackets(actualBrackets, { noAnsi: true })).toEqual(
      prettifyBrackets(expectedBrackets, { noAnsi: true })
    );
  });
});

describe("Bracket customization", async () => {
  const lang = "ts";
  const theme = "dark-plus";
  const highlighter = await createHighlighter({
    langs: [lang],
    themes: [theme],
  });

  test("Denied scopes", () => {
    const code = "let values: number[] = [1, 2, 3];";

    expect(
      highlighter.codeToHtml(code, {
        lang,
        theme,
        transformers: [
          shikiColorizedBrackets({
            themes: { "dark-plus": ["Y", "P", "B", "R"] },
          }),
        ],
      })
    ).toContain('<span style="color:Y">[</span><span style="color:Y">]</span>');

    expect(
      highlighter.codeToHtml(code, {
        lang,
        theme,
        transformers: [
          shikiColorizedBrackets({
            themes: { "dark-plus": ["Y", "P", "B", "R"] },
            bracketPairs: [
              {
                opener: "[",
                closer: "]",
                scopesDenyList: ["meta.type.annotation"],
              },
              { opener: "{", closer: "}" },
              { opener: "(", closer: ")" },
            ],
          }),
        ],
      })
    ).toContain(
      '<span style="color:#D4D4D4">[</span><span style="color:#D4D4D4">]</span>'
    );
  });
});

describe("Dual themes", async () => {
  const lang = "ts";
  const highlighter = await createHighlighter({
    langs: [lang],
    themes: [
      "dark-plus",
      "light-plus",
      "red",
      "vesper",
      "material-theme-ocean",
    ],
  });

  test("Light and dark", () => {
    const htmlStr = highlighter.codeToHtml("{}", {
      lang,
      themes: { light: "light-plus", dark: "dark-plus" },
      transformers: [
        shikiColorizedBrackets({
          themes: {
            "light-plus": ["Y", "P", "B", "R"],
            "dark-plus": ["y", "p", "b", "r"],
          },
        }),
      ],
    });
    expect(htmlStr).toContain('<span style="color:Y;--shiki-dark:y">{</span>');
  });

  test("Custom prefix", () => {
    const htmlStr = highlighter.codeToHtml("{}", {
      lang,
      themes: { light: "light-plus", dark: "dark-plus" },
      cssVariablePrefix: "--custom-",
      transformers: [
        shikiColorizedBrackets({
          themes: {
            "light-plus": ["Y", "P", "B", "R"],
            "dark-plus": ["y", "p", "b", "r"],
          },
        }),
      ],
    });
    expect(htmlStr).toContain('<span style="color:Y;--custom-dark:y">{</span>');
  });

  test("Custom default", () => {
    const htmlStr = highlighter.codeToHtml("{}", {
      lang,
      themes: { dark: "dark-plus", light: "light-plus" },
      defaultColor: "dark",
      transformers: [
        shikiColorizedBrackets({
          themes: {
            "light-plus": ["Y", "P", "B", "R"],
            "dark-plus": ["y", "p", "b", "r"],
          },
        }),
      ],
    });
    expect(htmlStr).toContain('<span style="color:y;--shiki-light:Y">{</span>');
  });

  test("No default", () => {
    const htmlStr = highlighter.codeToHtml("{}", {
      lang,
      themes: { light: "light-plus", dark: "dark-plus" },
      defaultColor: false,
      transformers: [
        shikiColorizedBrackets({
          themes: {
            "light-plus": ["Y", "P", "B", "R"],
            "dark-plus": ["y", "p", "b", "r"],
          },
        }),
      ],
    });
    expect(htmlStr).toContain(
      '<span style="--shiki-light:Y;--shiki-dark:y">{</span>'
    );
  });

  test("Arbitrary theme names", () => {
    const htmlStr = highlighter.codeToHtml("{}", {
      lang,
      themes: {
        cool: "material-theme-ocean",
        warm: "red",
        grayscale: "vesper",
      },
      defaultColor: false,
      transformers: [
        shikiColorizedBrackets({
          themes: {
            "material-theme-ocean": ["blue", "red"],
            red: ["yellow", "red"],
            vesper: ["gray", "white"],
          },
        }),
      ],
    });
    expect(htmlStr).toContain(
      '<span style="--shiki-cool:blue;--shiki-warm:yellow;--shiki-grayscale:gray">{</span>'
    );
  });
});
