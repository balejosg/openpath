export type CsvCell = string | number | boolean | null | undefined;
export type CsvRow = CsvCell[];

export function escapeCsvCell(cell: CsvCell): string {
  const value = cell === null || cell === undefined ? '' : String(cell);
  return `"${value.replace(/"/g, '""')}"`;
}

export function toCsv(rows: CsvRow[]): string {
  return rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')).join('\n');
}
