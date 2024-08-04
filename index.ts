import * as shiki from "shiki";

type Theme = "dark" | "light" | "hc-dark" | "hc-light" | "solarized-dark";
export const colorizedBracketThemes: Record<Theme, string[]> = {
  dark: ["#FFD700", "#DA70D6", "#179FFF", "rgba(255, 18, 18, 0.8)"],
  light: ["#0431FA", "#319331", "#7B3814", "rgba(255, 18, 18, 0.8)"],
  "hc-dark": ["#FFD700", "#DA70D6", "#87CEFA", "rgba(255, 50, 50, 1)"],
  // unexpected color for vscode hcLight is actually an empty string
  // using the light theme value
  "hc-light": ["#0431FA", "#319331", "#7B3814", "rgba(255, 18, 18, 0.8)"],
  // vscode solarized dark does not define an unexpected color
  // using the dark theme value
  "solarized-dark": ["#CDCDCD", "#B58900", "#d33682", "rgba(255, 18, 18, 0.8)"],
};

export interface ColorizedBracketsConfig {
  colors: string[] | Record<string, string[]>;
  defaultColor?: string | false;
  cssVariablePrefix?: string;
  bracketPairs: BracketPair[];
  langs: Record<string, Partial<Omit<ColorizedBracketsConfig, "langs">>>;
}

export interface BracketPair {
  opener: string;
  closer: string;
  scopesAllowList?: string[];
  scopesDenyList?: string[];
}

export class ShikiColorizedBracketsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShikiColorizedBracketsError";
  }
}

export default function shikiColorizedBrackets({
  colors = colorizedBracketThemes.dark,
  defaultColor,
  cssVariablePrefix,
  bracketPairs = [
    { opener: "[", closer: "]" },
    { opener: "{", closer: "}" },
    { opener: "(", closer: ")" },
    {
      opener: "<",
      closer: ">",
      scopesAllowList: [
        "punctuation.definition.typeparameters.begin.ts",
        "punctuation.definition.typeparameters.end.ts",
      ],
    },
  ],
  langs = {
    html: { bracketPairs: [] },
  },
}: Partial<ColorizedBracketsConfig> = {}): shiki.ShikiTransformer {
  const config: ColorizedBracketsConfig = {
    colors,
    defaultColor,
    cssVariablePrefix,
    bracketPairs,
    langs,
  };
  const transformer: shiki.ShikiTransformer = {
    name: "colorizedBrackets",
    preprocess(code, options) {
      // includeExplanation is a valid option for codeToTokens
      // but is missing from the type definition here
      (options as shiki.CodeToTokensOptions).includeExplanation = true;
      // options.mergeWhitespaces = false;
    },
    tokens: function transformTokens(tokens) {
      const lang = this.options.lang;

      for (let lineIndex = 0; lineIndex < tokens.length; lineIndex++) {
        const line = tokens[lineIndex];
        const newLine = line.flatMap((token) =>
          splitBracketTokens(token, config, lang)
        );
        tokens[lineIndex] = newLine;
      }

      colorizeBracketTokens(tokens.flat(), config, lang);
    },
  };
  return transformer;
}

