const MOJIBAKE_MARKER_REGEX = /(Ã.|Â.|á»|áº|â€|Æ°|Ä‘|Äƒ|Æ¡|Æ¯)/;

function countMojibakeMarkers(value: string) {
  const matches = value.match(MOJIBAKE_MARKER_REGEX);
  return matches ? matches.length : 0;
}

function decodeLatin1AsUtf8(value: string) {
  const bytes = Uint8Array.from(Array.from(value).map((char) => char.charCodeAt(0) & 0xff));
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export function repairMojibakeText(value: string) {
  if (!value) return value;
  if (!MOJIBAKE_MARKER_REGEX.test(value)) return value;
  try {
    const decoded = decodeLatin1AsUtf8(value);
    if (!decoded) return value;
    const originalScore = countMojibakeMarkers(value);
    const decodedScore = countMojibakeMarkers(decoded);
    return decodedScore < originalScore ? decoded : value;
  } catch {
    return value;
  }
}

export function repairMojibakeDeep<T>(input: T): T {
  if (typeof input === "string") {
    return repairMojibakeText(input) as T;
  }
  if (Array.isArray(input)) {
    return input.map((item) => repairMojibakeDeep(item)) as T;
  }
  if (!input || typeof input !== "object") {
    return input;
  }
  const next: Record<string, unknown> = {};
  Object.entries(input as Record<string, unknown>).forEach(([key, value]) => {
    next[key] = repairMojibakeDeep(value);
  });
  return next as T;
}
