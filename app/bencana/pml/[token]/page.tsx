"use client";

import { useEffect, useRef, useState, use as usePromise } from "react";
import BrandBps from "@/app/components/BrandBps";
import BuatAkunPanel from "../../undangan/BuatAkunPanel";
import ModalSelesaikan from "../../undangan/ModalSelesaikan";

// ------------------------------------------------------------------------
// (4 Okt 2026) Halaman konfirmasi PML (Pengawas) -- tujuan /undangan untuk
// petugas berperan PML (tidak memegang Sub SLS sebagai PPL). Isi: daftar PPL
// binaan + wilayah kerjanya, jawaban bersedia/tidak (+ tanggal pelatihan),
// lalu buat PIN & gabung grup WA. Data lewat /api/bencana/pml/[token].
// ------------------------------------------------------------------------

type Wilayah = { kecamatan: string; nagari: string; sls: string; sub_sls: string };
type StatusKonfirmasi = "bersedia" | "pulang_pergi" | "menolak" | "belum";
type PplBinaan = {
  nama: string;
  no_hp: string | null;
  domisili: string | null;
  wilayah: Wilayah[];
  // (5 Okt 2026) status konfirmasi kesediaan ikut pendataan bencana.
  status_konfirmasi?: StatusKonfirmasi;
};

// Hijau = bersedia, kuning = bersedia pulang-pergi (tidak menginap), merah = menolak, abu = belum konfirmasi.
const BADGE_KONFIRMASI: Record<StatusKonfirmasi, { label: string; kelas: string; ikon: string }> = {
  bersedia: { label: "Bersedia", kelas: "bg-[#DDF3E4] text-[#1E6B3A] border-[#9AD3AE]", ikon: "✓" },
  pulang_pergi: { label: "Bersedia pulang-pergi", kelas: "bg-[#FEF3E2] text-[#8A4B08] border-[#F5C27A]", ikon: "✓" },
  menolak: { label: "Menolak", kelas: "bg-[#FDE4E4] text-[#9B1C1C] border-[#F2A9A9]", ikon: "✕" },
  belum: { label: "Belum konfirmasi", kelas: "bg-[#EEF1F6] text-[#55657D] border-[#D5DDE8]", ikon: "…" },
};
type Info = {
  nama: string;
  status_kontak: "diterima" | "menolak" | null;
  catatan_penolakan: string | null;
  jadwal_pelatihan_dipilih: string | null;
  punya_akun: boolean;
  wa_group_url: string | null;
  ppl: PplBinaan[];
  // (5 Okt 2026) pemberitahuan PPL tim yg plotting-nya dibatalkan (hilang setelah PML menekan "Oke").
  pemberitahuan?: { nama: string; alasan: string; dialihkan_ke: string[] }[];
};

