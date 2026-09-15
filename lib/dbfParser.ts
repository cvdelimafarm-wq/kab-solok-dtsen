// lib/dbfParser.ts
//
// Wrapper tipis di atas paket 'dbffile' untuk membaca file DBF hasil
// export aplikasi desktop entri Susenas (walau ekstensinya .xls, isinya
// format dBase III). Dipanggil dari Route Handler (Node.js runtime),
// BUKAN dari Client Component — paket 'dbffile' pakai modul 'fs' Node.

import { DBFFile } from 'dbffile';

export type DbfRow = Record<string, string | number | null | undefined>;

export async function readDbf(filePath: string): Promise<DbfRow[]> {
  // readMode:'loose' penting karena sebagian tabel (mis. tabel 3, kolom
  // NAMAKRTDSR) punya field memo yang butuh file .dbt pendamping — kalau
  // file .dbt itu tidak ada (beberapa export dari aplikasi desktop tidak
  // menyertakannya), mode 'strict' (default) akan gagal total dgn error
  // "Memo file not found". Mode 'loose' tetap membaca SEMUA kolom lain
  // dengan benar, cuma kolom memo yang jadi kosong — dan kolom itu memang
  // tidak dipakai di lib/anomalyChecks.ts manapun, jadi aman diabaikan.
  const dbf = await DBFFile.open(filePath, { encoding: 'latin1', readMode: 'loose' });
  const rows = await dbf.readRecords();
  return rows as DbfRow[];
}
