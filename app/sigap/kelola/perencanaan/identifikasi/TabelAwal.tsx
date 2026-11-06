"use client";

// app/sigap/kelola/perencanaan/identifikasi/TabelAwal.tsx
//
// (5 Nov 2026) Identifikasi AWAL sebagai TABEL (Tahap 2): Jadwal tahap, Pelatihan dan briefing, Rapat, dan Organisasi pendataan lapangan.
// Tiap judul kolom punya tombol saring (TabelSaring). Hanya tampilan: seluruh aturan dan perhitungan tetap di lib/keu/identifikasi.ts.
//   * Isian sederhana (ada/tidak, bentuk, tempat, status, jumlah, translok, honor) diisi langsung di selnya.
//   * Isian panjang (pola jadwal, tanggal, instruktur) dibuka lewat tombol Ubah pada baris, memakai komponen lama (WaktuIsian, BarisRelatif, dll).
//   * Baris yang tidak dipakai tampil abu-abu. Penanda Fix/Perkiraan satu kolom.
// Baris dapat dibuka dari kartu lain lewat loncat(id) (Kontrol.tsx menembakkan peristiwa "bukabaris" ke baris berid itu).

import { useState, type ReactNode } from "react";
import { kolom, kisi, tombolKecil } from "@/app/sigap/keu-ui";
import {
  JABATAN_TIM, PERAN_DEF, daftarPeriode, hitungMitra, instrDari, periodeTurunan, tanggalRapat, tanggalSesi, tglIndo,
  type AsalInstruktur, type Form, type LevelInstruktur, type Media, type PeranId, type StatusPetugas, type TempatSesi,
} from "@/lib/keu/identifikasi";
import { jumlahHariAntara } from "@/lib/keu/tanggalDurasi";
import { recPerk } from "@/lib/keu/waktu";
import { Angka, Cat, Centang, FixPerk, Isian, Pilihan, YaTidak } from "./Kontrol";
import { WaktuIsian } from "./Waktu";
import { TabelSaring, type Kol } from "./TabelSaring";
import SelectCari from "@/app/components/SelectCari";

export const BENTUK = ["Daring", "Luring", "Hybrid"] as const;
export const MEDIA: readonly Media[] = ["Apel pagi", "Tatap muka", "Zoom"];
export const TEMPAT_PILIH = ["Kantor", "Hotel dalam kota", "Hotel luar kota", "Lokasi lain"] as const;
export const STATUS = ["Organik", "Mitra", "Organik dan mitra"] as const;
export const STATUS_SUP = ["Organik", "Organik dan mitra"] as const;

const KELAS_MATI = "bg-[#F6F8FB] text-[#8A97AD]";
const selKecil = `${kolom} min-h-[36px] py-0 text-[13px]`;
const Strip = () => <span className="text-[#8A97AD]" aria-hidden="true">—</span>;

// ---------------------------------------------------------------------------------------------------------------------
// Kontrol kecil untuk sel tabel
// ---------------------------------------------------------------------------------------------------------------------
function KotakCentang({ aktif, onUbah, mati, nama }: { aktif: boolean; onUbah: (v: boolean) => void; mati?: boolean; nama: string }) {
  return <input type="checkbox" aria-label={nama} className="h-5 w-5 accent-[#1F5FD1]" checked={aktif} disabled={mati} onChange={(e) => onUbah(e.target.checked)} />;
}
function PilKecil<T extends string>({ nilai, opsi, onPilih, mati, nama, kosong }: { nilai: T; opsi: readonly T[]; onPilih: (v: T) => void; mati?: boolean; nama: string; kosong?: string }) {
  return (
    <SelectCari aria-label={nama} className={`${selKecil} min-w-[92px]`} value={nilai} disabled={mati} onChange={(e) => onPilih(e.target.value as T)}>
      {kosong !== undefined && <option value="">{kosong}</option>}
      {opsi.map((o) => <option key={o} value={o}>{o}</option>)}
    </SelectCari>
  );
}
function YaTidakKecil({ nilai, onPilih, mati, nama }: { nilai: boolean; onPilih: (v: boolean) => void; mati?: boolean; nama: string }) {
  return (
    <SelectCari aria-label={nama} className={`${selKecil} w-[72px]`} value={nilai ? "ya" : "tidak"} disabled={mati} onChange={(e) => onPilih(e.target.value === "ya")}>
      <option value="ya">Ya</option>
      <option value="tidak">Tidak</option>
    </SelectCari>
  );
}
/** Penanda Fix atau Perkiraan satu kolom (pilihan ganda). */
function PerkKecil({ perk, onPilih, mati, nama }: { perk: boolean; onPilih: (perk: boolean) => void; mati?: boolean; nama: string }) {
  return (
    <SelectCari
      aria-label={`${nama}: Perkiraan atau Fix`} disabled={mati} value={perk ? "perk" : "fix"} onChange={(e) => onPilih(e.target.value === "perk")}
      className={`${selKecil} w-[112px] font-semibold ${perk ? "border-[#C98A00] bg-[#FFF4D6] text-[#8A6200]" : "border-[#2E9E63] bg-[#E6F6EC] text-[#14653A]"}`}
    >
      <option value="perk">≈ Perkiraan</option>
      <option value="fix">Fix</option>
    </SelectCari>
  );
}
const LencanaPerk = ({ perk }: { perk: boolean }) => (
  <span className={`inline-block rounded-md border px-2 py-[2px] text-[12px] font-semibold ${perk ? "border-[#C98A00] bg-[#FFF4D6] text-[#8A6200]" : "border-[#2E9E63] bg-[#E6F6EC] text-[#14653A]"}`}>{perk ? "≈ Perkiraan" : "Fix"}</span>
);
const tgl = (t: string | undefined) => (t ? tglIndo(t) : "—");
const hari = (m: string | undefined, s: string | undefined): string => { const n = jumlahHariAntara(m, s); return n === null ? "—" : String(n); };

