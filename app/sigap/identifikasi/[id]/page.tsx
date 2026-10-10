"use client";

// app/sigap/identifikasi/[id]/page.tsx
//
// (10 Okt 2026) Isian hasil identifikasi SATU Sub SLS (mockup disetujui user). Total KK terdampak diisi sendiri (BUKAN penjumlahan kolom: satu KK
// bisa terkena beberapa jenis dampak). Tombol "Tidak terdampak" untuk Sub SLS yang memang tidak terdampak (permintaan user): angka dikunci nol,
// disimpan sebagai sudah dinilai (beda dengan belum diisi) dan diberi warna biru di daftar.

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import IkonMenu from "@/app/portal/IkonMenu";
import { apiPortal, bacaLihatSebagai } from "@/app/portal/sesi";
import { BATAS_CATATAN, BATAS_KET, JENIS_DAMPAK, JENIS_LAMA, kodeDesa, periksaIsian, peringatanIsian, type KunciAngka } from "@/lib/identifikasi";
import PetaSheet, { IkonPeta } from "../PetaSheet";
import { dariAman, tampilAwal, tglJam, useIdentifikasi } from "../useIdentifikasi";

type Nilai = Record<KunciAngka | "kk_terdampak", string>;
const KOSONG: Nilai = { kk_terdampak: "", rusak_berat: "", rusak_sedang: "", rusak_ringan: "", lahan_tertimbun: "", kekeringan: "", lainnya: "", aset_usaha: "", lahan_ternak: "", korban: "" };

