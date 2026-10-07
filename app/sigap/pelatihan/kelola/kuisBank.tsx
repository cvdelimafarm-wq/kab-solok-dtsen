"use client";

// app/sigap/pelatihan/kelola/kuisBank.tsx
//
// (7-8 Okt 2026) Adu Sigap > Bank Kuis: buat kuis, unduh template Excel (kolom Topik & Penjelasan), unggah soal (.xlsx),
// lihat, salin, hapus. Ruang dibuka per kelas dari tab "Pengaturan Kelas" (bukan dari sini).

import { useRef, useState } from "react";
import { DETIK_MAX, DETIK_MIN, HEADER_TEMPLATE_KUIS, PETUNJUK_TEMPLATE_KUIS, WARNA_OPSI, bacaBarisKuis, barisTemplateKuis, type SoalKuis } from "@/lib/sigapKuis";
import { MAKS_SOAL } from "@/lib/sigapTes";
import { fetchJson, pesanGalat, SesiBerakhir } from "../../admin/api";
import { BTN, BTN_G, BTN_O, BTN_R, Chip, INPUT, Kartu, Pesan } from "../../admin/ui";
import { URL_KUIS_ADMIN } from "./kuisHost";
import { kirim, menit, type AksiFn, type Daftar, type KuisRingkas } from "./kuisBersama";

export async function unduhTemplateKuis() {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(barisTemplateKuis());
  ws["!cols"] = [{ wch: 5 }, { wch: 60 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 8 }, { wch: 8 }, { wch: 22 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, ws, "Soal");
  const wp = XLSX.utils.aoa_to_sheet(PETUNJUK_TEMPLATE_KUIS.map((t) => [t]));
  wp["!cols"] = [{ wch: 120 }];
  XLSX.utils.book_append_sheet(wb, wp, "Petunjuk");
  XLSX.writeFile(wb, "Template_Soal_Adu_Sigap_Pelatihan_PSP.xlsx");
}

export function BankKuis({ data, bisaKelola, sibuk, aksi }: { data: Daftar; bisaKelola: boolean; sibuk: boolean; aksi: AksiFn }) {
  const [judulBaru, setJudulBaru] = useState("");
  return (
    <Kartu judul="Bank kuis" ket={`${data.kuis.length} kuis · maks. ${MAKS_SOAL} soal per kuis`} kanan={<button type="button" className={BTN_O} onClick={unduhTemplateKuis}>⬇ Unduh template Excel</button>}>
      {bisaKelola && (
        <form
          className="mb-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const j = judulBaru.trim();
            if (!j) return;
            aksi(async () => {
              await kirim({ aksi: "buat_kuis", judul: j });
              setJudulBaru("");
            }, "Kuis dibuat. Unggah soalnya (template Excel) di kartu kuis.");
          }}
        >
          <input className={`${INPUT} min-w-[220px] flex-1`} placeholder="Judul kuis baru, mis. Kuis Penyegaran Materi PSP" maxLength={150} value={judulBaru} onChange={(e) => setJudulBaru(e.target.value)} aria-label="Judul kuis baru" />
          <button type="submit" className={BTN} disabled={sibuk || !judulBaru.trim()}>＋ Buat kuis</button>
        </form>
      )}
      {data.kuis.length === 0 && <p className="text-[13px] text-[#7B8794]">Belum ada kuis. Buat kuis, lalu unggah soal dari template Excel.</p>}
      <div className="space-y-3">
        {data.kuis.map((k) => (
          <KartuKuis key={k.id} kuis={k} bisaKelola={bisaKelola} sudahDimainkan={data.ruang.some((r) => r.kuis_id === k.id)} dipakaiKelas={data.kelas.filter((x) => x.kuis_id === k.id).map((x) => x.kelas)} sibuk={sibuk} aksi={aksi} />
        ))}
      </div>
    </Kartu>
  );
}

