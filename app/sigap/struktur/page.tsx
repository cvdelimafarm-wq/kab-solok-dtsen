"use client";

// app/sigap/struktur/page.tsx
//
// (24 Okt 2026, tahap 16) Tambah level mata anggaran (papan 16 mockup): mengusulkan Program, Kegiatan, KRO, RO, Komponen, Subkomponen, Akun, dan Item sebagai baris usulan
// dengan kode sementara T-nnn, jalur kewenangan ditunjuk sistem (Master jalur), lalu aktif setelah POK resmi terbit dan kodenya dipadankan. Semua aturan dan hak ditegakkan
// fungsi basis data keu_struktur_*; halaman ini hanya membaca, menjalankan pemeriksaan awal, dan memanggil fungsi tersebut. Logika murni: lib/keu/struktur.ts.

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { angka, urlBaca } from "@/lib/keu/ro";
import type { AliasSatuan, SatuanMaster, WaktuMaster } from "@/lib/keu/master";
import { hakKosong, levelTampil, ringkasStatus, statusProses, type Hak, type JalurMaster, type LevelStruktur, type NodeJalur, type RiwayatStruktur, type UsulanStruktur } from "@/lib/keu/struktur";
import { Chip, Galat, HalamanKeu, kisi, Kpi, kartu, Memuat, Potong, tombolAktif, tombolKecil, Tenang } from "../keu-ui";
import { aksiKeu, tulisKeuKlien, useBacaKeu, useBoleh, useKirim } from "../ro/useKeu";
import DaftarUsulan from "./Daftar";
import FormTambah from "./Form";
import { AturanStruktur, DelapanLangkah, MatriksJalur, RiwayatUsulan, UbahTutupHapus, YangPerluDipastikan } from "./Statis";

type AkunRef = { kode: string; nama: string; aktif: boolean; pola_kode?: string };

/** Kewenangan pelaku untuk menampilkan tombol: global (sahkan, str_ppk) dan per RO yang punya usulan berjalan (rab, setuju_ketua, draf). */
function useHak(usulan: UsulanStruktur[] | null): Hak {
  const [hak, setHak] = useState<Hak>(hakKosong());
  const ros = useMemo(() => [...new Set((usulan ?? []).filter((u) => statusProses(u.status) && u.ro_kode).map((u) => u.ro_kode as string))].sort().slice(0, 30), [usulan]);
  const kunci = ros.join("|");
  useEffect(() => {
    let hidup = true;
    const q = (kew: string, ro?: string) => aksiKeu<boolean>("keu_boleh", ro ? { p_kew: kew, p_ro: ro } : { p_kew: kew }).then((r) => r.ok && r.data === true);
    void (async () => {
      const [ppk, strPpk] = await Promise.all([q("sahkan"), q("str_ppk")]);
      const perRo: Hak["perRo"] = {};
      await Promise.all(ros.map(async (ro) => {
        const [rab, setuju, draf] = await Promise.all([q("rab", ro), q("setuju_ketua", ro), q("draf", ro)]);
        perRo[ro] = { rab, setuju, draf };
      }));
      if (hidup) setHak({ ppk, strPpk, perRo });
    })();
    return () => { hidup = false; };
  }, [kunci]); // eslint-disable-line react-hooks/exhaustive-deps
  return hak;
}