/** Tombol Ubah/Tutup pada kolom lekat, dan baris isian yang terbuka di bawah barisnya. */
function useBuka(awal: string[] = []) {
  const [terbuka, setTerbuka] = useState<Set<string>>(new Set(awal));
  const buka = (id: string) => setTerbuka((s) => (s.has(id) ? s : new Set(s).add(id)));
  const alih = (id: string) => setTerbuka((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return { terbuka, buka, alih };
}
const BarisIsi = ({ lebar, children }: { lebar: number; children: ReactNode }) => (
  <tr className="bg-[#FAFBFD]"><td colSpan={lebar} className="px-2 pb-3 pt-1"><div className="flex flex-col gap-2.5 rounded-lg border border-[#DCE3EE] bg-white p-3">{children}</div></td></tr>
);

// ---------------------------------------------------------------------------------------------------------------------
// 1. Jadwal tahap kegiatan
// ---------------------------------------------------------------------------------------------------------------------
export type BarisTahap = {
  id: string; no: number; nama: string; acuan: string;
  aktif: boolean;
  /** tahap yang boleh ditiadakan (Updating, Diseminasi): kotak centang "Ada" */
  bolehTiada?: boolean; onAda?: () => void;
  mulai?: string; selesai?: string;
  perkEfektif: boolean; perkSendiri: boolean; onPerk: (perk: boolean) => void;
  catatan?: string;
  /** isian lengkap tahap ini (pola jendela, selisih hari, dll) */
  isi: ReactNode;
};

export function TabelJadwalTahap({ baris, mati, bukaAwal = [] }: { baris: BarisTahap[]; mati: boolean; bukaAwal?: string[] }) {
  const { terbuka, buka, alih } = useBuka(bukaAwal);
  const kols: Kol<BarisTahap>[] = [
    { id: "no", judul: "No", jenis: "pilih", nilai: (r) => String(r.no), sel: (r) => r.no },
    { id: "tahap", judul: "Tahap", jenis: "teks", nilai: (r) => r.nama, sel: (r) => <strong className="text-[#0F2A52]">{r.nama}</strong>, kelasTd: "min-w-[120px]" },
    {
      id: "ada", judul: "Ada", jenis: "pilih", nilai: (r) => (r.aktif ? "Ya" : "Tidak"),
      sel: (r) => (r.bolehTiada ? <KotakCentang aktif={r.aktif} mati={mati} onUbah={() => r.onAda?.()} nama={`Ada ${r.nama.toLowerCase()}`} /> : <span className="text-[#44546F]">Wajib</span>),
    },
    { id: "mulai", judul: "Mulai", jenis: "teks", nilai: (r) => (r.aktif ? tgl(r.mulai) : "—"), sel: (r) => (r.aktif ? <span className="whitespace-nowrap font-semibold text-[#0F2A52]">{tgl(r.mulai)}</span> : <Strip />) },
    { id: "selesai", judul: "Selesai", jenis: "teks", nilai: (r) => (r.aktif ? tgl(r.selesai) : "—"), sel: (r) => (r.aktif ? <span className="whitespace-nowrap font-semibold text-[#0F2A52]">{tgl(r.selesai)}</span> : <Strip />) },
    { id: "hari", judul: "Hari", jenis: "teks", nilai: (r) => (r.aktif ? hari(r.mulai, r.selesai) : "—"), sel: (r) => (r.aktif ? hari(r.mulai, r.selesai) : <Strip />) },
    {
      id: "perk", judul: "Kematangan", jenis: "pilih", nilai: (r) => (!r.aktif ? "—" : r.perkEfektif ? "Perkiraan" : "Fix"),
      sel: (r) => !r.aktif ? <Strip /> : (
        <div className="flex flex-col gap-0.5">
          <PerkKecil perk={r.perkSendiri} mati={mati} onPilih={r.onPerk} nama={`Jadwal ${r.nama}`} />
          {r.perkEfektif && !r.perkSendiri && <span className="text-[11.5px] font-semibold text-[#8A6200]">ikut tahap sebelumnya</span>}
        </div>
      ),
    },
    { id: "acuan", judul: "Dihitung dari", jenis: "pilih", nilai: (r) => r.acuan, sel: (r) => <span className="text-[#44546F]">{r.acuan}</span>, kelasTd: "min-w-[120px]" },
    {
      id: "rinci", judul: "Rincian", jenis: "pilih", nilai: (r) => (terbuka.has(r.id) ? "Terbuka" : "Tertutup"), lekat: true,
      sel: (r) => r.aktif
        ? <button type="button" aria-expanded={terbuka.has(r.id)} aria-controls={terbuka.has(r.id) ? `isi-${r.id}` : undefined} className={tombolKecil} onClick={() => alih(r.id)}>{terbuka.has(r.id) ? "Tutup" : mati ? "Lihat" : "Ubah"}</button>
        : <Strip />,
    },
  ];
  return (
    <TabelSaring
      label="Jadwal tahap kegiatan" kols={kols} data={baris} kunci={(r) => r.id}
      idBaris={(r) => r.id} kelasBaris={(r) => (r.aktif ? "" : KELAS_MATI)} matiBaris={(r) => !r.aktif} bukaBaris={(r) => { if (r.aktif) buka(r.id); }}
      bawah={(r) => !r.aktif || !terbuka.has(r.id) ? null : (
        <BarisIsi lebar={kols.length}>
          <div id={`isi-${r.id}`} className="flex flex-col gap-2.5">
            {r.catatan && <p className="m-0 text-[12.5px] text-[#44546F]">{r.catatan}</p>}
            {r.isi}
          </div>
        </BarisIsi>
      )}
    />
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// 2. Pelatihan dan briefing
// ---------------------------------------------------------------------------------------------------------------------
type IdSesi = "briefing" | "pelatihan";
type PropsTabel = { f: Form; ubah: (fn: (g: Form) => void) => void; tahun: number; mati: boolean; pa: string };

export function TabelSesi({ f, ubah, tahun, mati, pa }: PropsTabel) {
  const { terbuka, buka, alih } = useBuka();
  const turunan = periodeTurunan(f, pa, tahun);
  const first = daftarPeriode(f)[0];
  const ids: IdSesi[] = ["briefing", "pelatihan"];
  const nama = (id: IdSesi) => (id === "briefing" ? "Briefing" : "Pelatihan");
  const set = (id: IdSesi, fn: (s: Form["sesi"][IdSesi]) => void) => ubah((g) => { fn(g.sesi[id]); });
  const jd = (id: IdSesi) => (f.sesi[id].on ? tanggalSesi(f, id, pa, tahun) : null);
  const perk = (id: IdSesi) => recPerk(f.sesi[id].tgl[turunan ? first : pa]);
  const ins = (id: IdSesi) => instrDari(f.sesi[id]);
  // satu kolom jadwal (tanggal tunggal bila mulai = selesai) agar tabel tidak meluap
  const rentang = (id: IdSesi): string => { const j = jd(id); if (!j) return "—"; const a = tgl(j.mulai); const b = tgl(j.selesai); return a === b ? a : `${a} – ${b}`; };

  const kols: Kol<IdSesi>[] = [
    { id: "kegiatan", judul: "Kegiatan", jenis: "teks", nilai: nama, sel: (id) => <strong className="text-[#0F2A52]">{nama(id)}</strong> },
    { id: "ada", judul: "Ada", jenis: "pilih", nilai: (id) => (f.sesi[id].on ? "Ya" : "Tidak"), sel: (id) => <KotakCentang aktif={f.sesi[id].on} mati={mati} onUbah={() => set(id, (s) => { s.on = !s.on; })} nama={`Ada ${nama(id).toLowerCase()}`} /> },
    {
      id: "bentuk", judul: "Bentuk", jenis: "pilih", nilai: (id) => (f.sesi[id].on ? f.sesi[id].bentuk || "—" : "—"),
      sel: (id) => f.sesi[id].on ? <PilKecil nilai={f.sesi[id].bentuk as string} opsi={BENTUK as readonly string[]} mati={mati} nama={`Bentuk ${nama(id)}`} onPilih={(v) => set(id, (s) => { s.bentuk = v as typeof BENTUK[number]; })} /> : <Strip />,
    },
    {
      id: "tempat", judul: "Tempat", jenis: "pilih", nilai: (id) => (f.sesi[id].on && f.sesi[id].bentuk !== "Daring" ? f.sesi[id].tempat || "—" : "—"),
      sel: (id) => f.sesi[id].on && (f.sesi[id].bentuk === "Luring" || f.sesi[id].bentuk === "Hybrid")
        ? <PilKecil nilai={f.sesi[id].tempat as string} opsi={TEMPAT_PILIH as readonly string[]} mati={mati} nama={`Tempat ${nama(id)}`} onPilih={(v) => set(id, (s) => { s.tempat = v as TempatSesi; })} />
        : <Strip />,
      kelasTd: "min-w-[128px]",
    },
    {
      id: "jadwal", judul: "Jadwal", jenis: "teks", nilai: (id) => rentang(id),
      sel: (id) => (jd(id) ? <span className="whitespace-nowrap font-semibold text-[#0F2A52]">{rentang(id)}</span> : <Strip />),
    },
    { id: "perk", judul: "Kematangan", jenis: "pilih", nilai: (id) => (f.sesi[id].on ? (perk(id) ? "Perkiraan" : "Fix") : "—"), sel: (id) => (f.sesi[id].on ? <LencanaPerk perk={perk(id)} /> : <Strip />) },
    {
      id: "pulsa", judul: "Pulsa mitra", jenis: "pilih",
      nilai: (id) => (f.sesi[id].on && (f.sesi[id].bentuk === "Daring" || f.sesi[id].bentuk === "Hybrid") ? (f.sesi[id].pulsa ? "Ya" : "Tidak") : "—"),
      sel: (id) => f.sesi[id].on && (f.sesi[id].bentuk === "Daring" || f.sesi[id].bentuk === "Hybrid")
        ? <YaTidakKecil nilai={f.sesi[id].pulsa} mati={mati} nama={`${nama(id)} pulsa`} onPilih={(v) => set(id, (s) => { s.pulsa = v; })} /> : <Strip />,
    },
    {
      id: "perl", judul: "Perlengkapan", jenis: "pilih",
      nilai: (id) => (id === "pelatihan" && f.sesi[id].on && (f.sesi[id].bentuk === "Luring" || f.sesi[id].bentuk === "Hybrid") ? (f.sesi[id].perl ? "Ya" : "Tidak") : "—"),
      sel: (id) => id === "pelatihan" && f.sesi[id].on && (f.sesi[id].bentuk === "Luring" || f.sesi[id].bentuk === "Hybrid")
        ? <YaTidakKecil nilai={f.sesi[id].perl} mati={mati} nama={`${nama(id)} perlengkapan`} onPilih={(v) => set(id, (s) => { s.perl = v; })} /> : <Strip />,
    },
    {
      id: "instr", judul: "Instruktur", jenis: "pilih", nilai: (id) => (f.sesi[id].on ? (f.sesi[id].pengajar ? "Ya" : "Tidak") : "—"),
      sel: (id) => f.sesi[id].on ? (
        <div className="flex flex-col gap-0.5">
          <YaTidakKecil nilai={f.sesi[id].pengajar} mati={mati} nama={`${nama(id)} pengajar`} onPilih={(v) => set(id, (s) => { s.pengajar = v; })} />
          {f.sesi[id].pengajar && <span className="text-[11.5px] text-[#44546F]">{ins(id).jumlah} orang · {ins(id).level || "level ?"}</span>}
        </div>
      ) : <Strip />,
    },
    {
      id: "rinci", judul: "Rincian", jenis: "pilih", nilai: (id) => (terbuka.has(id) ? "Terbuka" : "Tertutup"), lekat: true,
      sel: (id) => f.sesi[id].on
        ? <button type="button" aria-expanded={terbuka.has(id)} aria-controls={terbuka.has(id) ? `isi-sesi-${id}` : undefined} className={tombolKecil} onClick={() => alih(id)}>{terbuka.has(id) ? "Tutup" : mati ? "Lihat" : "Ubah"}</button>
        : <Strip />,
    },
  ];

  return (
    <TabelSaring
      label="Pelatihan dan briefing" kols={kols} data={ids} kunci={(id) => id}
      idBaris={(id) => `sesi-${id}`} kelasBaris={(id) => (f.sesi[id].on ? "" : KELAS_MATI)} matiBaris={(id) => !f.sesi[id].on} bukaBaris={(id) => { if (f.sesi[id].on) buka(id); }}
      bawah={(id) => {
        if (!f.sesi[id].on || !terbuka.has(id)) return null;
        const s = f.sesi[id];
        const luring = s.bentuk === "Luring"; const daring = s.bentuk === "Daring"; const hybrid = s.bentuk === "Hybrid";
        const t = tanggalSesi(f, id, pa, tahun);
        const n = nama(id);
        const ii = instrDari(s);
        const setI = (p: Partial<typeof ii>) => ubah((g) => { g.sesi[id].instr = { ...instrDari(g.sesi[id]), ...p }; });
        return (
          <BarisIsi lebar={kols.length}>
            <div id={`isi-sesi-${id}`} className="flex flex-col gap-2.5">
              <strong className="text-[13.5px] text-[#0F2A52]">{n}: jadwal dan rincian</strong>
              {(luring || hybrid) && <Cat>Tempat: hotel = paket meeting fullday atau fullboard (524114 dalam kota, 524119 luar kota). Kantor atau lokasi lain = konsumsi tanpa paket (521211).</Cat>}
              {turunan ? (
                <Cat>Jadwal {n.toLowerCase()} {pa}: {tglIndo(t.mulai)} s.d. {tglIndo(t.selesai)} ({perk(id) ? "perkiraan" : "fix"}). Diturunkan dari periode acuan {first}, digeser mengikuti tanggal mulai pendataan {pa}. Ubah jadwalnya pada tab {first}.</Cat>
              ) : (
                <>
                  {daftarPeriode(f).length > 1 && <span className="text-[12px] font-semibold text-[#44546F]">Periode: {pa}</span>}
                  <WaktuIsian nama={`${n} ${pa}`} rec={s.tgl[pa]} tahun={tahun} mati={mati} onUbah={(r) => ubah((g) => { g.sesi[id].tgl[pa] = r; })} />
                </>
              )}
              {s.pengajar && (
                <div className="flex flex-col gap-2.5 rounded-lg border border-[#E3E9F2] bg-white p-2.5">
                  <strong className="text-[13px] text-[#0F2A52]">Instruktur {n.toLowerCase()}</strong>
                  <div className={kisi}>
                    <Isian judul="Jumlah instruktur"><Angka nama={`${n} jumlah instruktur`} nilai={ii.jumlah} min={0} maks={50} mati={mati} onUbah={(v) => setI({ jumlah: v })} /></Isian>
                    <Isian judul="Perkiraan jam mengajar" ket="Total jam semua instruktur."><Angka nama={`${n} jam instruktur`} nilai={ii.jam} min={0} maks={500} mati={mati} onUbah={(v) => setI({ jam: v })} /></Isian>
                  </div>
                  <Isian judul="Level instruktur" ket="Innas = instruktur nasional, Inda = instruktur daerah (menentukan tarif honor pada lembar kebijakan).">
                    <Pilihan<LevelInstruktur> nama={`${n} level instruktur`} nilai={ii.level} opsi={["Innas", "Inda"]} mati={mati} onPilih={(v) => setI({ level: v })} />
                  </Isian>
                  <Isian judul="Asal instruktur">
                    <Pilihan<AsalInstruktur> nama={`${n} asal instruktur`} nilai={ii.asal} opsi={["Internal BPS", "Eksternal"]} mati={mati} onPilih={(v) => setI({ asal: v })} />
                  </Isian>
                  <Isian judul="Data instruktur"><FixPerk nama={`Instruktur ${n}`} perk={ii.perk} mati={mati} onPilih={(v) => setI({ perk: v })} /></Isian>
                  <Cat>Nama instruktur dan level pasti diisi pada identifikasi lanjutan. Honor pengajar dihitung dari jumlah jam dan tarif sesuai level.</Cat>
                </div>
              )}
              {luring && <Cat>Bentuk Luring: pulsa tidak ditanya (bernilai Tidak).</Cat>}
              {daring && <Cat>Bentuk Daring: tempat dan perlengkapan tidak ditanya.</Cat>}
              {(luring || hybrid) && <Cat>Konsumsi atau paket hanya dihitung bila ada petugas mitra. Perlengkapan hanya untuk pelatihan (bukan briefing), baik ada maupun tanpa mitra.</Cat>}
              {(daring || hybrid) && <Cat>Pulsa peserta hanya dihitung bila ada petugas mitra.</Cat>}
            </div>
          </BarisIsi>
        );
      }}
    />
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// 3. Rapat
// ---------------------------------------------------------------------------------------------------------------------
type IdRapat = "persiapan" | "pelaksanaan" | "evaluasi";

export function TabelRapat({ f, ubah, tahun, mati, pa }: PropsTabel) {
  const { terbuka, buka, alih } = useBuka();
  const adaMitra = hitungMitra(f) > 0;
  const turunan = periodeTurunan(f, pa, tahun);
  const first = daftarPeriode(f)[0];
  const ids: IdRapat[] = ["persiapan", "pelaksanaan", "evaluasi"];
  const nama = (id: IdRapat) => `Rapat ${id}`;
  const aktif = (id: IdRapat) => id === "evaluasi" || f.rapat[id].on;
  const jd = (id: IdRapat) => (aktif(id) ? tanggalRapat(f, id, pa, tahun) : null);
  const perk = (id: IdRapat) => recPerk(f.rapat[id].tgl?.[turunan ? first : pa]);
  const konsumsi = (id: IdRapat): string => (!aktif(id) ? "—" : f.rapat[id].media.includes("Tatap muka") && adaMitra ? "Dihitung" : "Tidak dihitung");
  const ubahMedia = (id: IdRapat, m: Media) => ubah((g) => { const a = g.rapat[id].media; g.rapat[id].media = a.includes(m) ? a.filter((x) => x !== m) : [...a, m]; });

  const kols: Kol<IdRapat>[] = [
    { id: "rapat", judul: "Rapat", jenis: "teks", nilai: nama, sel: (id) => <strong className="text-[#0F2A52]">{nama(id)}</strong>, kelasTd: "min-w-[130px]" },
    {
      id: "ada", judul: "Ada", jenis: "pilih", nilai: (id) => (aktif(id) ? "Ya" : "Tidak"),
      sel: (id) => id === "evaluasi" ? <span className="rounded-full bg-[#EEF2F7] px-2.5 py-[2px] text-[11.5px] font-semibold text-[#44546F]">Wajib</span>
        : <KotakCentang aktif={f.rapat[id].on} mati={mati} onUbah={() => ubah((g) => { g.rapat[id].on = !g.rapat[id].on; })} nama={`Ada rapat ${id}`} />,
    },
    {
      id: "media", judul: "Media", jenis: "teks", nilai: (id) => (aktif(id) ? f.rapat[id].media.join(", ") || "—" : "—"),
      sel: (id) => !aktif(id) ? <Strip /> : (
        <div role="group" aria-label={`Media rapat ${id}`} className="flex flex-wrap gap-x-3 gap-y-1">
          {MEDIA.map((m) => (
            <label key={m} className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[12.5px]">
              <input type="checkbox" className="h-4 w-4 accent-[#1F5FD1]" checked={f.rapat[id].media.includes(m)} disabled={mati} onChange={() => ubahMedia(id, m)} aria-label={`Media rapat ${id}: ${m}`} />
              {m}
            </label>
          ))}
        </div>
      ),
      kelasTd: "min-w-[210px]",
    },
    { id: "mulai", judul: "Mulai", jenis: "teks", nilai: (id) => tgl(jd(id)?.mulai), sel: (id) => (jd(id) ? <span className="whitespace-nowrap font-semibold text-[#0F2A52]">{tgl(jd(id)?.mulai)}</span> : <Strip />) },
    { id: "selesai", judul: "Selesai", jenis: "teks", nilai: (id) => tgl(jd(id)?.selesai), sel: (id) => (jd(id) ? <span className="whitespace-nowrap font-semibold text-[#0F2A52]">{tgl(jd(id)?.selesai)}</span> : <Strip />) },
    { id: "perk", judul: "Kematangan", jenis: "pilih", nilai: (id) => (aktif(id) ? (perk(id) ? "Perkiraan" : "Fix") : "—"), sel: (id) => (aktif(id) ? <LencanaPerk perk={perk(id)} /> : <Strip />) },
    { id: "konsumsi", judul: "Konsumsi", jenis: "pilih", nilai: konsumsi, sel: (id) => (aktif(id) ? <span className={konsumsi(id) === "Dihitung" ? "font-semibold text-[#14653A]" : "text-[#44546F]"}>{konsumsi(id)}</span> : <Strip />) },
    {
      id: "rinci", judul: "Rincian", jenis: "pilih", nilai: (id) => (terbuka.has(id) ? "Terbuka" : "Tertutup"), lekat: true,
      sel: (id) => aktif(id)
        ? <button type="button" aria-expanded={terbuka.has(id)} aria-controls={terbuka.has(id) ? `isi-rapat-${id}` : undefined} className={tombolKecil} onClick={() => alih(id)}>{terbuka.has(id) ? "Tutup" : mati ? "Lihat" : "Ubah"}</button>
        : <Strip />,
    },
  ];

  return (
    <TabelSaring
      label="Rapat" kols={kols} data={ids} kunci={(id) => id}
      idBaris={(id) => `rapat-${id}`} kelasBaris={(id) => (aktif(id) ? "" : KELAS_MATI)} matiBaris={(id) => !aktif(id)} bukaBaris={(id) => { if (aktif(id)) buka(id); }}
      bawah={(id) => {
        if (!aktif(id) || !terbuka.has(id)) return null;
        const r = f.rapat[id];
        const t = tanggalRapat(f, id, pa, tahun);
        return (
          <BarisIsi lebar={kols.length}>
            <div id={`isi-rapat-${id}`} className="flex flex-col gap-2.5">
              <strong className="text-[13.5px] text-[#0F2A52]">{nama(id)}: jadwal</strong>
              {turunan ? (
                <Cat>Jadwal rapat {id} {pa}: {tglIndo(t.mulai)} s.d. {tglIndo(t.selesai)} ({perk(id) ? "perkiraan" : "fix"}). Diturunkan dari periode acuan {first}. Ubah jadwalnya pada tab {first}.</Cat>
              ) : (
                <>
                  {daftarPeriode(f).length > 1 && <span className="text-[12px] font-semibold text-[#44546F]">Periode: {pa}</span>}
                  <WaktuIsian nama={`Rapat ${id} ${pa}`} rec={r.tgl?.[pa]} tahun={tahun} mati={mati} onUbah={(x) => ubah((g) => { g.rapat[id].tgl = { ...(g.rapat[id].tgl ?? {}), [pa]: x }; })} />
                </>
              )}
              {r.media.includes("Tatap muka") && <Cat>Konsumsi rapat {id}: dihitung bila rapat luring (tatap muka) dan ada petugas mitra, keduanya harus terpenuhi. Saat ini {adaMitra ? "keduanya terpenuhi, konsumsi dihitung." : "belum ada petugas mitra, konsumsi belum dihitung."}</Cat>}
              {r.media.length > 0 && !r.media.includes("Tatap muka") && <Cat>Rapat {id} tidak tatap muka (luring), sehingga konsumsi tidak dihitung.</Cat>}
            </div>
          </BarisIsi>
        );
      }}
    />
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// 4. Organisasi pendataan lapangan (per peran)
// ---------------------------------------------------------------------------------------------------------------------
type DefPeran = (typeof PERAN_DEF)[number];

export function TabelPeran({ f, ubah, mati }: { f: Form; ubah: (fn: (g: Form) => void) => void; mati: boolean }) {
  const papi = f.instrumen === "PAPI";
  const setP = (id: PeranId, patch: Partial<Form["peran"]["ppl"]>) => ubah((g) => { Object.assign(g.peran[id], patch); });
  const terkunci = (d: DefPeran) => d.id === "entri" && !papi;
  const pakai = (d: DefPeran) => f.peran[d.id].on && !terkunci(d);
  const adaOrg = (d: DefPeran) => f.peran[d.id].status === "Organik" || f.peran[d.id].status === "Organik dan mitra";
  const adaMit = (d: DefPeran) => f.peran[d.id].status === "Mitra" || f.peran[d.id].status === "Organik dan mitra";
  const honorAktif = (d: DefPeran) => d.honor === "pilih" && f.peran[d.id].honor;

  const kols: Kol<DefPeran>[] = [
    {
      id: "peran", judul: "Peran", jenis: "teks", nilai: (d) => d.nama,
      sel: (d) => <div className="flex flex-col"><strong className="text-[#0F2A52]">{d.nama}</strong>{terkunci(d) && <span className="text-[11.5px] text-[#5B6B84]">Hanya untuk instrumen PAPI</span>}</div>,
      kelasTd: "min-w-[110px]",
    },
    {
      id: "dipakai", judul: "Dipakai", jenis: "pilih", nilai: (d) => (pakai(d) ? "Ya" : "Tidak"),
      sel: (d) => <KotakCentang aktif={pakai(d)} mati={mati || terkunci(d)} onUbah={() => setP(d.id, { on: !f.peran[d.id].on })} nama={`Dipakai ${d.nama}`} />,
    },
    {
      id: "status", judul: "Status", jenis: "pilih", nilai: (d) => (pakai(d) ? f.peran[d.id].status : "—"),
      sel: (d) => pakai(d)
        ? <PilKecil nilai={f.peran[d.id].status as string} opsi={(d.id === "supervisor" ? STATUS_SUP : STATUS) as readonly string[]} mati={mati} nama={`Status ${d.nama}`} onPilih={(v) => setP(d.id, { status: v as StatusPetugas })} />
        : <Strip />,
      kelasTd: "min-w-[150px]",
    },
    {
      id: "org", judul: "Organik", jenis: "teks", nilai: (d) => (pakai(d) && adaOrg(d) ? String(f.peran[d.id].nOrg) : "—"),
      sel: (d) => pakai(d) && adaOrg(d) ? <div className="w-[76px]"><Angka nama={`Jumlah ${d.nama} organik`} nilai={f.peran[d.id].nOrg} min={0} mati={mati} onUbah={(v) => setP(d.id, { nOrg: v })} /></div> : <Strip />,
    },
    {
      id: "mit", judul: "Mitra", jenis: "teks", nilai: (d) => (pakai(d) && adaMit(d) ? String(f.peran[d.id].nMit) : "—"),
      sel: (d) => pakai(d) && adaMit(d) ? <div className="w-[76px]"><Angka nama={`Jumlah ${d.nama} mitra`} nilai={f.peran[d.id].nMit} min={0} mati={mati} onUbah={(v) => setP(d.id, { nMit: v })} /></div> : <Strip />,
    },
    {
      id: "perk", judul: "Kematangan jumlah", jenis: "pilih", nilai: (d) => (pakai(d) ? (f.peran[d.id].perk ? "Perkiraan" : "Fix") : "—"),
      sel: (d) => pakai(d) ? <PerkKecil perk={f.peran[d.id].perk} mati={mati} nama={`Jumlah ${d.nama}`} onPilih={(v) => setP(d.id, { perk: v })} /> : <Strip />,
    },
    {
      id: "translok", judul: "Translok", jenis: "pilih", nilai: (d) => (!pakai(d) ? "—" : d.translok === "kunci" ? "Ya" : d.translok === "pilih" ? (f.peran[d.id].translok ? "Ya" : "Tidak") : "—"),
      sel: (d) => !pakai(d) ? <Strip /> : d.translok === "pilih"
        ? <YaTidakKecil nilai={f.peran[d.id].translok} mati={mati} nama={`Translok ${d.nama}`} onPilih={(v) => setP(d.id, { translok: v })} />
        : d.translok === "kunci" ? <span className="text-[#44546F]">Ya (tetap)</span> : <Strip />,
    },
    {
      id: "honor", judul: "Honorarium", jenis: "pilih", nilai: (d) => (pakai(d) && d.honor === "pilih" ? (f.peran[d.id].honor ? "Ya" : "Tidak") : "—"),
      sel: (d) => pakai(d) && d.honor === "pilih" ? <YaTidakKecil nilai={f.peran[d.id].honor} mati={mati} nama={`Honor ${d.nama}`} onPilih={(v) => setP(d.id, { honor: v })} /> : <Strip />,
    },
    {
      id: "dasar", judul: "Dasar honorarium", jenis: "teks", nilai: (d) => (pakai(d) && honorAktif(d) && f.peran[d.id].status === "Organik" ? f.peran[d.id].dasar || "—" : "—"),
      sel: (d) => pakai(d) && honorAktif(d) && f.peran[d.id].status === "Organik"
        ? <input className={`${selKecil} min-w-[190px]`} value={f.peran[d.id].dasar} maxLength={200} disabled={mati} onChange={(e) => setP(d.id, { dasar: e.target.value })} aria-label={`Dasar honor ${d.nama}`} placeholder="SK atau juknis" />
        : <Strip />,
    },
  ];

  return (
    <TabelSaring
      label="Organisasi pendataan lapangan" kols={kols} data={[...PERAN_DEF]} kunci={(d) => d.id}
      idBaris={(d) => `peran-${d.id}`} kelasBaris={(d) => (pakai(d) ? "" : KELAS_MATI)} matiBaris={(d) => !pakai(d)}
    />
  );
}

/** Honor anggota tim (kegiatan Ad-hoc): tetap kartu kecil di bawah tabel. */
export function KartuHonorTim({ f, ubah, mati }: { f: Form; ubah: (fn: (g: Form) => void) => void; mati: boolean }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[#DCE3EE] bg-[#FAFBFD] p-3">
      <strong className="text-[14px] text-[#0F2A52]">Honor anggota tim (kegiatan Ad-hoc)</strong>
      <Isian judul="Ada honor untuk anggota tim?"><YaTidak nama="Honor tim" nilai={f.tim.honor} mati={mati} onPilih={(v) => ubah((g) => { g.tim.honor = v; })} /></Isian>
      {f.tim.honor && (
        <Isian judul="Yang menerima honor" ket="Centang jabatan tim yang menerima honor.">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Jabatan tim penerima honor">
            {JABATAN_TIM.map((j) => <Centang key={j.id} aktif={f.tim[j.id]} mati={mati} onUbah={() => ubah((g) => { g.tim[j.id] = !g.tim[j.id]; })}>{j.nama}</Centang>)}
          </div>
        </Isian>
      )}
    </div>
  );
}
