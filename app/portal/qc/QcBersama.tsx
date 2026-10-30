"use client";

// app/portal/qc/QcBersama.tsx
//
// (31 Okt 2026) Bagian tampilan yang dipakai BERSAMA tab QC Pasca Bencana (Lembar Supervisi > Hasil QC Pemahaman) dan tab QC SPDT NTP, supaya keduanya tampil dan
// berperilaku sama: kartu ringkasan yang bisa diketuk sebagai saringan, lembar bawah (rincian soal / petugas) yang menutup dengan Back HP, dan matriks soal x petugas.
// Hanya tampilan; aturan hitung di lib/korwilHasilQc.ts dan lib/sigapQcSaring.ts.

import { useEffect, useState, type ReactNode } from "react";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";
import { namaSingkatTampil } from "@/lib/namaTampil";
import { teksJawaban, type BarisMatriks, type HasilQc, type PetugasHasil, type RincianPetugas } from "@/lib/korwilHasilQc";

export const KOTAK = "rounded-[16px] bg-white p-3 shadow-[0_6px_18px_rgba(15,42,82,.07)]";
export const SELECT_PADAT = "h-10 w-full min-w-0 rounded-[10px] border border-[#CBD6E6] bg-white px-2 text-[12.5px] font-semibold text-[#1B2B4B] outline-none";
export const tglPendek = (t: string) => `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)}`;
export const pct = (x: number | null) => (x == null ? "—" : `${x}%`);
export const warnaPersen = (x: number | null) => (x == null ? "bg-[#EEF2F7] text-[#5B6B84]" : x >= 80 ? "bg-[#E3F6EC] text-[#13794B]" : x >= 60 ? "bg-[#FFF4D6] text-[#8A6200]" : "bg-[#FDE8E8] text-[#B42329]");

