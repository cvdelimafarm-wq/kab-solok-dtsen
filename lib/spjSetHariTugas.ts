// lib/spjSetHariTugas.ts
//
// Logic BERSAMA utk mengelompokkan tanggal Hari Tugas (🗓 Identifikasi Hari
// Tugas, tab Perencanaan Lapangan) milik seorang petugas jadi "SET" -- dasar
// dari model baru Kwitansi/Visum/Surat Pernyataan Kendaraan (per SET, bukan
// lagi 1 baris per Surat Tugas) sesuai permintaan user 23 Sep 2026:
//
//   "set ke 6 dokumen spj dibuat 1 set per hari, mungkin yg membedakan
//   adalah modenya, bikin mode 1 set per hari, dan 1 set per hari yang
//   tersambung (jika ada yang putus maka harus pecah menjadi beberapa set,
//   seperti jika tgl 2-4 dan 6-7 maka ini harus dipisah menjadi 2 set)"
//
// Dipakai BERSAMA oleh:
//  - app/api/penyisiran/spj/buat-otomatis/route.ts (endpoint "Buat Otomatis")
//  - app/penyisiran/administrasi-spj.tsx (pratinjau set sblm klik "Buat
//    Otomatis", & daftar set yg sudah ada, tombol pilih mode)
//
// Dua mode (dipilih PENGELOLA tiap kali klik "Buat Otomatis" -- TIDAK
// disimpan sbg pengaturan tetap global maupun per-ST, sesuai jawaban user
// di AskUserQuestion 23 Sep 2026 "Pengelola pilih saat 'Buat Otomatis'"):
//  - "per_hari"   : SETIAP tanggal yg ditag jadi SET tersendiri (1 hari/set).
//  - "per_rentang": tanggal2 yg ditag & BERURUTAN (selisih 1 hari kalender)
//    digabung jadi 1 SET; begitu ada tanggal yg TIDAK berurutan (ada
//    "lubang"/gap), SET baru dimulai. Contoh dari user: tag di tgl 2,3,4 &
//    6,7 (tgl 5 TIDAK ditag) -> 2 SET: [2-4] dan [6-7].
//
// SENGAJA fungsi murni (tanpa Supabase/DOM) spy bisa dipakai baik di
// backend (route.ts) maupun frontend (pratinjau sblm submit di
// administrasi-spj.tsx) tanpa duplikasi logic gaps-and-islands.

export type ModeSetHariTugas = "per_hari" | "per_rentang";

export const MODE_SET_HARI_TUGAS: ModeSetHariTugas[] = ["per_hari", "per_rentang"];

export const LABEL_MODE_SET_HARI_TUGAS: Record<ModeSetHariTugas, string> = {
  per_hari: "1 set per hari",
  per_rentang: "1 set per rentang hari yang tersambung",
};

// Tarif TRANSLOK per hari -- BELUM PERNAH ada tarif tetap tersimpan di
// sistem sebelumnya (lihat komentar "sesuai keputusan user" di migrasi
// 20260918_spj_translok.sql) -- ini nilai DEFAULT baru sesuai permintaan
// user 23 Sep 2026 ("Nominal (Rp) default 170.0000"), tetap bisa diganti
// manual per SET stlh dibuat otomatis (bukan dikunci).
export const TARIF_TRANSLOK_PER_HARI_DEFAULT = 170000;

export interface SetHariTugas {
  tanggalMulai: string; // YYYY-MM-DD
  tanggalSelesai: string; // YYYY-MM-DD
  jumlahHari: number;
  tanggalTermasuk: string[]; // semua tanggal kalender dlm set ini, urut kronologis
}

function selisihHari(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  return Math.round((db - da) / 86400000);
}

/**
 * Hitung daftar SET dari daftar tanggal yg ditag sesuai mode terpilih.
 * Tanggal input boleh tidak terurut/ada duplikat -- fungsi ini yg
 * menormalkan (dedup + sort) sblm mengelompokkan.
 */
