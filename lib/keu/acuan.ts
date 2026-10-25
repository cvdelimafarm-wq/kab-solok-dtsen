// lib/keu/acuan.ts
//
// (25 Okt 2026, tahap 30) Apa yang dibaca modul hilir dari identifikasi: RAB dan revisi, draf pengadaan, rencana realisasi, rekrutmen mitra,
// Delego (tim, jadwal, target), dan Bendahara. Pintu basisnya keu_v_ident_acuan; berkas ini MURNI: meringkas isi menjadi butir yang dapat dibaca
// manusia, sehingga pengguna melihat persis apa yang akan diambil modul lain dan dari versi mana. Prinsip V1: lanjutan lebih diutamakan daripada
// identifikasi awal; keputusan KPA yang ditolak atau belum diputus TIDAK mengubah versi yang dibaca (tidak memblokir).

import type { Form } from "./identifikasi";
import type { IsiKebijakan } from "./kebijakan";
import {
  jadwalPendataan, jumlahPetugas, jumlahRincian, KODE_PERAN, NAMA_PERAN, rincianBiaya, type IsiLanjutan, type StatusLanjutan,
} from "./lanjutan";

export type AcuanModul = { modul: string; dari: string; siap: boolean; butir: string[] };
export type MasukanAcuan = {
  form: Form; tahun: number; upd: Record<string, { mulai: string; selesai: string }> | null;
  isi: IsiLanjutan | null; ver: number | null; status: StatusLanjutan | null;
  lembar: IsiKebijakan | null; kebijakanVer: number | null;
};

const rp = (n: number): string => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const MENUNGGU = "Menunggu identifikasi lanjutan disimpan.";

