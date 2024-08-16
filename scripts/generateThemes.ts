import { argv, file, write } from "bun";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parseArgs } from "node:util";

async function main() {
  const { values } = parseArgs({
    args: argv,
    options: {
      shikiTextmateGrammarsThemesPath: { type: "string" },
    },
    allowPositionals: true,
  });

  if (!values.shikiTextmateGrammarsThemesPath)
    throw new Error("Argument shikiTextmateGrammarsThemesPath is required");

  // if a theme doesn't define bracket colors, it falls back to these
  // from vscode /src/vs/editor/common/core/editorColorRegistry.ts
  const vsCodeBaseThemes: Record<string, Record<string, string>> = {
    light: {
      "editorBracketHighlight.foreground1": "#0431FA",
      "editorBracketHighlight.foreground2": "#319331",
      "editorBracketHighlight.foreground3": "#7B3814",
      "editorBracketHighlight.unexpectedBracket.foreground":
        "rgba(255, 18, 18, 0.8)",
    },
    dark: {
      "editorBracketHighlight.foreground1": "#FFD700",
      "editorBracketHighlight.foreground2": "#DA70D6",
      "editorBracketHighlight.foreground3": "#179FFF",
      "editorBracketHighlight.unexpectedBracket.foreground":
        "rgba(255, 18, 18, 0.8)",
    },
    lightHighContrast: {
      "editorBracketHighlight.foreground1": "#0431FA",
      "editorBracketHighlight.foreground2": "#319331",
      "editorBracketHighlight.foreground3": "#7B3814",
      "editorBracketHighlight.unexpectedBracket.foreground": "#B5200D",
    },
    darkHighContrast: {
      "editorBracketHighlight.foreground1": "#FFD700",
      "editorBracketHighlight.foreground2": "#DA70D6",
      "editorBracketHighlight.foreground3": "#87CEFA",
      "editorBracketHighlight.unexpectedBracket.foreground":
        "rgba(255, 50, 50, 1)",
    },
  };

  const themes: Record<string, string[]> = {};
  const themesDir = path.join(
    values.shikiTextmateGrammarsThemesPath,
    "packages/tm-themes/themes"
  );
  for (const fileName of await fs.readdir(themesDir)) {
    const themeId = fileName.substring(0, fileName.length - 5);
    const theme = await file(path.join(themesDir, fileName)).json();
    const isHighContrast = themeId.includes("high-contrast");
    const themeType = theme.type ?? "dark";
    const baseTheme = isHighContrast ? `${themeType}HighContrast` : themeType;
    const colors: Record<string, string> = {
      ...vsCodeBaseThemes[baseTheme],
      ...theme.colors,
    };
    const bracketTheme = [
      colors["editorBracketHighlight.foreground1"],
      colors["editorBracketHighlight.foreground2"],
      colors["editorBracketHighlight.foreground3"],
      colors["editorBracketHighlight.foreground4"],
      colors["editorBracketHighlight.foreground5"],
      colors["editorBracketHighlight.foreground6"],
      colors["editorBracketHighlight.unexpectedBracket.foreground"],
    ].filter(Boolean);
    themes[themeId] = bracketTheme;
  }

  const sorted = Object.fromEntries(
    Object.entries(themes).sort((a, b) => a[0].localeCompare(b[0]))
  );

  write(
    "./themes.ts",
    `export default ${JSON.stringify(sorted)} as Record<string, string[]>`
  );
}

main();
