"use client";

// app/sigap/pelatihan/kelola/hierarki.tsx
//
// (2 Nov 2026) Tab "Tim & Peserta" di Kelola Pelatihan: hierarki instruktur > korwil > PML > PPL (satu kartu) dan Kelas (perencanaan, hanya baca) sebagai pilihan bagian.
// Penyimpanan atasan/peran BERJALAN DI LATAR BELAKANG per baris: pilihan langsung tampil, tidak ada yang dikunci, tidak ada muat ulang; gagal -> baris kembali ke nilai
// tersimpan. Status penyimpanan (Menyimpan, Tersimpan, galat) tampil sebagai pemberitahuan di POJOK KANAN BAWAH layar (Toast), bukan di baris. Impor dari template Excel (lib/hierarkiImpor.ts) dengan pratinjau sebelum diterapkan. API: /api/sigap/pelatihan/hierarki.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bacaSesi, fetchJson, pesanGalat, SesiBerakhir, urlPelatihan } from "../../admin/api";
import { BTN, BTN_O, Chip, INPUT, Kartu, Memuat, Pesan, TD, TH } from "../../admin/ui";
import { Toast, useToast } from "../../admin/Toast";
import { LABEL_PERAN_PELATIHAN, periksaHierarki, type PeranPelatihan, type SimpulHierarki } from "@/lib/hierarkiPelatihan";
import { PETUNJUK_TEMPLATE, bacaImpor, barisTemplate, type HasilImpor } from "@/lib/hierarkiImpor";
import type { SelisihTim } from "@/lib/hierarkiSelaras";
import KelasIdentKelola from "./kelasIdent";
import InstrukturKelola from "./instruktur";
import PengaturanKelasKelola from "./pengaturanKelas";
import { ChipSetelan, PilihSub, useSub, type ItemSub } from "./GrupTab";
import SelectCari from "@/app/components/SelectCari";

// (7 Nov 2026) `tim` = kegiatan saudara sumber alokasi Stage 1; `selisih_tim` = peserta yang atasannya di sini berbeda dari Tim
type Data = { tersedia: boolean; simpul: SimpulHierarki[]; boleh_kelola: boolean; tim: { kegiatan_id: number; nama: string } | null; selisih_tim: SelisihTim[] };

const URUT_PERAN: Record<PeranPelatihan, number> = { korwil: 0, pml: 1, ppl: 2 };
const ASAL: Record<NonNullable<SimpulHierarki["asal"]>, { teks: string; w: "mut" | "ok" | "wait" }> = {
  bawaan: { teks: "Bawaan", w: "mut" },
  salinan: { teks: "Salinan PSP", w: "ok" },
  manual: { teks: "Diubah", w: "wait" },
};

const SUB: ItemSub[] = [
  { kode: "pengaturan", label: "Pengaturan kelas", ket: "Jumlah dan nama kelas, siapa peserta tiap kelas, instruktur, dan panitia. Semua pilihan kelas di Adu Sigap dan Monitoring mengikuti ini." },
  { kode: "hierarki", label: "Hierarki", ket: "Siapa melapor kepada siapa. Menentukan siapa yang dapat memantau progres siapa di Hari H › Monitoring peserta." },
  { kode: "instruktur", label: "Instruktur", ket: "Tetapkan instruktur per kelas, tanpa SQL." },
  { kode: "kelas", label: "Rencana kelas", ket: "Kelas menurut perencanaan (hanya baca)." },
];

