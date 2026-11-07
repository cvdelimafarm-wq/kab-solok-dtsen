// lib/masterOrang.ts  (logika murni; aman diimpor klien dan server)
//
// (7 Nov 2026, tahap C4) Master > Mitra dan Pegawai: panel KESEHATAN master orang, hanya baca. Satu identitas = sigap_akun (jenis mitra / organik);
// master mitra = sigap_mitra_pool per tahun; master organik = sigap_pegawai_profil tertaut akun organik. Panel ini hanya menghitung dan menunjuk kejanggalan;
// perbaikannya lewat layar yang sudah ada (Kelola Peran & Akses > Mitra Kepka / Pegawai organik). Tidak membawa NIK, NIP, HP, atau rekening.

export const API_MASTER_ORANG = "/api/portal/master/orang";
export const TAUTAN_PENGGUNA = "/sigap/akses";
const MAKS_CONTOH = 12;

export type AkunMaster = { id: number; nama: string; jenis: string; aktif: boolean; magang: boolean; alamat_kecamatan: string | null; sudah_masuk: boolean };
export type PoolMaster = { akun_id: number; tahun: number; status: string };
export type ProfilMaster = { id: number; akun_id: number | null; nama_lengkap: string };

export type TingkatTemuan = "perlu" | "cek" | "info";
export type ContohOrang = { id: number | null; nama: string; ket: string };
export type TemuanOrang = { kode: string; judul: string; ket: string; tingkat: TingkatTemuan; jumlah: number; contoh: ContohOrang[] };
export type RingkasOrang = {
  mitra_aktif: number; pool_aktif: number; pool_nonaktif: number; organik_aktif: number; organik_magang: number; profil_pegawai: number; akun_nonaktif: number; belum_pernah_masuk: number;
};
export type DataMasterOrang = { siap: boolean; tahun: number; ringkas: RingkasOrang; temuan: TemuanOrang[] };

const RINGKAS_KOSONG: RingkasOrang = { mitra_aktif: 0, pool_aktif: 0, pool_nonaktif: 0, organik_aktif: 0, organik_magang: 0, profil_pegawai: 0, akun_nonaktif: 0, belum_pernah_masuk: 0 };
export const MASTER_ORANG_KOSONG: DataMasterOrang = { siap: false, tahun: new Date().getFullYear(), ringkas: RINGKAS_KOSONG, temuan: [] };

/** Nama untuk mencari kembar: huruf kecil, tanpa aksen/tanda baca, spasi tunggal. */
export const kunciNama = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

const contoh = (daftar: ContohOrang[]) => daftar.slice(0, MAKS_CONTOH);
const urut = <T extends { nama: string }>(x: T[]) => [...x].sort((a, b) => a.nama.localeCompare(b.nama, "id"));
const ket = (a: Pick<AkunMaster, "alamat_kecamatan" | "magang">) => [a.alamat_kecamatan || "kecamatan belum diisi", a.magang ? "magang" : ""].filter(Boolean).join(" · ");

