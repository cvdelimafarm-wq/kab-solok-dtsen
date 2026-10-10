"use client";

// app/sigap/pendataan/page.tsx
//
// (11 Okt 2026) Lembar Pendataan keroyokan PPL/PML (mockup disetujui user; pewarnaan "A": warna = PPL, bentuk = hasil).
// Seluruh anggota tim (PML + semua PPL-nya) melihat SEMUA KK di Sub SLS timnya dan menandai hasil: didata-terdampak, didata-tidak terdampak, tidak ditemukan.
// Hasil terakhir yang berlaku (menurut waktu kejadian di HP); pelaku tercatat di log. Tab: Peta | Daftar KK | Monitoring (bersama PPL dan PML).
// Tahap 1: titik KK di kanvas tanpa peta dasar; peta jalan offline (tahap 2), flag "segera didata" oleh PML (tahap 3), draf translok (tahap 4).

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import IkonMenu from "@/app/portal/IkonMenu";
import { keAtas } from "@/app/portal/navigasi";
import BannerAntrean from "@/app/portal/BannerAntrean";
import { useAntrean } from "@/app/portal/antreanKirim";
import { dariAman } from "../identifikasi/useIdentifikasi";
import PetaKk, { IkonHasil, PANDANG_AWAL, warnaPelaku, type Pandang } from "./PetaKk";
import { inisial, namaDepan, tandaiKk, useKkSub, useTimPendataan, useUnduhKkLatar, waktuRingkas } from "./usePendataan";
import {
  HASIL_KK,
  LABEL_HASIL,
  LABEL_PENDEK,
  WARNA_BELUM,
  buatProyeksi,
  jarakMeter,
  jumlahHitung,
  ringkasPerPpl,
  ringkasPerSub,
  type Anggota,
  type HasilKk,
  type KkLembar,
  type SubTim,
} from "@/lib/pendataan";

type Tab = "peta" | "daftar" | "mon";
type FStatus = "semua" | "belum" | HasilKk;
type Urut = "belum" | "nama" | "dekat";

const KUNCI_SUB = "sigap_pendataan_sub";
const ALASAN_TIDAK_DITEMUKAN = ["Rumah kosong", "Pindah", "Menolak", "Alamat tidak ada"];
const SUBTEKS: Record<HasilKk, string> = { terdampak: "Keluarga terdampak bencana", tidak_terdampak: "Keluarga tidak terdampak", tidak_ditemukan: "Rumah kosong, pindah, menolak, atau alamat tidak ada" };

