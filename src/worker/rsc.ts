const PUSH_CHUNK = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;

export function decodeRscChunks(html: string): string {
  const chunks: string[] = [];
  for (const match of html.matchAll(PUSH_CHUNK)) {
    try {
      const decoded: unknown = JSON.parse(match[1]);
      if (typeof decoded === "string") chunks.push(decoded);
    } catch {
      // 单个分块损坏时跳过，其余分块仍可拼接
    }
  }
  return chunks.join("");
}

export function extractArray(text: string, key: string): unknown[] | null {
  const needle = `"${key}":[`;
  const keyIndex = text.indexOf(needle);
  if (keyIndex === -1) return null;

  const start = keyIndex + needle.length - 1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === "[") depth += 1;
    else if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, index + 1)) as unknown[];
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}