export function hitungSetDariTanggal(tanggal: string[], mode: ModeSetHariTugas): SetHariTugas[] {
  const unik = Array.from(new Set(tanggal)).sort();
  if (unik.length === 0) return [];

  if (mode === "per_hari") {
    return unik.map((t) => ({ tanggalMulai: t, tanggalSelesai: t, jumlahHari: 1, tanggalTermasuk: [t] }));
  }

  // mode "per_rentang" -- gabung tanggal berurutan (selisih 1 hari kalender)
  // jadi 1 "pulau"; setiap ketemu lubang (selisih > 1 hari), pulau baru mulai.
  const hasil: SetHariTugas[] = [];
  let pulauMulai = unik[0];
  let pulauTerkini: string[] = [unik[0]];

  for (let i = 1; i < unik.length; i++) {
    const sebelumnya = unik[i - 1];
    const skrg = unik[i];
    if (selisihHari(sebelumnya, skrg) === 1) {
      pulauTerkini.push(skrg);
    } else {
      hasil.push({
        tanggalMulai: pulauMulai,
        tanggalSelesai: pulauTerkini[pulauTerkini.length - 1],
        jumlahHari: pulauTerkini.length,
        tanggalTermasuk: pulauTerkini,
      });
      pulauMulai = skrg;
      pulauTerkini = [skrg];
    }
  }
  hasil.push({
    tanggalMulai: pulauMulai,
    tanggalSelesai: pulauTerkini[pulauTerkini.length - 1],
    jumlahHari: pulauTerkini.length,
    tanggalTermasuk: pulauTerkini,
  });

  return hasil;
}

/**
 * Filter tanggal yg ditag ke rentang tanggal_mulai..tanggal_selesai Surat
 * Tugas terkait (jaga2 kalau ada tanggal ditag DI LUAR rentang ST ini --
 * tetap hari kerja sah tp bukan bagian penugasan ST ybs, mis. petugas
 * ditugaskan lagi lewat ST lain), lalu hitung SET-nya.
 */
export function hitungSetUntukSuratTugas(
  tanggalDitag: string[],
  stMulai: string,
  stSelesai: string,
  mode: ModeSetHariTugas
): SetHariTugas[] {
  const dlmRentang = tanggalDitag.filter((t) => t >= stMulai && t <= stSelesai);
  return hitungSetDariTanggal(dlmRentang, mode);
}

/**
 * Nominal Kwitansi default utk 1 SET -- tarif tetap DIKALI jumlah hari dlm
 * set (BUKAN flat per set), sesuai jawaban user 23 Sep 2026 "Dikali jumlah
 * hari (170.000 x jumlah hari)". Hasil ini tetap bisa diganti manual stlh
 * dibuat otomatis (field nominal per SET tetap dpt diedit, sesuai
 * permintaan user "mungkin bisa tambahkan pilihan ganti nilai jika perlu").
 */
export function nominalKwitansiDefault(
  jumlahHari: number,
  tarifPerHari: number = TARIF_TRANSLOK_PER_HARI_DEFAULT
): number {
  return tarifPerHari * jumlahHari;
}