function KartuSubkomp({ sub, boleh, sesudah }: { sub: LevelStruktur | undefined; boleh: boolean; sesudah: () => Promise<void> }) {
  const { jalankan, mengirim, galat } = useKirim(sesudah);
  if (!sub) return null;
  return (
    <div className={`${kartu} flex flex-col gap-1.5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="text-[14px] text-[#0F2A52]">Level Subkomponen</b>
        {boleh
          ? <button type="button" disabled={mengirim} className={sub.tampil ? tombolAktif : tombolKecil} onClick={() => void jalankan(() => tulisKeuKlien("keu_struktur_level", "update", { tampil: !sub.tampil }, { kode: "subkomp" }))}>{sub.tampil ? "Sembunyikan Subkomponen" : "Tampilkan Subkomponen"}</button>
          : <Chip warna={sub.tampil ? "hijau" : "abu"}>{sub.tampil ? "Ditampilkan" : "Disembunyikan"}</Chip>}
      </div>
      <p className="text-[12px] leading-relaxed text-[#5B6B84]">Subkomponen ada di laporan SAKTI (mis. 052.0A, TANPA SUB KOMPONEN) tetapi tidak terpisah di POK PDF, jadi disembunyikan secara bawaan. Saat disembunyikan, Akun langsung berada di bawah Komponen dan angka level serta tabel jalur memakai tujuh level. Saat ditampilkan, Subkomponen menjadi level keenam (akun tetap diusulkan di bawah Komponen, sama seperti jalur POK). Pengaturan yang sama ada di <Link href="/sigap/master?bagian=struktur" className="font-semibold text-[#1F5FD1]">Master data (struktur anggaran)</Link>.</p>
      <Galat pesan={galat} />
    </div>
  );
}

function Isi() {
  const level = useBacaKeu<LevelStruktur>(urlBaca("keu_struktur_level", {}, { urut: "no", batas: 30 }));
  const jalur = useBacaKeu<JalurMaster>(urlBaca("keu_master_jalur", {}, { batas: 100 }));
  const waktu = useBacaKeu<WaktuMaster>(urlBaca("keu_master_waktu", {}, { urut: "urut", batas: 50, kolom: ["kode", "nama", "nilai", "nilai_tanggal", "ket", "urut"] }));
  const usulan = useBacaKeu<UsulanStruktur>(urlBaca("keu_v_struktur_usulan", {}, { urut: "-id", batas: 300 }));
  const riwayat = useBacaKeu<RiwayatStruktur>(urlBaca("keu_v_struktur_riwayat", {}, { urut: "-id", batas: 30 }));
  const node = useBacaKeu<NodeJalur>(urlBaca("keu_v_pok_jalur_node", {}, { batas: 5000, kolom: ["node_id", "tingkat", "kode", "nama", "jalur"] }));
  const akun = useBacaKeu<AkunRef>(urlBaca("keu_master_akun", {}, { urut: "kode", batas: 3000, kolom: ["kode", "nama", "pola_kode", "aktif"] }));
  const satuan = useBacaKeu<SatuanMaster>(urlBaca("keu_master_satuan", {}, { urut: "urut", batas: 200, kolom: ["kode", "arti", "pasti", "urut", "aktif"] }));
  const alias = useBacaKeu<AliasSatuan>(urlBaca("keu_master_satuan_alias", {}, { urut: "alias", batas: 1000 }));
  const bolehMaster = useBoleh("master", null) === true;
  const bolehPpk = useBoleh("sahkan", null) === true;
  const hak = useHak(usulan.baris);

  const semua = [level, jalur, waktu, usulan, riwayat, node, akun, satuan, alias];
  const muatSemua = useCallback(async () => { await Promise.all(semua.map((h) => h.muat())); }, semua.map((h) => h.muat)); // eslint-disable-line react-hooks/exhaustive-deps
  const galat = semua.map((h) => h.galat).find((g) => g !== null) ?? null;
  const potong = semua.some((h) => h.terpotong);
  const siap = !!(level.baris && jalur.baris && waktu.baris && usulan.baris && node.baris && akun.baris && satuan.baris && alias.baris);

  const ringkas = useMemo(() => ringkasStatus(usulan.baris ?? []), [usulan.baris]);
  const tampil = useMemo(() => levelTampil(level.baris ?? []), [level.baris]);
  const sub = level.baris?.find((l) => l.kode === "subkomp");

  const cocok = useCallback(async () => {
    const r = await aksiKeu<number>("keu_struktur_cocokkan");
    await muatSemua();
    return r.ok ? { ok: true, pesan: `Pencocokan dengan POK berlaku selesai: ${angka(r.data)} usulan berubah status.` } : { ok: false, pesan: r.pesan };
  }, [muatSemua]);

  return (
    <HalamanKeu jejak={[{ t: "SIGAP" }, { t: "Perencanaan" }, { t: "Anggaran" }, { t: "Tambah level mata anggaran" }]} judul="Menambah Program, Kegiatan, KRO, RO, Komponen, Subkomponen, Akun, dan Item" induk="/sigap/revisi" labelKembali="Jadwal revisi" sub="Satu prosedur untuk semua level: usul, tunjuk jalur, aktif setelah POK resmi terbit.">
      <Tenang><b>Satu prosedur untuk semua level.</b> Kode resmi selalu lahir dari POK atau DIPA resmi, bukan dari SIGAP. Karena itu, menambah level di SIGAP berarti <b>mengusulkan</b> baris dengan kode sementara (T-001, T-002, dan seterusnya), memilih jalur kewenangan yang benar, lalu menjadi <b>aktif</b> setelah POK resmi terbit dan kodenya dipadankan. Level yang lebih tinggi makin jarang menjadi inisiatif satker: Program dan Kegiatan ditetapkan pusat, KRO dan RO cukup ditambahkan PPK (hanya kertas kerja), sedangkan Komponen, Subkomponen (bila ditampilkan), Akun, dan Item diajukan tim.</Tenang>

      <KartuSubkomp sub={sub} boleh={bolehMaster} sesudah={muatSemua} />

      <div className={kisi}>
        <Kpi label="Level mata anggaran" nilai={level.baris ? angka(tampil.length) : "-"} sub={sub?.tampil ? "Subkomponen ditampilkan" : "Subkomponen tersembunyi (dapat ditampilkan)"} />
        <Kpi label="Baris usulan struktur" nilai={usulan.baris ? angka(ringkas.total) : "-"} sub={`${angka(ringkas.aktif)} sudah aktif, ${angka(ringkas.proses)} dalam proses${ringkas.akhir ? `, ${angka(ringkas.akhir)} ditutup` : ""}`} />
        <Kpi label="Jalur" nilai="3" sub="Revisi POK, DIPA jalur DJPb, DIPA jalur DJA" />
      </div>

      <Galat pesan={galat} />
      {potong && <Potong />}

      {siap ? (
        <>
          <FormTambah level={level.baris!} jalur={jalur.baris!} waktu={waktu.baris!} node={node.baris!} usulan={usulan.baris!} akun={akun.baris!} satuan={satuan.baris!} alias={alias.baris!} sesudah={muatSemua} />
          <DaftarUsulan usulan={usulan.baris!} level={level.baris!} hak={hak} node={node.baris!} boleh={bolehPpk} cocok={cocok} sesudah={muatSemua} galatBaca={usulan.galat} />
          <MatriksJalur level={level.baris!} jalur={jalur.baris!} />
        </>
      ) : <Memuat tinggi="h-64" />}
      <DelapanLangkah />
      <UbahTutupHapus />
      <RiwayatUsulan riwayat={riwayat.baris} memuat={riwayat.baris === null && !riwayat.galat} />
      <AturanStruktur />
      <YangPerluDipastikan />
    </HalamanKeu>
  );
}

export default function HalamanStruktur() {
  return (
    <Suspense fallback={null}>
      <Isi />
    </Suspense>
  );
}
