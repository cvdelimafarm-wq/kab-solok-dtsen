"use client";

// app/sigap/struktur/Statis.tsx
//
// (24 Okt 2026, tahap 16) Bagian 3 sampai akhir papan 16: tabel jalur menurut level (dibaca dari Master jalur), delapan langkah, mengubah/menutup, riwayat usulan,
// aturan struktur S1 sampai S6, dan hal yang perlu dipastikan ke Kanwil.

import { matriksJalur, teksKepastian, teksRiwayat, warnaKepastian, type JalurMaster, type LevelStruktur, type RiwayatStruktur } from "@/lib/keu/struktur";
import { tglPanjang } from "@/lib/keu/revisi";
import { Chip, judulKartu, kartu } from "../keu-ui";

export function MatriksJalur({ level, jalur }: { level: LevelStruktur[]; jalur: JalurMaster[] }) {
  const baris = matriksJalur(level, jalur);
  return (
    <div className={`${kartu} flex flex-col gap-2`}>
      <h2 className={judulKartu}>3. Jalur menurut level</h2>
      <div className="overflow-x-auto rounded-lg border border-[#DCE3EE]">
        <table className="w-full min-w-[820px] border-collapse text-left text-[12px]">
          <thead className="bg-[#EEF3FB] text-[#44546F]"><tr>{["Level", "Diusulkan oleh", "Jalur bila dana digeser di dalam RO", "Pemutus", "Kepastian"].map((h) => <th key={h} className="px-2.5 py-2 font-bold">{h}</th>)}</tr></thead>
          <tbody>
            {baris.map((m) => (
              <tr key={m.kode} className="border-t border-[#E7ECF4] align-top">
                <td className="px-2.5 py-2 font-semibold text-[#0F2A52]">{m.no}. {m.nama}</td><td className="px-2.5 py-2">{m.pengusul}</td><td className="px-2.5 py-2">{m.jalur}</td><td className="px-2.5 py-2">{m.pemutus}</td>
                <td className="px-2.5 py-2"><Chip warna={warnaKepastian(m.kepastian)}>{teksKepastian(m.kepastian)}</Chip></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-[#5B6B84]">Bila dana berasal dari jenis belanja lain atau RO lain, Akun dan Item naik ke DIPA jalur DJPb (turun volume RO total: DJA). Bila ada tambahan pagu dari pusat, semua level naik ke DIPA jalur DJA. Kolom "Dugaan" adalah inferensi dari pasal yang sudah dibaca (catatan 23 Okt) dan perlu ditanyakan ke Kanwil sebelum dikunci.</p>
    </div>
  );
}

const LANGKAH: { no: string; judul: string; isi: string }[] = [
  { no: "P1", judul: "Pilih level dan induk", isi: "Pilih level lalu induknya (mis. Item di bawah Akun, Akun di bawah Komponen). Induk dapat berupa simpul POK berlaku atau usulan yang belum aktif." },
  { no: "P2", judul: "Isi kode dan uraian", isi: "RO wajib punya volume dan satuan; Item wajib punya volume, satuan baku, dan harga. Akun dipilih dari Master akun." },
  { no: "P3", judul: "Sistem memeriksa", isi: "Format kode, tidak duplikat, akun ada di Master (bila belum, tambahkan dulu lengkap dengan pola dokumen), satuan baku, pengusul berwenang." },
  { no: "P4", judul: "Sistem menunjuk jalur", isi: "Revisi POK, DIPA jalur DJPb, atau DIPA jalur DJA, lengkap dengan pemutus, dasar pasal, dan tenggat. Jalur tidak dipilih manual." },
  { no: "P5", judul: "Dana harus ada sumbernya", isi: "Pagu satker tetap, tidak ada baris minus, penggenap tepat pagu (R-17). Dana digeser lewat jendela geseran (papan 1 sampai 8); kekurangan tanpa pagu resmi dicatat di papan 15." },
  { no: "P6", judul: "Disimpan sebagai baris usulan", isi: "Kode sementara T-nnn. Ketua tim mengajukan; usulan admin RO menunggu persetujuan ketua tim; PPK menyahkan (Revisi POK) atau meneruskan sebagai paket usulan DIPA." },
  { no: "P7", judul: "POK resmi terbit", isi: "PPK mengunggah PDF POK (papan 12). Sistem membandingkan struktur lama dan baru dan menampilkan selisihnya: level baru, level hilang, level berubah uraian." },
  { no: "P8", judul: "Pemadanan kode, lalu aktif", isi: "Kode sama: baris aktif otomatis. Kode berbeda: dipadankan manual, tidak ditebak. Item diikat ke nomor item resmi dari Excel realisasi. Setelah aktif: pola dokumen, RAB, skor, dan tim (untuk RO baru) tersedia." },
];
const ATURAN: { no: string; judul: string; isi: string }[] = [
  { no: "S1", judul: "Kode resmi dari pusat", isi: "SIGAP tidak menciptakan kode resmi. Kode sementara hanya penanda sampai POK atau DIPA resmi terbit." },
  { no: "S2", judul: "Induk harus ada", isi: "Tidak ada Akun tanpa Komponen, tidak ada Item tanpa Akun. Induk baru yang masih usulan dapat menjadi induk usulan lain; jalur tertinggi menang untuk seluruh paket." },
  { no: "S3", judul: "Pagu satker tetap", isi: "Menambah level tidak menambah pagu. Tambahan pagu hanya dari pusat (DJA), dan sebelum itu dicatat di papan 15." },
  { no: "S4", judul: "Akun dari Master", isi: "Akun yang belum ada di Master akun tidak dapat diusulkan. Penambahan Master dilakukan Admin Aplikasi atau PPK, termasuk pola dokumen." },
  { no: "S5", judul: "Pemadanan manual", isi: "Kode resmi yang berbeda dari kode usulan dipadankan oleh PPK. Sistem hanya menyarankan, tidak menyatukan sendiri." },
  { no: "S6", judul: "Belanja tidak dikomitmenkan", isi: "Baris usulan berstatus belum aktif tidak boleh dipakai untuk komitmen atau SPJ sampai POK resmi memuatnya (Pasal 124 ayat (3), usul diajukan sebelum kegiatan terdampak dilaksanakan)." },
];
function Langkah({ daftar }: { daftar: { no: string; judul: string; isi: string }[] }) {
  return (
    <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]">
      {daftar.map((l) => (
        <div key={l.no} className="flex min-w-0 flex-col gap-1 rounded-lg border border-[#DCE3EE] p-3">
          <span className="w-fit rounded bg-[#E3EEFF] px-1.5 py-0.5 text-[11px] font-bold text-[#1F5FD1]">{l.no}</span>
          <h3 className="text-[13.5px] font-bold text-[#0F2A52]">{l.judul}</h3>
          <p className="text-[12.5px] leading-relaxed text-[#44546F]">{l.isi}</p>
        </div>
      ))}
    </div>
  );
}

export function DelapanLangkah() {
  return <div className={`${kartu} flex flex-col gap-2`}><h2 className={judulKartu}>4. Delapan langkah, sama untuk semua level</h2><Langkah daftar={LANGKAH} /></div>;
}
export function UbahTutupHapus() {
  return (
    <div className={`${kartu} flex flex-col gap-2`}>
      <h2 className={judulKartu}>5. Mengubah, menutup, dan menghapus</h2>
      <p className="text-[12.5px] leading-relaxed text-[#5B6B84]">Level tidak pernah dihapus dari riwayat. Level yang dikosongkan lewat revisi dan tidak punya realisasi menjadi <b>tidak aktif</b> dan hilang dari daftar kerja, tetapi tetap muncul pada versi POK yang lama. Perubahan uraian saja (tanpa mengubah kode atau pagu) dicatat sebagai versi baru lewat impor POK resmi. Penyatuan dua komponen atau akun adalah dua langkah: kosongkan yang satu, tambah ke yang lain, dengan jalur sesuai tabel di atas. Usulan yang salah dibatalkan dengan alasan (tidak dihapus), dan usulan yang berstatus draf atau dikembalikan dapat diubah isiannya.</p>
    </div>
  );
}
export function AturanStruktur() {
  return <div className={`${kartu} flex flex-col gap-2`}><h2 className={judulKartu}>Aturan struktur</h2><Langkah daftar={ATURAN} /></div>;
}
export function YangPerluDipastikan() {
  return (
    <div className={`${kartu} flex flex-col gap-2`}>
      <h2 className={judulKartu}>Yang perlu dipastikan</h2>
      <p className="text-[12.5px] leading-relaxed text-[#5B6B84]">Sudah diputuskan Bapak: RO dan KRO baru cukup ditambahkan PPK, karena yang ditambahkan hanya baris kertas kerja (belum menjadi POK resmi). Subkomponen disediakan sebagai level, tersembunyi secara bawaan, dapat ditampilkan. Masih perlu dipastikan ke Kanwil: jalur RO baru dan Komponen atau Subkomponen baru (kolom "Dugaan" di tabel).</p>
    </div>
  );
}

export function RiwayatUsulan({ riwayat, memuat }: { riwayat: RiwayatStruktur[] | null; memuat: boolean }) {
  return (
    <div className={`${kartu} flex flex-col gap-2`}>
      <h2 className={judulKartu}>Riwayat usulan</h2>
      {memuat && <div className="h-12 animate-pulse rounded-lg bg-[#EEF3FB]" aria-busy="true" />}
      {riwayat && riwayat.length === 0 && <p className="text-[12.5px] text-[#5B6B84]">Belum ada. Setiap usulan, persetujuan, dan pemadanan tercatat dengan siapa dan kapan.</p>}
      {(riwayat ?? []).map((r) => (
        <div key={r.id} className="rounded-r-md border-l-[3px] border-[#B7CDF5] bg-white px-2.5 py-0.5 text-[12.5px] text-[#1B2B4B]">
          {teksRiwayat(r)} <span className="text-[#5B6B84]">{tglPanjang(r.waktu.slice(0, 10))} {r.waktu.slice(11, 16)} UTC</span>
        </div>
      ))}
    </div>
  );
}
