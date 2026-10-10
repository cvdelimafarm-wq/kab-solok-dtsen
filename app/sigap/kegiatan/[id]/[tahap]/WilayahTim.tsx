"use client";

// app/sigap/kegiatan/[id]/[tahap]/WilayahTim.tsx
//
// (9 Okt 2026) Wilayah tugas PER TIM (mockup 4 disetujui user): skema pendataan tetap KEROYOKAN, jadi yang ditampilkan adalah
// tim (PML + semua PPL) dan Sub SLS yang didata bersama -- bukan "siapa mendata Sub SLS apa". Tiap Sub SLS satu baris padat dengan
// perkiraan KK dan perkiraan KK terdampak. Status per Sub SLS hanya "sudah ada laporan" (satu-satunya data yang benar-benar ada di SIGAP).

import { useMemo } from "react";
import IkonMenu from "@/app/portal/IkonMenu";
import { useData } from "@/app/portal/dataBersama";
import KartuPetaOffline from "@/app/portal/KartuPetaOffline";
import type { WilayahTim as Tim } from "@/lib/portal/induk";
import { angkaId, judulKata, namaSingkat } from "../../format";

/** Grid tunggal untuk judul kolom & baris Sub SLS: nama (lebar sisa) | KK | KK terdampak. */
const GRID = "grid grid-cols-[minmax(0,1fr)_48px_72px] gap-x-2";

