import pc from "picocolors";

interface ColoredBracket {
  bracket: string;
  color: string;
}

export function parseExpectedBrackets(content: string): ColoredBracket[] {
  const brackets: ColoredBracket[] = [];
  const lines = content.split("\n");
  const implicitIndexRegex = /[RYPB]/g;
  const explicitIndexRegex = /\d+=[RYPB]/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("@colors")) {
      const prev = lines[i - 1];
      const [implicitIndexPart, explicitIndexPart] = line.split("@colors");
      for (const match of explicitIndexPart.matchAll(explicitIndexRegex)) {
        const [indexStr, color] = match[0].split("=");
        brackets.push({ bracket: prev[parseInt(indexStr)], color });
      }
      for (const match of implicitIndexPart.matchAll(implicitIndexRegex)) {
        const index = match.index;
        const color = match[0];
        brackets.push({ bracket: prev[index], color });
      }
    }
  }
  return brackets;
}

export function parseActualBrackets(html: string): ColoredBracket[] {
  const spanRegex =
    /<span style="color:([RYPB])">\s*(&#x[0-9A-F]+;|.)\s*<\/span>/g;
  const brackets = Array.from(html.matchAll(spanRegex)).map<ColoredBracket>(
    (match) => {
      const color = match[1];
      let bracket = match[2];
      if (bracket.startsWith("&#x"))
        bracket = String.fromCharCode(
          parseInt(bracket.substring(3, bracket.length - 1), 16)
        );
      return { color, bracket };
    }
  );
  return brackets;
}

export function prettifyBrackets(
  brackets: ColoredBracket[],
  { noAnsi = false } = {}
): string {
  if (!brackets.length) return noAnsi ? "none" : pc.gray("none");
  return brackets
    .map((b) => getColoredBracketTerminalOutput(b, { noAnsi }))
    .join(" ");
}

function getColoredBracketTerminalOutput(
  { bracket, color }: ColoredBracket,
  { noAnsi = false } = {}
): string {
  const isCloser = "]})>".includes(bracket);
  if (noAnsi) return isCloser ? `${bracket}${color}` : `${color}${bracket}`;
  if (color === "R") {
    return pc.red(bracket);
  } else if (color === "Y") {
    return pc.yellow(bracket);
  } else if (color === "P") {
    return pc.magenta(bracket);
  } else if (color === "B") {
    return pc.blue(bracket);
  } else {
    return `${color}${bracket}`;
  }
}
