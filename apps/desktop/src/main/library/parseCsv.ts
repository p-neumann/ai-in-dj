// Adopted unchanged from Ranjish Kumar's ranjish/ccdj-desktop branch.
//
// A real, RFC-4180-compliant CSV parser (CLAUDE.md Section 6.1 / R24).
// Handles what a naive split(",") parser can't: commas inside quoted
// fields, literal quotes escaped as "", and newlines inside a quoted
// field - a song title genuinely can contain any of these. Also strips a
// leading UTF-8 byte-order mark and accepts both \r\n and \n line endings.
//
// Returns rows as plain string arrays (not yet matched to headers or
// normalized into a Track) - that split keeps this file testable on its
// own, with no knowledge of what a "track" is.

export function parseCsv(text: string): string[][] {
  // Strip a UTF-8 BOM if present - Excel/Serato exports commonly have one.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = (): void => {
    row.push(field);
    field = "";
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      endField();
      i++;
      continue;
    }
    if (c === "\r" || c === "\n") {
      endRow();
      i++;
      // Collapse any immediately-following run of line-break characters
      // into this SAME row boundary, rather than ending a new (empty) row
      // for each one. Found on a real export file whose every row ends in
      // "\r\r\n" (a doubled CR, not a blank row) - treating each \r/\n as
      // its own boundary was turning one real row ending into one real
      // row plus one spurious empty "row" immediately after it.
      while (i < text.length && (text[i] === "\r" || text[i] === "\n")) i++;
      continue;
    }
    field += c;
    i++;
  }

  // Trailing field/row with no final newline.
  if (field.length > 0 || row.length > 0) endRow();

  // Drop a single wholly-empty trailing row (a trailing newline at EOF).
  if (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") {
    rows.pop();
  }

  return rows;
}

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

// Matches raw rows to the header row and lowercases header names (CLAUDE.md
// 6.1: "lowercase headers (playCount -> playcount)").
export function parseCsvWithHeaders(text: string): ParsedCsv {
  const rawRows = parseCsv(text);
  if (rawRows.length === 0) return { headers: [], rows: [] };

  const headers = rawRows[0].map((h) => h.trim().toLowerCase());
  const rows: Record<string, string>[] = [];

  for (let r = 1; r < rawRows.length; r++) {
    const cols = rawRows[r];
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] !== undefined ? cols[idx] : "";
    });
    rows.push(obj);
  }

  return { headers, rows };
}
