// lib/keu/pilihNama.ts
//
// (2 Nov 2026, permintaan Iqbal: "seluruh nama harus dipilih lewat dropdown") Calon nama untuk pemilih nama petugas pada Identifikasi lanjutan: pegawai organik
// (view keu_v_pegawai_organik) dan mitra (view keu_v_mitra_aktif, ±760 orang sehingga ada kolom pencarian). Nama di luar daftar tetap boleh ("pakai nama lain").
// MURNI. Yang disimpan tetap hanya `nama` (tanpa skema baru).

export type CalonNama = { nama: string; ket: string };
const pangkas = (s: string): string => s.replace(/\s+/g, " ").trim();
const kunci = (s: string): string => pangkas(s).toLocaleLowerCase("id");

/** Pegawai organik: dipangkas, tanpa duplikat persis, urut abjad. */
export function calonOrganik(nama: readonly string[] | null | undefined): CalonNama[] {
  const unik = new Map<string, CalonNama>();
  for (const n of nama ?? []) { const p = pangkas(n ?? ""); if (p !== "" && !unik.has(p)) unik.set(p, { nama: p, ket: "" }); }
  return [...unik.values()].sort((a, b) => a.nama.localeCompare(b.nama, "id"));
}

/** Mitra: keterangan = kecamatan (membedakan nama kembar); urut abjad nama lalu kecamatan. */
export function calonMitra(baris: readonly { nama: string; kecamatan: string | null }[] | null | undefined): CalonNama[] {
  const unik = new Map<string, CalonNama>();
  for (const b of baris ?? []) {
    const n = pangkas(b.nama ?? ""); const ket = pangkas(b.kecamatan ?? "");
    if (n !== "" && !unik.has(`${kunci(n)}|${kunci(ket)}`)) unik.set(`${kunci(n)}|${kunci(ket)}`, { nama: n, ket });
  }
  return [...unik.values()].sort((a, b) => a.nama.localeCompare(b.nama, "id") || a.ket.localeCompare(b.ket, "id"));
}

/** Saring menurut kata (tanpa membedakan huruf besar kecil; cocok pada nama atau keterangan). Nama yang diawali kata didahulukan. Maksimal `maks` hasil. */
export function saringCalon(daftar: readonly CalonNama[], kata: string, maks = 40): CalonNama[] {
  const k = kunci(kata);
  if (k === "") return daftar.slice(0, maks);
  const awal: CalonNama[] = []; const sisa: CalonNama[] = [];
  for (const c of daftar) {
    const n = kunci(c.nama);
    if (n.startsWith(k)) awal.push(c);
    else if (n.includes(k) || kunci(c.ket).includes(k)) sisa.push(c);
    if (awal.length >= maks) break;
  }
  return [...awal, ...sisa].slice(0, maks);
}

/** Nama ada di daftar (kecocokan nama saja, tanpa membedakan huruf besar kecil). */
export const adaDiDaftar = (daftar: readonly CalonNama[], nama: string): boolean => { const k = kunci(nama); return k !== "" && daftar.some((c) => kunci(c.nama) === k); };

/** Nama yang sudah dipakai petugas lain pada peran dan status yang sama (agar satu orang tidak terpilih dua kali pada peran yang sama). */
export function namaTerpakaiPeran(petugas: readonly { id: string; nama: string; peran: string; status: string }[], p: { id: string; peran: string; status: string }): Set<string> {
  return new Set(petugas.filter((x) => x.id !== p.id && x.peran === p.peran && x.status === p.status && pangkas(x.nama) !== "").map((x) => kunci(x.nama)));
}
export const sudahTerpakai = (terpakai: ReadonlySet<string>, nama: string): boolean => terpakai.has(kunci(nama));