export default function WilayahTim() {
  // (10 Okt 2026) Data dari simpanan bersama (sudah diambil lebih dulu selagi petugas di halaman sebelumnya), diperbarui di belakang.
  // Data dasar (Sub SLS, KK) hampir tetap; status identifikasi/laporan boleh tertunda beberapa menit.
  const d = useData<{ tim: Tim | null }>("/api/portal/wilayah-tim");
  const tim: Tim | null | undefined = d.data ? d.data.tim : undefined;
  const galat = d.galat && d.galat !== "SESI_BERAKHIR" && !d.data ? d.galat : null;

  // Kelompok per kecamatan · nagari (sudah terurut dari server)
  const kelompok = useMemo(() => {
    const m = new Map<string, Tim["sub_sls"]>();
    for (const s of tim?.sub_sls ?? []) {
      const k = `${s.kecamatan} · ${s.nagari}`;
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return Array.from(m.entries());
  }, [tim]);

  if (galat) return <p className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>;
  if (tim === undefined)
    return (
      <div className="rounded-[18px] bg-white p-4 shadow-[0_8px_22px_rgba(15,42,82,.08)]" aria-busy="true">
        <div className="h-3 w-32 animate-pulse rounded bg-[#E6EDF8]" />
        <div className="mt-4 h-24 animate-pulse rounded bg-[#EEF2F7]" />
      </div>
    );
  if (tim === null || tim.sub_sls.length === 0)
    return <p className="rounded-[18px] bg-white px-4 py-6 text-center text-[13.5px] text-[#5B6B84] shadow-[0_8px_22px_rgba(15,42,82,.06)]">Wilayah tugas tim Anda belum ditetapkan.</p>;

  const ppl = tim.anggota.filter((a) => a.peran !== "pml");
  const persen = Math.round((tim.ada_laporan / tim.sub_sls.length) * 100);

  return (
    <div className="space-y-3">
    <section aria-label="Wilayah tugas tim" className="overflow-hidden rounded-[18px] bg-white shadow-[0_8px_22px_rgba(15,42,82,.08)]">
      <div className="border-b border-[#EEF2F7] p-3.5">
        <p className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-[#6B7A90]">Tim Anda</p>
        <h3 className="mt-0.5 text-[16px] font-extrabold text-[#0F2A52]">Tim {tim.pml ? namaSingkat(tim.pml.nama) : "-"}</h3>
        <p className="text-[12px] text-[#55657D]">
          PML · {ppl.length} PPL · {tim.sub_sls.length} Sub SLS
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tim.pml && (
            <span className="rounded-full bg-[#0F2A52] px-2.5 py-[3px] text-[11px] font-bold text-white">{namaSingkat(tim.pml.nama)} · PML</span>
          )}
          {ppl.map((a) => (
            <span key={a.id} className={`rounded-full px-2.5 py-[3px] text-[11px] font-bold ${a.anda ? "bg-[#F4B400] text-[#0F2A52]" : "bg-[#E6EEFC] text-[#0F3D7A]"}`}>
              {namaSingkat(a.nama)}
              {a.anda ? " · Anda" : ""}
            </span>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-[12px] bg-[#F1F6FE] px-1 py-2">
            <b className="block text-[17px] text-[#0F2A52]">{tim.sub_sls.length}</b>
            <small className="text-[10.5px] text-[#55657D]">Sub SLS</small>
          </div>
          <div className="rounded-[12px] bg-[#F1F6FE] px-1 py-2">
            <b className="block text-[17px] text-[#0F2A52]">≈{angkaId(tim.total_kk)}</b>
            <small className="text-[10.5px] text-[#55657D]">Perkiraan KK</small>
          </div>
          <div className="rounded-[12px] bg-[#FFF4D6] px-1 py-2">
            <b className="block text-[17px] text-[#8A6200]">≈{angkaId(tim.total_terdampak)}</b>
            <small className="text-[10.5px] text-[#8A6200]">Perkiraan KK terdampak</small>
          </div>
        </div>

        <p className="mt-3 rounded-[12px] bg-[#EAF1FC] px-3 py-2 text-[12px] leading-snug text-[#0F3D7A]">
          Seluruh anggota tim mendata bersama (keroyokan). Sub SLS di bawah adalah wilayah tim, bukan pembagian per orang.
        </p>

        {tim.sub_sls.some((x) => x.identifikasi) && (
          <p className="mt-3 rounded-[12px] bg-[#F1F6FE] px-3 py-2 text-[12px] leading-snug text-[#0F3D7A]">
            Identifikasi SLS oleh PML: <b>{tim.sub_sls.filter((x) => x.identifikasi === "selesai").length}</b> dari {tim.sub_sls.filter((x) => x.identifikasi).length} Sub SLS selesai.
          </p>
        )}

        <div className="mt-3">
          <div className="flex items-center justify-between text-[11.5px] font-bold text-[#55657D]">
            <span>Sudah ada laporan</span>
            <span>
              {tim.ada_laporan} dari {tim.sub_sls.length} Sub SLS
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#E3E8F0]" role="progressbar" aria-valuenow={persen} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-[#19A463]" style={{ width: `${persen}%` }} />
          </div>
        </div>
      </div>

      {/* (10 Okt 2026) Judul kolom & baris memakai SATU grid yang sama (lebar kolom angka identik) supaya judul tepat di atas angkanya,
          dan judul dipendekkan (tidak lagi terlipat 2 baris & meluber) -- permintaan user: "judul kolom agak ketengah". */}
      <div className={`${GRID} items-end border-b border-[#EEF2F7] bg-[#F7FAFE] px-3.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#6B7A90]`}>
        <span>Sub SLS</span>
        <span className="text-right">KK</span>
        <span className="text-right">Terdampak</span>
      </div>

      {kelompok.map(([nama, isi]) => (
        <div key={nama}>
          <div className="border-b border-[#EEF2F7] bg-[#F1F6FE] px-3.5 py-1 text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-[#0F3D7A]">{judulKata(nama.split(" · ")[0])} · {judulKata(nama.split(" · ")[1] ?? "")}</div>
          {isi.map((s) => (
            <div key={s.idsubsls} className={`${GRID} min-h-[44px] items-center border-b border-[#EEF2F7] px-3.5 py-1.5 last:border-b-0`}>
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={`grid h-[18px] w-[18px] flex-none place-items-center rounded-full ${s.ada_laporan ? "bg-[#19A463] text-white" : "border-[1.5px] border-[#C5D0E2] bg-white"}`}
                  role="img"
                  aria-label={s.ada_laporan ? "Sudah ada laporan" : "Belum ada laporan"}
                >
                  {s.ada_laporan && <IkonMenu n="tanda" className="h-2.5 w-2.5" />}
                </span>
                {/* (10 Okt 2026) Nama jorong TIDAK lagi dipotong "…": boleh turun ke baris berikutnya, nomor Sub SLS di baris sendiri
                    -- permintaan user: "list jorong banyak yang terputus, apa solusinya?" */}
                <span className="min-w-0 flex-1 text-[12.5px] leading-tight text-[#0F2A52]">
                  <b className="block break-words">{judulKata(s.sls)}</b>
                  <span className="text-[11px] text-[#6B7A90]">Sub {s.sub_sls}</span>
                  {/* (10 Okt 2026) Status Lembar Identifikasi SLS oleh PML -- permintaan user */}
                  {s.identifikasi && (
                    <span className={`ml-1.5 inline-block rounded-full px-1.5 py-[1px] align-middle text-[9.5px] font-extrabold ${s.identifikasi === "selesai" ? "bg-[#E3F6EC] text-[#13794B]" : "bg-[#FFF4D6] text-[#8A6200]"}`}>
                      {s.identifikasi === "selesai" ? "Selesai identifikasi" : "Sedang diidentifikasi PML"}
                    </span>
                  )}
                </span>
              </span>
              <span className="text-right text-[12.5px] font-bold tabular-nums text-[#0F2A52]">{angkaId(s.kk)}</span>
              <span className="text-right text-[12.5px] font-bold tabular-nums text-[#8A6200]">{angkaId(s.kk_terdampak)}</span>
            </div>
          ))}
        </div>
      ))}

      <p className="px-3.5 py-2.5 text-[11px] leading-snug text-[#6B7A90]">KK = perkiraan jumlah keluarga; Terdampak = perkiraan KK terdampak bencana. Keduanya dari data awal, bukan hasil pencacahan. Lingkaran hijau = sudah ada laporan harian yang memuat Sub SLS itu. Tag identifikasi: “Sedang diidentifikasi PML” = PML belum menyimpan hasilnya; “Selesai identifikasi” = hasil sudah disimpan.</p>
    </section>
    <KartuPetaOffline idsubsls={tim.sub_sls.map((x) => x.idsubsls)} />
    </div>
  );
}
