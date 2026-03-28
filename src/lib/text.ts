const MOJIBAKE_PATTERN = new RegExp(
  [
    '\u00c3.',
    '\u00c2.',
    '\u00e2\u20ac',
    '\u00e2\u20ac\u2026',
    '\u00e2\u20ac\u201c',
    '\u00e2\u20ac\u201d',
    '\u00e2\u20ac\u0153',
    '\u00e2\u20ac\u017e',
    '\u00e2\u20ac\u0161',
    '\u00f0\u0178',
    '\u00c3\u0192',
    '\u00c3\u00bc',
    '\u00c3\u00b6',
    '\u00c3\u00a4',
    '\u00c3\u0178',
  ].join('|'),
);

function looksBroken(value: string): boolean {
  return MOJIBAKE_PATTERN.test(value);
}

function decodeLatin1AsUtf8(value: string): string {
  const bytes = Uint8Array.from([...value].map((char) => char.charCodeAt(0) & 0xff));
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

export function repairMojibake(value: string): string {
  let current = value;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!looksBroken(current)) {
      break;
    }

    const repaired = decodeLatin1AsUtf8(current);
    if (!repaired || repaired === current) {
      break;
    }

    current = repaired;
  }

  return current;
}

export function deepRepairText<T>(input: T): T {
  if (typeof input === 'string') {
    return repairMojibake(input) as T;
  }

  if (Array.isArray(input)) {
    return input.map((entry) => deepRepairText(entry)) as T;
  }

  if (input && typeof input === 'object') {
    const repairedEntries = Object.entries(input as Record<string, unknown>).map(([key, value]) => [key, deepRepairText(value)]);
    return Object.fromEntries(repairedEntries) as T;
  }

  return input;
}
