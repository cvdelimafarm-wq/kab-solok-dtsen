"use client";

// app/sigap/kelola/master/KkMaster.tsx
//
// (7 Nov 2026, tahap C3) Master > KK master: (1) ringkasan KK per kecamatan, (2) unggah daftar KK (Excel/CSV; satu berkas boleh memuat banyak kecamatan, dipecah per
// kecamatan di browser dan diproses satu per satu) dengan pratinjau selisih yang dihitung fungsi SQL yang SAMA dengan penerapannya, (3) riwayat unggahan, (4) keputusan atas usulan pembaruan master dari lapangan (penggantian sampel yang ditandai usul).
// KK yang dipakai tag atau penggantian sampel tidak pernah dinonaktifkan; baris yang cocok diperbarui di tempat sehingga rujukan tetap sah. SQL 20261107j.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import {
  API_MASTER_KK, MAKS_BARIS_BERKAS_KK, MAKS_BARIS_KK, PETUNJUK_TEMPLAT_KK, kecamatanBerkas, kelompokKecamatan, periksaBarisKk, templatKk,
  type DataMasterKk, type HasilPeriksaKk, type HasilTerapkanKk, type ContohKk, type UsulanKk,
} from "@/lib/masterKk";
import { LABEL_ALASAN_USUL } from "@/lib/masterWilayah";
import { BTN, BTN_G, BTN_O, Chip, INPUT, Kartu, Memuat, Pesan, TD, TH } from "../../admin/ui";

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const tgl = (iso: string | null) => (iso ? new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) : "—");
const kodePendek = (k: string) => (k.length > 8 ? `…${k.slice(-8)}` : k);

async function unduhTemplat() {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(templatKk());
  ws["!cols"] = [{ wch: 20 }, { wch: 28 }, { wch: 32 }, { wch: 28 }, { wch: 12 }, { wch: 12 }];
  if (ws["A2"]) ws["A2"].z = "@";
  XLSX.utils.book_append_sheet(wb, ws, "Templat");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Petunjuk"], ...PETUNJUK_TEMPLAT_KK.map((t) => [t])]), "Petunjuk");
  XLSX.writeFile(wb, "templat_kk_master.xlsx");
}

type Berkas = { nama: string; periksa: HasilPeriksaKk };
type StatusKec = { status: "proses" | "siap" | "selesai" | "galat"; pratinjau?: HasilTerapkanKk; hasil?: HasilTerapkanKk; pesan?: string };
const adaUbah = (h: HasilTerapkanKk) => h.baru + h.berubah + h.diaktifkan + h.nonaktif > 0;
async function bacaBerkas(file: File): Promise<Berkas> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const nama = wb.SheetNames.find((n) => n.toLowerCase() !== "petunjuk") ?? wb.SheetNames[0];
  if (!nama) throw new Error("Berkas tidak berisi lembar.");
  // raw:false -> teks seperti tampil di Excel; kode 16 digit yang tersimpan sebagai angka terbaca ilmiah dan ditolak dengan petunjuk
  const baris = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[nama], { defval: "", raw: false });
  return { nama: file.name, periksa: periksaBarisKk(baris) };
}

const Contoh = ({ judul, daftar, warna }: { judul: string; daftar: ContohKk[]; warna: "ok" | "wait" | "bad" }) =>
  daftar.length === 0 ? null : (
    <div className="text-[12px] text-[#5B6B84]">
      <Chip w={warna}>{judul}</Chip>{" "}
      {daftar.map((c, i) => (
        <span key={i}>{i > 0 ? "; " : ""}{c.nama} <span className="font-mono text-[11px]">({kodePendek(c.idsubsls)})</span>{c.terpakai ? " · dipakai tag/penggantian" : ""}</span>
      ))}
    </div>
  );