export function ringkasAcuan(m: MasukanAcuan): AcuanModul[] {
  const { isi } = m;
  const dari = isi ? `Identifikasi lanjutan versi ${m.ver} (${m.status === "final" ? "Final" : "Draf"})` : "Identifikasi awal (belum ada lanjutan)";
  const peringatanDraf = isi && m.status !== "final" ? ["Masih Draf: ada isian Perkiraan atau nama menyusul; angka dapat berubah."] : [];
  const jadwal = jadwalPendataan(m.form, m.tahun, m.upd).filter((j) => j.mulai && j.selesai);
  const jadwalTeks = jadwal.length > 0 ? jadwal.map((j) => `${j.periode}: ${j.mulai} s.d. ${j.selesai}`).join("; ") : "jadwal belum lengkap";
  const out: AcuanModul[] = [];

  // RAB dan revisi
  if (isi) {
    const j = jumlahRincian(rincianBiaya(isi, m.form, m.lembar));
    out.push({ modul: "RAB dan revisi", dari, siap: true, butir: [`${j.terhitung} baris terhitung senilai ${rp(j.total)}; ${j.belum} baris menunggu tarif atau jumlah hari.`, "Angka belum sah sampai identifikasi dan lembar kebijakan disahkan.", ...peringatanDraf] });
  } else {
    out.push({ modul: "RAB dan revisi", dari, siap: true, butir: ["Kebutuhan anggaran dibaca dari identifikasi awal yang sah sampai lanjutan tersedia."] });
  }

  if (!isi) {
    for (const modul of ["Draf pengadaan", "Rencana realisasi", "Rekrutmen mitra", "Delego, laporan harian, evaluasi", "Bendahara (pencairan)"]) out.push({ modul, dari, siap: false, butir: [MENUNGGU] });
    return out;
  }

  // Draf pengadaan: jenis dan jumlah barang atau jasa dari kelas
  const luring = isi.kelas.filter((k) => k.metode === "Luring" || k.metode === "Hybrid");
  const hotel = luring.filter((k) => k.tempat === "Hotel dalam kota" || k.tempat === "Hotel luar kota");
  const oh = isi.kelas.reduce((s, k) => s + k.oh, 0);
  out.push({
    modul: "Draf pengadaan", dari, siap: true,
    butir: [
      `${isi.kelas.length} kelas (${luring.length} luring atau hybrid, ${hotel.length} di hotel); jumlah OH per peserta ${oh}.`,
      ...(hotel.length > 0 ? [`Paket hotel: ${hotel.map((k) => `${k.nama || "Kelas"} ${k.paket || "(paket belum dipilih)"}`).join("; ")}.`] : ["Tidak ada kelas di hotel."]),
      ...peringatanDraf,
    ],
  });

  // Rencana realisasi: jadwal, petugas, biaya
  const ringkas = jumlahPetugas(isi);
  const tr = KODE_PERAN.filter((k) => isi.peran[k].on && isi.peran[k].translok).map((k) => NAMA_PERAN[k]);
  const inap = KODE_PERAN.filter((k) => isi.peran[k].on && isi.peran[k].penginapan).map((k) => NAMA_PERAN[k]);
  out.push({
    modul: "Rencana realisasi", dari: `${dari}${m.kebijakanVer ? `; lembar kebijakan versi ${m.kebijakanVer}` : "; belum ada lembar kebijakan yang berlaku"}`, siap: true,
    butir: [
      `Pendataan: ${jadwalTeks}.`, `Kelas: ${isi.kelas.map((k) => `${k.nama || "Kelas"} ${k.mulai || "?"}${k.selesai && k.selesai !== k.mulai ? ` s.d. ${k.selesai}` : ""}`).join("; ") || "belum ada"}.`,
      `${ringkas.total} petugas (${ringkas.organik} organik, ${ringkas.mitra} mitra).`, `Translok: ${tr.join(", ") || "tidak ada"}. Penginapan: ${inap.join(", ") || "tidak ada"}.`, ...peringatanDraf,
    ],
  });

  // Rekrutmen mitra: jumlah dan sumber
  const mitra = isi.petugas.filter((p) => p.status === "Mitra");
  const kepka = mitra.filter((p) => p.sumber === "kepka").length;
  const seleksi = mitra.filter((p) => p.sumber === "seleksi").length;
  const perPeran = KODE_PERAN.filter((k) => isi.peran[k].on && isi.peran[k].nMit > 0).map((k) => `${NAMA_PERAN[k]} ${isi.peran[k].nMit}`);
  out.push({
    modul: "Rekrutmen mitra", dari, siap: true,
    butir: [`${mitra.length} mitra tercatat: ${kepka} langsung dari kepka, ${seleksi} lewat seleksi.`, `Kebutuhan per peran: ${perPeran.join(", ") || "tidak ada mitra"}.`, ...(ringkas.menyusul > 0 ? [`${ringkas.menyusul} nama petugas masih menyusul.`] : [])],
  });

  // Delego, laporan harian, evaluasi: tim, jadwal, target
  const jabatanTerisi = isi.petugas.filter((p) => p.jabatan.length > 0).length;
  out.push({
    modul: "Delego, laporan harian, evaluasi", dari, siap: true,
    butir: [`Tim: ${ringkas.total} petugas, ${jabatanTerisi} sudah memegang jabatan, ${ringkas.baru} petugas baru.`, `Jadwal pendataan: ${jadwalTeks}.`, ...peringatanDraf],
  });

  // Bendahara: rincian biaya dan batas kebijakan
  out.push({
    modul: "Bendahara (pencairan)", dari: `${dari}${m.kebijakanVer ? `; lembar kebijakan versi ${m.kebijakanVer}` : ""}`, siap: m.lembar !== null,
    butir: m.lembar ? [`Rincian biaya mengikuti lembar kebijakan versi ${m.kebijakanVer}; batas kebijakan dipakai sebagai peringatan, bukan pemblokir.`] : ["Belum ada lembar kebijakan yang berlaku; batas kebijakan belum dapat dibaca."],
  });
  return out;
}
