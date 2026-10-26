// lib/ringkasHariKerja.ts
//
// (26 Okt 2026, uji Android per peran A1) SATU cara menghitung hari kerja untuk semua layar.
// Sebelumnya Transport Lokal menampilkan "Hari kerja 31" (rencana seluruh periode), sedangkan Monitoring Korwil > Administrasi
// menghitung "lengkap dari wajib" (hanya hari yang sudah lewat, hari ini belum dihitung). Angkanya benar masing-masing tetapi tampak
// bertabrakan untuk akun yang sama. Kini keduanya memakai fungsi ini dan label yang sama:
//   direncanakan = semua tanggal hari kerja pada periode (sudah lewat + hari ini + akan datang)
//   sudahLewat   = hari kerja sebelum hari ini
//   lengkap      = hari kerja sudah lewat yang isiannya lengkap
//   terlewat     = sudahLewat - lengkap (belum lengkap dan tidak lagi bisa diisi biasa)
//   akanDatang   = hari kerja sesudah hari ini
//   hariIni      = "bukan" (hari ini bukan hari kerja) | "lengkap" | "berjalan" (hari kerja, belum lengkap)
// Hari ini tidak ikut dihitung sebagai lengkap/terlewat karena masih bisa diisi.

export type HariKerjaMasuk = { tanggal: string; lengkap: boolean };

export type RingkasHariKerja = {
  direncanakan: number;
  sudahLewat: number;
  lengkap: number;
  terlewat: number;
  akanDatang: number;
  hariIni: "bukan" | "lengkap" | "berjalan";
};

/** `hariKerja` = tanggal-tanggal hari kerja yang direncanakan (YYYY-MM-DD); `lengkap` = tanggal yang isiannya lengkap (boleh berisi tanggal bukan hari kerja, diabaikan). */
export function ringkasHariKerja(hariKerja: readonly string[], lengkap: readonly string[], hariIni: string): RingkasHariKerja {
  const rencana = Array.from(new Set(hariKerja));
  const penuh = new Set(lengkap);
  const lewat = rencana.filter((t) => t < hariIni);
  const lengkapLewat = lewat.filter((t) => penuh.has(t)).length;
  const hariIniKerja = rencana.includes(hariIni);
  return {
    direncanakan: rencana.length,
    sudahLewat: lewat.length,
    lengkap: lengkapLewat,
    terlewat: lewat.length - lengkapLewat,
    akanDatang: rencana.filter((t) => t > hariIni).length,
    hariIni: !hariIniKerja ? "bukan" : penuh.has(hariIni) ? "lengkap" : "berjalan",
  };
}

/** Satu kalimat yang sama untuk Transport Lokal dan Monitoring Korwil. */
export function kalimatHariKerja(r: RingkasHariKerja): string {
  if (r.direncanakan === 0) return "Belum ada hari kerja yang direncanakan.";
  const bagian: string[] = [];
  bagian.push(r.sudahLewat === 0 ? "Belum ada hari yang lewat" : `Sudah lewat ${r.sudahLewat} hari: ${r.lengkap} lengkap, ${r.terlewat} terlewat`);
  if (r.hariIni === "berjalan") bagian.push("hari ini masih bisa diisi");
  else if (r.hariIni === "lengkap") bagian.push("hari ini sudah lengkap");
  if (r.akanDatang > 0) bagian.push(`${r.akanDatang} hari lagi`);
  return `${bagian.join("; ")}.`;
}

/** Untuk papan Korwil: baris petugas berisi kelas per tanggal ("lengkap" | "sebagian" | "kosong" | "berjalan" | "anomali" | "tidak_ada" | "libur" ...). Hari kerja = lengkap/sebagian/kosong/berjalan. */
export function ringkasDariSel(tanggal: readonly string[], sel: readonly string[], hariIni: string): RingkasHariKerja {
  const kerja: string[] = [];
  const penuh: string[] = [];
  tanggal.forEach((t, i) => {
    const s = sel[i];
    if (s === "lengkap" || s === "sebagian" || s === "kosong" || s === "berjalan") kerja.push(t);
    if (s === "lengkap") penuh.push(t);
  });
  return ringkasHariKerja(kerja, penuh, hariIni);
}
