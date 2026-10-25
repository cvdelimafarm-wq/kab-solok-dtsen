"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/pelaksanaan/Kartu.tsx
//
// (25 Okt 2026, tahap 31) Kartu halaman Pelaksanaan: tautan kegiatan, usulan penugasan (terapkan ke SIGAP), laporan harian dan keselarasan jadwal, evaluasi,
// dan kesiapan Bendahara. Hanya tampilan; aturan ada di lib/keu/pelaksanaan.ts, hak ditegakkan basis data. Semua peringatan tidak memblokir.

import { useMemo, useState } from "react";
import { Catatan, Chip, kolom, label, tombolKecil, tombolUtama } from "@/app/sigap/keu-ui";
import { tglIndo } from "@/lib/keu/identifikasi";
import {
  agendaEvaluasi, calonBelumTertaut, fungsiBawaan, FUNGSI_KEGIATAN, ID_PL, kalimatHasilTerap, kodeSiap, LABEL_USULAN, NAMA_FUNGSI, ringkasLaporan, ringkasUsulan,
  selarasJadwal, urutkanUsulan, type BarisBiaya, type ButirPencairan, type CalonKegiatan, type FungsiKegiatan, type HasilTerap, type KegiatanBahan, type KegiatanTertaut,
} from "@/lib/keu/pelaksanaan";
import type { Form } from "@/lib/keu/identifikasi";
import { Bagian, Centang, Poin } from "../../Kontrol";
import { useUsulan } from "./usePelaksanaan";

