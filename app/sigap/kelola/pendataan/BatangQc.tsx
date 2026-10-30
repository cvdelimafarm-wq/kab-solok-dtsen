// app/sigap/kelola/pendataan/BatangQc.tsx
//
// (30 Okt 2026) Potongan tampilan kecil untuk MELIHAT PERGERAKAN NILAI QC Pemahaman: batang tipis di bawah angka (SelNilai), deretan batang mini
// P1..Pn per orang (Pergerakan), dan batang mendatar (BatangMendatar). Angka SELALU ikut tampil: warna dan tinggi batang hanya penguat, bukan satu-satunya penanda.
// Hijau = nilai lulus ke atas; kuning/oranye = di bawah nilai lulus. Tanpa state, bisa dipakai di komponen klien maupun server.

import { selisihNilai } from "@/lib/sigapQcTabel";

export const WARNA_LULUS = { teks: "text-[#13794B]", batang: "bg-[#34A874]" } as const;
export const WARNA_BELUM = { teks: "text-[#8A4B08]", batang: "bg-[#E3A33B]" } as const;
export const warnaNilai = (n: number, nilaiLulus: number) => (n >= nilaiLulus ? WARNA_LULUS : WARNA_BELUM);

const batasPersen = (n: number) => Math.min(100, Math.max(0, n));

/** Angka nilai dengan batang tipis di bawahnya (lebar = nilai 0-100). */
export function SelNilai({ nilai, nilaiLulus, desimal = false }: { nilai: number; nilaiLulus: number; desimal?: boolean }) {
  const w = warnaNilai(nilai, nilaiLulus);
  return (
    <span className="inline-flex min-w-[44px] flex-col items-center gap-0.5">
      <b className={`tabular-nums ${w.teks}`}>{desimal ? nilai.toLocaleString("id-ID", { maximumFractionDigits: 1 }) : nilai}</b>
      <span className="block h-1 w-full min-w-[40px] overflow-hidden rounded-full bg-[#E8EDF5]" aria-hidden>
        <span className={`block h-full rounded-full ${w.batang}`} style={{ width: `${batasPersen(nilai)}%` }} />
      </span>
    </span>
  );
}

/** Deretan batang mini (satu per percobaan) + selisih terakhir terhadap pertama. */
export function Pergerakan({ nilai, nilaiLulus }: { nilai: readonly (number | null)[]; nilaiLulus: number }) {
  const ada = nilai.some((n) => n != null);
  if (!ada) return <span className="text-[#9AA7BA]">-</span>;
  const sel = selisihNilai(nilai);
  const label = nilai.map((n, i) => `P${i + 1} ${n ?? "kosong"}`).join(", ");
  return (
    <span className="inline-flex items-end gap-2" role="img" aria-label={`Pergerakan nilai: ${label}`} title={label}>
      <span className="flex h-[30px] items-end gap-[3px]" aria-hidden>
        {nilai.map((n, i) =>
          n == null ? (
            <span key={i} className="block h-[3px] w-2 rounded-sm bg-[#DDE4EF]" />
          ) : (
            <span key={i} className={`block w-2 rounded-sm ${warnaNilai(n, nilaiLulus).batang}`} style={{ height: `${Math.max(3, Math.round((batasPersen(n) / 100) * 30))}px` }} />
          ),
        )}
      </span>
      {sel != null && (
        <span className={`text-[11.5px] font-extrabold tabular-nums ${sel > 0 ? "text-[#13794B]" : sel < 0 ? "text-[#B42329]" : "text-[#6B7A90]"}`}>
          {sel > 0 ? `▲ +${sel}` : sel < 0 ? `▼ ${sel}` : "= 0"}
        </span>
      )}
    </span>
  );
}

/** Batang mendatar dengan penanda batas lulus. */
export function BatangMendatar({ label, nilai, nilaiLulus, ket }: { label: string; nilai: number | null; nilaiLulus: number; ket?: string }) {
  const w = nilai == null ? WARNA_BELUM : warnaNilai(nilai, nilaiLulus);
  return (
    <div className="grid grid-cols-[34px_1fr_auto] items-center gap-2 text-[12.5px]">
      <span className="font-extrabold text-[#0F2A52]">{label}</span>
      <span className="relative block h-5 overflow-hidden rounded-md bg-[#EEF2F8]" aria-hidden>
        {nilai != null && <span className={`block h-full ${w.batang}`} style={{ width: `${batasPersen(nilai)}%` }} />}
        <span className="absolute inset-y-0 w-[2px] bg-[#0F2A52]/60" style={{ left: `${batasPersen(nilaiLulus)}%` }} />
      </span>
      <span className="min-w-[88px] text-right tabular-nums">
        <b className={nilai == null ? "text-[#9AA7BA]" : w.teks}>{nilai == null ? "-" : nilai.toLocaleString("id-ID", { maximumFractionDigits: 1 })}</b>
        {ket && <span className="ml-1 text-[11px] text-[#6B7A90]">{ket}</span>}
      </span>
    </div>
  );
}
