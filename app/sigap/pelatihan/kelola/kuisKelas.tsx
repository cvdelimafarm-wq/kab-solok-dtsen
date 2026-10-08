"use client";

// app/sigap/pelatihan/kelola/kuisKelas.tsx
//
// (8 Okt 2026) Adu Sigap > Pengaturan Kelas. Tiap kelas (1-4) punya kuis, pilihan soal, dan pengaturan sendiri:
//   ① Soal  ② Jalannya kuis  ③ Tampilan & suara  ④ Jadwal & mulai.
// Pemilihan soal: ACAK MERATA (bergiliran antar Topik; soal yang belum dipakai kelas lain didahulukan) atau MANUAL.
// Pengaturan disimpan per kelas; saat ruang dibuka, pengaturan & urutan soal di-"snapshot" ke ruang itu.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {KELAS_GABUNGAN, labelKelas, DETIK_MAX, DETIK_MIN, JEDA_MAKS, PENGATURAN_DEFAULT, TOPIK_UMUM, normalisasiPengaturan, pilihSoalMerata, rngBenih, ringkasMain, type Pengaturan, type SoalKuis } from "@/lib/sigapKuis";
import { MAKS_SOAL } from "@/lib/sigapTes";
import { fetchJson, pesanGalat, SesiBerakhir } from "../../admin/api";
import { BTN, BTN_G, BTN_O, Chip, INPUT, Kartu, Pesan } from "../../admin/ui";
import { URL_KUIS_ADMIN } from "./kuisHost";
import { LABEL_STATUS, kirim, menit, type AksiFn, type Daftar, type KonfigKelas } from "./kuisBersama";

const WIB_MS = 7 * 3600_000;
const isoKeInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + WIB_MS).toISOString().slice(0, 16) : "");
const inputKeIso = (v: string) => (v ? new Date(`${v}:00+07:00`).toISOString() : null);

type Draft = { kuis_id: number | null; pengaturan: Pengaturan; soal_pilihan: number[] };
const dariKonfig = (k: KonfigKelas): Draft => ({ kuis_id: k.kuis_id, pengaturan: normalisasiPengaturan(k.pengaturan), soal_pilihan: [...k.soal_pilihan] });