// ======================================================================
// Satu kuis di bank
// ======================================================================
export function KartuKuis({ kuis, bisaKelola, sudahDimainkan, dipakaiKelas, sibuk, aksi }: {
  kuis: KuisRingkas;
  bisaKelola: boolean;
  sudahDimainkan: boolean;
  dipakaiKelas: number[];
  sibuk: boolean;
  aksi: AksiFn;
}) {
  const [pratinjau, setPratinjau] = useState<{ soal: SoalKuis[]; galat: string[]; nama: string } | null>(null);
  const [tersimpan, setTersimpan] = useState<SoalKuis[] | null>(null);
  const [lihat, setLihat] = useState(false);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);
  const [hapus, setHapus] = useState(false);
  const [ubahJudul, setUbahJudul] = useState<string | null>(null);
  const berkas = useRef<HTMLInputElement>(null);

  async function muatSoal() {
    try {
      const d = await fetchJson<{ soal: SoalKuis[] }>(`${URL_KUIS_ADMIN}?bagian=soal&kuis_id=${kuis.id}`);
      setTersimpan(d.soal);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    }
  }
  async function bacaBerkas(f: File | undefined) {
    if (!f) return;
    setPesan(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const nama = wb.SheetNames.find((n) => n.toLowerCase() === "soal") ?? wb.SheetNames[0];
      const baris = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nama], { header: 1, defval: "", blankrows: false });
      setPratinjau({ ...bacaBarisKuis(baris), nama: f.name });
    } catch {
      setPesan({ jenis: "galat", teks: "Berkas tidak dapat dibaca. Gunakan template .xlsx Adu Sigap yang diunduh dari halaman ini." });
    } finally {
      if (berkas.current) berkas.current.value = "";
    }
  }
  async function simpanSoal() {
    if (!pratinjau || pratinjau.galat.length > 0) return;
    await aksi(async () => {
      await kirim({ aksi: "simpan_soal", kuis_id: kuis.id, soal: pratinjau.soal });
      setPratinjau(null);
      setTersimpan(null);
      setLihat(false);
    }, `${pratinjau.soal.length} soal tersimpan di "${kuis.judul}".`);
  }
  return (
    <div className="rounded-xl border border-[#E3E8EE] p-3">
      <div className="flex flex-wrap items-center gap-2">
        {ubahJudul === null ? (
          <p className="min-w-0 flex-1 text-[14px] font-bold">
            {kuis.judul}
            {bisaKelola && <button type="button" className="ml-2 text-[11.5px] font-semibold text-[#1F6FD1] hover:underline" onClick={() => setUbahJudul(kuis.judul)}>ubah judul</button>}
          </p>
        ) : (
          <form
            className="flex min-w-0 flex-1 gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const j = ubahJudul.trim();
              if (j) aksi(() => kirim({ aksi: "ubah_judul", kuis_id: kuis.id, judul: j }), "Judul diubah.").then(() => setUbahJudul(null));
            }}
          >
            <input className={`${INPUT} min-w-0 flex-1`} value={ubahJudul} maxLength={150} onChange={(e) => setUbahJudul(e.target.value)} aria-label="Judul kuis" />
            <button type="submit" className={BTN} disabled={sibuk}>Simpan</button>
            <button type="button" className={BTN_O} onClick={() => setUbahJudul(null)}>Batal</button>
          </form>
        )}
        {kuis.jumlah_soal > 0 ? <Chip w="ok">{kuis.jumlah_soal} soal · {menit(kuis.total_detik)}</Chip> : <Chip w="bad">Belum ada soal</Chip>}
        {sudahDimainkan && <Chip w="navy">pernah dimainkan</Chip>}
        {dipakaiKelas.length > 0 && <Chip w="ok">dipakai Kelas {dipakaiKelas.join(", ")}</Chip>}
      </div>

      {Object.keys(kuis.topik).length > 0 && (
        <p className="mt-1.5 flex flex-wrap gap-1.5 text-[11.5px] text-[#55657D]">
          {Object.entries(kuis.topik).map(([t, n]) => (
            <span key={t} className="rounded-full bg-[#F1EAFB] px-2 py-0.5 font-semibold text-[#46178F]">{t} · {n}</span>
          ))}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {bisaKelola && (
          <>
            <button type="button" className={BTN} disabled={sibuk || sudahDimainkan} title={sudahDimainkan ? "Kuis sudah pernah dimainkan: salin kuis lalu ubah salinannya" : undefined} onClick={() => berkas.current?.click()}>
              ⬆ Unggah soal (.xlsx)
            </button>
            <input ref={berkas} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => bacaBerkas(e.target.files?.[0])} />
          </>
        )}
        {bisaKelola && kuis.jumlah_soal > 0 && (
          <button type="button" className={BTN_O} onClick={() => { setLihat((v) => !v); if (!tersimpan) muatSoal(); }}>
            {lihat ? "Sembunyikan soal" : "Lihat soal"}
          </button>
        )}
        {bisaKelola && <button type="button" className={BTN_O} disabled={sibuk} onClick={() => aksi(() => kirim({ aksi: "duplikat_kuis", kuis_id: kuis.id }), "Kuis disalin.")}>⧉ Salin</button>}
        {bisaKelola &&
          (hapus ? (
            <>
              <button type="button" className={BTN_R} disabled={sibuk} onClick={() => aksi(() => kirim({ aksi: "hapus_kuis", kuis_id: kuis.id }), "Kuis dihapus.")}>Ya, hapus kuis ini</button>
              <button type="button" className={BTN_O} onClick={() => setHapus(false)}>Batal</button>
            </>
          ) : (
            <button type="button" className={BTN_R} onClick={() => setHapus(true)}>Hapus</button>
          ))}
      </div>
      {sudahDimainkan && bisaKelola && <p className="mt-1.5 text-[11.5px] text-[#9A6200]">Soal terkunci karena kuis sudah pernah dimainkan. Untuk mengubah soal, salin kuis ini.</p>}
      {bisaKelola && kuis.jumlah_soal === 0 && <p className="mt-1.5 text-[11.5px] text-[#7B8794]">Kolom template: {HEADER_TEMPLATE_KUIS.join(" · ")} (Detik {DETIK_MIN}–{DETIK_MAX}, kosong = 20; Topik & Penjelasan opsional).</p>}
      {pesan && (
        <div className="mt-2">
          <Pesan jenis={pesan.jenis} onTutup={() => setPesan(null)}>{pesan.teks}</Pesan>
        </div>
      )}

      {pratinjau && (
        <div className="mt-3 rounded-xl border border-[#CDD5DE] p-2.5">
          <p className="text-[12.5px] font-semibold">Pratinjau: {pratinjau.nama}</p>
          {pratinjau.galat.length > 0 ? (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[12.5px] text-[#7F241E]">
              {pratinjau.galat.slice(0, 30).map((g, i) => (
                <li key={i}>{g}</li>
              ))}
              {pratinjau.galat.length > 30 && <li>… dan {pratinjau.galat.length - 30} kesalahan lain.</li>}
            </ul>
          ) : (
            <p className="mt-1 text-[12.5px] text-[#0E5E4E]">{pratinjau.soal.length} soal terbaca dengan benar. Simpan akan menimpa soal kuis ini.</p>
          )}
          {pratinjau.soal.length > 0 && <DaftarSoalKuis soal={pratinjau.soal} />}
          <div className="mt-2 flex gap-2">
            <button type="button" className={BTN_G} disabled={sibuk || pratinjau.galat.length > 0 || pratinjau.soal.length === 0} onClick={simpanSoal}>Simpan {pratinjau.soal.length} soal</button>
            <button type="button" className={BTN_O} onClick={() => setPratinjau(null)}>Batal</button>
          </div>
        </div>
      )}
      {lihat && tersimpan && !pratinjau && (
        <div className="mt-3 rounded-xl border border-[#E3E8EE] p-2.5">
          <DaftarSoalKuis soal={tersimpan} />
        </div>
      )}
    </div>
  );
}