// ---------------------------------------------------------------------
// (27 Sep 2026) Pengecekan & rencana PERBAIKAN konsistensi SET Kwitansi/
// Visum/Surat Pernyataan Kendaraan -- dipakai "Buat Otomatis" SETIAP kali
// diklik, SEBELUM membuat baris baru, supaya kasus data lama yg masih
// "nyangkut" pecah per-hari (peninggalan mode "per_hari" yg pernah aktif
// 24 Sep 2026, lihat kasus nyata Fadhil Ananda/Ondri Yandi/Ayu Sepriani/
// Megawati yg sempat diperbaiki manual lewat SQL) ATAU SET yg blm
// diperluas walau tanggal Hari Tugas-nya sudah bertambah (kasus Megawati:
// Kwitansi cuma sampai 26 Sep walau Hari Tugas & Visum-nya sudah 18-30)
// -- BISA ketahuan & dibetulkan SENDIRI oleh sistem, bukan menunggu
// ditemukan manual lagi.
//
// (28 Sep 2026, laporan user -- kasus nyata: Hari Tugas awalnya 17-30,
// diganti jadi 18-30 (tgl 17 dihapus dari tag), tapi baris Kwitansi/Visum
// LAMA yg 17-30 TETAP ADA & muncul DOBEL bareng baris baru 18-30 pas
// Cetak SPJ, "harusnya yg terupdate aja") -- ROOT CAUSE: pencocokan baris
// existing ke SET versi SEBELUMNYA pakai syarat CONTAINMENT PENUH
// (`tanggal_mulai_set >= SET.mulai && tanggal_selesai_set <= SET.selesai`)
// -- cuma menangani kasus baris LAMA lebih SEMPIT/pecah DI DALAM SET yg
// SEKARANG lebih lebar (Megawati, di atas). Begitu SET malah MENYUSUT
// atau BERGESER (rentang lama TIDAK LAGI seluruhnya termuat di rentang
// baru, mis. 17-30 -> 18-30: tgl 17 skrg di LUAR SET baru), baris lama
// gagal cocok dgn SET manapun -- bukan "perlu_diperbaiki" (jadi tidak
// di-UPDATE) & bukan "belum_ada" (jadi tidak ke-track sbg baris yg harus
// dibuat) -- baris itu SENYAP begitu saja, tidak pernah disentuh/dihapus,
// nyangkut selamanya sbg baris "hantu" yg tetap ikut tercetak.
//
// PERBAIKAN: syarat pencocokan diganti dari CONTAINMENT jadi OVERLAP biasa
// (2 rentang beririsan kalau salah satu tidak berakhir sebelum yg lain
// mulai) -- baris lama 17-30 SEKARANG dianggap "beririsan" dgn SET baru
// 18-30 (walau tgl 17-nya sendiri di luar), jadi tetap kepilih sbg baris
// yg "perlu_diperbaiki" (di-UPDATE PAS ke rentang SET baru 18-30, BUKAN
// dibiarkan tetap 17-30). Ditambah lapisan BARU: baris existing yg SAMA
// SEKALI tidak beririsan dgn SET manapun di `setRentang` saat ini (artinya
// rentang tanggal yg diwakilinya sudah TIDAK ADA LAGI di tag Hari Tugas,
// bukan cuma bergeser) SEKARANG ikut terdeteksi lewat `yatimDihapus` --
// pemanggil WAJIB men-DELETE baris ini jg, supaya tidak ada lagi baris yg
// "nyangkut" apa pun bentuk perubahan tanggalnya (menyempit, bergeser,
// ATAU dihapus total).
//
// Definisi status per SET (hasil hitungSetUntukSuratTugas): ADA PERSIS 1
// baris existing (yg beririsan dgn SET ini & belum "diklaim" SET lain --
// lihat catatan klaim di bawah) yg tanggal_mulai_set & tanggal_selesai_set
// -nya SAMA PERSIS dgn batas SET itu -> "konsisten" (tidak disentuh).
// Kalau tidak (baris masih terpecah jadi >1 potongan, baris cuma menutupi
// SEBAGIAN, ATAU baris lama meleset/bergeser dari rentang SET) ->
// "perlu_diperbaiki": baris PALING AWAL (tanggal_mulai_set terkecil) di
// antara yg beririsan DIPERTAHANKAN (di-UPDATE jadi PAS menutupi rentang
// SET penuh oleh pemanggil), baris LAIN yg beririsan SET yg sama akan
// DIHAPUS (duplikat/fragmen). Kalau BELUM ADA baris yg beririsan sama
// sekali, statusnya "belum_ada" -- akan dibuat baru lewat upsert seperti
// biasa (BUKAN "perlu_diperbaiki", supaya laporan progress ke pengguna
// jelas membedakan "dibuat baru" drpd "diperbaiki krn tidak konsisten").
//
// Klaim baris: SET diproses SCR KRONOLOGIS (urutan `setRentang`, sudah
// terurut menaik dari hitungSetDariTanggal) -- kalau 1 baris lama
// beririsan dgn >1 SET sekaligus (mis. baris lama menggabungkan rentang yg
// SEKARANG terpecah 2 krn ada tanggal yg dihapus di tengah), baris itu
// "diklaim" oleh SET PALING AWAL yg beririsan & di-UPDATE ke rentang SET
// itu SAJA -- SET berikutnya yg tadinya jg beririsan dgn baris yg sama
// otomatis dianggap "belum_ada" (baris baru dibuat khusus utk bagian itu),
// krn baris lama stlh di-UPDATE TIDAK beririsan lagi dgn SET kedua.
//
// SENGAJA fungsi murni (tanpa Supabase) -- pemanggil (lib/spjBuatOtomatisInti.ts)
// yg menjalankan UPDATE/DELETE sesungguhnya sesuai rencana yg dikembalikan
// di sini, krn field yg di-recompute (nominal, tanggal_pelaksanaan, dst)
// beda2 per jenis dokumen.