/** Dua/tiga pilihan sejajar (satu baris, pendek). */
export function Segmen<T extends string>({ nilai, pilihan, onPilih, label }: { nilai: T; pilihan: [T, string][]; onPilih: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-[3px] rounded-[11px] bg-[#EEF2F7] p-[3px]">
      {pilihan.map(([k, t]) => (
        <button key={k} type="button" aria-pressed={nilai === k} onClick={() => onPilih(k)} className={`min-h-[36px] rounded-[8px] px-2 text-[12.5px] font-extrabold ${nilai === k ? "bg-white text-[#0F2A52] shadow-sm" : "text-[#52627A]"}`}>
          {t}
        </button>
      ))}
    </div>
  );
}

export type ItemKartu = {
  kunci: string;
  angka: string;
  label: string;
  /** baris kecil di bawah label (mis. "PML 1/15 · PPL 2/40") */
  sub?: ReactNode;
  aktif: boolean;
  /** nada peringatan (mis. masih ada yang belum mengisi) */
  peringatan?: boolean;
  /** terbaca pembaca layar: apa yang terjadi bila diketuk */
  petunjuk: string;
  onKlik: () => void;
};

/** Kartu ringkasan yang juga tombol saringan: ketuk = saring, ketuk lagi = lepas. Rapat (satu baris). */
export function KartuSaring({ item }: { item: ItemKartu[] }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${item.length}, minmax(0, 1fr))` }}>
      {item.map((x) => (
        <button
          key={x.kunci}
          type="button"
          aria-pressed={x.aktif}
          aria-label={`${x.label}: ${x.angka}. ${x.petunjuk}`}
          onClick={x.onKlik}
          className={`rounded-[13px] border px-2 py-1.5 text-left active:scale-[.99] ${x.aktif ? "border-[#1F5FD1] bg-[#EEF4FF] ring-2 ring-[#1F5FD1]/30" : x.peringatan ? "border-[#E3A33B] bg-[#FFF9ED]" : "border-[#D9E2F1] bg-white"}`}
        >
          <b className={`block text-[18px] font-extrabold leading-tight tabular-nums ${x.peringatan && !x.aktif ? "text-[#8A4B08]" : "text-[#0F2A52]"}`}>{x.angka}</b>
          <span className="block text-[11.5px] font-bold leading-tight text-[#44546F]">{x.label}</span>
          {x.sub && <span className="mt-0.5 block text-[10px] leading-tight text-[#6B7A90]">{x.sub}</span>}
        </button>
      ))}
    </div>
  );
}

/** Keterangan saringan yang sedang aktif + tombol lepas (hanya tampil bila ada saringan, jadi tidak memakan baris). */
export function BarisSaring({ teks, jumlah, onLepas }: { teks: string; jumlah: number; onLepas: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-[11px] bg-[#EEF4FF] px-3 py-1" role="status">
      <span className="min-w-0 truncate text-[12px] font-bold text-[#0F2A52]">
        Menampilkan yang {teks} · {jumlah} petugas
      </span>
      <button type="button" onClick={onLepas} className="min-h-[36px] flex-none px-1 text-[12px] font-extrabold text-[#1F5FD1]">
        Tampilkan semua
      </button>
    </div>
  );
}

/** Lembar bawah (modal): Back HP, Esc, ketuk di luar, dan tombol Tutup semuanya menutupnya. */
export function LembarBawah({ judul, onTutup, children }: { judul: string; onTutup: () => void; children: ReactNode }) {
  useTutupDenganBack(true, onTutup);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onTutup();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onTutup]);
  return (
    <div className="fixed inset-0 z-[9100] flex items-end justify-center bg-[#0B1530]/55 sm:items-center sm:p-4" role="presentation" onClick={onTutup}>
      <div role="dialog" aria-modal="true" aria-label={judul} onClick={(e) => e.stopPropagation()} className="flex max-h-[86dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[20px] bg-white shadow-2xl sm:rounded-[20px]">
        <div className="flex items-center gap-2 border-b border-[#E3E8F0] pl-4 pr-1">
          <h3 className="min-w-0 flex-1 truncate py-3 text-[14px] font-extrabold text-[#0F2A52]">{judul}</h3>
          <button type="button" onClick={onTutup} className="min-h-[44px] flex-none px-3 text-[13px] font-extrabold text-[#1F5FD1]">
            Tutup
          </button>
        </div>
        <div className="space-y-2 overflow-y-auto px-4 py-3">{children}</div>
      </div>
    </div>
  );
}

/** Isi lembar rincian soal: pertanyaan, pilihan (kunci ditandai, berapa yang memilih), siapa yang salah, penjelasan. `sorotAkun` = hanya jawaban petugas itu. */
export function IsiSoal({ baris, kolom, sorotAkun }: { baris: BarisMatriks; kolom: PetugasHasil[]; sorotAkun: number | null }) {
  const s = baris.soal;
  const jawab = kolom.filter((p) => baris.sel[p.akun_id] && (sorotAkun == null || p.akun_id === sorotAkun));
  const salah = jawab.filter((p) => baris.sel[p.akun_id]!.status === "salah");
  const benar = jawab.length - salah.length;
  const hitung: Record<string, number> = {};
  for (const p of jawab) {
    const c = baris.sel[p.akun_id]!;
    const kode = c.pilih ?? (c.status === "benar" ? s.kunci : null);
    if (kode) hitung[kode] = (hitung[kode] ?? 0) + 1;
  }
  const kodeOpsi = Object.keys(s.opsi ?? {}).sort();
  return (
    <>
      <p className="text-[13.5px] font-bold leading-snug text-[#1B2B4B]">
        <span className="mr-1 text-[11px] font-extrabold text-[#6B7A90]">{s.id}</span>
        {s.pertanyaan}
      </p>
      {kodeOpsi.length > 0 && (
        <ul className="space-y-1">
          {kodeOpsi.map((k) => (
            <li key={k} className={`flex items-start gap-2 rounded-[10px] px-2.5 py-1.5 text-[12.5px] leading-snug ${k === s.kunci ? "bg-[#E3F6EC] text-[#0E5F3A]" : "bg-[#F5F8FD] text-[#1B2B4B]"}`}>
              <b className="flex-none">{k}.</b>
              <span className="min-w-0 flex-1">{s.opsi[k]}</span>
              <span className="flex-none text-[11px] font-bold text-[#52627A]">
                {k === s.kunci ? "✓ kunci" : ""}
                {hitung[k] ? `${k === s.kunci ? " · " : ""}${hitung[k]} memilih` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {kodeOpsi.length === 0 && (
        <p className="text-[12.5px] text-[#13794B]">
          <b>Kunci:</b> {teksJawaban(s, s.kunci || null)}
        </p>
      )}
      <p className="text-[12.5px] font-bold text-[#52627A]">
        {salah.length} salah · {benar} benar{sorotAkun == null ? "" : " (petugas ini)"}
      </p>
      {salah.length > 0 && (
        <ul className="space-y-1">
          {salah.map((p) => {
            const c = baris.sel[p.akun_id]!;
            return (
              <li key={p.akun_id} className="text-[12.5px] leading-snug text-[#7A1D22]">
                <b>{namaSingkatTampil(p.nama)}</b> <span className="text-[#6B7A90]">({p.peran.toUpperCase()}, {tglPendek(c.tanggal)})</span> memilih {teksJawaban(s, c.pilih)}
              </li>
            );
          })}
        </ul>
      )}
      {s.penjelasan && (
        <p className="rounded-[10px] bg-[#EEF4FF] px-2.5 py-2 text-[12.5px] leading-snug text-[#1B2B4B]">
          <b>Penjelasan:</b> {s.penjelasan}
        </p>
      )}
    </>
  );
}

/** Matriks: baris = soal, kolom = petugas (dikelompokkan per tim). Ketuk soal / sel / nama petugas membuka lembar bawah (dikelola pemanggil). */
export function MatriksQc({
  hasil,
  hanyaSalah,
  onHanyaSalah,
  aktif,
  onSoal,
  onSel,
  onKolom,
}: {
  hasil: HasilQc;
  hanyaSalah: boolean;
  onHanyaSalah: (v: boolean) => void;
  aktif: { soal: string; akun: number | null } | null;
  onSoal: (soal: string) => void;
  onSel: (soal: string, akun: number) => void;
  onKolom: (akun: number) => void;
}) {
  const baris = hanyaSalah ? hasil.matriks.baris.filter((b) => b.jumlahSalah > 0) : hasil.matriks.baris;
  const kolomPerTim = hasil.tim.map((t) => ({ nama: t.nama, kolom: t.petugas }));
  return (
    <section className={`${KOTAK} space-y-2 !px-0`} aria-label="Matriks soal dan petugas">
      <div className="flex items-center justify-between gap-2 px-3">
        <label className="flex min-h-[40px] items-center gap-2 text-[12.5px] font-bold text-[#52627A]">
          <input type="checkbox" className="h-5 w-5" checked={hanyaSalah} onChange={(e) => onHanyaSalah(e.target.checked)} />
          Hanya soal yang ada salahnya
        </label>
        <span className="flex-none text-[11.5px] text-[#6B7A90]">{baris.length} soal</span>
      </div>
      {baris.length === 0 ? (
        <p className="px-3 text-[12.5px] font-bold text-[#13794B]">Tidak ada jawaban salah.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-0 text-center text-[12px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-[128px] bg-white" />
                {kolomPerTim.map((t) => (
                  <th key={t.nama} colSpan={t.kolom.length} className="border-b border-l border-[#E1E8F3] bg-[#EEF4FF] px-1 py-1 text-[11px] font-extrabold text-[#0F2A52]">
                    Tim {namaSingkatTampil(t.nama)}
                  </th>
                ))}
              </tr>
              <tr>
                <th className="sticky left-0 z-10 bg-white px-3 py-1 text-left text-[11px] font-extrabold text-[#6B7A90]">Soal</th>
                {hasil.matriks.kolom.map((p) => (
                  <th key={p.akun_id} className="w-[52px] min-w-[52px] border-l border-[#E1E8F3] px-0.5 py-1 align-bottom text-[10.5px] font-bold leading-tight text-[#1B2B4B]">
                    <button type="button" disabled={p.terjawab === 0} onClick={() => onKolom(p.akun_id)} className={`block w-full text-center ${p.terjawab > 0 ? "text-[#1F5FD1] underline decoration-dotted" : ""}`}>
                      <span className="line-clamp-2 break-words">{namaSingkatTampil(p.nama)}</span>
                      <span className="block text-[9.5px] font-extrabold text-[#6B7A90]">{p.peran.toUpperCase()}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {baris.map((b) => (
                <tr key={b.soal.id}>
                  <th scope="row" className="sticky left-0 z-10 min-w-[128px] max-w-[128px] border-t border-[#EEF2F7] bg-white px-3 py-1 text-left align-top">
                    <button type="button" onClick={() => onSoal(b.soal.id)} aria-label={`Rincian soal ${b.soal.id}`} className="block w-full text-left">
                      <span className="block text-[11px] font-extrabold text-[#0F2A52]">
                        {b.soal.id} <span className="font-bold text-[#B42329]">· {b.jumlahSalah} salah</span>
                      </span>
                      <span className="line-clamp-2 text-[11px] font-normal leading-tight text-[#52627A]">{b.soal.pertanyaan}</span>
                    </button>
                  </th>
                  {hasil.matriks.kolom.map((p) => {
                    const c = b.sel[p.akun_id];
                    const sorot = aktif?.soal === b.soal.id && aktif.akun === p.akun_id;
                    const gaya = !c ? "bg-[#F4F6FA] text-[#9AA7BA]" : c.status === "benar" ? "bg-[#E3F6EC] text-[#13794B]" : "bg-[#FDE8E8] text-[#B42329]";
                    return (
                      <td key={p.akun_id} className="border-l border-t border-[#EEF2F7] p-0.5">
                        <button
                          type="button"
                          disabled={!c}
                          aria-label={`${p.nama}, ${b.soal.id}: ${!c ? "belum" : c.status === "benar" ? "benar" : `salah, memilih ${c.pilih ?? "?"}`}`}
                          onClick={() => onSel(b.soal.id, p.akun_id)}
                          className={`h-[34px] w-full rounded-[8px] text-[13px] font-extrabold ${gaya} ${sorot ? "ring-2 ring-[#1F5FD1]" : ""}`}
                        >
                          {!c ? "–" : c.status === "benar" ? "✓" : `✕${c.pilih ?? ""}`}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="px-3 text-[11px] text-[#6B7A90]">✓ benar · ✕ salah (huruf = jawaban yang dipilih) · – belum dijawab. Ketuk soal, sel, atau nama petugas untuk rincian.</p>
    </section>
  );
}

/** Isi lembar rincian petugas: tiap soal berisi pilihan pertama, kedua, ... sampai benar. */
export function IsiPetugas({ r }: { r: RincianPetugas }) {
  const [semua, setSemua] = useState(false);
  const daftar = semua ? r.soal : r.soal.filter((s) => s.pernahSalah);
  return (
    <>
      <p className="text-[12.5px] font-semibold text-[#52627A]">
        {r.percobaan} percobaan · {r.pernahSalah} soal pernah salah{r.belumBenar > 0 ? ` · ${r.belumBenar} belum benar` : ""}
      </p>
      <label className="flex min-h-[40px] items-center gap-2 text-[12.5px] font-bold text-[#52627A]">
        <input type="checkbox" className="h-5 w-5" checked={!semua} onChange={(e) => setSemua(!e.target.checked)} />
        Hanya soal yang pernah salah
      </label>
      {daftar.length === 0 && <p className="text-[12.5px] font-bold text-[#13794B]">{r.soal.length === 0 ? "Belum ada jawaban." : "Semua soal langsung benar pada pilihan pertama."}</p>}
      {daftar.map((s) => (
        <div key={s.soal.id} className="rounded-[10px] border border-[#E1E8F3] bg-white px-3 py-2 text-[12.5px] leading-snug">
          <p className="font-bold text-[#1B2B4B]">
            <span className="mr-1 text-[11px] font-extrabold text-[#6B7A90]">{s.soal.id}</span>
            {s.soal.pertanyaan}
          </p>
          <ol className="mt-1 space-y-0.5">
            {s.upaya.map((u) => (
              <li key={`${u.tanggal}-${u.percobaanKe}-${u.ke}`} className={u.benar ? "text-[#13794B]" : "text-[#7A1D22]"}>
                <b>Pilihan {u.ke}:</b> {teksJawaban(s.soal, u.pilih)} {u.benar ? "✓ benar" : "✕ salah"}{" "}
                <span className="text-[11px] text-[#6B7A90]">({tglPendek(u.tanggal)}, percobaan ke-{u.percobaanKe})</span>
              </li>
            ))}
          </ol>
          {!s.akhirBenar && <p className="mt-0.5 text-[11.5px] font-bold text-[#B42329]">Belum menjawab benar.{s.soal.kunci ? ` Kunci: ${teksJawaban(s.soal, s.soal.kunci)}` : ""}</p>}
        </div>
      ))}
    </>
  );
}
