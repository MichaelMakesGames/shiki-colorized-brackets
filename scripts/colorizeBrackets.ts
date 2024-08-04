import { argv, file, write } from "bun";
import { createHighlighter, type BundledLanguage } from "shiki";
import { parseArgs } from "util";
import shikiColorizedBrackets from "..";

async function main() {
  const { values } = parseArgs({
    args: argv,
    options: {
      input: { type: "string" },
      output: { type: "string" },
    },
    allowPositionals: true,
  });
  const { input, output } = values;
  if (!input || !output) throw new Error("Expected --input and --output");
  const lang = input?.split(".").at(-1) ?? "text";
  const highlighter = await createHighlighter({
    langs: [lang],
    themes: ["dark-plus"],
  });
  const html = highlighter.codeToHtml(await file(input).text(), {
    lang: lang as BundledLanguage,
    theme: "dark-plus",
    transformers: [shikiColorizedBrackets()],
  });
  write(output, html);
}

main();