export default function KkMaster() {
  const [data, setData] = useState<DataMasterKk | null>(null);
  const [galat, setGalat] = useState("");
  const [info, setInfo] = useState("");
  const [berkas, setBerkas] = useState<Berkas | null>(null);
  const [kec, setKec] = useState("");
  const [nonaktif, setNonaktif] = useState(false);
  const [membaca, setMembaca] = useState(false);
  const [pratinjau, setPratinjau] = useState<HasilTerapkanKk | null>(null);
  const [galatPratinjau, setGalatPratinjau] = useState("");
  const [menghitung, setMenghitung] = useState(false);
  const [yakin, setYakin] = useState(false);
  const [menerapkan, setMenerapkan] = useState(false);
  const [usulSibuk, setUsulSibuk] = useState<number | null>(null);
  const [usulYakin, setUsulYakin] = useState<{ id: number; putusan: "diterapkan" | "ditolak" } | null>(null);
  const [catatan, setCatatan] = useState("");
  const input = useRef<HTMLInputElement | null>(null);
  const urutan = useRef(0);
  const [multi, setMulti] = useState<Record<string, StatusKec>>({});
  const [multiSibuk, setMultiSibuk] = useState(false);

  const muat = useCallback(async () => {
    try {
      setData(await apiPortal<DataMasterKk>(API_MASTER_KK));
      setGalat("");
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Data KK master belum bisa dimuat.");
    }
  }, []);
  useEffect(() => { void muat(); }, [muat]);

  const barisSah = berkas?.periksa.baris ?? [];
  const kelompok = useMemo(() => kelompokKecamatan(barisSah), [barisSah]);
  const namaKec = useMemo(() => new Map((data?.kecamatan ?? []).map((k) => [k.kd_kec, k.kecamatan])), [data]);
  const campur = kelompok.length > 1;
  const tidakDikenal = campur ? kelompok.filter((g) => !namaKec.has(g.kd)).map((g) => g.kd) : [];
  const terlalu = kelompok.filter((g) => g.baris.length > MAKS_BARIS_KK);

  const hitung = useCallback(async (b: Berkas, kd: string, nonaktifkan: boolean) => {
    const no = ++urutan.current;
    setPratinjau(null);
    setGalatPratinjau("");
    setYakin(false);
    if (!kd || b.periksa.baris.length === 0 || b.periksa.galat_total > 0) return;
    setMenghitung(true);
    try {
      const h = await apiPortal<HasilTerapkanKk>(API_MASTER_KK, { method: "POST", body: JSON.stringify({ aksi: "pratinjau", kec: kd, berkas: b.nama, baris: b.periksa.baris, nonaktifkan }) });
      if (no === urutan.current) setPratinjau(h);
    } catch (e) {
      if (no === urutan.current) setGalatPratinjau(e instanceof Error ? e.message : "Pratinjau belum bisa dihitung.");
    } finally {
      if (no === urutan.current) setMenghitung(false);
    }
  }, []);

  /** Berkas banyak kecamatan: pratinjau dihitung satu kecamatan per panggilan (server dibatasi per kecamatan). */
  const hitungSemua = useCallback(async (b: Berkas, nonaktifkan: boolean) => {
    const no = ++urutan.current;
    setMulti({});
    setYakin(false);
    setGalatPratinjau("");
    if (b.periksa.galat_total > 0) return;
    setMultiSibuk(true);
    for (const g of kelompokKecamatan(b.periksa.baris)) {
      if (no !== urutan.current) return;
      setMulti((m) => ({ ...m, [g.kd]: { status: "proses" } }));
      try {
        const h = await apiPortal<HasilTerapkanKk>(API_MASTER_KK, { method: "POST", body: JSON.stringify({ aksi: "pratinjau", kec: g.kd, berkas: b.nama, baris: g.baris, nonaktifkan }) });
        if (no !== urutan.current) return;
        setMulti((m) => ({ ...m, [g.kd]: { status: "siap", pratinjau: h } }));
      } catch (e) {
        if (no !== urutan.current) return;
        setMulti((m) => ({ ...m, [g.kd]: { status: "galat", pesan: e instanceof Error ? e.message : "Pratinjau belum bisa dihitung." } }));
      }
    }
    if (no === urutan.current) setMultiSibuk(false);
  }, []);

  const bisaDiproses = (g: { kd: string; baris: unknown[] }[]) => g.every((x) => namaKec.has(x.kd) && x.baris.length <= MAKS_BARIS_KK);

  const kosongkan = () => { urutan.current++; setBerkas(null); setPratinjau(null); setMulti({}); setMultiSibuk(false); setYakin(false); };

  const pilihBerkas = async (f: File | undefined) => {
    if (!f) return;
    setMembaca(true);
    setInfo("");
    urutan.current++;
    setMulti({});
    setMultiSibuk(false);
    setBerkas(null);
    setPratinjau(null);
    try {
      const b = await bacaBerkas(f);
      setBerkas(b);
      const k = kecamatanBerkas(b.periksa.baris);
      const pilih = k.utama && namaKec.has(k.utama) ? k.utama : "";
      setKec(pilih);
      if (k.jumlah === 1) { if (pilih) void hitung(b, pilih, nonaktif); }
      else if (b.periksa.galat_total === 0 && bisaDiproses(kelompokKecamatan(b.periksa.baris))) void hitungSemua(b, nonaktif);
    } catch (e) {
      setBerkas({ nama: f.name, periksa: { baris: [], nomor: [], galat: [{ baris: 0, pesan: e instanceof Error ? e.message : "Berkas tidak terbaca." }], peringatan: [], dilewati: 0, galat_total: 1, peringatan_total: 0 } });
    } finally {
      setMembaca(false);
      if (input.current) input.current.value = "";
    }
  };

  const ubahKec = (kd: string) => { setKec(kd); if (berkas && !campur) void hitung(berkas, kd, nonaktif); };
  const ubahNonaktif = (v: boolean) => {
    setNonaktif(v);
    if (!berkas) return;
    if (campur) { if (berkas.periksa.galat_total === 0 && bisaDiproses(kelompok)) void hitungSemua(berkas, v); }
    else if (kec) void hitung(berkas, kec, v);
  };

  const terapkan = async () => {
    if (!berkas || !kec) return;
    setMenerapkan(true);
    setGalat("");
    try {
      const h = await apiPortal<HasilTerapkanKk>(API_MASTER_KK, { method: "POST", body: JSON.stringify({ aksi: "terapkan", kec, berkas: berkas.nama, baris: berkas.periksa.baris, nonaktifkan: nonaktif }) });
      setInfo(`Unggahan ${namaKec.get(kec) ?? kec} diterapkan: ${fmt(h.baru)} baru, ${fmt(h.berubah)} diperbarui, ${fmt(h.diaktifkan)} diaktifkan kembali${h.nonaktif ? `, ${fmt(h.nonaktif)} dinonaktifkan` : ""}.`);
      setBerkas(null);
      setPratinjau(null);
      setYakin(false);
      await muat();
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Unggahan belum bisa diterapkan.");
    } finally {
      setMenerapkan(false);
    }
  };

  const terapkanSemua = async () => {
    if (!berkas) return;
    setMenerapkan(true);
    setGalat("");
    setYakin(false);
    let baru = 0, berubah = 0, diaktifkan = 0, mati = 0, selesai = 0, gagal = 0;
    for (const g of kelompokKecamatan(berkas.periksa.baris)) {
      const pr = multi[g.kd]?.pratinjau;
      if (!pr || !adaUbah(pr)) continue;
      setMulti((m) => ({ ...m, [g.kd]: { status: "proses", pratinjau: pr } }));
      try {
        const h = await apiPortal<HasilTerapkanKk>(API_MASTER_KK, { method: "POST", body: JSON.stringify({ aksi: "terapkan", kec: g.kd, berkas: berkas.nama, baris: g.baris, nonaktifkan: nonaktif }) });
        setMulti((m) => ({ ...m, [g.kd]: { status: "selesai", pratinjau: pr, hasil: h } }));
        baru += h.baru; berubah += h.berubah; diaktifkan += h.diaktifkan; mati += h.nonaktif; selesai++;
      } catch (e) {
        gagal++;
        setMulti((m) => ({ ...m, [g.kd]: { status: "galat", pratinjau: pr, pesan: e instanceof Error ? e.message : "Belum bisa diterapkan." } }));
      }
    }
    if (selesai > 0) setInfo(`${selesai} kecamatan diterapkan: ${fmt(baru)} baru, ${fmt(berubah)} diperbarui, ${fmt(diaktifkan)} diaktifkan kembali${mati ? `, ${fmt(mati)} dinonaktifkan` : ""}.`);
    if (gagal > 0) setGalat(`${gagal} kecamatan gagal diterapkan; kecamatan lain sudah berlaku. Tekan "Hitung ulang" untuk melihat sisa selisih, lalu terapkan lagi.`);
    else kosongkan();
    await muat();
    setMenerapkan(false);
  };

  const putuskan = async (u: UsulanKk, putusan: "diterapkan" | "ditolak") => {
    setUsulSibuk(u.id);
    setGalat("");
    try {
      await apiPortal(API_MASTER_KK, { method: "POST", body: JSON.stringify({ aksi: "usul", id: u.id, putusan, catatan }) });
      setInfo(putusan === "diterapkan" ? `KK "${u.nama_kk}" dinonaktifkan di master.` : "Usulan ditolak; master tidak berubah.");
      setUsulYakin(null);
      setCatatan("");
      await muat();
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Keputusan belum bisa disimpan.");
    } finally {
      setUsulSibuk(null);
    }
  };

  const p = berkas?.periksa;
  const bolehTerapkan = !!pratinjau && !!kec && !campur && terlalu.length === 0 && !menghitung && !menerapkan && adaUbah(pratinjau);
  const semuaSiap = campur && kelompok.every((g) => multi[g.kd]?.status === "siap");
  const bolehTerapkanSemua = semuaSiap && !multiSibuk && !menerapkan && tidakDikenal.length === 0 && terlalu.length === 0 && kelompok.some((g) => { const pr = multi[g.kd]?.pratinjau; return !!pr && adaUbah(pr); });
  const perluHitungUlang = campur && !multiSibuk && !menerapkan && kelompok.some((g) => { const st = multi[g.kd]?.status; return st === "galat" || st === "selesai"; });
  const jumlahUbah = kelompok.filter((g) => { const pr = multi[g.kd]?.pratinjau; return !!pr && adaUbah(pr); }).length;
  const tampilGalat = (p?.galat ?? []).slice(0, 15);
  const tampilPeringatan = (p?.peringatan ?? []).slice(0, 8);

  return (
    <div className="flex flex-col gap-3.5">
      {galat && <Pesan>{galat}</Pesan>}
      {info && <Pesan jenis="ok" onTutup={() => setInfo("")}>{info}</Pesan>}
      {data && !data.siap && <Pesan jenis="info">Fitur KK master belum aktif di basis data (SQL 20261107j belum dijalankan). Layar ini baru bisa dipakai setelah SQL itu dijalankan.</Pesan>}

      <Kartu judul="KK per kecamatan" ket="Keluarga aktif di master, semua kegiatan memakai sumber yang sama">
        {!data && !galat && <Memuat />}
        {data && data.siap && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead><tr><th className={TH}>Kecamatan</th><th className={TH}>Sub SLS</th><th className={TH}>Sub SLS berKK</th><th className={TH}>KK aktif</th><th className={TH}>Terakhir diubah</th></tr></thead>
              <tbody>
                {data.kecamatan.map((k) => (
                  <tr key={k.kd_kec}>
                    <td className={TD}><b>{k.kecamatan}</b></td>
                    <td className={TD}>{fmt(k.subsls)}</td>
                    <td className={TD}>{fmt(k.subsls_berkk)}{k.subsls_berkk < k.subsls && <span className="ml-1.5"><Chip w="wait">{fmt(k.subsls - k.subsls_berkk)} tanpa KK</Chip></span>}</td>
                    <td className={TD}>{fmt(k.kk_aktif)}</td>
                    <td className={TD}>{tgl(k.terbaru)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Kartu>

      <Kartu judul="Unggah daftar KK" ket="Pratinjau tidak mengubah apa pun; baru berlaku setelah Anda menerapkan">
        <p className="mb-2.5 text-[12.5px] leading-relaxed text-[#5B6B84]">
          Kolom: Kode Sub SLS (16 digit, teks), Nama KK, Anggota Lain, Patokan, Latitude, Longitude. Baris yang cocok (sub SLS + nama) diperbarui di tempat; baris baru ditambahkan.
          KK yang tidak ada di berkas <b>tidak disentuh</b> kecuali Anda memilih menonaktifkannya, dan KK yang dipakai tag atau penggantian sampel tidak pernah dinonaktifkan. Satu berkas boleh memuat banyak kecamatan (maksimal {fmt(MAKS_BARIS_BERKAS_KK)} baris); sistem memprosesnya per kecamatan, paling banyak {fmt(MAKS_BARIS_KK)} baris per kecamatan.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => void pilihBerkas(e.target.files?.[0])} />
          <button type="button" className={BTN} disabled={membaca || menerapkan || !data?.siap} onClick={() => input.current?.click()}>{membaca ? "Membaca…" : "Pilih berkas"}</button>
          <button type="button" className={BTN_O} onClick={() => void unduhTemplat()}>Unduh templat</button>
          {berkas && <button type="button" className={BTN_O} disabled={menerapkan} onClick={kosongkan}>Batalkan</button>}
        </div>

        {membaca && <div className="mt-3"><Memuat teks="Membaca dan memeriksa berkas…" /></div>}

        {berkas && p && !membaca && (
          <div className="mt-3.5 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <span className="text-[#5B6B84]">{berkas.nama}</span>
              <Chip w="ok">{fmt(p.baris.length)} baris sah</Chip>
              {p.galat_total > 0 && <Chip w="bad">{fmt(p.galat_total)} galat</Chip>}
              {p.peringatan_total > 0 && <Chip w="wait">{fmt(p.peringatan_total)} peringatan</Chip>}
              {p.dilewati > 0 && <Chip w="mut">{fmt(p.dilewati)} baris kosong dilewati</Chip>}
            </div>

            {tampilGalat.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-[#DDE6F3]">
                <table className="w-full border-collapse text-[12.5px]">
                  <thead><tr><th className={TH}>Baris</th><th className={TH}>Galat (baris tidak dimasukkan)</th></tr></thead>
                  <tbody>{tampilGalat.map((g, i) => <tr key={i}><td className={TD}>{g.baris || "—"}</td><td className={TD}>{g.pesan}</td></tr>)}</tbody>
                </table>
                {p.galat_total > tampilGalat.length && <div className="border-t border-[#DDE6F3] px-3 py-2 text-[12px] text-[#6B7A90]">Menampilkan {tampilGalat.length} dari {fmt(p.galat_total)} galat.</div>}
              </div>
            )}
            {p.galat_total > 0 && p.baris.length > 0 && <Pesan jenis="peringatan">Berkas yang masih memuat galat tidak bisa diterapkan. Perbaiki baris di atas lalu unggah ulang.</Pesan>}
            {tampilPeringatan.length > 0 && (
              <details className="rounded-xl border border-[#DDE6F3] bg-[#F9FBFE] px-3 py-2 text-[12.5px]">
                <summary className="cursor-pointer font-semibold text-[#8A6200]">{fmt(p.peringatan_total)} peringatan (tetap masuk)</summary>
                <ul className="mt-1.5 list-disc pl-5 text-[#5B6B84]">{tampilPeringatan.map((g, i) => <li key={i}>Baris {g.baris}: {g.pesan}</li>)}</ul>
              </details>
            )}

            {p.baris.length > 0 && p.galat_total === 0 && (
              <>
                {terlalu.length > 0 && <Pesan>{terlalu.map((g) => `${namaKec.get(g.kd) ?? g.kd} memuat ${fmt(g.baris.length)} baris`).join("; ")}; batasnya {fmt(MAKS_BARIS_KK)} baris per kecamatan. Bagi berkasnya lalu unggah ulang.</Pesan>}
                {campur && tidakDikenal.length > 0 && <Pesan>Kode kecamatan tidak ada di master wilayah: {tidakDikenal.join(", ")}. Periksa 7 digit pertama Kode Sub SLS, lalu unggah ulang.</Pesan>}
                {campur && (
                  <div className="flex flex-col gap-2.5">
                    <div className="text-[12.5px] text-[#5B6B84]">Berkas memuat <b>{fmt(kelompok.length)} kecamatan</b>; masing-masing dihitung dan diterapkan satu per satu.</div>
                    <label className="flex items-start gap-2 text-[12.5px] font-semibold text-[#5B6B84]">
                      <input type="checkbox" className="mt-0.5" checked={nonaktif} onChange={(e) => ubahNonaktif(e.target.checked)} disabled={multiSibuk || menerapkan} />
                      <span>Nonaktifkan KK di sub SLS yang muncul di berkas tetapi KK-nya tidak ada di berkas <span className="font-normal">(KK terpakai tag/penggantian dilewati)</span></span>
                    </label>
                    <div className="overflow-x-auto rounded-xl border border-[#DDE6F3]">
                      <table className="w-full border-collapse text-[12.5px]">
                        <thead><tr><th className={TH}>Kecamatan</th><th className={TH}>Baris</th><th className={TH}>Selisih dengan master</th></tr></thead>
                        <tbody>
                          {kelompok.map((g) => {
                            const st = multi[g.kd];
                            const pr = st?.pratinjau;
                            return (
                              <tr key={g.kd}>
                                <td className={TD}><b>{namaKec.get(g.kd) ?? g.kd}</b>{!namaKec.has(g.kd) && <span className="ml-1.5"><Chip w="bad">tidak dikenal</Chip></span>}</td>
                                <td className={TD}>{fmt(g.baris.length)}{g.baris.length > MAKS_BARIS_KK && <span className="ml-1.5"><Chip w="bad">melebihi batas</Chip></span>}</td>
                                <td className={TD}>
                                  {!st && <Chip w="mut">{multiSibuk ? "Menunggu giliran" : "Belum dihitung"}</Chip>}
                                  {st?.status === "proses" && <Chip w="wait">{menerapkan ? "Menerapkan…" : "Menghitung…"}</Chip>}
                                  {st?.status === "galat" && <span className="text-[#B4261E]">{st.pesan}</span>}
                                  {st?.status === "selesai" && st.hasil && <Chip w="ok">Diterapkan: {fmt(st.hasil.baru)} baru, {fmt(st.hasil.berubah)} diperbarui{st.hasil.diaktifkan ? `, ${fmt(st.hasil.diaktifkan)} diaktifkan` : ""}{st.hasil.nonaktif ? `, ${fmt(st.hasil.nonaktif)} dinonaktifkan` : ""}</Chip>}
                                  {st?.status === "siap" && pr && (
                                    <span className="flex flex-wrap items-center gap-1.5">
                                      <Chip w={pr.baru ? "ok" : "mut"}>{fmt(pr.baru)} baru</Chip>
                                      <Chip w={pr.berubah ? "wait" : "mut"}>{fmt(pr.berubah)} diperbarui</Chip>
                                      {pr.diaktifkan > 0 && <Chip w="ok">{fmt(pr.diaktifkan)} diaktifkan kembali</Chip>}
                                      <Chip w="mut">{fmt(pr.sama)} tetap</Chip>
                                      {pr.hilang > 0 && <Chip w="wait">{fmt(pr.hilang)} tidak ada di berkas</Chip>}
                                      {nonaktif && pr.nonaktif > 0 && <Chip w="bad">{fmt(pr.nonaktif)} akan dinonaktifkan</Chip>}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {semuaSiap && jumlahUbah === 0 && <div className="text-[12.5px] text-[#6B7A90]">Berkas ini sama persis dengan master; tidak ada yang perlu diterapkan.</div>}
                    <div className="flex flex-wrap items-center gap-2">
                      {!yakin ? (
                        <button type="button" className={BTN_G} disabled={!bolehTerapkanSemua} onClick={() => setYakin(true)}>Terapkan ke master ({fmt(jumlahUbah)} kecamatan)</button>
                      ) : (
                        <>
                          <span className="text-[12.5px] font-semibold text-[#8A6200]">Yakin menerapkan ke {fmt(jumlahUbah)} kecamatan?</span>
                          <button type="button" className={BTN_G} disabled={menerapkan} onClick={() => void terapkanSemua()}>{menerapkan ? "Menerapkan…" : "Ya, terapkan"}</button>
                          <button type="button" className={BTN_O} disabled={menerapkan} onClick={() => setYakin(false)}>Batal</button>
                        </>
                      )}
                      {perluHitungUlang && <button type="button" className={BTN_O} onClick={() => void hitungSemua(berkas, nonaktif)}>Hitung ulang</button>}
                    </div>
                  </div>
                )}
                {!campur && <>
                <label className="flex max-w-xs flex-col gap-1 text-[12px] font-semibold text-[#5B6B84]">
                  Kecamatan *
                  <select className={INPUT} value={kec} onChange={(e) => ubahKec(e.target.value)}>
                    <option value="">— pilih —</option>
                    {(data?.kecamatan ?? []).map((k) => <option key={k.kd_kec} value={k.kd_kec}>{k.kecamatan}</option>)}
                  </select>
                </label>
                <label className="flex items-start gap-2 text-[12.5px] font-semibold text-[#5B6B84]">
                  <input type="checkbox" className="mt-0.5" checked={nonaktif} onChange={(e) => ubahNonaktif(e.target.checked)} />
                  <span>Nonaktifkan KK di sub SLS ini yang tidak ada di berkas <span className="font-normal">(hanya sub SLS yang muncul di berkas; KK terpakai tag/penggantian dilewati)</span></span>
                </label>

                {menghitung && <Memuat teks="Menghitung selisih dengan master…" />}
                {galatPratinjau && <Pesan>{galatPratinjau}</Pesan>}
                {pratinjau && (
                  <div className="rounded-xl border border-[#DDE6F3] bg-[#F9FBFE] p-3 text-[12.5px]">
                    <div className="mb-1.5 font-bold text-[#0F2A52]">Selisih dengan master {namaKec.get(kec) ?? ""}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip w={pratinjau.baru ? "ok" : "mut"}>{fmt(pratinjau.baru)} baru</Chip>
                      <Chip w={pratinjau.berubah ? "wait" : "mut"}>{fmt(pratinjau.berubah)} diperbarui</Chip>
                      {pratinjau.diaktifkan > 0 && <Chip w="ok">{fmt(pratinjau.diaktifkan)} diaktifkan kembali</Chip>}
                      <Chip w="mut">{fmt(pratinjau.sama)} tetap</Chip>
                      <Chip w={pratinjau.hilang ? "wait" : "mut"}>{fmt(pratinjau.hilang)} tidak ada di berkas</Chip>
                      {nonaktif && <Chip w={pratinjau.nonaktif ? "bad" : "mut"}>{fmt(pratinjau.nonaktif)} akan dinonaktifkan</Chip>}
                      {pratinjau.hilang_terpakai > 0 && <Chip w="navy">{fmt(pratinjau.hilang_terpakai)} dipakai tag/penggantian</Chip>}
                    </div>
                    <div className="mt-2 flex flex-col gap-1">
                      <Contoh judul="Contoh baru" daftar={pratinjau.contoh.baru} warna="ok" />
                      <Contoh judul="Contoh diperbarui" daftar={pratinjau.contoh.berubah} warna="wait" />
                      <Contoh judul="Contoh tidak ada di berkas" daftar={pratinjau.contoh.hilang} warna="bad" />
                    </div>
                    {pratinjau.baru + pratinjau.berubah + pratinjau.diaktifkan + pratinjau.nonaktif === 0 && <div className="mt-2 text-[#6B7A90]">Berkas ini sama persis dengan master; tidak ada yang perlu diterapkan.</div>}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {!yakin ? (
                    <button type="button" className={BTN_G} disabled={!bolehTerapkan} onClick={() => setYakin(true)}>Terapkan ke master</button>
                  ) : (
                    <>
                      <span className="text-[12.5px] font-semibold text-[#8A6200]">Yakin menerapkan ke master {namaKec.get(kec) ?? ""}?</span>
                      <button type="button" className={BTN_G} disabled={menerapkan} onClick={() => void terapkan()}>{menerapkan ? "Menerapkan…" : "Ya, terapkan"}</button>
                      <button type="button" className={BTN_O} disabled={menerapkan} onClick={() => setYakin(false)}>Batal</button>
                    </>
                  )}
                </div>
                </>}
              </>
            )}
          </div>
        )}
      </Kartu>

      {data?.siap && (
        <Kartu judul="Usulan pembaruan dari lapangan" ket="Dari penggantian sampel yang ditandai usul pembaruan master (hanya yang sudah disetujui bisa diputuskan)">
          {!data.usulan_siap && <Pesan jenis="info">Kolom keputusan usulan belum ada (SQL 20261107j belum dijalankan penuh).</Pesan>}
          {data.usulan_siap && data.usulan.length === 0 && <p className="text-[12.5px] text-[#6B7A90]">Tidak ada usulan yang menunggu keputusan.</p>}
          {data.usulan.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12.5px]">
                <thead><tr><th className={TH}>KK diusulkan nonaktif</th><th className={TH}>Wilayah</th><th className={TH}>Alasan</th><th className={TH}>Kegiatan · pengusul</th><th className={TH}>Status</th><th className={TH}></th></tr></thead>
                <tbody>
                  {data.usulan.map((u) => (
                    <tr key={u.id}>
                      <td className={TD}><b>{u.nama_kk || "—"}</b></td>
                      <td className={TD}>{u.sls} · {u.nagari}<div className="text-[11.5px] text-[#6B7A90]">{u.kecamatan} · <span className="font-mono">{kodePendek(u.idsubsls)}</span></div></td>
                      <td className={TD}>{LABEL_ALASAN_USUL[u.alasan] ?? u.alasan}</td>
                      <td className={TD}>{u.kegiatan}<div className="text-[11.5px] text-[#6B7A90]">{u.diajukan_nama ?? "—"} · {tgl(u.diajukan_at)}</div></td>
                      <td className={TD}>{u.status === "disetujui" ? <Chip w="ok">Penggantian disetujui</Chip> : <Chip w="wait">Menunggu persetujuan penggantian</Chip>}</td>
                      <td className={TD}>
                        {u.status === "disetujui" && (usulYakin?.id === u.id ? (
                          <span className="flex flex-col gap-1.5">
                            <input className={INPUT} maxLength={500} placeholder="Catatan (opsional)" value={catatan} onChange={(e) => setCatatan(e.target.value)} />
                            <span className="inline-flex gap-1.5">
                              <button type="button" className={usulYakin.putusan === "diterapkan" ? BTN : BTN_O} disabled={usulSibuk === u.id} onClick={() => void putuskan(u, usulYakin.putusan)}>{usulYakin.putusan === "diterapkan" ? "Ya, nonaktifkan di master" : "Ya, tolak usulan"}</button>
                              <button type="button" className={BTN_O} onClick={() => setUsulYakin(null)}>Batal</button>
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex gap-1.5">
                            <button type="button" className={BTN} disabled={usulSibuk === u.id} onClick={() => { setUsulYakin({ id: u.id, putusan: "diterapkan" }); setCatatan(""); }}>Terapkan</button>
                            <button type="button" className={BTN_O} disabled={usulSibuk === u.id} onClick={() => { setUsulYakin({ id: u.id, putusan: "ditolak" }); setCatatan(""); }}>Tolak</button>
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Kartu>
      )}

      <Kartu judul="Riwayat unggahan KK" ket="40 terakhir">
        {!data && !galat && <Memuat />}
        {data?.siap && data.riwayat.length === 0 && <p className="text-[12.5px] text-[#6B7A90]">Belum ada unggahan. Master awal berasal dari data pendataan pascabencana.</p>}
        {data?.siap && data.riwayat.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead><tr><th className={TH}>Waktu</th><th className={TH}>Kecamatan</th><th className={TH}>Berkas</th><th className={TH}>Oleh</th><th className={TH}>Hasil</th></tr></thead>
              <tbody>
                {data.riwayat.map((r) => (
                  <tr key={r.id}>
                    <td className={TD}>{tgl(r.dibuat_at)}</td>
                    <td className={TD}>{r.kecamatan}</td>
                    <td className={TD}>{r.nama_berkas || "—"}<div className="text-[11.5px] text-[#6B7A90]">{fmt(r.jumlah_baris)} baris</div></td>
                    <td className={TD}>{r.oleh || "—"}</td>
                    <td className={`${TD} text-[11.5px] text-[#5B6B84]`}>{fmt(r.baru)} baru · {fmt(r.berubah)} diperbarui · {fmt(r.sama)} tetap{r.diaktifkan ? ` · ${fmt(r.diaktifkan)} diaktifkan` : ""}{r.nonaktifkan_hilang ? ` · ${fmt(r.nonaktif)} dinonaktifkan` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Kartu>
    </div>
  );
}