export function DaftarSoalKuis({ soal }: { soal: SoalKuis[] }) {
  return (
    <ol className="mt-2 max-h-[340px] space-y-2 overflow-y-auto pr-1">
      {soal.map((s) => (
        <li key={s.nomor} className="rounded-lg bg-[#F8FAFC] px-2.5 py-2 text-[12.5px]">
          <p className="font-semibold">
            {s.nomor}. {s.teks} <span className="font-normal text-[#7B8794]">({s.detik} detik)</span>
            {s.topik && <span className="ml-1.5 rounded-full bg-[#F1EAFB] px-2 py-0.5 text-[11px] font-semibold text-[#46178F]">{s.topik}</span>}
          </p>
          <ul className="mt-0.5">
            {s.opsi.map((o) => (
              <li key={o.kode} className={o.kode === s.kunci ? "font-bold text-[#0E5E4E]" : "text-[#55657D]"}>
                <span style={{ color: WARNA_OPSI[o.kode]?.bg }}>{WARNA_OPSI[o.kode]?.simbol}</span> {o.kode}. {o.teks} {o.kode === s.kunci && "✔"}
              </li>
            ))}
          </ul>
          {s.penjelasan && <p className="mt-1 text-[12px] italic text-[#55657D]">💡 {s.penjelasan}</p>}
        </li>
      ))}
    </ol>
  );
}

