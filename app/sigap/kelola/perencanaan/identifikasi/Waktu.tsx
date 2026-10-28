"use client";

// app/sigap/kelola/perencanaan/identifikasi/Waktu.tsx
//
// (28 Okt 2026) Isian jadwal satu kegiatan (briefing, pelatihan, rapat) dengan penanda Perkiraan atau Fix.
//  - Perkiraan (bawaan): bulan + minggu ke-n. Tanggal Senin sampai Jumat minggu itu dihitung otomatis.
//  - Fix: satu tanggal, rentang tanggal, atau minggu.
// Murni tampilan terkendali; aturan ada di lib/keu/waktu.ts. Rekaman yang dihasilkan selalu memuat mulai dan selesai.

import { kisi, kolom } from "@/app/sigap/keu-ui";
import { MODE_FIX, modeRec, namaBulan, recPerk, ringkasRec, ubahRec, type ModeFix, type WaktuRec } from "@/lib/keu/waktu";
import { FixPerk, Isian, Tgl, TglRentang } from "./Kontrol";

const BULAN = Array.from({ length: 12 }, (_, i) => i);
const MINGGU = [1, 2, 3, 4, 5];

function PilihBulanMinggu({ rec, tahun, mati, nama, onUbah }: { rec: WaktuRec; tahun: number; mati: boolean; nama: string; onUbah: (r: WaktuRec) => void }) {
  const atur = (patch: Partial<WaktuRec>) => onUbah(ubahRec(rec, patch, tahun));
  return (
    <>
      <Isian judul="Bulan">
        <select className={kolom} aria-label={`${nama}: bulan`} disabled={mati} value={rec.bulan ?? ""} onChange={(e) => { const v = e.target.value; if (v !== "") atur({ bulan: Number(v), minggu: rec.minggu ?? 1 }); }}>
          <option value="">Pilih bulan…</option>
          {BULAN.map((b) => <option key={b} value={b}>{namaBulan(b)}</option>)}
        </select>
      </Isian>
      <Isian judul="Minggu ke-">
        <select className={kolom} aria-label={`${nama}: minggu ke-`} disabled={mati || rec.bulan === undefined} value={rec.minggu ?? 1} onChange={(e) => atur({ minggu: Number(e.target.value) })}>
          {MINGGU.map((m) => <option key={m} value={m}>Minggu ke-{m}</option>)}
        </select>
      </Isian>
    </>
  );
}

/** Bulan dan minggu ke-n yang memuat tanggal mulai (bila belum ada); dipakai saat berpindah ke Perkiraan atau Minggu. */
function daridMulai(r: WaktuRec): Partial<WaktuRec> {
  if (r.bulan !== undefined || !r.mulai) return {};
  return { bulan: Number(r.mulai.slice(5, 7)) - 1, minggu: Math.min(5, Math.max(1, Math.ceil(Number(r.mulai.slice(8, 10)) / 7))) };
}

/**
 * Isian jadwal. `rec` = rekaman mentah periode ini (boleh kosong). `onUbah` menerima rekaman lengkap (mulai, selesai, perk, mode, bulan, minggu).
 * `nama` dipakai untuk label aksesibilitas, mis. "Pelatihan Triwulan I".
 */
export function WaktuIsian({ rec, tahun, mati, nama, onUbah }: { rec: WaktuRec | undefined; tahun: number; mati: boolean; nama: string; onUbah: (r: WaktuRec) => void }) {
  const r: WaktuRec = rec ?? { mulai: "", selesai: "" };
  const perk = recPerk(r);
  const mode = modeRec(r);

  const keFix = () => {
    // Perkiraan -> Fix: bila sudah ada bulan/minggu, jadwalnya dipertahankan sebagai "Minggu"; bila tidak, satu tanggal.
    const m: ModeFix = r.bulan !== undefined ? "minggu" : modeRec(r);
    onUbah(ubahRec(r, { perk: false, mode: m }, tahun));
  };
  const keKira = () => {
    // Fix -> Perkiraan: bulan/minggu diambil dari tanggal mulai bila belum ada.
    onUbah(ubahRec(r, { perk: true, ...daridMulai(r) }, tahun));
  };

  const ringkas = ringkasRec(r);
  return (
    <div className="flex flex-col gap-2.5">
      <Isian judul="Jadwal">
        <FixPerk nama={`Jadwal ${nama}`} perk={perk} mati={mati} onPilih={(v) => (v ? keKira() : keFix())} />
      </Isian>
      {perk ? (
        <div className={kisi}>
          <PilihBulanMinggu rec={r} tahun={tahun} mati={mati} nama={nama} onUbah={onUbah} />
        </div>
      ) : (
        <>
          <div role="radiogroup" aria-label={`${nama}: bentuk jadwal Fix`} className="flex flex-wrap gap-1.5">
            {MODE_FIX.map((m) => (
              <label key={m.id} className={`${mati ? "cursor-not-allowed opacity-60" : "cursor-pointer"} inline-flex min-h-[36px] items-center gap-2 rounded-md border px-3 text-[13px] font-semibold ${mode === m.id ? "border-[#1F5FD1] bg-[#E3EEFF] text-[#1F5FD1]" : "border-[#C5D0E2] bg-white text-[#1B2B4B]"}`}>
                <input type="radio" name={`${nama}-mode`} checked={mode === m.id} disabled={mati} className="h-4 w-4 accent-[#1F5FD1]" onChange={() => onUbah(ubahRec(r, { perk: false, mode: m.id, ...(m.id === "minggu" ? daridMulai(r) : {}) }, tahun))} />
                {m.nama}
              </label>
            ))}
          </div>
          <div className={kisi}>
            {mode === "tgl" && (
              <Isian judul="Tanggal"><Tgl nama={`${nama} tanggal`} nilai={r.mulai} mati={mati} onUbah={(v) => onUbah(ubahRec(r, { perk: false, mode: "tgl", mulai: v, selesai: v }, tahun))} /></Isian>
            )}
            {mode === "rentang" && (
              <TglRentang nama={nama} mulai={r.mulai} selesai={r.selesai} mati={mati} onUbah={(x) => onUbah(ubahRec(r, { perk: false, mode: "rentang", mulai: x.mulai, selesai: x.selesai }, tahun))} />
            )}
            {mode === "minggu" && <PilihBulanMinggu rec={r} tahun={tahun} mati={mati} nama={nama} onUbah={onUbah} />}
          </div>
        </>
      )}
      <p className="m-0 text-[12.5px] text-[#44546F]">
        {ringkas ? <><strong className={perk ? "text-[#8A6200]" : "text-[#14653A]"}>{perk ? "≈ Perkiraan" : "Fix"}</strong>: {ringkas}</> : "Belum dijadwalkan. Pilih bulan dan minggu untuk perkiraan."}
      </p>
    </div>
  );
}
