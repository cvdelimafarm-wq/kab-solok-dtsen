// lib/keu/pilihNama.ts
//
// (2 Nov 2026, permintaan Iqbal: "seluruh nama harus dipilih lewat dropdown") Calon nama untuk pemilih nama petugas pada Identifikasi lanjutan: pegawai organik
// (view keu_v_pegawai_organik) dan mitra (view keu_v_mitra_aktif, ±760 orang sehingga ada kolom pencarian). Nama di luar daftar tetap boleh ("pakai nama lain").
// MURNI. Yang disimpan tetap hanya `nama` (tanpa skema baru).

/** `akun` = id akun SIGAP; disimpan bersama nama supaya petugas TERTAUT ke akun (bukan hanya dicocokkan lewat ejaan nama). */
export type CalonNama = { nama: string; ket: string; akun?: number };
const pangkas = (s: string): string => s.replace(/\s+/g, " ").trim();
const kunci = (s: string): string => pangkas(s).toLocaleLowerCase("id");

const idSah = (x: unknown): number | undefined => (typeof x === "number" && Number.isInteger(x) && x > 0 ? x : undefined);

/** Pegawai organik (view keu_v_pegawai_organik): dipangkas, tanpa duplikat persis, urut abjad. */
export function calonOrganik(baris: readonly { nama: string; akun_id?: number }[] | null | undefined): CalonNama[] {
  const unik = new Map<string, CalonNama>();
  for (const b of baris ?? []) { const p = pangkas(b.nama ?? ""); if (p !== "" && !unik.has(p)) unik.set(p, { nama: p, ket: "", ...(idSah(b.akun_id) ? { akun: idSah(b.akun_id) } : {}) }); }
  return [...unik.values()].sort((a, b) => a.nama.localeCompare(b.nama, "id"));
}

/** Mitra (view keu_v_mitra_aktif): keterangan = kecamatan (membedakan nama kembar); urut abjad nama lalu kecamatan. */
export function calonMitra(baris: readonly { nama: string; kecamatan: string | null; akun_id?: number }[] | null | undefined): CalonNama[] {
  const unik = new Map<string, CalonNama>();
  for (const b of baris ?? []) {
    const n = pangkas(b.nama ?? ""); const ket = pangkas(b.kecamatan ?? "");
    if (n !== "" && !unik.has(`${kunci(n)}|${kunci(ket)}`)) unik.set(`${kunci(n)}|${kunci(ket)}`, { nama: n, ket, ...(idSah(b.akun_id) ? { akun: idSah(b.akun_id) } : {}) });
  }
  return [...unik.values()].sort((a, b) => a.nama.localeCompare(b.nama, "id") || a.ket.localeCompare(b.ket, "id"));
}

/** id akun bila tepat SATU calon bernama sama (tanpa beda huruf dan spasi ganda); nama kembar atau tidak ada = null (tidak ditautkan otomatis). */
export function cariAkunUnik(daftar: readonly CalonNama[], nama: string): number | null {
  const k = kunci(nama);
  if (k === "") return null;
  const cocok = daftar.filter((c) => kunci(c.nama) === k);
  return cocok.length === 1 && cocok[0].akun !== undefined ? cocok[0].akun : null;
}

/** Bentuk pembanding untuk PENCARIAN saja: huruf kecil, tanda baca (koma, titik, tanda hubung) dianggap spasi. Agar "Riva Hestaria A.Md" cocok dengan "Riva Hestaria, A.Md.". */
const kunciCari = (s: string): string => s.toLocaleLowerCase("id").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Saring menurut kata (tanpa membedakan huruf besar kecil dan tanda baca; tiap kata yang diketik harus ada pada nama atau keterangan, urutan bebas). Nama yang diawali kata didahulukan. Maksimal `maks` hasil. */
export function saringCalon(daftar: readonly CalonNama[], kata: string, maks = 40): CalonNama[] {
  const k = kunciCari(kata);
  if (k === "") return daftar.slice(0, maks);
  const kataKata = k.split(" ");
  const awal: CalonNama[] = []; const sisa: CalonNama[] = [];
  for (const c of daftar) {
    const n = kunciCari(c.nama);
    if (n.startsWith(k)) awal.push(c);
    else {
      const gabung = `${n} ${kunciCari(c.ket)}`;
      if (kataKata.every((w) => gabung.includes(w))) sisa.push(c);
    }
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

/** Nama yang sudah dipakai baris lain pada satu daftar (mis. instruktur satu kelas), dalam bentuk kunci pembanding; baris `indeks` sendiri dan nama kosong dilewati. */
export const terpakaiLain = (nama: readonly string[], indeks: number): Set<string> => new Set(nama.flatMap((n, i) => (i === indeks || pangkas(n) === "" ? [] : [kunci(n)])));