export function susunKesehatanOrang(akun: readonly AkunMaster[], pool: readonly PoolMaster[], profil: readonly ProfilMaster[], tahun: number): DataMasterOrang {
  const poolTahun = pool.filter((p) => p.tahun === tahun);
  const poolAktif = new Map(poolTahun.filter((p) => p.status === "aktif").map((p) => [p.akun_id, p]));
  const akunPerId = new Map(akun.map((a) => [a.id, a]));
  const aktif = akun.filter((a) => a.aktif);
  const mitra = aktif.filter((a) => a.jenis === "mitra");
  const organik = aktif.filter((a) => a.jenis === "organik");
  const adaProfil = new Set(profil.map((p) => p.akun_id).filter((x): x is number => x !== null));

  const temuan: TemuanOrang[] = [];
  const tambah = (t: Omit<TemuanOrang, "contoh" | "jumlah"> & { daftar: ContohOrang[] }) => {
    if (t.daftar.length > 0) temuan.push({ kode: t.kode, judul: t.judul, ket: t.ket, tingkat: t.tingkat, jumlah: t.daftar.length, contoh: contoh(t.daftar) });
  };

  tambah({
    kode: "mitra_tanpa_pool", tingkat: "perlu", judul: "Akun mitra aktif yang belum masuk pool tahun ini",
    ket: `Hanya mitra yang disahkan Keputusan Kepala (pool ${tahun}) yang boleh dipekerjakan. Tandai di Kelola Peran & Akses > Mitra Kepka, atau nonaktifkan akunnya bila bukan mitra.`,
    daftar: urut(mitra.filter((a) => !poolAktif.has(a.id))).map((a) => ({ id: a.id, nama: a.nama, ket: ket(a) })),
  });
  tambah({
    kode: "pool_tak_sah", tingkat: "perlu", judul: "Anggota pool aktif yang akunnya nonaktif atau bukan mitra",
    ket: "Pool tahun ini memuat akun yang tidak bisa dipekerjakan. Nonaktifkan keanggotaan pool atau aktifkan kembali akunnya.",
    daftar: urut(
      [...poolAktif.values()].flatMap((p) => {
        const a = akunPerId.get(p.akun_id);
        if (!a) return [{ id: p.akun_id, nama: `Akun ${p.akun_id} (tidak ditemukan)`, ket: "akun hilang" }];
        if (!a.aktif) return [{ id: a.id, nama: a.nama, ket: `akun nonaktif · ${ket(a)}` }];
        if (a.jenis !== "mitra") return [{ id: a.id, nama: a.nama, ket: `jenis ${a.jenis} · ${ket(a)}` }];
        return [];
      }),
    ),
  });
  tambah({
    kode: "organik_tanpa_profil", tingkat: "cek", judul: "Akun organik aktif tanpa profil pegawai",
    ket: "Master organik = profil pegawai yang tertaut akun. Pegawai magang memang belum punya profil (ditandai magang); selain itu perlu ditautkan di Pegawai organik.",
    daftar: urut(organik.filter((a) => !a.magang && !adaProfil.has(a.id))).map((a) => ({ id: a.id, nama: a.nama, ket: ket(a) })),
  });
  tambah({
    kode: "profil_tanpa_akun", tingkat: "cek", judul: "Profil pegawai yang belum tertaut akun aktif",
    ket: "Profil ada, tetapi tidak ada akun organik aktif yang tertaut, sehingga orangnya belum bisa ditugaskan.",
    daftar: urut(profil.filter((p) => p.akun_id === null || !akunPerId.get(p.akun_id)?.aktif).map((p) => ({ id: p.akun_id, nama: p.nama_lengkap, ket: p.akun_id === null ? "belum ada akun" : "akun nonaktif atau hilang" }))),
  });

  const perNama = new Map<string, AkunMaster[]>();
  for (const a of aktif) {
    const k = kunciNama(a.nama);
    if (k) perNama.set(k, [...(perNama.get(k) ?? []), a]);
  }
  const kembar = [...perNama.values()].filter((g) => g.length > 1);
  tambah({
    kode: "nama_kembar", tingkat: "cek", judul: "Nama kembar di antara akun aktif",
    ket: "Masuk dengan nama bisa tertukar. Pastikan keduanya benar orang berbeda dan pembedanya (kecamatan) terisi di daftar pilihan masuk.",
    daftar: kembar.flatMap((g) => g.map((a) => ({ id: a.id, nama: a.nama, ket: `${a.jenis} · ${ket(a)}` }))).sort((a, b) => a.nama.localeCompare(b.nama, "id")),
  });
  tambah({
    kode: "tanpa_kecamatan", tingkat: "info", judul: "Akun aktif tanpa kecamatan domisili",
    ket: "Kecamatan dipakai sebagai pembeda nama kembar dan untuk menentukan petugas terdekat.",
    daftar: urut(aktif.filter((a) => !(a.alamat_kecamatan ?? "").trim())).map((a) => ({ id: a.id, nama: a.nama, ket: `${a.jenis}${a.magang ? " · magang" : ""}` })),
  });

  return {
    siap: true, tahun,
    ringkas: {
      mitra_aktif: mitra.length,
      pool_aktif: poolTahun.filter((p) => p.status === "aktif").length,
      pool_nonaktif: poolTahun.filter((p) => p.status !== "aktif").length,
      organik_aktif: organik.length,
      organik_magang: organik.filter((a) => a.magang).length,
      profil_pegawai: profil.length,
      akun_nonaktif: akun.length - aktif.length,
      belum_pernah_masuk: aktif.filter((a) => !a.sudah_masuk).length,
    },
    temuan,
  };
}