const JADWAL = ["7 Oktober 2026", "8 Oktober 2026"] as const;
const KARTU = "rounded-[14px] bg-white p-4 shadow-sm";
const fontStyle = { fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" };

export default function PmlPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = usePromise(params);
  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ubah, setUbah] = useState(false);
  const [modeTidak, setModeTidak] = useState(false);
  const [jadwal, setJadwal] = useState<string[]>([...JADWAL]);
  const [alasan, setAlasan] = useState("");
  const [modalSelesaikan, setModalSelesaikan] = useState(false);
  const bannerRef = useRef<HTMLDivElement | null>(null);

  async function muat() {
    try {
      const res = await fetch(`/api/bencana/pml/${token}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) setLoadError(json?.error ?? "Link tidak valid.");
      else {
        setInfo(json.data as Info);
        const j = (json.data as Info).jadwal_pelatihan_dipilih;
        if (j) setJadwal(JADWAL.filter((x) => j.includes(x)));
      }
    } catch {
      setLoadError("Gagal memuat halaman. Periksa koneksi internet.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function okePemberitahuan() {
    setBusy(true);
    try {
      const res = await fetch(`/api/bencana/pml/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "baca_pemberitahuan" }),
      });
      if (res.ok) setInfo((cur) => (cur ? { ...cur, pemberitahuan: [] } : cur));
      else setError("Gagal menyimpan. Coba lagi.");
    } catch {
      setError("Gagal menyimpan. Periksa koneksi internet.");
    } finally {
      setBusy(false);
    }
  }

  async function kirim(bersedia: boolean) {
    setError(null);
    if (bersedia && jadwal.length === 0) return setError("Centang minimal 1 tanggal pelatihan.");
    if (!bersedia && !alasan.trim()) return setError("Mohon isi alasan tidak bersedia.");
    setBusy(true);
    try {
      const res = await fetch(`/api/bencana/pml/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bersedia ? { bersedia: true, jadwal_pelatihan: jadwal } : { bersedia: false, alasan: alasan.trim() }),
      });
      const json = await res.json();
      if (!res.ok) setError(json?.error ?? "Gagal mengirim jawaban.");
      else {
        setUbah(false);
        setModeTidak(false);
        await muat();
        if (bersedia) setModalSelesaikan(true);
        else setTimeout(() => bannerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
      }
    } catch {
      setError("Gagal mengirim jawaban. Periksa koneksi internet, lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  if (loading)
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F1F4F8] px-6" style={fontStyle}>
        <p className="text-[#55657D]">Memuat...</p>
      </main>
    );
  if (loadError || !info)
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center bg-[#F1F4F8] px-6 py-16 text-center" style={fontStyle}>
        <p className="text-sm text-[#C0392B]">{loadError ?? "Link tidak valid."}</p>
      </main>
    );

  const diterima = info.status_kontak === "diterima";
  const menolak = info.status_kontak === "menolak";
  const sudahJawab = diterima || menolak;
  const tampilForm = !sudahJawab || ubah;
  const totalSub = info.ppl.reduce((n, p) => n + p.wilayah.length, 0);

  return (
    <main className="min-h-screen bg-[#F1F4F8] pb-10 text-[#13213A]" style={fontStyle}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      {modalSelesaikan && !info.punya_akun && <ModalSelesaikan nama={info.nama} onOk={() => setModalSelesaikan(false)} />}

      <div className="mx-auto max-w-lg">
        <header className="flex flex-col gap-3.5 bg-[#0F3D7A] px-5 pb-11 pt-[22px] text-white">
          <div className="flex items-center justify-between gap-2">
            <BrandBps className="min-w-0" teksClassName="text-[13px] font-bold leading-tight tracking-wide" ukuran={30} kotakPutih />
            <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold">Undangan PML</span>
          </div>
          <h1 className="text-[25px] font-extrabold leading-tight">Konfirmasi Kesediaan PML Pendataan Pascabencana</h1>
          <p className="text-sm leading-relaxed text-[#DCE6F5]">
            Halo, <strong className="text-white">{info.nama}</strong>. Anda ditunjuk sebagai Pengawas (PML) bagi{" "}
            <strong className="text-white">{info.ppl.length} PPL</strong> pada pendataan KK terdampak bencana hidrometeorologi.
          </p>
        </header>

        <div className="-mt-[26px] mx-4 grid grid-cols-3 rounded-[14px] bg-white px-1.5 py-3.5 shadow-md">
          <div className="flex flex-col items-center gap-0.5 border-r border-[#E4E9F0]">
            <span className="text-[11px] font-semibold text-[#55657D]">PPL binaan</span>
            <span className="text-sm font-extrabold">{info.ppl.length} orang</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 border-r border-[#E4E9F0]">
            <span className="text-[11px] font-semibold text-[#55657D]">Sub SLS</span>
            <span className="text-sm font-extrabold">{totalSub}</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[11px] font-semibold text-[#55657D]">Pendataan</span>
            <span className="text-sm font-extrabold">10–31 Okt</span>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3.5 px-4">
          {(info.pemberitahuan?.length ?? 0) > 0 && (
            <div role="alert" className={`${KARTU} border-2 border-red-300 bg-red-50`}>
              <p className="text-[16px] font-extrabold text-red-800">Pemberitahuan perubahan tim</p>
              <ul className="mt-2 space-y-2 text-[14px] leading-relaxed text-red-900">
                {info.pemberitahuan!.map((p, i) => (
                  <li key={p.nama + i}>
                    Mohon maaf, plotting wilayah tugas <strong>{p.nama}</strong> dibatalkan karena yang bersangkutan merupakan PPL NTP, sehingga
                    tidak lagi menjadi anggota tim Anda.
                    {p.dialihkan_ke.length > 0 && (
                      <>
                        {" "}Sub SLS-nya dialihkan ke <strong>{p.dialihkan_ke.join(", ")}</strong>.
                      </>
                    )}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={busy}
                onClick={okePemberitahuan}
                className="mt-3 min-h-[44px] w-full rounded-xl bg-red-700 px-4 py-2.5 text-[15px] font-extrabold text-white disabled:opacity-60"
              >
                {busy ? "Menyimpan…" : "Oke, saya mengerti"}
              </button>
            </div>
          )}
          {sudahJawab && !ubah && (
            <div ref={bannerRef} className={`${KARTU} border-2 ${diterima ? "border-[#1E7A4C]/40" : "border-[#C0392B]/30"}`}>
              <p className={`text-[16px] font-extrabold ${diterima ? "text-[#1E5E3C]" : "text-[#9B2C20]"}`}>
                {diterima ? "✓ Anda BERSEDIA menjadi PML" : "Anda TIDAK bersedia menjadi PML"}
              </p>
              {diterima && info.jadwal_pelatihan_dipilih && (
                <p className="mt-1 text-sm text-[#44546C]">Tanggal pelatihan yang Anda sanggupi: {info.jadwal_pelatihan_dipilih}.</p>
              )}
              {menolak && info.catatan_penolakan && <p className="mt-1 text-sm text-[#44546C]">Alasan: {info.catatan_penolakan}</p>}
              <button
                type="button"
                onClick={() => {
                  setUbah(true);
                  setModeTidak(menolak);
                  setAlasan(info.catatan_penolakan ?? "");
                }}
                className="mt-3 text-sm font-bold text-[#0F3D7A] underline"
              >
                Ubah jawaban
              </button>
            </div>
          )}

          {diterima && !ubah && (
            <BuatAkunPanel jenis="pml" token={token} nama={info.nama} punyaAkun={info.punya_akun} waUrl={info.wa_group_url} onSelesai={muat} />
          )}

          {/* PPL binaan */}
          <section className={`${KARTU} flex flex-col gap-3`}>
            <div className="flex items-baseline justify-between">
              <h2 className="text-[17px] font-extrabold">PPL yang Anda awasi</h2>
              <span className="text-xs font-bold text-[#55657D]">{info.ppl.length} PPL</span>
            </div>
            <div role="note" className="flex items-start gap-2.5 rounded-xl border-2 border-[#F59E0B] bg-[#FEF3E2] px-3.5 py-3 text-[#7A3E06]">
              <span aria-hidden className="mt-0.5 text-lg leading-none">⚠️</span>
              <p className="text-[13px] font-extrabold uppercase leading-snug tracking-wide">
                Alokasi ini hanya perkiraan, dapat bergeser sesuai dengan temuan kondisi riil saat pendataan
              </p>
            </div>
            {info.ppl.map((p, i) => (
              <div key={p.nama + i} className="rounded-[10px] bg-[#F6F8FB] p-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-[#E3EBF6] text-[13px] font-extrabold text-[#0F3D7A]">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold">{p.nama}</p>
                    <p className="text-xs text-[#55657D]">Domisili: {p.domisili ?? "-"}</p>
                    {p.no_hp && <p className="text-xs text-[#55657D]">HP: {p.no_hp}</p>}
                    {(() => {
                      const b = BADGE_KONFIRMASI[p.status_konfirmasi ?? "belum"];
                      return (
                        <span className={`mt-1.5 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${b.kelas}`}>
                          <span aria-hidden>{b.ikon}</span>
                          {b.label}
                        </span>
                      );
                    })()}
                  </div>
                  <span className="shrink-0 text-xs font-bold text-[#0F3D7A]">{p.wilayah.length} Sub SLS</span>
                </div>
                {p.wilayah.length > 0 && (
                  <ul className="mt-2 space-y-0.5 border-t border-[#E4E9F0] pt-2 text-xs text-[#44546C]">
                    {p.wilayah.map((w, k) => (
                      <li key={k}>
                        {w.sls} ({w.sub_sls}) · Nagari {w.nagari} · Kec. {w.kecamatan}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>

          {/* Form jawaban */}
          {tampilForm && (
            <section className={`${KARTU} flex flex-col gap-3.5`}>
              <h2 className="text-[17px] font-extrabold">Apakah Anda bersedia menjadi PML?</h2>
              {!modeTidak ? (
                <>
                  <div>
                    <p className="text-sm font-bold">Tanggal pelatihan yang Anda sanggupi</p>
                    <p className="mt-0.5 text-xs text-[#55657D]">Pelatihan 1 hari di salah satu tanggal; panitia menentukan hari finalnya.</p>
                    <div className="mt-2 flex flex-col gap-2">
                      {JADWAL.map((j) => (
                        <label key={j} className="flex items-center gap-2.5 rounded-lg border border-[#D5DDE8] px-3 py-2.5 text-sm font-semibold">
                          <input
                            type="checkbox"
                            checked={jadwal.includes(j)}
                            onChange={(e) => setJadwal((cur) => (e.target.checked ? [...cur, j] : cur.filter((x) => x !== j)))}
                          />
                          {j}
                        </label>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => kirim(true)}
                    className="min-h-[48px] rounded-xl bg-[#1E7A4C] px-4 py-3 text-[15px] font-extrabold text-white disabled:opacity-60"
                  >
                    {busy ? "Mengirim…" : "Saya BERSEDIA menjadi PML"}
                  </button>
                  <button type="button" onClick={() => setModeTidak(true)} className="text-sm font-bold text-[#9B2C20] underline">
                    Saya tidak bersedia
                  </button>
                </>
              ) : (
                <>
                  <textarea
                    value={alasan}
                    onChange={(e) => setAlasan(e.target.value)}
                    rows={3}
                    placeholder="Tuliskan alasan Anda tidak bersedia"
                    className="rounded-lg border border-[#D5DDE8] px-3 py-2.5 text-[15px] outline-none focus:border-[#0F3D7A]"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => kirim(false)}
                    className="min-h-[48px] rounded-xl bg-[#9B2C20] px-4 py-3 text-[15px] font-extrabold text-white disabled:opacity-60"
                  >
                    {busy ? "Mengirim…" : "Kirim: tidak bersedia"}
                  </button>
                  <button type="button" onClick={() => setModeTidak(false)} className="text-sm font-bold text-[#0F3D7A] underline">
                    Kembali
                  </button>
                </>
              )}
              {error && <p className="text-xs font-semibold text-[#C0392B]">{error}</p>}
            </section>
          )}

          <p className="px-1 text-center text-xs text-[#55657D]">Ada pertanyaan? Hubungi admin BPS Kabupaten Solok.</p>
        </div>
      </div>
    </main>
  );
}