function splitBracketTokens(
  rawToken: shiki.ThemedToken,
  config: ColorizedBracketsConfig,
  lang: string
): shiki.ThemedToken[] {
  const embeddedLang = getEmbeddedLang(rawToken);
  const resolvedConfig = resolveConfig(config, embeddedLang ?? lang);

  if (
    resolvedConfig.bracketPairs.length === 0 ||
    resolvedConfig.colors.length === 0 ||
    shouldIgnoreToken(rawToken)
  ) {
    return [rawToken];
  }

  const bracketsRegExp = new RegExp(
    resolvedConfig.bracketPairs
      .flatMap((pair) => [pair.opener, pair.closer])
      .map(escapeRegExp)
      .join("|")
  );

  let tokens = [rawToken];
  while (true) {
    const token = tokens.pop();
    if (!token) break; // shouldn't be possible, but it makes TS happy

    const match = token?.content.match(bracketsRegExp);
    if (!match) {
      tokens.push(token);
      break;
    }

    // index is always set since we're not using /g regexp flag, but typescript can't infer that
    const matchIndex = match.index ?? 0;

    if (matchIndex > 0) {
      tokens.push({
        ...token,
        content: token.content.substring(0, matchIndex),
      });
    }
    tokens.push({
      ...token,
      content: match[0],
      offset: token.offset + matchIndex,
    });
    if (matchIndex + match[0].length < token.content.length) {
      tokens.push({
        ...token,
        content: token.content.substring(matchIndex + match[0].length),
        offset: token.offset + matchIndex + match[0].length,
      });
    } else {
      break;
    }
  }

  const explanations = rawToken.explanation ?? [];
  let currentExplanationStart = 0;
  const explanationsWithStartEnd = (explanations ?? []).map(
    (explanation, i) => {
      const start = currentExplanationStart;
      let length = explanation.content.length;

      // with shiki option mergeWhitespaces (default true), the leading/trailing whitespaces of the token and explanations do not necessarily match
      if (explanations.length === 1) {
        length = rawToken.content.length;
      } else if (i === 0) {
        length =
          (rawToken.content.match(/^\s*/)?.[0].length ?? 0) +
          explanation.content.trimStart().length;
      } else if (i === explanations.length - 1) {
        length =
          explanation.content.trimEnd().length +
          (rawToken.content.match(/\s*$/)?.[0].length ?? 0);
      }
      currentExplanationStart += length;
      return {
        ...explanation,
        start,
        end: start + length - 1,
      };
    }
  );
  for (const token of tokens) {
    const tokenStart = token.offset - rawToken.offset;
    const tokenEnd = tokenStart + token.content.length - 1;
    const overlappingExplanations = explanationsWithStartEnd.filter(
      (explanation) =>
        // token start in explanation range
        (tokenStart >= explanation.start && tokenStart <= explanation.end) ||
        // token end in explanation range
        (tokenEnd >= explanation.end && tokenEnd <= explanation.end) ||
        // explanation start in token range
        (explanation.start >= tokenStart && explanation.start <= tokenEnd) ||
        // explanation end in token range
        (explanation.end >= tokenStart && explanation.end <= tokenEnd)
    );
    token.explanation = overlappingExplanations.map(
      (exp, i) => explanations[i]
    );
  }
  return tokens;
}

function colorizeBracketTokens(
  tokens: shiki.ThemedToken[],
  config: ColorizedBracketsConfig,
  lang: string
) {
  const openerStack: shiki.ThemedToken[] = [];

  for (const token of tokens) {
    const embeddedLang = getEmbeddedLang(token);
    const resolvedConfig = resolveConfig(config, embeddedLang ?? lang);
    const openers = new Set(
      resolvedConfig.bracketPairs.map((pair) => pair.opener)
    );
    const closers = new Set(
      resolvedConfig.bracketPairs.map((pair) => pair.closer)
    );
    const closerToOpener = Object.fromEntries(
      resolvedConfig.bracketPairs.map((pair) => [pair.closer, pair.opener])
    );

    const pairDefinition = resolvedConfig.bracketPairs.find(
      (pair) =>
        pair.opener === token.content.trim() ||
        pair.closer === token.content.trim()
    );
    if (
      !pairDefinition ||
      shouldIgnoreToken(
        token,
        pairDefinition.scopesAllowList,
        pairDefinition.scopesDenyList
      )
    ) {
      continue;
    }
    if (openers.has(token.content.trim())) {
      openerStack.push(token);
    } else if (closers.has(token.content.trim())) {
      const opener = openerStack
        .slice()
        .reverse()
        .find((t) => t.content.trim() === closerToOpener[token.content.trim()]);
      if (opener) {
        while (openerStack.at(-1) !== opener) {
          const unexpected = openerStack.pop();
          if (unexpected) {
            unexpected.htmlStyle = getStyle(resolvedConfig, -1);
          }
        }
        openerStack.pop();
        const style = getStyle(resolvedConfig, openerStack.length);
        token.htmlStyle = style;
        opener.htmlStyle = style;
      } else {
        token.htmlStyle = getStyle(resolvedConfig, -1);
      }
    }
  }

  for (const token of openerStack) {
    token.htmlStyle = getStyle(resolveConfig(config, lang), -1);
  }
}