export interface BarisSetExisting {
  id: number;
  tanggalMulaiSet: string;
  tanggalSelesaiSet: string;
}

export interface RentangSet {
  tanggalMulai: string;
  tanggalSelesai: string;
}

export interface RencanaPerbaikanSet {
  set: SetHariTugas;
  status: "konsisten" | "belum_ada" | "perlu_diperbaiki";
  /** Baris yg dipertahankan (di-UPDATE jadi rentang SET penuh) -- null kalau status "belum_ada". */
  idDipertahankan: number | null;
  /** Baris lain yg beririsan SET yg sama & harus DIHAPUS (fragmen/duplikat) -- hanya terisi kalau "perlu_diperbaiki". */
  idDihapus: number[];
  /** Rentang tiap baris SEBELUM diperbaiki -- utk ditampilkan di laporan progress ("sebelumnya N baris: 18-18, 19-19, ..."). */
  rentangSebelum: RentangSet[];
}

export interface HasilRencanaPerbaikanSet {
  rencana: RencanaPerbaikanSet[];
  /**
   * (28 Sep 2026) Baris existing yg TIDAK beririsan dgn SET manapun di
   * `setRentang` saat ini -- rentang tanggal yg diwakilinya sudah TIDAK
   * ADA LAGI di tag Hari Tugas terkini (bukan cuma bergeser/menyempit, tp
   * benar2 hilang, mis. seluruh tanggalnya di-untag). WAJIB dihapus oleh
   * pemanggil supaya tidak nyangkut & muncul dobel/hantu saat Cetak SPJ
   * (lihat komentar besar di atas -- laporan user 28 Sep 2026).
   */
  yatimDihapus: BarisSetExisting[];
}

export function rencanakanPerbaikanSet(
  setRentang: SetHariTugas[],
  existingRows: BarisSetExisting[]
): HasilRencanaPerbaikanSet {
  // 2 rentang [aMulai,aSelesai] & [bMulai,bSelesai] beririsan kalau
  // TIDAK (a berakhir sebelum b mulai ATAU b berakhir sebelum a mulai).
  const beririsan = (r: BarisSetExisting, s: SetHariTugas) =>
    r.tanggalMulaiSet <= s.tanggalSelesai && r.tanggalSelesaiSet >= s.tanggalMulai;

  const idTerklaim = new Set<number>();
  const rencana: RencanaPerbaikanSet[] = setRentang.map((s) => {
    const kandidat = existingRows
      .filter((r) => !idTerklaim.has(r.id) && beririsan(r, s))
      .slice()
      .sort((a, b) => a.tanggalMulaiSet.localeCompare(b.tanggalMulaiSet));

    if (kandidat.length === 0) {
      return { set: s, status: "belum_ada", idDipertahankan: null, idDihapus: [], rentangSebelum: [] };
    }
    for (const k of kandidat) idTerklaim.add(k.id);

    const satuBarisPersisSama =
      kandidat.length === 1 &&
      kandidat[0].tanggalMulaiSet === s.tanggalMulai &&
      kandidat[0].tanggalSelesaiSet === s.tanggalSelesai;
    if (satuBarisPersisSama) {
      return { set: s, status: "konsisten", idDipertahankan: kandidat[0].id, idDihapus: [], rentangSebelum: [] };
    }

    return {
      set: s,
      status: "perlu_diperbaiki",
      idDipertahankan: kandidat[0].id,
      idDihapus: kandidat.slice(1).map((r) => r.id),
      rentangSebelum: kandidat.map((r) => ({ tanggalMulai: r.tanggalMulaiSet, tanggalSelesai: r.tanggalSelesaiSet })),
    };
  });

  const yatimDihapus = existingRows.filter((r) => !idTerklaim.has(r.id));

  return { rencana, yatimDihapus };
}
