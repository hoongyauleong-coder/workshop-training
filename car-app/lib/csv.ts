/**
 * Bulk import: rows pasted from Excel (tab-separated) or a CSV, header row required.
 * Recognises English and BM headers, and the walkthrough skill's CSV columns.
 */
import type { NewCar } from './types';

export function parseDelimited(text: string): string[][] {
  const delim = text.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

type Field = keyof NewCar;

// Order matters: more specific headers first.
const ALIASES: [Field, string[]][] = [
  ['hod_email', ['hod email', 'manager email', 'emel pengurus', 'email pengurus', 'emel hod']],
  ['owner_email', ['owner email', 'email', 'emel', 'e-mail', 'pic email', 'emel pic']],
  ['hod_name', ['hod name', 'hod', 'manager', 'pengurus', 'ketua jabatan', 'nama pengurus']],
  ['owner_name', ['owner name', 'owner', 'pic', 'name', 'nama', 'person in charge']],
  ['car_no', ['car no', 'car no.', 'car', 'no. car']],
  ['area', ['area/dept', 'area', 'department', 'dept', 'jabatan', 'kawasan', 'section']],
  ['finding', ['finding', 'description', 'penemuan', 'isu', 'issue', 'huraian']],
  ['requirement_ref', ['requirement/ref', 'reference', 'rujukan', 'ref', 'requirement']],
  ['severity', ['severity', 'tahap']]
];

export function mapHeaders(headers: string[]): Partial<Record<Field, number>> {
  const norm = headers.map(h => h.trim().toLowerCase().replace(/\s+/g, ' '));
  const map: Partial<Record<Field, number>> = {};
  const used = new Set<number>();
  for (const [field, aliases] of ALIASES) {
    for (const alias of aliases) {
      const i = norm.indexOf(alias);
      if (i >= 0 && !used.has(i)) { map[field] = i; used.add(i); break; }
    }
  }
  return map;
}

export function parseImport(text: string): { rows: NewCar[]; errors: string[] } {
  const table = parseDelimited(text.trim());
  if (table.length < 2) return { rows: [], errors: ['Paste a header row and at least one data row.'] };
  const map = mapHeaders(table[0]);
  if (map.finding === undefined) return { rows: [], errors: ['No "Finding" or "Description" column found in the header row.'] };
  const get = (r: string[], f: Field) => (map[f] !== undefined ? (r[map[f]!] ?? '').trim() : '');
  const rows: NewCar[] = [];
  const errors: string[] = [];
  table.slice(1).forEach((r, i) => {
    const finding = get(r, 'finding');
    if (!finding) { errors.push(`Row ${i + 2}: no finding – skipped`); return; }
    const email = get(r, 'owner_email');
    if (email && !/@/.test(email)) errors.push(`Row ${i + 2}: owner email "${email}" looks wrong`);
    rows.push({
      car_no: get(r, 'car_no') || null,
      area: get(r, 'area'),
      finding,
      requirement_ref: get(r, 'requirement_ref'),
      severity: get(r, 'severity'),
      owner_name: get(r, 'owner_name'),
      owner_email: email,
      hod_name: get(r, 'hod_name'),
      hod_email: get(r, 'hod_email')
    });
  });
  return { rows, errors };
}