function KolomAngka({ id, label, nilai, onUbah, mati, besar }: { id: string; label: string; nilai: string; onUbah: (v: string) => void; mati: boolean; besar?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${besar ? "" : "min-h-[52px] border-b border-[#EEF2F7]"}`}>
      <label htmlFor={id} className={`flex-1 leading-tight text-[#0F2A52] ${besar ? "text-[14px] font-extrabold" : "text-[13.5px] font-bold"}`}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={mati ? "0" : nilai}
        disabled={mati}
        onChange={(e) => onUbah(e.target.value.replace(/\D/g, "").slice(0, 6))}
        onFocus={(e) => e.currentTarget.select()}
        className={`box-border rounded-[12px] border-[#C5D0E2] text-right font-extrabold text-[#0F2A52] disabled:bg-[#EEF2F7] disabled:text-[#8A97AB] ${besar ? "h-[52px] w-[120px] border-2 border-[#1F5FD1] bg-[#F8FBFF] px-3.5 text-[22px] disabled:border-[#C5D0E2]" : "h-11 w-[84px] border-[1.5px] px-2.5 text-[16px]"}`}
      />
    </div>
  );
}

export default function IsianIdentifikasi() {
  const { id: idParam } = useParams<{ id: string }>();
  const idsubsls = decodeURIComponent(idParam);
  const router = useRouter();
  const { data, galat } = useIdentifikasi();
  const [dari, setDari] = useState<string | null>(null);
  const [nilai, setNilai] = useState<Nilai>(KOSONG);
  const [ket, setKet] = useState("");
  const [catatan, setCatatan] = useState("");
  const [tidak, setTidak] = useState(false);
  const [siap, setSiap] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [peta, setPeta] = useState(false);
  const [sebagai, setSebagai] = useState(false);
  useEffect(() => {
    setDari(dariAman());
    setSebagai(!!bacaLihatSebagai());
  }, []);

  const s = data?.sub.find((x) => x.idsubsls === idsubsls) ?? null;
  const daftar = `/sigap/identifikasi${dari ? `?dari=${encodeURIComponent(dari)}` : ""}`;

  // isi awal dari hasil tersimpan (sekali, saat data pertama tiba)
  useEffect(() => {
    if (!s || siap) return;
    if (s.hasil) {
      const h = s.hasil;
      setNilai({ kk_terdampak: String(h.kk_terdampak), rusak_berat: String(h.rusak_berat), rusak_sedang: String(h.rusak_sedang), rusak_ringan: String(h.rusak_ringan), lahan_tertimbun: String(h.lahan_tertimbun), kekeringan: String(h.kekeringan), lainnya: String(h.lainnya), aset_usaha: String(h.aset_usaha), lahan_ternak: String(h.lahan_ternak), korban: String(h.korban) });
      setKet(h.lainnya_ket);
      setCatatan(h.catatan);
      setTidak(h.tidak_terdampak);
    }
    setSiap(true);
  }, [s, siap]);

  const ubah = (k: keyof Nilai) => (v: string) => setNilai((x) => ({ ...x, [k]: v }));

  const cek = useMemo(() => {
    if (tidak) return { ok: true as const, galat: null, peringatan: [] as string[], info: "Sub SLS ini akan disimpan sebagai TIDAK TERDAMPAK (0 KK)." };
    if (nilai.kk_terdampak.trim() === "") return { ok: false as const, galat: "Isi total KK terdampak, atau pilih \"Tidak terdampak\" bila memang tidak ada.", peringatan: [] as string[], info: null };
    const r = periksaIsian({ ...nilai, lainnya_ket: ket, catatan, tidak_terdampak: false });
    if (!r.ok) return { ok: false as const, galat: r.pesan, peringatan: [] as string[], info: null };
    const jumlah = [...JENIS_DAMPAK, ...JENIS_LAMA].reduce((a, j) => a + r.isi[j.kunci], 0);
    return {
      ok: true as const,
      galat: null,
      peringatan: peringatanIsian(r.isi, s?.kk ?? 0),
      info: r.isi.kk_terdampak === 0 ? "Total 0 akan disimpan sebagai TIDAK TERDAMPAK." : `Pengecekan lolos: tiap jenis dampak tidak melebihi total (${r.isi.kk_terdampak}). Jumlah seluruh kolom ${jumlah} wajar bila satu KK terkena beberapa jenis.`,
    };
  }, [tidak, nilai, ket, catatan, s]);

  async function simpan() {
    if (!s || !cek.ok || menyimpan) return;
    setMenyimpan(true);
    setPesan(null);
    try {
      const nol = Object.fromEntries(Object.keys(KOSONG).map((k) => [k, 0]));
      await apiPortal("/api/portal/identifikasi", {
        method: "POST",
        body: JSON.stringify(tidak ? { ...nol, idsubsls, tidak_terdampak: true, catatan } : { ...nilai, idsubsls, tidak_terdampak: false, lainnya_ket: ket, catatan }),
      });
      router.replace(daftar);
    } catch (e) {
      if (e instanceof Error && e.message === "SESI_BERAKHIR") return router.replace("/");
      setPesan(e instanceof Error ? e.message : "Gagal menyimpan.");
      setMenyimpan(false);
    }
  }

  const kartu = "rounded-[20px] bg-white p-4 shadow-[0_8px_22px_rgba(15,42,82,.08)]";
  const judulKecil = "text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-[#6B7A90]";

  return (
    <main className="min-h-screen bg-[#F5F8FE] pb-12 text-[#1B2B4B]">
      <header className="relative overflow-hidden bg-[linear-gradient(165deg,#1A4590_0%,#0F2A52_100%)] px-5 pb-16 pt-5 text-white">
        <div aria-hidden className="absolute -right-24 -top-28 h-60 w-60 rounded-full bg-white/[0.06]" />
        <div className="relative mx-auto flex max-w-xl items-center gap-2">
          <button type="button" onClick={() => router.replace(daftar)} aria-label="Kembali ke daftar Sub SLS" className="grid h-11 w-11 flex-none place-items-center rounded-full bg-white/15 active:bg-white/25">
            <IkonMenu n="kembali" className="h-5 w-5 text-white" />
          </button>
          <span className="truncate text-[12.5px] font-bold text-[#D3E0F5]">Lembar Identifikasi SLS</span>
        </div>
        <div className="relative mx-auto mt-3 flex max-w-xl items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="break-words text-[20px] font-extrabold leading-tight tracking-[-0.3px]">{s ? `${s.sls} · Sub ${s.sub_sls}` : "Sub SLS"}</h1>
            {s && <p className="mt-1.5 text-[12.5px] text-[#A9BCD8]">{s.nagari} · {s.kecamatan}</p>}
          </div>
          {s && (
            <button type="button" onClick={() => setPeta(true)} className="flex min-h-[44px] flex-none items-center gap-1.5 rounded-full bg-white/15 px-3.5 text-[12.5px] font-extrabold text-white active:bg-white/25">
              <IkonPeta className="h-4 w-4" />
              Peta
            </button>
          )}
        </div>
      </header>

      <div className="relative z-10 mx-auto -mt-10 max-w-xl space-y-3 px-3.5">
        {galat && <p className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>}
        {!data && !galat && <div className="h-40 animate-pulse rounded-[20px] bg-white" aria-busy="true" />}
        {data && !s && <p className={`${kartu} text-[13.5px] text-[#5B6B84]`}>Sub SLS ini tidak ada di wilayah tim Anda.</p>}

        {s && (
          <>
            {sebagai && <p className="rounded-[14px] bg-[#FFF4D6] px-3 py-2 text-[12.5px] font-bold text-[#8A6200]">Mode "masuk sebagai": hanya untuk melihat tampilan, tombol Simpan dimatikan.</p>}

            <section className="rounded-[20px] bg-white p-4 shadow-[0_10px_28px_rgba(15,42,82,.12)]">
              <p className="mb-3 rounded-[12px] bg-[#F1F6FE] px-3 py-2 text-[12px] leading-snug text-[#0F2A52]">
                Anda <b>PML {s.peran}</b> untuk SLS ini{s.rekan ? <>; {s.peran === "pelaksana" ? "pendamping" : "pelaksana"}: <b>{s.rekan}</b></> : ""}. Hasil dipakai bersama, jadi siapa pun dari kalian berdua bisa mengisi atau memperbaikinya.
              </p>
              <p className={judulKecil}>Data awal dari sistem</p>
              <div className="mt-2.5 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-[12px] bg-[#F1F6FE] px-1 py-2.5">
                  <b className="block text-[20px] text-[#0F2A52]">{Math.round(s.kk)}</b>
                  <span className="text-[11px] text-[#55657D]">KK tinggal di Sub SLS ini</span>
                </div>
                <div className="rounded-[12px] bg-[#FFF4D6] px-1 py-2.5">
                  <b className="block text-[20px] text-[#8A6200]">{tampilAwal(s.kk_awal)}</b>
                  <span className="text-[11px] text-[#8A6200]">Perkiraan KK terdampak awal</span>
                </div>
              </div>
              <p className="mt-2.5 text-[11.5px] leading-snug text-[#55657D]">Angka awal hanya perkiraan dari data lama, bukan hasil pencacahan. Hasil identifikasi Anda yang menggantikannya.</p>
            </section>

            <button
              type="button"
              role="switch"
              aria-checked={tidak}
              onClick={() => setTidak((v) => !v)}
              className={`flex min-h-[64px] w-full items-center gap-3 rounded-[20px] px-4 py-3 text-left shadow-[0_8px_22px_rgba(15,42,82,.08)] ${tidak ? "bg-[#EAF5FD] ring-2 ring-[#2B8FD6]" : "bg-white"}`}
            >
              <span className={`grid h-7 w-7 flex-none place-items-center rounded-full ${tidak ? "bg-[#2B8FD6]" : "border-2 border-[#C5D0E2] bg-white"}`}>
                {tidak && (
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5 5 9-10" />
                  </svg>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <b className={`block text-[14.5px] ${tidak ? "text-[#12618F]" : "text-[#0F2A52]"}`}>Sub SLS ini tidak terdampak</b>
                <small className="block text-[12px] leading-snug text-[#55657D]">Pilih bila sudah dicek dan memang tidak ada KK terdampak. Semua angka menjadi 0.</small>
              </span>
            </button>

            <section className={kartu}>
              <p className={judulKecil}>Hasil identifikasi</p>
              <div className="mt-2.5">
                <KolomAngka id="total" label="Jumlah KK terdampak (total)" nilai={nilai.kk_terdampak} onUbah={ubah("kk_terdampak")} mati={tidak} besar />
              </div>
              <p className="mt-2 rounded-[12px] bg-[#EAF1FC] px-3 py-2 text-[12px] leading-snug text-[#14202E]">
                Isi total KK yang terdampak di Sub SLS ini. <b>Bukan penjumlahan kolom di bawah</b>, karena satu KK bisa terdampak oleh beberapa jenis kerusakan sekaligus.
              </p>
            </section>

            <section className={kartu}>
              <p className={judulKecil}>Rincian jenis dampak (jumlah KK)</p>
              <div className="mt-1.5 flex flex-col">
                {JENIS_DAMPAK.map((j) => (
                  <KolomAngka key={j.kunci} id={j.kunci} label={j.label} nilai={nilai[j.kunci]} onUbah={ubah(j.kunci)} mati={tidak} />
                ))}
              </div>
              {!tidak && Number(nilai.lainnya || 0) > 0 && (
                <>
                  <label htmlFor="lainnya_ket" className="mt-3 block text-[12.5px] font-bold text-[#55657D]">
                    Sebutkan dampak "Lainnya"
                  </label>
                  <input id="lainnya_ket" type="text" value={ket} maxLength={BATAS_KET} onChange={(e) => setKet(e.target.value)} className="mt-1.5 box-border h-11 w-full rounded-[12px] border-[1.5px] border-[#C5D0E2] px-3 text-[14px] text-[#0F2A52]" />
                </>
              )}
              <p className={`${judulKecil} mt-4`}>Dampak lain (sama seperti identifikasi jorong)</p>
              <div className="mt-1.5 flex flex-col">
                {JENIS_LAMA.map((j) => (
                  <KolomAngka key={j.kunci} id={j.kunci} label={j.label} nilai={nilai[j.kunci]} onUbah={ubah(j.kunci)} mati={tidak} />
                ))}
              </div>

              {cek.galat && <p className="mt-3 rounded-[12px] bg-[#FDE8E8] px-3 py-2 text-[12px] leading-snug text-[#7A1D22]">{cek.galat}</p>}
              {cek.ok && cek.info && <p className={`mt-3 rounded-[12px] px-3 py-2 text-[12px] leading-snug ${tidak ? "bg-[#EAF5FD] text-[#12618F]" : "bg-[#E3F6EC] text-[#17623C]"}`}>{cek.info}</p>}
              {cek.peringatan.map((p) => (
                <p key={p} className="mt-2 rounded-[12px] bg-[#FFF4D6] px-3 py-2 text-[12px] leading-snug text-[#8A6200]">
                  {p}
                </p>
              ))}
            </section>

            <section className={kartu}>
              <label htmlFor="catatan" className="block text-[13.5px] font-extrabold text-[#0F2A52]">
                Catatan (opsional)
              </label>
              <textarea id="catatan" rows={3} maxLength={BATAS_CATATAN} value={catatan} onChange={(e) => setCatatan(e.target.value)} className="mt-1.5 box-border w-full resize-none rounded-[12px] border-[1.5px] border-[#C5D0E2] px-3 py-2.5 text-[14px] leading-snug text-[#0F2A52]" />
            </section>

            <div className="space-y-2 pb-4">
              {pesan && <p className="rounded-[12px] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{pesan}</p>}
              <button type="button" onClick={simpan} disabled={!cek.ok || menyimpan || sebagai} className="flex min-h-[52px] w-full items-center justify-center rounded-[14px] bg-[#1F5FD1] text-[16px] font-extrabold text-white disabled:bg-[#A9BCD8]">
                {menyimpan ? "Menyimpan…" : "Simpan"}
              </button>
              <p className="text-center text-[11.5px] text-[#6B7A90]">Bisa diubah lagi kapan saja. Terakhir disimpan: {s.hasil ? `${tglJam(s.hasil.diperbarui_at)}${s.hasil.oleh ? ` oleh ${s.hasil.oleh}` : ""}` : "belum pernah"}.</p>
            </div>
          </>
        )}
      </div>

      <PetaSheet buka={peta} onTutup={() => setPeta(false)} judul={s ? `${s.sls} · Sub ${s.sub_sls}` : "Peta"} desa={s ? kodeDesa(s.idsubsls) : null} subs={s ? [{ idsubsls: s.idsubsls, nama: s.sls, sub: s.sub_sls }] : []} />
    </main>
  );
}