function shouldIgnoreToken(
  token: shiki.ThemedToken,
  scopesAllowList?: string[],
  scopesDenyList?: string[]
) {
  if (!token.explanation) return true;

  const commentLastIndex =
    token.explanation?.[0].scopes.findLastIndex((scope) =>
      scope.scopeName.startsWith("comment.")
    ) ?? -1;
  const stringLastIndex =
    token.explanation?.[0].scopes.findLastIndex((scope) =>
      scope.scopeName.startsWith("string.")
    ) ?? -1;
  const embeddedLastIndex =
    token.explanation?.[0].scopes.findLastIndex((scope) =>
      scope.scopeName.startsWith("meta.embedded.")
    ) ?? -1;
  // skip all comments and strings (but not if a deeper scope match is meta.embedded eg template expressions)
  if (
    commentLastIndex > embeddedLastIndex ||
    stringLastIndex > embeddedLastIndex
  ) {
    return true;
  }

  if (
    scopesAllowList &&
    scopesAllowList.length &&
    !token.explanation?.some((explanation) =>
      explanation.scopes.some((scope) =>
        scopesAllowList.some(
          (allowed) =>
            scope.scopeName === allowed ||
            scope.scopeName.startsWith(`${allowed}.`)
        )
      )
    )
  ) {
    return true;
  }

  if (
    scopesDenyList &&
    scopesDenyList.length &&
    token.explanation?.some((explanation) =>
      explanation.scopes.some((scope) =>
        scopesDenyList.some(
          (denied) =>
            scope.scopeName === denied ||
            scope.scopeName.startsWith(`${denied}.`)
        )
      )
    )
  ) {
    return true;
  }

  return false;
}

function getStyle(
  config: Omit<ColorizedBracketsConfig, "langs">,
  level: number
) {
  const {
    colors,
    defaultColor = "light",
    cssVariablePrefix = "--shiki-",
  } = config;
  const styles: string[] = [];
  if (Array.isArray(colors)) {
    styles.push(`color:${getColor(colors, level)}`);
  } else {
    if (!Object.keys(colors).length)
      throw new ShikiColorizedBracketsError(
        "`colors` option must not be empty"
      );
    if (defaultColor) {
      if (!colors[defaultColor])
        throw new ShikiColorizedBracketsError(
          `\`colors\` option must contain the defaultColor key \`${defaultColor}\``
        );
      styles.push(`color:${getColor(colors[defaultColor], level)}`);
    }
    for (const [theme, themeColors] of Object.entries(colors)) {
      if (theme !== defaultColor) {
        styles.push(
          `${cssVariablePrefix}${theme}:${getColor(themeColors, level)}`
        );
      }
    }
  }
  return styles.join(";");
}

function getColor(colors: string[], level: number) {
  const isUnexpected = level === -1;
  if (isUnexpected) {
    return colors[colors.length - 1];
  } else {
    return colors[level % (colors.length - 1)];
  }
}

function getEmbeddedLang(token: shiki.ThemedToken): string | undefined {
  return token.explanation?.[0].scopes
    .findLast((scope) => scope.scopeName.match(/^source.\w+$/))
    ?.scopeName.split(".")[1];
}

