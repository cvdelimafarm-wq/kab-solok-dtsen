"use client";

// app/sigap/master/page.tsx
//
// (24 Okt 2026, tahap 14) Master data (papan 14 mockup): satu tempat untuk daftar rujukan yang dipakai semua papan: akun belanja, struktur anggaran, satuan,
// kelompok + prioritas + parameter kecukupan, waktu, skor RAB, kewenangan, dokumen kelengkapan, peran/status, dan riwayat perubahan.
// Alamat: /sigap/master?bagian=<akun|struktur|satuan|kelompok|waktu|skor|kew|pola|lain>. Hak mengubah ditegakkan basis data (keu_jaga):
// master = Admin Aplikasi dan PPK, bobot skor = PPK. Pembaca lain hanya melihat. Tanpa hapus. Logika murni: lib/keu/master.ts.

import { Suspense, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { angka, urlBaca } from "@/lib/keu/ro";
import {
  BAGIAN_MASTER, bagianMasterSah, GRUP_MASTER, kelompokDokumen, pakaiAkun, pakaiSatuan,
  type AkunMaster, type AliasSatuan, type DokMaster, type Kewenangan, type KewenanganPeran, type PeranMaster, type RiwayatRow, type SatuanMaster, type SkorRo, type SkorRow, type WaktuMaster,
} from "@/lib/keu/master";
import { Catatan, Galat, HalamanKeu, kisi, Kpi, Memuat, Potong, Tenang, tombolAktif, tombolKecil } from "../keu-ui";
import { useBacaKeu, useBoleh } from "../ro/useKeu";
import { BagianAkun, BagianSatuan, type PolaMaster } from "./Akun";
import { BagianKelompok, BagianSkor, BagianStruktur, BagianWaktu, type KelompokBelanja, type LevelStruktur, type ParamRow, type Prioritas } from "./Anggaran";
import { AturanMaster, BagianDokumen, BagianKewenangan, BagianLain, BagianRiwayat } from "./Lainnya";

type NodeMaster = { id: number; tingkat: string; kode: string; nama: string; ro_kode: string | null };
type DetailMaster = { akun_node_id: number; jumlah: number | string; satuan: string | null };

function Isi() {
  const router = useRouter();
  const sp = useSearchParams();
  const bagian = bagianMasterSah(sp.get("bagian"));
  const pilihBagian = useCallback((b: string) => router.replace(`/sigap/master?bagian=${b}`, { scroll: false }), [router]);

  const bolehMaster = useBoleh("master", null) === true;
  const bolehBobot = useBoleh("bobot", null) === true;

  const akun = useBacaKeu<AkunMaster>(urlBaca("keu_master_akun", {}, { urut: "kode", batas: 3000, kolom: ["kode", "nama", "kelompok_kode", "pola_kode", "aktif"] }));
  const pola = useBacaKeu<PolaMaster>(urlBaca("keu_master_pola_dok", {}, { urut: "urut", batas: 50 }));
  const kelompok = useBacaKeu<KelompokBelanja>(urlBaca("keu_master_kelompok", {}, { urut: "urut", batas: 20 }));
  const prioritas = useBacaKeu<Prioritas>(urlBaca("keu_master_prioritas", {}, { urut: "urut", batas: 20 }));
  const satuan = useBacaKeu<SatuanMaster>(urlBaca("keu_master_satuan", {}, { urut: "urut", batas: 200, kolom: ["kode", "arti", "pasti", "urut", "aktif"] }));
  const alias = useBacaKeu<AliasSatuan>(urlBaca("keu_master_satuan_alias", {}, { urut: "alias", batas: 1000 }));
  const param = useBacaKeu<ParamRow>(urlBaca("keu_master_param", {}, { batas: 50, kolom: ["kode", "nilai", "ket"] }));
  const waktu = useBacaKeu<WaktuMaster>(urlBaca("keu_master_waktu", {}, { urut: "urut", batas: 50, kolom: ["kode", "nama", "nilai", "nilai_tanggal", "ket", "urut"] }));
  const skor = useBacaKeu<SkorRow>(urlBaca("keu_master_skor", {}, { batas: 1, kolom: ["id", "bobot_penarikan", "bobot_volume", "bobot_cakupan", "bobot_disiplin", "ambang_baik", "ambang_cukup"] }));
  const skorRo = useBacaKeu<SkorRo>(urlBaca("keu_v_skor_ro", {}, { batas: 500, kolom: ["ro_kode", "n_penarikan", "n_volume", "n_cakupan", "n_disiplin"] }));
  const level = useBacaKeu<LevelStruktur>(urlBaca("keu_struktur_level", {}, { urut: "no", batas: 30, kolom: ["kode", "no", "nama", "istilah_sakti", "contoh", "format_ket", "induk_kode", "pengusul", "tampil"] }));
  const kew = useBacaKeu<Kewenangan>(urlBaca("keu_master_kewenangan", {}, { urut: "urut", batas: 100 }));
  const kp = useBacaKeu<KewenanganPeran>(urlBaca("keu_master_kewenangan_peran", {}, { batas: 2000 }));
  const peran = useBacaKeu<PeranMaster>(urlBaca("keu_master_peran", {}, { urut: "urut", batas: 50 }));
  const dok = useBacaKeu<DokMaster>(urlBaca("keu_master_dok", {}, { batas: 5000 }));
  const riwayat = useBacaKeu<RiwayatRow>(urlBaca("keu_v_master_riwayat", {}, { urut: "-id", batas: 100 }));

  const versi = useBacaKeu<{ id: number }>(urlBaca("keu_pok_versi", { status: "berlaku" }, { urut: "-id", batas: 1, kolom: ["id"] }));
  const idPok = versi.baris?.[0]?.id ?? null;
  const node = useBacaKeu<NodeMaster>(idPok !== null ? urlBaca("keu_v_pok_node_tampil", { versi_id: idPok }, { batas: 5000, kolom: ["id", "tingkat", "kode", "nama", "ro_kode"] }) : null);
  const detail = useBacaKeu<DetailMaster>(idPok !== null ? urlBaca("keu_pok_detail", { versi_id: idPok }, { batas: 8000, kolom: ["akun_node_id", "jumlah", "satuan"] }) : null);

  const semua = [akun, pola, kelompok, prioritas, satuan, alias, param, waktu, skor, skorRo, level, kew, kp, peran, dok, riwayat, versi, node, detail];
  const muatSemua = useCallback(async () => { await Promise.all(semua.map((h) => h.muat())); }, semua.map((h) => h.muat)); // eslint-disable-line react-hooks/exhaustive-deps
  const galat = semua.map((h) => h.galat).find((g) => g !== null) ?? null;
  // `versi` memakai batas 1 (hanya butuh yang berlaku), jadi "terpotong" miliknya selalu benar dan tidak dihitung.
  const potong = semua.some((h) => h !== versi && h.terpotong);

  const simpulAkun = useMemo(() => (node.baris ?? []).filter((n) => n.tingkat === "akun").map((n) => ({ id: n.id, kode: n.kode })), [node.baris]);
  const pakai = useMemo(() => pakaiAkun(simpulAkun, detail.baris ?? []), [simpulAkun, detail.baris]);
  const satuanPok = useMemo(() => (detail.baris ?? []).map((d) => d.satuan), [detail.baris]);
  const jumlahLevel = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of node.baris ?? []) m.set(n.tingkat, (m.get(n.tingkat) ?? 0) + 1);
    m.set("item", detail.baris?.length ?? 0);
    return m;
  }, [node.baris, detail.baris]);
  const komponen = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of node.baris ?? []) if (n.tingkat === "komponen" && !m.has(n.kode)) m.set(n.kode, n.nama);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([kode, nama]) => ({ kode, nama }));
  }, [node.baris]);
  const namaRo = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of node.baris ?? []) if (n.tingkat === "ro" && n.ro_kode) m.set(n.ro_kode, n.nama);
    return m;
  }, [node.baris]);

  // Akun yang ada di POK berlaku tetapi belum terdaftar di master (aturan M5: Admin Aplikasi menetapkan kelompok, pola, dan arti).
  const akunBelumTerdaftar = useMemo(() => {
    if (!akun.baris) return [];
    const ada = new Set(akun.baris.map((a) => a.kode));
    return [...new Set(simpulAkun.map((s) => s.kode))].filter((k) => !ada.has(k)).sort();
  }, [akun.baris, simpulAkun]);
  const nSatuanPenulisan = useMemo(() => new Set((detail.baris ?? []).map((d) => (d.satuan ?? "").trim().toUpperCase()).filter(Boolean)).size, [detail.baris]);
  const nBakuTerpakai = useMemo(() => (satuan.baris && alias.baris ? pakaiSatuan(satuanPok, satuan.baris, alias.baris).size : 0), [satuan.baris, alias.baris, satuanPok]);
  const grupDok = useMemo(() => (dok.baris && pola.baris ? kelompokDokumen(dok.baris, pola.baris) : []), [dok.baris, pola.baris]);

  const siap = (...h: { baris: unknown[] | null }[]) => h.every((x) => x.baris !== null);
  const sedangMuat = <Memuat tinggi="h-48" />;

  return (
    <HalamanKeu jejak={[{ t: "SIGAP" }, { t: "Pengaturan" }, { t: "Master data" }]} judul="Master data: akun, anggaran, dan lainnya" induk="/sigap/ro" labelKembali="Anggaran" sub="Daftar rujukan yang dipakai semua papan: akun belanja, satuan, waktu, kewenangan, pola dan lembar dokumen, peran.">
      <Tenang>Satu tempat untuk daftar rujukan yang dipakai semua papan. Papan lain membaca dari sini, jadi tidak ada daftar kedua yang harus dipelihara. Akun, nama, dan satuan diambil dari POK yang berlaku; pola dokumen, tanda dapat dibuat SIGAP, dan kewenangan dapat diubah oleh yang berhak.</Tenang>

      <div className={kisi}>
        <Kpi label="Akun belanja" nilai={akun.baris ? angka(akun.baris.length) : "-"} sub={`${angka(pakai.size)} dipakai pada POK`} />
        <Kpi label="Satuan baku" nilai={satuan.baris ? angka(satuan.baris.length) : "-"} sub={`dari ${angka(nSatuanPenulisan)} penulisan di POK (${angka(nBakuTerpakai)} baku terpakai)`} />
        <Kpi label="Jenis dokumen kelengkapan" nilai={dok.baris ? angka(dok.baris.length) : "-"} sub={`dokumen: ${angka(grupDok.filter((g) => g.sumber === "pola").length)} pola umum dan ${angka(grupDok.filter((g) => g.sumber !== "pola").length)} lembar subject matter`} />
        <Kpi label="Kewenangan" nilai={kew.baris ? angka(kew.baris.filter((k) => k.aktif).length) : "-"} sub="tindakan, dipetakan ke peran" />
      </div>

      <nav aria-label="Bagian master" className="grid gap-3 rounded-xl border border-[#DCE3EE] bg-white p-3 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
        {[1, 2, 3].map((g) => (
          <div key={g} className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#5B6B84]">{GRUP_MASTER[g]}</span>
            <div className="flex flex-wrap gap-1.5">
              {BAGIAN_MASTER.filter((b) => b.grup === g).map((b) => <button key={b.kode} type="button" aria-current={bagian === b.kode ? "page" : undefined} className={bagian === b.kode ? tombolAktif : tombolKecil} onClick={() => pilihBagian(b.kode)}>{b.nama}</button>)}
            </div>
          </div>
        ))}
      </nav>

      <Galat pesan={galat} />
      {potong && <Potong />}

      {bagian === "akun" && akunBelumTerdaftar.length > 0 && <Catatan>{akunBelumTerdaftar.length} akun ada di POK yang berlaku tetapi belum terdaftar di master: {akunBelumTerdaftar.join(", ")}. Tambahkan lewat "Tambah akun baru" di bawah (nama sesuai POK) supaya pola dokumennya dapat ditetapkan.</Catatan>}
      {bagian === "akun" && (siap(akun, pola, node, detail) ? <BagianAkun akun={akun.baris!} pola={pola.baris!} pakai={pakai} boleh={bolehMaster} sesudah={muatSemua} /> : sedangMuat)}
      {bagian === "struktur" && (siap(level, node, detail) ? <BagianStruktur level={level.baris!} jumlah={jumlahLevel} boleh={bolehMaster} sesudah={muatSemua} /> : sedangMuat)}
      {bagian === "satuan" && (siap(satuan, alias, detail) ? <BagianSatuan satuan={satuan.baris!} alias={alias.baris!} satuanPok={satuanPok} boleh={bolehMaster} sesudah={muatSemua} /> : sedangMuat)}
      {bagian === "kelompok" && (siap(kelompok, akun, prioritas, param, node, detail) ? <BagianKelompok kelompok={kelompok.baris!} akun={akun.baris!} pakai={pakai} komponen={komponen} prioritas={prioritas.baris!} param={param.baris!} boleh={bolehMaster} sesudah={muatSemua} /> : sedangMuat)}
      {bagian === "waktu" && (siap(waktu) ? <BagianWaktu waktu={waktu.baris!} boleh={bolehMaster} sesudah={muatSemua} /> : sedangMuat)}
      {bagian === "skor" && (siap(skor, skorRo) && skor.baris!.length > 0
        ? <BagianSkor key={JSON.stringify(skor.baris![0])} skor={skor.baris![0]} hasil={skorRo.baris!} namaRo={namaRo} boleh={bolehBobot} sesudah={muatSemua} />
        : siap(skor, skorRo) ? <Galat pesan="Pengaturan skor RAB belum ada di basis data." /> : sedangMuat)}
      {bagian === "kew" && (siap(kew, kp, peran) ? <BagianKewenangan kew={kew.baris!} kp={kp.baris!} peran={peran.baris!} /> : sedangMuat)}
      {bagian === "pola" && (siap(dok, pola, akun) ? <BagianDokumen dok={dok.baris!} pola={pola.baris!} akun={akun.baris!} boleh={bolehMaster} sesudah={muatSemua} /> : sedangMuat)}
      {bagian === "lain" && (siap(peran) ? <BagianLain peran={peran.baris!} /> : sedangMuat)}

      <BagianRiwayat riwayat={riwayat.baris} memuat={riwayat.baris === null && !riwayat.galat} />
      <AturanMaster />
    </HalamanKeu>
  );
}

export default function HalamanMaster() {
  return (
    <Suspense fallback={null}>
      <Isi />
    </Suspense>
  );
}