function Sakelar({ nilai, onUbah, label, ket, mati }: { nilai: boolean; onUbah: (v: boolean) => void; label: string; ket?: string; mati?: boolean }) {
  return (
    <label className={`flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1.5 ${mati ? "opacity-50" : ""}`}>
      <button type="button" role="switch" aria-checked={nilai} aria-label={label} disabled={mati} onClick={() => onUbah(!nilai)} className={`relative mt-0.5 h-[22px] w-[40px] shrink-0 rounded-full transition ${nilai ? "bg-[#6B2FC0]" : "bg-[#CDD5DE]"}`}>
        <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all ${nilai ? "left-[21px]" : "left-[3px]"}`} />
      </button>
      <span className="min-w-0 text-[13px]">
        <span className="font-semibold text-[#14202E]">{label}</span>
        {ket && <span className="block text-[11.5px] text-[#7B8794]">{ket}</span>}
      </span>
    </label>
  );
}

function Seg<T extends string>({ nilai, pilihan, onUbah, label }: { nilai: T; pilihan: { v: T; t: string }[]; onUbah: (v: T) => void; label: string }) {
  return (
    <span className="inline-flex rounded-lg border border-[#CDD5DE] bg-white p-0.5" role="group" aria-label={label}>
      {pilihan.map((p) => (
        <button key={p.v} type="button" aria-pressed={nilai === p.v} onClick={() => onUbah(p.v)} className={`rounded-md px-3 py-1 text-[12.5px] font-semibold transition ${nilai === p.v ? "bg-[#46178F] text-white" : "text-[#4D5B6B] hover:bg-[#F1EAFB]"}`}>
          {p.t}
        </button>
      ))}
    </span>
  );
}

function Angka({ nilai, onUbah, min, max, satuan, label }: { nilai: number; onUbah: (v: number) => void; min: number; max: number; satuan?: string; label: string }) {
  const atur = (v: number) => onUbah(Math.min(max, Math.max(min, Math.round(v) || min)));
  return (
    <span className="inline-flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" className={BTN_O} aria-label={`${label} kurangi`} onClick={() => atur(nilai - 1)} disabled={nilai <= min}>−</button>
      <input className={`${INPUT} w-[64px] text-center tabular-nums`} type="number" min={min} max={max} value={nilai} aria-label={label} onChange={(e) => atur(Number(e.target.value))} />
      <button type="button" className={BTN_O} aria-label={`${label} tambah`} onClick={() => atur(nilai + 1)} disabled={nilai >= max}>＋</button>
      {satuan && <span className="text-[12px] text-[#7B8794]">{satuan}</span>}
    </span>
  );
}

export function PengaturanKelas({ data, bisaKelola, sibuk, aksi, bukaHost }: { data: Daftar; bisaKelola: boolean; sibuk: boolean; aksi: AksiFn; bukaHost: (ruangId: number) => void }) {
  const [kelas, setKelas] = useState(data.kelas_saya ?? 1); // inda/instruktur: langsung terbuka di kelasnya
  const konfig = data.kelas.find((k) => k.kelas === kelas)!;
  const [draft, setDraft] = useState<Draft>(() => dariKonfig(konfig));
  const versiTerakhir = useRef<string>(`${kelas}|${konfig.diubah_at ?? ""}`);
  const [soalBank, setSoalBank] = useState<Record<number, SoalKuis[]>>({});
  const [galatSoal, setGalatSoal] = useState<string | null>(null);

  // sinkron draft hanya saat berpindah kelas atau data server berubah (mis. setelah Simpan), bukan tiap polling
  useEffect(() => {
    const v = `${kelas}|${konfig.diubah_at ?? ""}`;
    if (v !== versiTerakhir.current) {
      versiTerakhir.current = v;
      setDraft(dariKonfig(konfig));
    }
  }, [kelas, konfig]);

  const kuisDipilih = data.kuis.find((k) => k.id === draft.kuis_id) ?? null;
  const diubahKuis = kuisDipilih?.diubah_at ?? "";
  const muatSoal = useCallback(async (id: number) => {
    try {
      const d = await fetchJson<{ soal: SoalKuis[] }>(`${URL_KUIS_ADMIN}?bagian=soal&kuis_id=${id}`);
      setSoalBank((s) => ({ ...s, [id]: d.soal }));
      setGalatSoal(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalatSoal(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    if (draft.kuis_id !== null && bisaKelola) void muatSoal(draft.kuis_id);
  }, [draft.kuis_id, diubahKuis, bisaKelola, muatSoal]);
  const bank = useMemo(() => (draft.kuis_id !== null ? (soalBank[draft.kuis_id] ?? []) : []), [soalBank, draft.kuis_id]);

  // soal yang sudah dipakai kelas lain (pada kuis yang sama)
  const dipakaiLain = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const k of data.kelas) {
      if (k.kelas === kelas || k.kuis_id !== draft.kuis_id) continue;
      for (const n of k.soal_pilihan) (m.get(n) ?? m.set(n, []).get(n)!).push(k.kelas);
    }
    return m;
  }, [data.kelas, kelas, draft.kuis_id]);

  const p = draft.pengaturan;
  const ubahP = (u: Partial<Pengaturan>) => setDraft((d) => ({ ...d, pengaturan: { ...d.pengaturan, ...u } }));

  const acak = useCallback(
    (kuis: SoalKuis[], pp: Pengaturan, benih: number) => pilihSoalMerata(kuis, Math.min(pp.jumlah, kuis.length), new Set(dipakaiLain.keys()), pp.dahulukan_belum_dipakai, rngBenih(benih)),
    [dipakaiLain]
  );
  const acakUlang = () => setDraft((d) => ({ ...d, soal_pilihan: acak(bank, d.pengaturan, Date.now()) }));

  // mode acak: pilihan mengikuti jumlah/dahulukan/kuis (dihitung ulang di klien; server memakai pilihan ini bila jumlahnya cocok)
  const kunciAcak = `${p.mode}|${p.jumlah}|${p.dahulukan_belum_dipakai}|${draft.kuis_id}|${bank.length}`;
  const kunciSebelum = useRef("");
  useEffect(() => {
    if (kunciSebelum.current === kunciAcak) return;
    kunciSebelum.current = kunciAcak;
    if (p.mode !== "acak" || !bank.length) return;
    setDraft((d) => {
      const target = Math.min(d.pengaturan.jumlah, bank.length);
      const ada = d.soal_pilihan.filter((n) => bank.some((s) => s.nomor === n));
      if (ada.length === target && d.soal_pilihan.length === target) return d;
      return { ...d, soal_pilihan: acak(bank, d.pengaturan, Date.now()) };
    });
  }, [kunciAcak, p.mode, bank, acak]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(dariKonfig(konfig));
  const ruangKelas = data.ruang.filter((r) => r.kelas === kelas);
  const ruangAktif = ruangKelas.find((r) => r.status !== "selesai") ?? null;
  const ringkas = useMemo(() => ringkasMain(bank, draft.soal_pilihan, p), [bank, draft.soal_pilihan, p]);

  const topikBank = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of bank) m.set(s.topik?.trim() || TOPIK_UMUM, (m.get(s.topik?.trim() || TOPIK_UMUM) ?? 0) + 1);
    return m;
  }, [bank]);
  const topikPilih = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of draft.soal_pilihan) {
      const s = bank.find((x) => x.nomor === n);
      if (s) m.set(s.topik?.trim() || TOPIK_UMUM, (m.get(s.topik?.trim() || TOPIK_UMUM) ?? 0) + 1);
    }
    return m;
  }, [bank, draft.soal_pilihan]);

  async function simpan(): Promise<boolean> {
    let ok = true;
    await aksi(async () => {
      try {
        await kirim({ aksi: "simpan_kelas", kelas, kuis_id: draft.kuis_id, pengaturan: draft.pengaturan, soal_pilihan: draft.soal_pilihan });
      } catch (e) {
        ok = false;
        throw e;
      }
    }, `Pengaturan ${labelKelas(kelas)} tersimpan.`);
    return ok;
  }
  async function bukaRuang() {
    if (dirty && !(await simpan())) return;
    await aksi(async () => {
      const r = await kirim<{ ruang_id: number }>({ aksi: "buka_ruang", kelas });
      bukaHost(r.ruang_id);
    });
  }

  const nPesertaKelas = konfig.anggota;
  const tabKelas = [1, 2, 3, 4, KELAS_GABUNGAN].map((k) => { // (8 Okt 2026) + Semua Kelas
    const r = data.ruang.find((x) => x.kelas === k && x.status !== "selesai");
    return { k, r };
  });
  const bolehEdit = bisaKelola && !sibuk;

  return (
    <div className="space-y-3">
      {/* tab kelas */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Pilih kelas">
        {tabKelas.map(({ k, r }) => {
          const kf = data.kelas.find((x) => x.kelas === k)!;
          return (
            <button key={k} type="button" role="tab" aria-selected={kelas === k} onClick={() => setKelas(k)} className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[13.5px] font-bold transition ${kelas === k ? "border-[#46178F] bg-[#46178F] text-white" : "border-[#CDD5DE] bg-white text-[#14202E] hover:bg-[#F1EAFB]"}`}>
              {labelKelas(k)}
              {r ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${kelas === k ? "bg-[#FFD02B] text-[#2B0F55]" : "bg-[#FBEFD6] text-[#9A6200]"}`}>● {LABEL_STATUS[r.status].split(" · ")[0]}</span> : kf.kuis_id !== null ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${kelas === k ? "bg-white/25" : "bg-[#DFF2EC] text-[#12816A]"}`}>siap</span> : <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${kelas === k ? "bg-white/25" : "bg-[#EDF0F4] text-[#4D5B6B]"}`}>belum diatur</span>}
            </button>
          );
        })}
      </div>

      {ruangAktif && (
        <Pesan jenis="info">
          {labelKelas(kelas)} sedang punya ruang <b>{LABEL_STATUS[ruangAktif.status].toLowerCase()}</b> ({ruangAktif.jumlah_peserta} peserta). Perubahan di bawah berlaku untuk ruang berikutnya.{" "}
          <button type="button" className="font-bold text-[#46178F] underline" onClick={() => bukaHost(ruangAktif.id)}>Buka layar host</button>
        </Pesan>
      )}
      {kelas === KELAS_GABUNGAN && (
        <Pesan jenis="info">
          <b>Semua Kelas</b> = satu ruang gabungan untuk seluruh peserta (satu layar host, satu papan skor &amp; podium). Saat ruang ini dibuka, peserta yang
          ruang kelasnya tidak aktif otomatis diarahkan ke sini, jadi <b>Stop dulu ruang Kelas 1–4</b> yang masih berjalan.
        </Pesan>
      )}
      {!bisaKelola && <Pesan jenis="peringatan">Anda hanya punya izin melihat. Pengaturan kelas hanya dapat diubah oleh pengelola.</Pesan>}

      <div className="grid gap-3 xl:grid-cols-2">
        {/* ① Soal */}
        <Kartu judul="① Soal" ket={`${labelKelas(kelas)} · ${nPesertaKelas} peserta`} className="xl:col-span-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="text-[13px] font-semibold">Kuis dari bank</label>
            <select className={`${INPUT} min-w-[220px]`} value={draft.kuis_id ?? ""} disabled={!bolehEdit} onChange={(e) => setDraft((d) => ({ ...d, kuis_id: e.target.value ? Number(e.target.value) : null, soal_pilihan: [] }))} aria-label="Kuis untuk kelas ini">
              <option value="">— pilih kuis —</option>
              {data.kuis.map((k) => (
                <option key={k.id} value={k.id} disabled={k.jumlah_soal === 0}>
                  {k.judul} ({k.jumlah_soal} soal)
                </option>
              ))}
            </select>
            {data.kuis.length === 0 && <span className="text-[12.5px] text-[#9A6200]">Belum ada kuis. Buat dulu di tab Bank Kuis.</span>}
          </div>

          {draft.kuis_id !== null && (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-[13px] font-semibold">Jumlah soal</span>
                {p.mode === "manual" ? (
                  <Chip w="navy">{draft.soal_pilihan.length} soal dicentang · dari {kuisDipilih?.jumlah_soal ?? 0} di bank</Chip>
                ) : (
                  <Angka label="Jumlah soal" nilai={Math.min(p.jumlah, Math.max(1, bank.length || MAKS_SOAL))} min={1} max={Math.max(1, bank.length || data.maks_soal)} onUbah={(v) => ubahP({ jumlah: v })} satuan={`dari ${kuisDipilih?.jumlah_soal ?? 0} di bank`} />
                )}
                <Seg
                  label="Cara memilih soal"
                  nilai={p.mode}
                  onUbah={(v) => setDraft((d) => ({ ...d, pengaturan: { ...d.pengaturan, mode: v, jumlah: v === "manual" ? Math.max(1, d.soal_pilihan.length) : d.pengaturan.jumlah } }))}
                  pilihan={[{ v: "acak", t: "🎲 Acak merata" }, { v: "manual", t: "☑ Manual" }]}
                />
                {p.mode === "acak" && (
                  <button type="button" className={BTN_O} disabled={!bolehEdit || !bank.length} onClick={acakUlang}>🎲 Acak ulang</button>
                )}
              </div>
              {p.mode === "acak" && (
                <div className="mt-2">
                  <Sakelar nilai={p.dahulukan_belum_dipakai} onUbah={(v) => ubahP({ dahulukan_belum_dipakai: v })} label="Dahulukan soal yang belum dipakai kelas lain" ket="Agar keempat kelas mendapat soal berbeda selama bank soal mencukupi." mati={!bolehEdit} />
                </div>
              )}
              {p.mode === "manual" && <p className="mt-2 text-[12.5px] text-[#7B8794]">Centang soal yang akan dimainkan. Jumlah soal mengikuti jumlah yang dicentang.</p>}

              {!bisaKelola ? null : galatSoal ? (
                <div className="mt-2"><Pesan jenis="galat">{galatSoal}</Pesan></div>
              ) : (
                <>
                  {topikPilih.size > 0 && (
                    <div className="mt-3 space-y-1" aria-label="Sebaran topik">
                      <p className="text-[12.5px] font-semibold text-[#4D5B6B]">Sebaran topik terpilih</p>
                      {[...topikBank.keys()].map((t) => {
                        const n = topikPilih.get(t) ?? 0;
                        const total = topikBank.get(t) ?? 1;
                        return (
                          <div key={t} className="flex items-center gap-2 text-[12px]">
                            <span className="w-[150px] shrink-0 truncate font-semibold" title={t}>{t}</span>
                            <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#EDE3FA]">
                              <span className="block h-full rounded-full bg-[#6B2FC0]" style={{ width: `${Math.min(100, (n / total) * 100)}%` }} />
                            </span>
                            <span className="w-[64px] shrink-0 text-right tabular-nums text-[#55657D]">{n} / {total}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <ol className="mt-3 max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
                    {bank
                      .filter((s) => p.mode === "manual" || draft.soal_pilihan.includes(s.nomor))
                      .map((s) => {
                        const pilih = draft.soal_pilihan.includes(s.nomor);
                        const lain = dipakaiLain.get(s.nomor);
                        return (
                          <li key={s.nomor} className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] ${pilih ? "bg-[#F1EAFB]" : "bg-[#F8FAFC]"}`}>
                            {p.mode === "manual" ? (
                              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#6B2FC0]" checked={pilih} disabled={!bolehEdit} aria-label={`Pilih soal ${s.nomor}`} onChange={(e) =>
                                setDraft((d) => {
                                  const baru = (e.target.checked ? [...d.soal_pilihan, s.nomor] : d.soal_pilihan.filter((n) => n !== s.nomor)).sort((a, b) => a - b);
                                  return { ...d, soal_pilihan: baru, pengaturan: { ...d.pengaturan, jumlah: Math.max(1, baru.length) } };
                                })
                              } />
                            ) : (
                              <span className="mt-0.5 text-[#6B2FC0]" aria-hidden>✔</span>
                            )}
                            <span className="min-w-0 flex-1">
                              <b>{s.nomor}.</b> {s.teks}
                            </span>
                            {s.topik && <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-[#46178F]">{s.topik}</span>}
                            {lain && <span className="shrink-0 rounded-full bg-[#FBEFD6] px-2 py-0.5 text-[11px] font-semibold text-[#9A6200]">dipakai Kls {lain.join(", ")}</span>}
                            <span className="shrink-0 tabular-nums text-[#7B8794]">{s.detik} dtk</span>
                          </li>
                        );
                      })}
                    {bank.length === 0 && <li className="text-[12.5px] text-[#7B8794]">Memuat soal…</li>}
                  </ol>
                </>
              )}
            </>
          )}
        </Kartu>

        {/* ② Jalannya kuis */}
        <Kartu judul="② Jalannya kuis">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[13px] font-semibold">Waktu per soal</span>
              <Seg label="Waktu per soal" nilai={p.waktu} onUbah={(v) => ubahP({ waktu: v })} pilihan={[{ v: "bank", t: "Ikut kolom Detik" }, { v: "seragam", t: "Seragam" }]} />
              {p.waktu === "seragam" && <Angka label="Detik seragam" nilai={p.detik_seragam} min={DETIK_MIN} max={DETIK_MAX} satuan="detik" onUbah={(v) => ubahP({ detik_seragam: v })} />}
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[13px] font-semibold">Jeda pembahasan</span>
              <Angka label="Jeda pembahasan" nilai={p.jeda_pembahasan} min={3} max={JEDA_MAKS} satuan="detik" onUbah={(v) => ubahP({ jeda_pembahasan: v })} />
            </div>
            <Sakelar nilai={p.lanjut_otomatis} onUbah={(v) => ubahP({ lanjut_otomatis: v })} label="Lanjut otomatis ke soal berikutnya" ket={`Setelah jeda pembahasan ${p.jeda_pembahasan} detik. Mati = pemandu menekan Lanjut.`} mati={!bolehEdit} />
            <Sakelar nilai={p.acak_soal} onUbah={(v) => ubahP({ acak_soal: v })} label="Acak urutan soal" ket="Urutan diacak saat ruang dibuka; sama untuk semua peserta di kelas." mati={!bolehEdit} />
            <Sakelar nilai={p.acak_opsi} onUbah={(v) => ubahP({ acak_opsi: v })} label="Acak urutan pilihan jawaban" ket="Warna tombol mengikuti posisi, bukan huruf." mati={!bolehEdit} />
            <Sakelar nilai={p.bonus_kecepatan} onUbah={(v) => ubahP({ bonus_kecepatan: v })} label="Bonus kecepatan" ket="Mati = benar selalu 1000 poin; Hidup = 500–1000 menurut kecepatan." mati={!bolehEdit} />
          </div>
        </Kartu>

        {/* ③ Tampilan & suara */}
        <Kartu judul="③ Tampilan & suara">
          <div className="space-y-2.5">
            <Sakelar nilai={p.papan_live_hp} onUbah={(v) => ubahP({ papan_live_hp: v })} label="Papan skor live di HP peserta" ket="Peserta melihat 5 besar dan selisih ke peringkat di atasnya. Mati = hanya poin & peringkat sendiri." mati={!bolehEdit} />
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[13px] font-semibold">Nama di proyektor</span>
              <Seg label="Mode nama" nilai={p.nama_mode} onUbah={(v) => ubahP({ nama_mode: v })} pilihan={[{ v: "singkat", t: "Singkat · Ardial J." }, { v: "penuh", t: "Nama lengkap" }]} />
            </div>
            <Sakelar nilai={p.musik} onUbah={(v) => ubahP({ musik: v })} label="Musik & efek suara layar host" ket="Dapat dibisukan juga dari layar host." mati={!bolehEdit} />
            <Sakelar nilai={p.gabung_terlambat} onUbah={(v) => ubahP({ gabung_terlambat: v })} label="Boleh bergabung terlambat" ket="Mati = peserta yang belum masuk lobi tidak bisa ikut setelah kuis dimulai." mati={!bolehEdit} />
          </div>
        </Kartu>

        {/* ④ Jadwal & mulai */}
        <Kartu judul="④ Jadwal & mulai" className="xl:col-span-2">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[13px]">
              <span className="mb-1 block font-semibold">Jadwal mulai (WIB)</span>
              <input type="datetime-local" className={INPUT} value={isoKeInput(p.jadwal_mulai)} disabled={!bolehEdit} onChange={(e) => ubahP({ jadwal_mulai: inputKeIso(e.target.value), mulai_otomatis: e.target.value ? p.mulai_otomatis : false })} aria-label="Jadwal mulai" />
            </label>
            {p.jadwal_mulai && (
              <button type="button" className={BTN_O} disabled={!bolehEdit} onClick={() => ubahP({ jadwal_mulai: null, mulai_otomatis: false })}>Hapus jadwal</button>
            )}
            <Sakelar nilai={p.mulai_otomatis} onUbah={(v) => ubahP({ mulai_otomatis: v })} label="Mulai otomatis saat jadwal tiba" ket="Mati = hanya hitung mundur di lobi; pemandu tetap menekan Start." mati={!bolehEdit || !p.jadwal_mulai} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Soal", String(ringkas.soal)],
              ["Perkiraan durasi", ringkas.soal ? `±${ringkas.menit} menit` : "—"],
              ["Poin maksimum", ringkas.soal ? String(ringkas.poin_maks) : "—"],
              ["Peserta kelas", String(nPesertaKelas)],
            ].map(([t, v]) => (
              <div key={t} className="rounded-xl bg-[#F1EAFB] px-3 py-2">
                <p className="text-[11.5px] font-semibold text-[#6B4DA0]">{t}</p>
                <p className="text-[18px] font-extrabold tabular-nums text-[#46178F]">{v}</p>
              </div>
            ))}
          </div>
          {ringkas.soal > 0 && <p className="mt-1.5 text-[11.5px] text-[#7B8794]">Waktu menjawab total {menit(ringkas.detik)}{p.lanjut_otomatis ? ` + jeda pembahasan ${p.jeda_pembahasan} dtk × ${ringkas.soal} soal` : ""}.</p>}

          {bisaKelola && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" className={BTN} disabled={sibuk || !dirty} onClick={() => void simpan()}>💾 Simpan pengaturan {labelKelas(kelas)}</button>
              {dirty && <Chip w="wait">belum disimpan</Chip>}
              {ruangAktif ? (
                <button type="button" className={BTN_G} onClick={() => bukaHost(ruangAktif.id)}>🖥 Buka layar host {labelKelas(kelas)}</button>
              ) : (
                <button type="button" className={BTN_G} disabled={sibuk || draft.kuis_id === null || ringkas.soal === 0} title={draft.kuis_id === null ? "Pilih kuis dulu" : undefined} onClick={bukaRuang}>
                  ▶ Buka ruang & layar host
                </button>
              )}
              <a className={BTN_O} href={`/sigap/pelatihan/kuis?kelas=${kelas}&gabung=1`} target="_blank" rel="noreferrer">📱 Main sebagai peserta</a>
            </div>
          )}
        </Kartu>
      </div>
      <p className="text-[11.5px] text-[#7B8794]">Nilai awal pengaturan: {PENGATURAN_DEFAULT.jumlah} soal, acak merata, waktu mengikuti bank, jeda {PENGATURAN_DEFAULT.jeda_pembahasan} dtk.</p>
    </div>
  );
}