/** (8 Nov 2026) diekspor agar tab Peserta & Kelas dapat menyusunnya sebagai satu bagian. */
export function KartuHierarki() {
  const [d, setD] = useState<Data | null>(null);
  const [simpul, setSimpul] = useState<SimpulHierarki[]>([]);
  const [galat, setGalat] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const toast = useToast();
  const berjalan = useRef(0); // jumlah penyimpanan yang sedang berjalan (antar-baris paralel)
  const [menyalin, setMenyalin] = useState(false);
  const [impor, setImpor] = useState<(HasilImpor & { nama: string }) | null>(null);
  const [menerapkan, setMenerapkan] = useState(false);
  const [menyamakan, setMenyamakan] = useState(false);

  // nilai terakhir yang SUDAH tersimpan di server, per akun (untuk mengembalikan baris bila gagal); antrean simpan per akun
  const tersimpan = useRef(new Map<number, SimpulHierarki>());
  const terkini = useRef<SimpulHierarki[]>([]);
  const antrean = useRef(new Map<number, Promise<void>>());
  terkini.current = simpul;

  const muat = useCallback(async () => {
    try {
      const r = await fetchJson<Data & { masalah?: unknown }>(urlPelatihan("/api/sigap/pelatihan/hierarki"));
      setD({ tersedia: r.tersedia, simpul: r.simpul, boleh_kelola: r.boleh_kelola, tim: r.tim ?? null, selisih_tim: r.selisih_tim ?? [] });
      setSimpul(r.simpul);
      tersimpan.current = new Map(r.simpul.map((s) => [s.akun_id, s]));
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    if (!bacaSesi()) return;
    void muat();
  }, [muat]);

  const urut = useMemo(() => [...simpul].sort((a, b) => URUT_PERAN[a.peran] - URUT_PERAN[b.peran] || a.nama.localeCompare(b.nama)), [simpul]);
  const nama = useMemo(() => new Map(simpul.map((s) => [s.akun_id, s.nama])), [simpul]);
  const masalah = useMemo(() => periksaHierarki(simpul), [simpul]);
  const hitung = useMemo(() => {
    const h = { bawaan: 0, salinan: 0, manual: 0 };
    for (const s of simpul) h[s.asal ?? "bawaan"]++;
    return h;
  }, [simpul]);

  /** Peserta yang (langsung maupun tidak) berada di bawah `id`: tidak boleh dipilih sebagai atasan `id` (akan melingkar). */
  const keturunan = useCallback((id: number): Set<number> => {
    const hasil = new Set<number>();
    const peta = new Map(terkini.current.map((s) => [s.akun_id, s.atasan_akun_id]));
    for (const s of terkini.current) {
      const lihat = new Set<number>();
      let x: number | null = s.atasan_akun_id;
      while (x !== null && !lihat.has(x)) {
        if (x === id) {
          hasil.add(s.akun_id);
          break;
        }
        lihat.add(x);
        x = peta.get(x) ?? null;
      }
    }
    return hasil;
  }, []);

  /** Ubah baris di layar SEKETIKA, lalu simpan di latar belakang (diurutkan per baris, antar-baris paralel). */
  function ubah(akunId: number, patch: Partial<Pick<SimpulHierarki, "atasan_akun_id" | "peran">>) {
    // `terkini` diperbarui SEKETIKA (bukan menunggu render) supaya pengiriman di latar belakang membaca nilai terbaru
    terkini.current = terkini.current.map((s) => (s.akun_id === akunId ? { ...s, ...patch, asal: "manual" as const } : s));
    setSimpul(terkini.current);
    berjalan.current += 1;
    toast.tampil("simpan", berjalan.current > 1 ? `Menyimpan ${berjalan.current} perubahan…` : "Menyimpan…");
    const sebelum = antrean.current.get(akunId) ?? Promise.resolve();
    const kerja = sebelum.then(async () => {
      const baris = terkini.current.find((s) => s.akun_id === akunId);
      if (!baris) {
        berjalan.current = Math.max(0, berjalan.current - 1);
        return;
      }
      try {
        await fetchJson(urlPelatihan("/api/sigap/pelatihan/hierarki"), { method: "POST", body: JSON.stringify({ aksi: "atur", akun_id: akunId, atasan_akun_id: baris.atasan_akun_id, peran: baris.peran }) });
        tersimpan.current.set(akunId, baris);
        berjalan.current = Math.max(0, berjalan.current - 1);
        if (berjalan.current === 0) toast.tampil("ok", "Tersimpan");
        else toast.tampil("simpan", berjalan.current > 1 ? `Menyimpan ${berjalan.current} perubahan…` : "Menyimpan…");
      } catch (e) {
        berjalan.current = Math.max(0, berjalan.current - 1);
        const asli = tersimpan.current.get(akunId);
        if (asli) {
          terkini.current = terkini.current.map((s) => (s.akun_id === akunId ? asli : s));
          setSimpul(terkini.current);
        }
        const siapa = terkini.current.find((s) => s.akun_id === akunId)?.nama ?? "Peserta";
        toast.tampil("galat", `${siapa}: tidak tersimpan, dikembalikan ke nilai sebelumnya. ${e instanceof SesiBerakhir ? "Sesi berakhir, masuk kembali." : pesanGalat(e)}`);
      }
    });
    antrean.current.set(akunId, kerja);
  }

  async function salin() {
    setMenyalin(true);
    setGalat(null);
    setOk(null);
    try {
      const r = await fetchJson<{ ditambah?: number }>(urlPelatihan("/api/sigap/pelatihan/hierarki"), { method: "POST", body: JSON.stringify({ aksi: "salin" }) });
      setOk(`Disalin dari data PSP: ${Number(r.ditambah ?? 0)} peserta ditambahkan (yang sudah ada tidak diubah).`);
      await muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setMenyalin(false);
    }
  }

  async function samakanTim() {
    setMenyamakan(true);
    setGalat(null);
    setOk(null);
    try {
      const r = await fetchJson<{ diterapkan?: number; dilewati?: number }>(urlPelatihan("/api/sigap/pelatihan/hierarki"), { method: "POST", body: JSON.stringify({ aksi: "samakan_tim" }) });
      setOk(`Atasan disamakan dengan Tim: ${Number(r.diterapkan ?? 0)} peserta diperbarui${Number(r.dilewati ?? 0) > 0 ? `, ${Number(r.dilewati)} dilewati (atasan Tim bukan peserta pelatihan ini)` : ""}.`);
      await muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setMenyamakan(false);
    }
  }

  async function unduhTemplate() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(barisTemplate(terkini.current));
    ws["!cols"] = [{ wch: 5 }, { wch: 34 }, { wch: 9 }, { wch: 7 }, { wch: 34 }];
    XLSX.utils.book_append_sheet(wb, ws, "Hierarki");
    const wp = XLSX.utils.aoa_to_sheet(PETUNJUK_TEMPLATE.map((t) => [t]));
    wp["!cols"] = [{ wch: 120 }];
    XLSX.utils.book_append_sheet(wb, wp, "Petunjuk");
    XLSX.writeFile(wb, "Template_Hierarki_Pelatihan.xlsx");
  }

  async function bacaBerkas(f: File | undefined) {
    if (!f) return;
    setGalat(null);
    setOk(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const lembar = wb.SheetNames.find((n) => n.toLowerCase() === "hierarki") ?? wb.SheetNames[0];
      const baris = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[lembar], { header: 1, defval: "", blankrows: true });
      setImpor({ ...bacaImpor(baris, terkini.current), nama: f.name });
    } catch {
      setGalat("Berkas tidak dapat dibaca. Gunakan template .xlsx dari tombol Unduh template.");
    }
  }

  async function terapkan() {
    if (!impor || impor.perubahan.length === 0) return;
    setMenerapkan(true);
    setGalat(null);
    try {
      const r = await fetchJson<{ diterapkan?: number }>(urlPelatihan("/api/sigap/pelatihan/hierarki"), {
        method: "POST",
        body: JSON.stringify({ aksi: "impor", perubahan: impor.perubahan.map((p) => ({ akun_id: p.akun_id, atasan_akun_id: p.atasan_akun_id, peran: p.peran })) }),
      });
      setOk(`Impor diterapkan: ${Number(r.diterapkan ?? 0)} peserta diperbarui.`);
      setImpor(null);
      await muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setMenerapkan(false);
    }
  }

  if (!d && !galat) return <Memuat />;
  if (!d) return <Pesan jenis="galat">{galat}</Pesan>;
  const bisa = d.boleh_kelola;

  return (
    <Kartu
      judul="Hierarki peserta"
      ket={`${simpul.length} peserta · instruktur > korwil > PML > PPL`}
      kanan={
        <span className="flex flex-wrap gap-1.5">
          <ChipSetelan diubah={hitung.manual > 0} teksDiubah={`${hitung.manual} diubah`} teksBawaan="Semua bawaan" />
          {hitung.salinan > 0 && <Chip w="ok">{hitung.salinan} salinan PSP</Chip>}
        </span>
      }
    >
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      {ok && <Pesan jenis="ok">{ok}</Pesan>}
      {!d.tersedia && <Pesan jenis="peringatan">Hierarki belum disusun. Isi lewat tabel, impor template, atau salin dari data PSP.</Pesan>}
      {(masalah.siklus.length > 0 || masalah.atasan_asing.length > 0) && (
        <Pesan jenis="galat">
          {masalah.siklus.length > 0 && `${masalah.siklus.length} peserta memiliki rantai atasan melingkar. `}
          {masalah.atasan_asing.length > 0 && `${masalah.atasan_asing.length} peserta memiliki atasan yang bukan peserta pelatihan ini.`}
        </Pesan>
      )}
      {d.tim && d.selisih_tim.length > 0 && (
        <div className="mb-3 rounded-xl border border-[#F0D58A] bg-[#FFF8E6] p-3" aria-label="Selisih dengan Tim">
          <b className="text-[13.5px] text-[#7A5B00]">
            {d.selisih_tim.length} peserta atasannya berbeda dari Tim (alokasi Stage 1: {d.tim.nama})
          </b>
          <ul className="mt-1.5 max-h-48 space-y-1 overflow-y-auto text-[12.5px] text-[#4D3B00]">
            {d.selisih_tim.map((x) => (
              <li key={x.akun_id}>
                <b>{x.nama}</b> · di sini: {x.atasan_sekarang_nama ?? "tanpa atasan"} → menurut Tim: {x.atasan_tim_nama ?? "bukan peserta pelatihan ini"}
                {!x.bisa && <span className="text-[#B42329]"> (tidak bisa diterapkan)</span>}
                {x.bisa && x.atasan_ppl && <span className="text-[#B45A00]"> (atasan itu berperan PPL di pelatihan ini, periksa perannya)</span>}
              </li>
            ))}
          </ul>
          {bisa && d.selisih_tim.some((x) => x.bisa) && (
            <button type="button" className={`${BTN} mt-2`} disabled={menyamakan} onClick={samakanTim}>
              {menyamakan ? "Menyamakan…" : `Samakan ${d.selisih_tim.filter((x) => x.bisa).length} atasan dengan Tim`}
            </button>
          )}
        </div>
      )}
      {d.tim && d.selisih_tim.length === 0 && simpul.length > 0 && <p className="mb-2 text-[12.5px] text-[#2E7D32]">Atasan sudah sama dengan Tim (alokasi Stage 1: {d.tim.nama}).</p>}
      {masalah.tanpa_atasan.length > 0 && <p className="mb-2 text-[12.5px] text-[#6B7A90]">{masalah.tanpa_atasan.length} PML/PPL belum punya atasan: hanya instruktur dan panitia yang melihat progres mereka.</p>}

      {bisa && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-[#F3F6FB] p-2.5">
          <button type="button" className={BTN_O} onClick={unduhTemplate}>
            ⬇ Unduh template
          </button>
          <label className={`${BTN_O} cursor-pointer`}>
            ⬆ Unggah template (.xlsx)
            <input
              type="file"
              accept=".xlsx,.xls"
              className="sr-only"
              onChange={(e) => {
                void bacaBerkas(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {!d.tim && (
            <button type="button" className={BTN_O} disabled={menyalin} onClick={salin}>
              {menyalin ? "Menyalin…" : "Salin atasan dari data PSP"}
            </button>
          )}
          <span className="text-[12px] text-[#6B7A90]">
            {d.tim ? `Acuan atasan: Tim (alokasi Stage 1) ${d.tim.nama}; selisihnya ditandai di atas.` : "Salinan PSP hanya titik awal (untuk Seruti sering belum lengkap)."} Perubahan di tabel tersimpan otomatis.
          </span>
        </div>
      )}

      {impor && (
        <div className="mb-3 rounded-xl border border-[#DDE6F3] p-3" aria-label="Pratinjau impor">
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-[13.5px] text-[#0F2A52]">Pratinjau impor · {impor.nama}</b>
            <Chip w="ok">{impor.perubahan.length} akan diubah</Chip>
            <Chip w="mut">{impor.sama} sama</Chip>
            {impor.galat.length > 0 && <Chip w="bad">{impor.galat.length} bermasalah</Chip>}
          </div>
          {impor.perubahan.length > 0 && (
            <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-[12.5px]">
              {impor.perubahan.map((p) => (
                <li key={p.akun_id}>
                  <b>{p.nama}</b>
                  {p.peran !== p.sebelumnya.peran && (
                    <span>
                      {" "}
                      · peran {LABEL_PERAN_PELATIHAN[p.sebelumnya.peran]} → {LABEL_PERAN_PELATIHAN[p.peran]}
                    </span>
                  )}
                  {p.atasan_nama !== p.sebelumnya.atasan_nama && (
                    <span>
                      {" "}
                      · atasan {p.sebelumnya.atasan_nama ?? "tanpa atasan"} → {p.atasan_nama ?? "tanpa atasan"}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {impor.galat.length > 0 && (
            <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-[12.5px] text-[#B42329]">
              {impor.galat.map((g, i) => (
                <li key={i}>
                  Baris {g.baris}: {g.pesan}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[12px] text-[#6B7A90]">Baris bermasalah tidak diterapkan; baris lain tetap bisa diterapkan.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={BTN} onClick={terapkan} disabled={menerapkan || impor.perubahan.length === 0}>
              {menerapkan ? "Menerapkan…" : `Terapkan ${impor.perubahan.length} perubahan`}
            </button>
            <button type="button" className={BTN_O} onClick={() => setImpor(null)} disabled={menerapkan}>
              Batal
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={TH}>Nama</th>
              <th className={TH}>Peran</th>
              <th className={TH}>Kelas</th>
              <th className={TH}>Atasan</th>
              <th className={TH}>Setelan</th>
            </tr>
          </thead>
          <tbody>
            {urut.map((s) => {
              const turunan = bisa ? keturunan(s.akun_id) : new Set<number>();
              const asal = ASAL[s.asal ?? "bawaan"];
              return (
                <tr key={s.akun_id}>
                  <td className={TD}>
                    {s.nama}
                    {s.tersembunyi && (
                      <span className="ml-1.5">
                        <Chip w="bad">Menolak undangan</Chip>
                      </span>
                    )}
                  </td>
                  <td className={TD}>
                    {bisa ? (
                      <SelectCari className={INPUT} value={s.peran} aria-label={`Peran ${s.nama}`} onChange={(e) => ubah(s.akun_id, { peran: e.target.value as PeranPelatihan })}>
                        {(["korwil", "pml", "ppl"] as PeranPelatihan[]).map((p) => (
                          <option key={p} value={p}>
                            {LABEL_PERAN_PELATIHAN[p]}
                          </option>
                        ))}
                      </SelectCari>
                    ) : (
                      LABEL_PERAN_PELATIHAN[s.peran]
                    )}
                  </td>
                  <td className={TD}>{s.kelas ?? "–"}</td>
                  <td className={TD}>
                    {bisa ? (
                      <SelectCari
                        className={`${INPUT} max-w-[220px]`}
                        value={s.atasan_akun_id ?? ""}
                        aria-label={`Atasan ${s.nama}`}
                        onChange={(e) => ubah(s.akun_id, { atasan_akun_id: e.target.value === "" ? null : Number(e.target.value) })}
                      >
                        <option value="">(tanpa atasan)</option>
                        {urut
                          .filter((x) => x.akun_id !== s.akun_id)
                          .map((x) => (
                            <option key={x.akun_id} value={x.akun_id} disabled={turunan.has(x.akun_id)}>
                              {x.nama} ({LABEL_PERAN_PELATIHAN[x.peran]}){turunan.has(x.akun_id) ? " – bawahan Anda" : ""}
                            </option>
                          ))}
                      </SelectCari>
                    ) : (
                      (s.atasan_akun_id !== null ? nama.get(s.atasan_akun_id) : null) ?? "–"
                    )}
                  </td>
                  <td className={TD}>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Chip w={asal.w}>{asal.teks}</Chip>
                    </span>
                  </td>
                </tr>
              );
            })}
            {urut.length === 0 && (
              <tr>
                <td className={TD} colSpan={5}>
                  Belum ada peserta.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Toast isi={toast.isi} onTutup={toast.tutup} />
    </Kartu>
  );
}

export default function TimPesertaKelola() {
  const [sub, pilih] = useSub(SUB);
  return (
    <div>
      <PilihSub daftar={SUB} aktif={sub} onPilih={pilih} label="Bagian Peserta & Kelas" />
      {sub === "pengaturan" && <PengaturanKelasKelola bukaInstruktur={() => pilih("instruktur")} />}
      {sub === "hierarki" && <KartuHierarki />}
      {sub === "instruktur" && <InstrukturKelola />}
      {sub === "kelas" && <KelasIdentKelola />}
    </div>
  );
}