const namaSub = (s: SubTim) => `${s.nagari} · ${s.sls}${s.sub_sls ? ` / ${s.sub_sls}` : ""}`;
const fmtJarak = (m: number) => (!Number.isFinite(m) ? "" : m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${Math.round(m / 10) * 10} m`);

function Pil({ a }: { a: Anggota | undefined }) {
  return (
    <span className="inline-grid h-[20px] min-w-[26px] flex-none place-items-center rounded-full px-1.5 text-[10px] font-extrabold leading-none text-white" style={{ background: warnaPelaku(a) }}>
      {a ? inisial(a.nama) : "?"}
    </span>
  );
}

export default function LembarPendataan() {
  const router = useRouter();
  const tim = useTimPendataan();
  const { menunggu } = useAntrean();
  const [dari, setDari] = useState<string | null>(null);
  const [subPilih, setSubPilih] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("peta");
  const [fStatus, setFStatus] = useState<FStatus>("semua");
  const [fPpl, setFPpl] = useState<number | null>(null);
  const [urut, setUrut] = useState<Urut>("belum");
  const [terpilihId, setTerpilihId] = useState<number | null>(null);
  const [pandang, setPandang] = useState<Pandang>(PANDANG_AWAL);
  const [saya, setSaya] = useState<{ lat: number; lng: number } | null>(null);
  const [monPpl, setMonPpl] = useState<number | null>(null);
  const [toast, setToast] = useState<{ pesan: string; urungkan?: () => void } | null>(null);

  useEffect(() => {
    setDari(dariAman());
    try {
      setSubPilih(new URLSearchParams(window.location.search).get("sub") ?? localStorage.getItem(KUNCI_SUB));
    } catch {
      /* abaikan */
    }
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(t);
  }, [toast]);

  const data = tim.data;
  const subId = useMemo(() => {
    if (!data || data.sub.length === 0) return null;
    return data.sub.some((s) => s.idsubsls === subPilih) ? subPilih : data.sub[0].idsubsls;
  }, [data, subPilih]);
  const kkQ = useKkSub(subId);
  useUnduhKkLatar(useMemo(() => (data ? data.sub.map((s) => s.idsubsls) : []), [data]), subId);

  const anggota = useMemo(() => new Map((data?.anggota ?? []).map((a) => [a.akun_id, a])), [data]);
  const kk = useMemo(() => kkQ.data?.kk ?? [], [kkQ.data]);
  const sayaAkun = data?.saya.akun_id ?? 0;

  const proj = useMemo(() => {
    const t = kk.filter((k) => k.lat !== null && k.lng !== null).map((k) => ({ lat: k.lat as number, lng: k.lng as number }));
    return buatProyeksi(t, 360, 440, 28);
  }, [kk]);
  const tanpaKoordinat = useMemo(() => kk.filter((k) => k.lat === null).length, [kk]);

  const hitung = useMemo(() => {
    const c = { semua: kk.length, belum: 0, terdampak: 0, tidak_terdampak: 0, tidak_ditemukan: 0 };
    for (const k of kk) if (k.hasil) c[k.hasil]++;
    c.belum = c.semua - c.terdampak - c.tidak_terdampak - c.tidak_ditemukan;
    return c;
  }, [kk]);

  const lolos = (k: KkLembar) => (fStatus === "semua" ? true : fStatus === "belum" ? !k.hasil : k.hasil === fStatus) && (fPpl === null || k.ppl_akun_id === fPpl);
  const tampil = useMemo(() => new Set(kk.filter(lolos).map((k) => k.id)), [kk, fStatus, fPpl]); // eslint-disable-line react-hooks/exhaustive-deps

  const daftar = useMemo(() => {
    const a = kk.filter(lolos);
    const jarak = (k: KkLembar) => (saya && k.lat !== null && k.lng !== null ? jarakMeter(saya, { lat: k.lat, lng: k.lng }) : Infinity);
    if (urut === "dekat" && saya) a.sort((p, q) => jarak(p) - jarak(q));
    else if (urut === "nama") a.sort((p, q) => p.nama_kk.localeCompare(q.nama_kk));
    else a.sort((p, q) => Number(!!p.hasil) - Number(!!q.hasil) || p.nama_kk.localeCompare(q.nama_kk));
    return a;
  }, [kk, fStatus, fPpl, urut, saya]); // eslint-disable-line react-hooks/exhaustive-deps

  const terpilih = terpilihId !== null ? kk.find((k) => k.id === terpilihId) ?? null : null;

  const perSub = useMemo(() => ringkasPerSub(data?.ringkas ?? []), [data]);
  const perPpl = useMemo(() => ringkasPerPpl(data?.ringkas ?? []), [data]);

  function pilihSub(id: string) {
    setSubPilih(id);
    setTerpilihId(null);
    setPandang(PANDANG_AWAL);
    setFStatus("semua");
    setFPpl(null);
    setSaya(null);
    try {
      localStorage.setItem(KUNCI_SUB, id);
    } catch {
      /* abaikan */
    }
  }

  function tandai(k: KkLembar, hasil: HasilKk, alasan?: string) {
    if (!subId) return;
    const sebelum = { hasil: k.hasil, ppl: k.ppl_akun_id, alasan: k.alasan };
    const r = tandaiKk(subId, k, hasil, alasan);
    if (!r.ok) return setToast({ pesan: r.pesan });
    // Urungkan hanya bila tidak menggeser atribusi rekan: KK sebelumnya belum didata, atau hasil milik saya sendiri
    const bisaUrung = sebelum.hasil === null || sebelum.ppl === sayaAkun;
    setToast({
      pesan: `Tersimpan: ${LABEL_HASIL[hasil]}`,
      urungkan: bisaUrung ? () => void tandaiKk(subId, k, sebelum.hasil ?? "belum", sebelum.hasil ? sebelum.alasan : null) : undefined,
    });
  }
  function kembalikan(k: KkLembar) {
    if (!subId) return;
    const sebelum = { hasil: k.hasil, ppl: k.ppl_akun_id, alasan: k.alasan };
    const r = tandaiKk(subId, k, "belum");
    if (!r.ok) return setToast({ pesan: r.pesan });
    setToast({ pesan: "Dikembalikan ke belum didata", urungkan: sebelum.hasil && sebelum.ppl === sayaAkun ? () => void tandaiKk(subId, k, sebelum.hasil as HasilKk, sebelum.alasan) : undefined });
  }

  function cariPosisi() {
    if (!navigator.geolocation) return setToast({ pesan: "Perangkat ini tidak punya GPS." });
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setSaya({ lat: p.coords.latitude, lng: p.coords.longitude });
        setUrut("dekat");
        setTab("daftar");
      },
      () => setToast({ pesan: "Lokasi tidak bisa dibaca. Izinkan lokasi untuk aplikasi ini lalu coba lagi." }),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  function lihatDiPeta(k: KkLembar) {
    if (!proj || k.lat === null || k.lng === null) return;
    setPandang({ cx: proj.x(k.lng), cy: proj.y(k.lat), z: 3.2 });
    setTab("peta");
  }

  const chipBase = "min-h-[40px] flex-none rounded-full px-3 text-[12px] font-extrabold inline-flex items-center gap-1.5";
  const chipOn = "bg-[#0F2A52] text-white";
  const chipOff = "bg-white text-[#55657D] shadow-[0_2px_6px_rgba(15,42,82,.08)]";
  const statusChip = (k: FStatus, teks: string, n: number, ikon?: React.ReactNode) => (
    <button key={k} type="button" aria-pressed={fStatus === k} onClick={() => setFStatus(k)} className={`${chipBase} ${fStatus === k ? chipOn : chipOff}`}>
      {ikon}
      {teks} <b>{n}</b>
    </button>
  );

  const subAktif = data?.sub.find((s) => s.idsubsls === subId) ?? null;
  const ppls = (data?.anggota ?? []).filter((a) => a.peran === "ppl");
  const bukanTim = tim.galat && /khusus anggota tim/i.test(tim.galat);

  const total = Object.values(perSub).reduce((n, s) => n + s.total, 0);
  const didata = Object.values(perSub).reduce((n, s) => n + s.didata, 0);

  return (
    <main className="min-h-screen bg-[#F5F8FE] pb-28 text-[#1B2B4B]">
      <header className="bg-[linear-gradient(165deg,#1A4590_0%,#0F2A52_100%)] px-4 pb-4 pt-4 text-white">
        <div className="mx-auto max-w-xl">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => keAtas(router, dari ?? "/")} aria-label="Kembali" className="grid h-11 w-11 flex-none place-items-center rounded-full bg-white/15 active:bg-white/25">
              <IkonMenu n="kembali" className="h-5 w-5 text-white" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-[18px] font-extrabold leading-tight tracking-[-0.2px]">Lembar Pendataan</h1>
              <p className="truncate text-[11.5px] text-[#A9BCD8]">{data ? `Tim ${namaDepan(data.pml.nama)} · ${data.saya.peran === "pml" ? "PML" : "PPL"}` : "Pendataan Pascabencana"}</p>
            </div>
          </div>
          {data && data.sub.length > 0 && (
            <div className="mt-3">
              <label htmlFor="sub-pendataan" className="sr-only">
                Sub SLS
              </label>
              <select
                id="sub-pendataan"
                value={subId ?? ""}
                onChange={(e) => pilihSub(e.target.value)}
                className="h-11 w-full rounded-[12px] border border-white/25 bg-white/12 px-3 text-[13.5px] font-bold text-white [&>option]:text-[#0F2A52]"
              >
                {data.sub.map((s) => {
                  const r = perSub[s.idsubsls];
                  return (
                    <option key={s.idsubsls} value={s.idsubsls}>
                      {namaSub(s)}
                      {r ? ` (${r.didata}/${r.total})` : ""}
                    </option>
                  );
                })}
              </select>
              {subAktif && <p className="mt-1.5 truncate text-[11.5px] text-[#A9BCD8]">Kec. {subAktif.kecamatan}</p>}
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-xl space-y-3 px-3.5 pt-3">
        {tim.galat && (
          <p className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">
            {bukanTim ? "Lembar Pendataan khusus anggota tim PML dan PPL. Akun Anda belum terhubung ke tim pendataan." : tim.galat}
          </p>
        )}
        {!data && !tim.galat && <div className="h-40 animate-pulse rounded-[20px] bg-white" aria-busy="true" />}
        <BannerAntrean satuan="penandaan" />

        {data && data.sub.length === 0 && <p className="rounded-[16px] bg-white p-4 text-[13px] text-[#55657D] shadow-[0_8px_22px_rgba(15,42,82,.08)]">Tim Anda belum mendapat pembagian Sub SLS.</p>}

        {data && subId && (
          <>
            <nav role="tablist" aria-label="Tampilan" className="flex overflow-hidden rounded-[14px] bg-white shadow-[0_2px_10px_rgba(15,42,82,.08)]">
              {([
                ["peta", "Peta"],
                ["daftar", "Daftar KK"],
                ["mon", "Monitoring"],
              ] as [Tab, string][]).map(([k, t]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`min-h-[46px] flex-1 border-b-[3px] text-[13px] font-extrabold ${tab === k ? "border-[#1F5FD1] text-[#1F5FD1]" : "border-transparent text-[#6B7A90]"}`}>
                  {t}
                </button>
              ))}
            </nav>

            {tab !== "mon" && (
              <>
                {kkQ.galat && !kkQ.data && <p className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{kkQ.galat}</p>}
                {kkQ.memuat && <div className="h-24 animate-pulse rounded-[16px] bg-white" aria-busy="true" />}

                {kkQ.data && kk.length === 0 && (
                  <p className="rounded-[16px] bg-white p-4 text-[13px] text-[#55657D] shadow-[0_8px_22px_rgba(15,42,82,.08)]">Daftar KK untuk Sub SLS ini belum diunggah admin.</p>
                )}

                {kk.length > 0 && (
                  <>
                    <div className="-mx-3.5 flex gap-2 overflow-x-auto px-3.5 pb-1" role="group" aria-label="Saring menurut status">
                      {statusChip("semua", "Semua", hitung.semua)}
                      {statusChip("belum", "Belum", hitung.belum, <IkonHasil hasil={null} warna={WARNA_BELUM} ukuran={16} />)}
                      {HASIL_KK.map((h) => statusChip(h, LABEL_PENDEK[h], hitung[h], <IkonHasil key={h} hasil={h} warna="#52627A" ukuran={16} />))}
                    </div>
                    <div className="-mx-3.5 flex gap-2 overflow-x-auto px-3.5 pb-1" role="group" aria-label="Saring menurut PPL">
                      <button type="button" aria-pressed={fPpl === null} onClick={() => setFPpl(null)} className={`${chipBase} ${fPpl === null ? chipOn : chipOff}`}>
                        Semua PPL
                      </button>
                      {ppls.map((a) => (
                        <button key={a.akun_id} type="button" aria-pressed={fPpl === a.akun_id} onClick={() => setFPpl(fPpl === a.akun_id ? null : a.akun_id)} className={`${chipBase} ${fPpl === a.akun_id ? chipOn : chipOff}`}>
                          <Pil a={a} />
                          {namaDepan(a.nama)}
                          {a.akun_id === sayaAkun ? " (saya)" : ""}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {kk.length > 0 && tab === "peta" && (
                  <section className="overflow-hidden rounded-[20px] bg-white shadow-[0_10px_28px_rgba(15,42,82,.12)]">
                    <div className="relative">
                      {proj ? (
                        <PetaKk kk={kk} proj={proj} anggota={anggota} pandang={pandang} setPandang={(f) => setPandang(f)} terpilih={terpilihId} tampil={tampil} onPilih={setTerpilihId} saya={saya} />
                      ) : (
                        <p className="p-6 text-center text-[13px] text-[#55657D]">Belum ada KK yang punya koordinat di Sub SLS ini. Gunakan tab Daftar KK.</p>
                      )}
                      {proj && (
                        <div className="absolute right-2.5 top-2.5 flex flex-col gap-1.5">
                          <button type="button" aria-label="Perbesar" onClick={() => setPandang((p) => ({ ...p, z: Math.min(8, p.z * 1.6) }))} className="grid h-11 w-11 place-items-center rounded-full bg-white text-[20px] font-bold text-[#0F2A52] shadow-[0_2px_8px_rgba(15,42,82,.2)]">
                            +
                          </button>
                          <button type="button" aria-label="Perkecil" onClick={() => setPandang((p) => ({ ...p, z: Math.max(1, p.z / 1.6) }))} className="grid h-11 w-11 place-items-center rounded-full bg-white text-[20px] font-bold text-[#0F2A52] shadow-[0_2px_8px_rgba(15,42,82,.2)]">
                            −
                          </button>
                          <button type="button" aria-label="Tampilkan semua" onClick={() => setPandang(PANDANG_AWAL)} className="grid h-11 w-11 place-items-center rounded-full bg-white text-[11px] font-extrabold text-[#0F2A52] shadow-[0_2px_8px_rgba(15,42,82,.2)]">
                            Semua
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#E8EDF5] px-3.5 py-2.5 text-[11.5px] text-[#52627A]">
                      <span className="inline-flex items-center gap-1"><IkonHasil hasil="terdampak" warna="#52627A" ukuran={16} />Terdampak</span>
                      <span className="inline-flex items-center gap-1"><IkonHasil hasil="tidak_terdampak" warna="#52627A" ukuran={16} />Tidak terdampak</span>
                      <span className="inline-flex items-center gap-1"><IkonHasil hasil="tidak_ditemukan" warna="#52627A" ukuran={16} />Tidak ditemukan</span>
                      <span className="inline-flex items-center gap-1"><IkonHasil hasil={null} warna={WARNA_BELUM} ukuran={16} />Belum</span>
                      <span>Warna = PPL yang mendata</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-[#E8EDF5] px-3.5 py-2.5">
                      <span className="text-[11.5px] text-[#6B7A90]">{tanpaKoordinat > 0 ? `${tanpaKoordinat} KK tanpa koordinat hanya ada di Daftar KK.` : "Peta jalan menyusul; titik sudah akurat."}</span>
                      <button type="button" onClick={cariPosisi} className="min-h-[40px] flex-none rounded-full bg-[#1F5FD1] px-3.5 text-[12px] font-extrabold text-white">
                        Terdekat dari saya
                      </button>
                    </div>
                  </section>
                )}

                {kk.length > 0 && tab === "daftar" && (
                  <section className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Urutan">
                      {saya && (
                        <button type="button" aria-pressed={urut === "dekat"} onClick={() => setUrut("dekat")} className={`${chipBase} ${urut === "dekat" ? chipOn : chipOff}`}>
                          Terdekat
                        </button>
                      )}
                      <button type="button" aria-pressed={urut === "belum"} onClick={() => setUrut("belum")} className={`${chipBase} ${urut === "belum" ? chipOn : chipOff}`}>
                        Belum dulu
                      </button>
                      <button type="button" aria-pressed={urut === "nama"} onClick={() => setUrut("nama")} className={`${chipBase} ${urut === "nama" ? chipOn : chipOff}`}>
                        Nama
                      </button>
                      {!saya && (
                        <button type="button" onClick={cariPosisi} className={`${chipBase} ${chipOff}`}>
                          Urut terdekat dari saya
                        </button>
                      )}
                    </div>
                    {daftar.length === 0 && <p className="rounded-[14px] bg-white p-4 text-[13px] text-[#55657D]">Tidak ada KK dengan penyaringan ini.</p>}
                    {daftar.map((k) => {
                      const a = k.ppl_akun_id ? anggota.get(k.ppl_akun_id) : undefined;
                      const jarak = saya && k.lat !== null && k.lng !== null ? fmtJarak(jarakMeter(saya, { lat: k.lat, lng: k.lng })) : "";
                      return (
                        <button key={k.id} type="button" onClick={() => setTerpilihId(k.id)} className="flex w-full items-center gap-3 rounded-[16px] bg-white p-3 text-left shadow-[0_4px_14px_rgba(15,42,82,.08)] active:bg-[#F1F6FE]">
                          <IkonHasil hasil={k.hasil} warna={k.hasil ? warnaPelaku(a) : WARNA_BELUM} />
                          <span className="min-w-0 flex-1">
                            <b className="block truncate text-[14px] text-[#0F2A52]">{k.nama_kk}</b>
                            <small className="block truncate text-[12px] text-[#6B7A90]">{[k.anggota_lain, k.patokan, jarak].filter(Boolean).join(" · ") || "-"}</small>
                          </span>
                          <span className="flex-none text-right text-[11.5px] font-bold text-[#52627A]">
                            {k.hasil ? LABEL_PENDEK[k.hasil] : "Belum"}
                            {k.hasil && (
                              <>
                                <br />
                                <Pil a={a} />
                              </>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </section>
                )}
              </>
            )}

            {tab === "mon" && (
              <section className="space-y-3">
                <div className="rounded-[20px] bg-white p-4 shadow-[0_10px_28px_rgba(15,42,82,.12)]">
                  <div className="flex items-baseline justify-between">
                    <b className="text-[13px] text-[#55657D]">Progres tim</b>
                    <b className="text-[13px] text-[#0F2A52]">
                      {didata} dari {total} KK{total ? ` (${Math.round((didata / total) * 100)}%)` : ""}
                    </b>
                  </div>
                  <div role="progressbar" aria-valuenow={total ? Math.round((didata / total) * 100) : 0} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#E3E8F0]">
                    <div className="h-full rounded-full bg-[#19A463]" style={{ width: `${total ? (didata / total) * 100 : 0}%` }} />
                  </div>
                  {menunggu.length > 0 && <p className="mt-2 text-[11.5px] text-[#8A6200]">{menunggu.length} penandaan di HP ini belum terkirim, jadi belum masuk angka di bawah.</p>}
                  <p className="mt-2 text-[11.5px] text-[#6B7A90]">Diperbarui {waktuRingkas(new Date(tim.tiba || Date.now()).toISOString())}. &quot;Hari ini&quot; menurut waktu kejadian di HP (WIB).</p>
                </div>

                <div className="rounded-[20px] bg-white p-4 shadow-[0_10px_28px_rgba(15,42,82,.12)]">
                  <h2 className="text-[14px] font-extrabold text-[#0F2A52]">Menurut PPL</h2>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[420px] text-[12.5px]">
                      <thead>
                        <tr className="text-left text-[11px] text-[#6B7A90]">
                          <th className="py-1.5 pr-2 font-bold">PPL</th>
                          <th className="px-1 text-right font-bold">Terdampak</th>
                          <th className="px-1 text-right font-bold">Tdk terdampak</th>
                          <th className="px-1 text-right font-bold">Tdk ditemukan</th>
                          <th className="px-1 text-right font-bold">Total</th>
                          <th className="pl-1 text-right font-bold">Hari ini</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data?.anggota ?? []).filter((a) => a.peran === "ppl" || perPpl[a.akun_id]).map((a) => {
                          const r = perPpl[a.akun_id];
                          return (
                            <tr key={a.akun_id} onClick={() => setMonPpl(monPpl === a.akun_id ? null : a.akun_id)} className={`cursor-pointer border-t border-[#EEF2F7] ${monPpl === a.akun_id ? "bg-[#E3ECFB]" : ""}`}>
                              <td className="py-2 pr-2">
                                <span className="inline-flex items-center gap-1.5">
                                  <Pil a={a} />
                                  {namaDepan(a.nama)}
                                  {a.akun_id === sayaAkun ? " (saya)" : ""}
                                </span>
                              </td>
                              <td className="px-1 text-right">{r?.total.terdampak ?? 0}</td>
                              <td className="px-1 text-right">{r?.total.tidak_terdampak ?? 0}</td>
                              <td className="px-1 text-right">{r?.total.tidak_ditemukan ?? 0}</td>
                              <td className="px-1 text-right font-extrabold">{r?.didata ?? 0}</td>
                              <td className="pl-1 text-right">{r?.didata_hari_ini ?? 0}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-[#D9E3F2] font-extrabold text-[#0F2A52]">
                          <td className="py-2">Seluruh tim</td>
                          <td className="px-1 text-right">{Object.values(perPpl).reduce((n, r) => n + r.total.terdampak, 0)}</td>
                          <td className="px-1 text-right">{Object.values(perPpl).reduce((n, r) => n + r.total.tidak_terdampak, 0)}</td>
                          <td className="px-1 text-right">{Object.values(perPpl).reduce((n, r) => n + r.total.tidak_ditemukan, 0)}</td>
                          <td className="px-1 text-right">{didata}</td>
                          <td className="pl-1 text-right">{Object.values(perPpl).reduce((n, r) => n + r.didata_hari_ini, 0)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <p className="mt-2 text-[11.5px] text-[#6B7A90]">Ketuk nama PPL untuk melihat rinciannya per Sub SLS di bawah.</p>
                </div>

                <div className="rounded-[20px] bg-white p-4 shadow-[0_10px_28px_rgba(15,42,82,.12)]">
                  <h2 className="text-[14px] font-extrabold text-[#0F2A52]">Rincian per Sub SLS</h2>
                  <label htmlFor="mon-ppl" className="mt-2 block text-[11.5px] text-[#6B7A90]">
                    Tampilkan hasil milik
                  </label>
                  <select id="mon-ppl" value={monPpl ?? ""} onChange={(e) => setMonPpl(e.target.value ? Number(e.target.value) : null)} className="mt-1 h-11 w-full rounded-[12px] border border-[#D9E3F2] bg-white px-3 text-[13px] font-bold text-[#0F2A52]">
                    <option value="">Semua PPL</option>
                    {(data?.anggota ?? []).filter((a) => a.peran === "ppl").map((a) => (
                      <option key={a.akun_id} value={a.akun_id}>
                        {a.nama}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[460px] text-[12.5px]">
                      <thead>
                        <tr className="text-left text-[11px] text-[#6B7A90]">
                          <th className="py-1.5 pr-2 font-bold">Sub SLS</th>
                          <th className="px-1 text-right font-bold">KK</th>
                          <th className="px-1 text-right font-bold">Didata</th>
                          <th className="px-1 text-right font-bold">Terd.</th>
                          <th className="px-1 text-right font-bold">Tdk</th>
                          <th className="px-1 text-right font-bold">Tdk ditemu.</th>
                          <th className="pl-1 text-right font-bold">Hari ini</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data?.sub ?? []).map((s) => {
                          const t = perSub[s.idsubsls];
                          const p = monPpl !== null ? perPpl[monPpl]?.per_sub[s.idsubsls] : undefined;
                          const hasil = monPpl !== null ? p?.total : t?.total_hasil;
                          const hari = monPpl !== null ? p?.hari_ini : t?.hari_ini;
                          const jml = monPpl !== null ? p?.didata ?? 0 : t?.didata ?? 0;
                          return (
                            <tr key={s.idsubsls} onClick={() => { pilihSub(s.idsubsls); setTab("peta"); }} className="cursor-pointer border-t border-[#EEF2F7]">
                              <td className="py-2 pr-2">{namaSub(s)}</td>
                              <td className="px-1 text-right">{t?.total ?? 0}</td>
                              <td className="px-1 text-right font-extrabold">{jml}</td>
                              <td className="px-1 text-right">{hasil?.terdampak ?? 0}</td>
                              <td className="px-1 text-right">{hasil?.tidak_terdampak ?? 0}</td>
                              <td className="px-1 text-right">{hasil?.tidak_ditemukan ?? 0}</td>
                              <td className="pl-1 text-right">{hari ? jumlahHitung(hari) : 0}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-[11.5px] text-[#6B7A90]">Ketuk baris untuk membuka Sub SLS itu di Peta.</p>
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {terpilih && (
        <div role="dialog" aria-label={`KK ${terpilih.nama_kk}`} className="fixed inset-x-0 bottom-0 z-30 mx-auto max-h-[78vh] max-w-xl overflow-y-auto rounded-t-[24px] bg-white px-4 pb-6 pt-2 shadow-[0_-12px_36px_rgba(15,42,82,.25)]">
          <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-[#D9E3F2]" />
          <button type="button" onClick={() => setTerpilihId(null)} aria-label="Tutup" className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full text-[22px] text-[#6B7A90]">
            ×
          </button>
          <h3 className="pr-10 text-[17px] font-extrabold text-[#0F2A52]">{terpilih.nama_kk}</h3>
          {terpilih.anggota_lain && <p className="mt-0.5 text-[12.5px] text-[#52627A]">Anggota: {terpilih.anggota_lain}</p>}
          <p className="mt-0.5 text-[12.5px] text-[#6B7A90]">
            {[terpilih.patokan, subAktif ? namaSub(subAktif) : null, saya && terpilih.lat !== null && terpilih.lng !== null ? `${fmtJarak(jarakMeter(saya, { lat: terpilih.lat, lng: terpilih.lng }))} dari Anda` : null].filter(Boolean).join(" · ")}
          </p>

          {terpilih.hasil && terpilih.ppl_akun_id !== sayaAkun && (
            <p className="mt-3 rounded-[12px] bg-[#FDEBDD] px-3 py-2 text-[12.5px] text-[#8A3B0C]">
              Sudah didata {anggota.get(terpilih.ppl_akun_id ?? 0)?.nama ? namaDepan(anggota.get(terpilih.ppl_akun_id ?? 0)!.nama) : "rekan tim"} ({waktuRingkas(terpilih.status_at)}): {LABEL_PENDEK[terpilih.hasil]}. Menandai ulang akan menimpa hasil ini; riwayat tetap tercatat.
            </p>
          )}
          {terpilih.hasil && terpilih.ppl_akun_id === sayaAkun && <p className="mt-3 text-[12px] text-[#6B7A90]">Anda menandai {waktuRingkas(terpilih.status_at)}.</p>}

          <div className="mt-3 space-y-2" role="group" aria-label="Hasil pendataan">
            {HASIL_KK.map((h) => {
              const aktif = terpilih.hasil === h && terpilih.ppl_akun_id === sayaAkun;
              return (
                <button key={h} type="button" aria-pressed={aktif} onClick={() => tandai(terpilih, h)} className={`flex min-h-[56px] w-full items-center gap-3 rounded-[16px] border-2 px-3.5 py-2 text-left ${aktif ? "border-[#1F5FD1] bg-[#E3ECFB]" : "border-[#D9E3F2] bg-white active:bg-[#F1F6FE]"}`}>
                  <IkonHasil hasil={h} warna={warnaPelaku(anggota.get(sayaAkun))} ukuran={26} />
                  <span className="text-[14px] font-extrabold text-[#0F2A52]">
                    {LABEL_HASIL[h]}
                    <small className="block text-[11.5px] font-medium text-[#6B7A90]">{SUBTEKS[h]}</small>
                  </span>
                </button>
              );
            })}
          </div>

          {terpilih.hasil === "tidak_ditemukan" && terpilih.ppl_akun_id === sayaAkun && (
            <div className="mt-3">
              <span className="text-[11.5px] font-bold text-[#52627A]">Alasan (boleh dikosongkan)</span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {ALASAN_TIDAK_DITEMUKAN.map((a) => (
                  <button key={a} type="button" aria-pressed={terpilih.alasan === a} onClick={() => tandai(terpilih, "tidak_ditemukan", a)} className={`${chipBase} ${terpilih.alasan === a ? chipOn : chipOff}`}>
                    {a}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {terpilih.lat !== null && terpilih.lng !== null && (
              <>
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${terpilih.lat},${terpilih.lng}`} target="_blank" rel="noopener noreferrer" className={`${chipBase} ${chipOff}`}>
                  Navigasi
                </a>
                <button type="button" onClick={() => lihatDiPeta(terpilih)} className={`${chipBase} ${chipOff}`}>
                  Lihat di peta
                </button>
              </>
            )}
            {terpilih.hasil && (
              <button type="button" onClick={() => kembalikan(terpilih)} className={`${chipBase} ${chipOff}`}>
                Kembalikan ke belum didata
              </button>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div role="status" className="fixed inset-x-3 bottom-4 z-40 mx-auto flex max-w-md items-center gap-3 rounded-[16px] bg-[#0F2A52] px-4 py-3 text-[13px] font-bold text-white shadow-[0_12px_30px_rgba(15,42,82,.4)]">
          <span className="min-w-0 flex-1">{toast.pesan}</span>
          {toast.urungkan && (
            <button
              type="button"
              onClick={() => {
                toast.urungkan?.();
                setToast(null);
              }}
              className="min-h-[40px] flex-none rounded-full bg-white/15 px-3.5 text-[12.5px] font-extrabold text-white"
            >
              Urungkan
            </button>
          )}
        </div>
      )}
    </main>
  );
}
