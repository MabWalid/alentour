const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  euml: "ë",
  agrave: "à",
  acirc: "â",
  auml: "ä",
  ccedil: "ç",
  ocire: "ô",
  ocirc: "ô",
  oelig: "œ",
  ugrave: "ù",
  ucirc: "û",
  iuml: "ï",
  icirc: "î",
  laquo: "«",
  raquo: "»",
  rsquo: "’",
  lsquo: "‘",
  ndash: "–",
  mdash: "—",
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (entity, token: string) => {
    if (token.startsWith("#")) {
      const code =
        token[1] === "x" || token[1] === "X"
          ? Number.parseInt(token.slice(2), 16)
          : Number.parseInt(token.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity
    }
    return NAMED[token] ?? entity
  })
}

export function decodeHtml(value: string): string {
  const text = decodeEntities(
    decodeEntities(value.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, " ")),
  )
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}
