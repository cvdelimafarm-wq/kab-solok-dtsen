// lib/dbfParser.ts
//
// Wrapper tipis di atas paket 'dbffile' untuk membaca file DBF hasil
// export aplikasi desktop entri Susenas (walau ekstensinya .xls, isinya
// format dBase III). Dipanggil dari Route Handler (Node.js runtime),
// BUKAN dari Client Component — paket 'dbffile' pakai modul 'fs' Node.

import { DBFFile } from 'dbffile';

export type DbfRow = Record<string, string | number | null | undefined>;

export async function readDbf(filePath: string): Promise<DbfRow[]> {
  const dbf = await DBFFile.open(filePath, { encoding: 'latin1' });
  const rows = await dbf.readRecords();
  return rows as DbfRow[];
}