function resolveConfig(
  config: ColorizedBracketsConfig,
  lang: string
): Omit<ColorizedBracketsConfig, "langs"> {
  return {
    colors: config.langs[lang]?.colors ?? config.colors,
    defaultColor: config.langs[lang]?.defaultColor ?? config.defaultColor,
    cssVariablePrefix:
      config.langs[lang]?.cssVariablePrefix ?? config.cssVariablePrefix,
    bracketPairs: config.langs[lang]?.bracketPairs ?? config.bracketPairs,
  };
}

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions#escaping
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

// // this is currently unused, but should be investigated more
// // as is, it does not correctly work with unexpected brackets, since those can end up grouped into a single explanation
// // for this to work, it would need to find and split brackets within an explanation
// function splitBracketTokensUsingExplanations(
//   rawToken: shiki.ThemedToken,
//   allBrackets: Set<string>
// ): shiki.ThemedToken[] {
//   const explanations = rawToken.explanation;
//   if (!explanations)
//     throw new ShikiColorizedBracketsError(
//       "Token is missing explanation. Is includeExplanation disabled?"
//     );
//   const bracketExplanations = explanations.filter((exp) =>
//     allBrackets.has(exp.content.trim())
//   );
//   const bracketExplanationIndexes = bracketExplanations.map((exp) =>
//     explanations.indexOf(exp)
//   );

//   if (!bracketExplanations.length) return [rawToken];

//   const splitTokens: shiki.ThemedToken[] = [];
//   for (let i = 0; i < bracketExplanations.length; i++) {
//     const bracketExplanation = bracketExplanations[i];
//     const bracketExplanationIndex = bracketExplanationIndexes[i];

//     // push any parts of the token between this bracket and the previous one
//     if (bracketExplanationIndex !== 0) {
//       const prevBracketExplanationIndex =
//         i === 0 ? -1 : bracketExplanationIndexes[i - 1];
//       const nonBracketExplanations = explanations.slice(
//         prevBracketExplanationIndex + 1,
//         bracketExplanationIndex
//       );
//       if (nonBracketExplanations.length > 0) {
//         splitTokens.push({
//           ...rawToken,
//           content: nonBracketExplanations.reduce(
//             (acc, cur) => acc + cur.content,
//             ""
//           ),
//           explanation: nonBracketExplanations,
//         });
//       }
//     }

//     splitTokens.push({
//       ...rawToken,
//       content: bracketExplanation.content,
//       explanation: [bracketExplanation],
//     });

//     // after last bracket, the rest of the token
//     if (i === bracketExplanations.length - 1) {
//       const nonBracketExplanations = explanations.slice(
//         bracketExplanationIndex + 1
//       );
//       if (nonBracketExplanations.length > 0) {
//         splitTokens.push({
//           ...rawToken,
//           content: nonBracketExplanations.reduce(
//             (acc, cur) => acc + cur.content,
//             ""
//           ),
//           explanation: nonBracketExplanations,
//         });
//       }
//     }
//   }

//   const leadingWhitespace = rawToken.content.match(/^\s*/)?.[0] ?? "";
//   const trailingWhitespace =
//     leadingWhitespace === rawToken.content
//       ? ""
//       : rawToken.content.match(/\s*$/)?.[0] ?? "";
//   splitTokens[0].content =
//     leadingWhitespace + splitTokens[0].content.trimStart();
//   splitTokens[splitTokens.length - 1].content =
//     splitTokens[splitTokens.length - 1].content.trimEnd() + trailingWhitespace;

//   let offset = rawToken.offset;
//   for (const token of splitTokens) {
//     token.offset = offset;
//     offset += token.content.length;
//   }

//   const splitTokensLength = splitTokens.reduce(
//     (acc, cur) => acc + cur.content.length,
//     0
//   );
//   if (rawToken.content.length !== splitTokensLength) {
//     throw new Error(
//       `split token length ${splitTokensLength} !== raw token length ${rawToken.content.length}`
//     );
//   }

//   return splitTokens;
// }