const rp = (n: number): string => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const periode = (a: string | null, b: string | null): string => (a && b ? `${tglIndo(a)} s.d. ${tglIndo(b)}` : "periode belum diatur");
const galatKotak = (g: string | null) => (g ? <p role="alert" className="m-0 rounded-lg border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{g}</p> : null);

// ---------------------------------------------------------------------------------------------------------------------
export function KartuTautan(p: {
  tertaut: KegiatanTertaut[]; calon: CalonKegiatan[]; bisa: boolean; mengirim: boolean; galat: string | null;
  onTautkan: (kegiatanId: number, fungsi: FungsiKegiatan, catatan: string) => Promise<boolean>; onLepas: (kegiatanId: number) => Promise<boolean>;
}) {
  const belum = useMemo(() => calonBelumTertaut(p.calon), [p.calon]);
  const [pilih, setPilih] = useState<number | "">("");
  const [fungsi, setFungsi] = useState<FungsiKegiatan>("pendataan");
  const [catatan, setCatatan] = useState("");
  const terpilih = belum.find((c) => c.kegiatan_id === pilih) ?? null;
  const pilihKegiatan = (v: string) => {
    const id = v === "" ? "" : Number(v);
    setPilih(id);
    const c = belum.find((x) => x.kegiatan_id === id);
    if (c) setFungsi(fungsiBawaan(c.jenis));
  };
  return (
    <Bagian huruf="A" judul="Kegiatan pelaksanaan tertaut" id={ID_PL.tautan}>
      <Catatan>
        Tautkan identifikasi ini ke kegiatan di SIGAP (Kelola translok) agar penugasan, laporan harian, dan evaluasi dapat dipantau. Tautan dipilih manual; kegiatan yang
        kode anggarannya memuat kode RO diberi tanda &ldquo;disarankan&rdquo;. Tautan tidak mengubah kegiatan itu sendiri.
      </Catatan>
      {p.tertaut.length === 0 ? <p className="m-0 text-[13px] text-[#5B6B84]">Belum ada kegiatan tertaut.</p> : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {p.tertaut.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-[#DCE3EE] px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[14px] font-semibold text-[#0F2A52]">{k.nama}</p>
                <p className="m-0 text-[12px] text-[#5B6B84]">{k.kode} · {periode(k.mulai, k.selesai)} · {k.n_penugasan} penugasan aktif</p>
              </div>
              <Chip warna="biru">{NAMA_FUNGSI[k.fungsi]}</Chip>
              {!k.aktif && <Chip warna="abu">Nonaktif</Chip>}
              {k.disarankan && <Chip warna="hijau">Kode RO sama</Chip>}
              {p.bisa && <button type="button" className={tombolKecil} disabled={p.mengirim} onClick={() => void p.onLepas(k.kegiatan_id)}>Lepas tautan</button>}
            </li>
          ))}
        </ul>
      )}
      {p.bisa ? (
        <div className="grid min-w-0 gap-2.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <label className="block min-w-0">
            <span className={label}>Tautkan kegiatan</span>
            <select className={kolom} value={pilih} onChange={(e) => pilihKegiatan(e.target.value)} disabled={p.mengirim || belum.length === 0}>
              <option value="">{belum.length === 0 ? "Tidak ada kegiatan lain" : "Pilih kegiatan…"}</option>
              {belum.map((c) => <option key={c.kegiatan_id} value={c.kegiatan_id}>{c.disarankan ? "★ " : ""}{c.nama} ({c.kode}){c.aktif ? "" : " — nonaktif"}</option>)}
            </select>
          </label>
          <label className="block min-w-0">
            <span className={label}>Fungsi</span>
            <select className={kolom} value={fungsi} onChange={(e) => setFungsi(e.target.value as FungsiKegiatan)} disabled={p.mengirim}>
              {FUNGSI_KEGIATAN.map((f) => <option key={f} value={f}>{NAMA_FUNGSI[f]}</option>)}
            </select>
          </label>
          <label className="block min-w-0 sm:col-span-2">
            <span className={label}>Catatan (opsional, maks. 300 huruf)</span>
            <input className={kolom} maxLength={300} value={catatan} onChange={(e) => setCatatan(e.target.value)} disabled={p.mengirim} />
          </label>
          {terpilih && !terpilih.disarankan && <p className="m-0 text-[12.5px] text-[#8A6200] sm:col-span-2">Kode anggaran kegiatan ini tidak memuat kode RO; pastikan memang kegiatan yang dimaksud.</p>}
          <div className="sm:col-span-2">
            <button type="button" className={tombolUtama} disabled={p.mengirim || pilih === ""}
              onClick={() => { if (pilih !== "") void p.onTautkan(pilih, fungsi, catatan.trim()).then((ok) => { if (ok) { setPilih(""); setCatatan(""); } }); }}>
              {p.mengirim ? "Menyimpan…" : "Tautkan"}
            </button>
          </div>
        </div>
      ) : <p className="m-0 text-[12.5px] text-[#5B6B84]">Menautkan hanya untuk ketua tim, admin RO, atau penyusun lain RO ini.</p>}
      {galatKotak(p.galat)}
    </Bagian>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
export function KartuUsulan(p: {
  identId: number; tertaut: KegiatanTertaut[]; bisa: boolean; final: boolean; ada: boolean; versi: number; mengirim: boolean; galat: string | null; hasil: HasilTerap | null;
  onTerapkan: (kegiatanId: number, kode: string[]) => Promise<boolean>;
}) {
  const [kid, setKid] = useState<number | null>(null);
  const aktifId = kid !== null && p.tertaut.some((k) => k.kegiatan_id === kid) ? kid : p.tertaut[0]?.kegiatan_id ?? null;
  const usulan = useUsulan(p.ada ? p.identId : null, aktifId, p.versi);
  const daftar = useMemo(() => urutkanUsulan(usulan.butir ?? []), [usulan.butir]);
  const siap = useMemo(() => kodeSiap(daftar), [daftar]);
  const ringkas = ringkasUsulan(daftar);
  const [dipilih, setDipilih] = useState<Set<string>>(new Set());
  const centangSemua = siap.length > 0 && siap.every((k) => dipilih.has(k));
  const tampilDipilih = siap.filter((k) => dipilih.has(k));
  const ubah = (k: string) => setDipilih((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <Bagian huruf="B" judul="Usulan penugasan petugas" id={ID_PL.usulan}>
      <Catatan>
        Dari daftar petugas bernama pada identifikasi lanjutan, SIGAP mencocokkan nama dengan akun aktif lalu mengusulkan penugasan. Menerapkan <strong>hanya menambah</strong>
        penugasan baru ke kegiatan; tidak pernah mengubah atau menghapus penugasan yang sudah ada, dan tarif peran tidak diubah. Peran koordinator wilayah pada lanjutan menjadi
        korwil di SIGAP.
      </Catatan>
      {!p.ada && <p className="m-0 text-[13px] text-[#5B6B84]">Identifikasi lanjutan belum disimpan.</p>}
      {p.ada && p.tertaut.length === 0 && <p className="m-0 text-[13px] text-[#5B6B84]">Tautkan kegiatan di bagian A terlebih dahulu.</p>}
      {p.ada && p.tertaut.length > 0 && (
        <>
          <label className="block min-w-0">
            <span className={label}>Kegiatan tujuan</span>
            <select className={kolom} value={aktifId ?? ""} onChange={(e) => { setKid(Number(e.target.value)); setDipilih(new Set()); }}>
              {p.tertaut.map((k) => <option key={k.kegiatan_id} value={k.kegiatan_id}>{k.nama} ({NAMA_FUNGSI[k.fungsi]})</option>)}
            </select>
          </label>
          {!p.final && <Catatan>Identifikasi lanjutan masih Draf. Usulan dapat dilihat, tetapi diterapkan hanya sesudah lanjutan Final.</Catatan>}
          {usulan.galat && galatKotak(usulan.galat)}
          {usulan.memuat && <p className="m-0 text-[13px] text-[#5B6B84]">Memuat usulan…</p>}
          {usulan.butir && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-[#44546F]">
                <Chip warna="hijau">{ringkas.siap} siap</Chip><Chip warna="biru">{ringkas.sudahAda} sudah ditugaskan</Chip>
                {ringkas.perluTindakan > 0 && <Chip warna="kuning">{ringkas.perluTindakan} perlu tindakan</Chip>}
                {ringkas.menyusul > 0 && <Chip warna="abu">{ringkas.menyusul} nama menyusul</Chip>}
              </div>
              {daftar.length === 0 ? <p className="m-0 text-[13px] text-[#5B6B84]">Belum ada petugas pada lanjutan.</p> : (
                <div className="min-w-0 overflow-x-auto">
                  <table className="w-full min-w-[620px] border-collapse text-left text-[12.5px]">
                    <thead><tr className="border-b border-[#DCE3EE] text-[#5B6B84]"><th className="py-1.5 pr-2 font-semibold">Terapkan</th><th className="pr-2 font-semibold">Petugas</th><th className="pr-2 font-semibold">Peran</th><th className="pr-2 font-semibold">Akun SIGAP</th><th className="font-semibold">Status</th></tr></thead>
                    <tbody>
                      {daftar.map((b) => (
                        <tr key={`${b.kode}-${b.urut}`} className="border-b border-[#EEF2F7] align-top">
                          <td className="py-1.5 pr-2">{b.status === "siap" ? <input type="checkbox" aria-label={`Terapkan ${b.nama}`} checked={dipilih.has(b.kode)} disabled={!p.bisa || !p.final || p.mengirim} onChange={() => ubah(b.kode)} /> : <span aria-hidden className="text-[#8FA3C2]">—</span>}</td>
                          <td className="pr-2 text-[#0F2A52]">{b.nama || "(tanpa nama)"}<div className="text-[11.5px] text-[#5B6B84]">{b.kode}</div></td>
                          <td className="pr-2">{b.peran_sigap ?? b.peran_lanjutan ?? "—"}</td>
                          <td className="pr-2">{b.akun_nama ?? "—"}</td>
                          <td><Chip warna={LABEL_USULAN[b.status].nada}>{LABEL_USULAN[b.status].teks}</Chip>{b.catatan && <div className="mt-0.5 text-[11.5px] text-[#5B6B84]">{b.catatan}</div>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {siap.length > 0 && p.bisa && p.final && (
                <div className="flex flex-wrap items-center gap-2">
                  <Centang aktif={centangSemua} onUbah={() => setDipilih(centangSemua ? new Set() : new Set(siap))} mati={p.mengirim}>Pilih semua yang siap ({siap.length})</Centang>
                  <button type="button" className={tombolUtama} disabled={p.mengirim || tampilDipilih.length === 0 || aktifId === null}
                    onClick={() => { if (aktifId !== null) void p.onTerapkan(aktifId, tampilDipilih).then((ok) => { if (ok) setDipilih(new Set()); }); }}>
                    {p.mengirim ? "Menerapkan…" : `Terapkan ${tampilDipilih.length} penugasan`}
                  </button>
                </div>
              )}
              {!p.bisa && <p className="m-0 text-[12.5px] text-[#5B6B84]">Menerapkan penugasan hanya untuk ketua tim, admin RO, atau penyusun lain RO ini.</p>}
            </>
          )}
          {p.hasil && <p role="status" className="m-0 rounded-lg border-l-4 border-[#2E9E63] bg-[#E6F6EC] px-3 py-2 text-[13px] text-[#14653A]">{kalimatHasilTerap(p.hasil)} PPK sudah diberi tahu.</p>}
        </>
      )}
      {galatKotak(p.galat)}
    </Bagian>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
export function KartuLaporan(p: { kegiatan: KegiatanBahan[]; jadwal: { periode: string; mulai: string; selesai: string }[]; hariIni: string }) {
  return (
    <Bagian huruf="C" judul="Pelaksanaan dan laporan harian" id={ID_PL.laporan}>
      {p.kegiatan.length === 0 ? <p className="m-0 text-[13px] text-[#5B6B84]">Belum ada kegiatan tertaut.</p> : p.kegiatan.map((k) => {
        const r = ringkasLaporan(k, p.hariIni);
        const sel = selarasJadwal(k, p.jadwal);
        return (
          <div key={k.id} className="flex min-w-0 flex-col gap-2 rounded-lg border border-[#DCE3EE] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="m-0 text-[14px] font-bold text-[#0F2A52]">{k.nama}</h3>
              <Chip warna="biru">{NAMA_FUNGSI[k.fungsi]}</Chip>
              <Chip warna={r.nada}>{r.petugasAktif} petugas · {r.laporan} laporan / {r.hariKerja} hari kerja</Chip>
            </div>
            <p className="m-0 text-[12px] text-[#5B6B84]">{periode(k.mulai, k.selesai)}</p>
            <Poin butir={sel.map((s) => <span key={s.pesan}>{s.pesan}</span>)} />
            {r.catatan.length > 0 && <Poin kelas="!text-[#5C4300]" butir={r.catatan} />}
            {k.petugas.length > 0 && (
              <div className="min-w-0 overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-left text-[12.5px]">
                  <thead><tr className="border-b border-[#DCE3EE] text-[#5B6B84]"><th className="py-1.5 pr-2 font-semibold">Petugas</th><th className="pr-2 font-semibold">Peran</th><th className="pr-2 text-right font-semibold">Hari kerja</th><th className="pr-2 text-right font-semibold">Laporan</th><th className="font-semibold">Terakhir lapor</th></tr></thead>
                  <tbody>
                    {k.petugas.map((t) => (
                      <tr key={t.akun_id} className={`border-b border-[#EEF2F7] ${t.aktif ? "" : "opacity-60"}`}>
                        <td className="py-1.5 pr-2 text-[#0F2A52]">{t.nama}{!t.aktif && <span className="ml-1 text-[11px] text-[#5B6B84]">(nonaktif)</span>}</td>
                        <td className="pr-2">{t.peran ?? "—"}</td>
                        <td className="pr-2 text-right tabular-nums">{t.hari_kerja}</td>
                        <td className={`pr-2 text-right tabular-nums ${r.sudahBerakhir && t.aktif && t.laporan < t.hari_kerja ? "font-semibold text-[#B42329]" : ""}`}>{t.laporan}</td>
                        <td>{t.lapor_terakhir ? tglIndo(t.lapor_terakhir.slice(0, 10)) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </Bagian>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
export function KartuEvaluasi(p: { form: Form; kegiatan: KegiatanBahan[]; hariIni: string }) {
  const a = useMemo(() => agendaEvaluasi(p.form, p.kegiatan, p.hariIni), [p.form, p.kegiatan, p.hariIni]);
  return (
    <Bagian huruf="D" judul="Evaluasi pelaksanaan" id={ID_PL.evaluasi}>
      <div className="flex flex-wrap items-center gap-2"><Chip warna={a.nada}>{a.rapat > 0 ? `${a.rapat} rapat evaluasi` : "Belum ada rapat evaluasi"}</Chip><span className="text-[12.5px] text-[#44546F]">{a.pesan}</span></div>
      {a.butir.length > 0 && (
        <div>
          <p className="m-0 mb-1 text-[12.5px] font-semibold text-[#44546F]">Bahan evaluasi dari identifikasi awal:</p>
          <Poin butir={a.butir} />
        </div>
      )}
    </Bagian>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
export function KartuBendahara(p: { baris: BarisBiaya[]; adaLaporan: boolean; sampai: string | null; syarat: ButirPencairan[] }) {
  return (
    <Bagian huruf="E" judul="Kesiapan pencairan (Bendahara)" id={ID_PL.bendahara}>
      <Catatan>Kebutuhan di sini perkiraan dari identifikasi lanjutan dan <strong>belum sah</strong>; pagu dan sisa mengikuti laporan realisasi terakhir yang diunggah. Ini alat bantu, bukan persetujuan pencairan.</Catatan>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {p.syarat.map((s) => (
          <li key={s.butir} className="flex flex-wrap items-baseline gap-2 text-[13px]">
            <Chip warna={s.siap === null ? "abu" : s.siap ? "hijau" : "kuning"}>{s.siap === null ? "Belum dapat dinilai" : s.siap ? "Siap" : "Belum"}</Chip>
            <span className="font-semibold text-[#0F2A52]">{s.butir}</span><span className="text-[12.5px] text-[#5B6B84]">{s.ket}</span>
          </li>
        ))}
      </ul>
      {p.baris.length > 0 && (
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-left text-[12.5px]">
            <thead><tr className="border-b border-[#DCE3EE] text-[#5B6B84]"><th className="py-1.5 pr-2 font-semibold">Akun</th><th className="pr-2 text-right font-semibold">Kebutuhan</th><th className="pr-2 text-right font-semibold">Pagu</th><th className="pr-2 text-right font-semibold">Sisa</th><th className="font-semibold">Status</th></tr></thead>
            <tbody>
              {p.baris.map((b) => (
                <tr key={b.akun} className="border-b border-[#EEF2F7] align-top">
                  <td className="py-1.5 pr-2 text-[#0F2A52]">{b.akun}<div className="text-[11.5px] text-[#5B6B84]">{b.nama}</div></td>
                  <td className="pr-2 text-right tabular-nums">{rp(b.kebutuhan)}</td>
                  <td className="pr-2 text-right tabular-nums">{b.pagu === null ? "—" : rp(b.pagu)}</td>
                  <td className="pr-2 text-right tabular-nums">{b.sisa === null ? "—" : rp(b.sisa)}</td>
                  <td><Chip warna={b.nada}>{b.status === "cukup" ? "Mencukupi" : b.status === "kurang" ? "Kurang" : b.status === "tanpa_pagu" ? "Pagu belum ada" : "Belum dihitung"}</Chip><div className="mt-0.5 text-[11.5px] text-[#5B6B84]">{b.catatan}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!p.adaLaporan && <p className="m-0 text-[12.5px] text-[#5B6B84]">Belum ada laporan realisasi untuk RO ini.</p>}
      {p.sampai && <p className="m-0 text-[12px] text-[#5B6B84]">Laporan realisasi s.d. {tglIndo(p.sampai)}.</p>}
    </Bagian>
  );
}
