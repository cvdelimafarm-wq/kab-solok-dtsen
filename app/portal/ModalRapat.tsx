"use client";

// app/portal/ModalRapat.tsx
//
// (9 Okt 2026) Presensi rapat Zoom -- modal otomatis di aplikasi petugas (PPL/PML). Permintaan user: "tampil modal di masing-masing aplikasi
// petugas, tinggal tekan hadir" + hadir sah hanya bila petugas mengetik token rapat (token diperiksa di server, tidak pernah dikirim ke HP).
// Muncul di Beranda; status (belum dibuka / dibuka / ditutup) ditentukan server dan disegarkan tiap 20 detik.
// "Nanti" menutup modal selama sesi browser untuk status itu; saat status berubah (mis. presensi dibuka) modal muncul lagi.

import { useCallback, useEffect, useRef, useState } from "react";
import { apiPortal } from "./sesi";

type StatusR = "belum" | "buka" | "sudah" | "tutup" | "nonaktif";
type RapatP = {
  id: number;
  judul: string;
  mulai_at: string;
  selesai_at: string;
  buka_at: string;
  tutup_at: string;
  tautan: string | null;
  meeting_id: string | null;
  passcode: string | null;
  status: StatusR;
  hadir_at: string | null;
};

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
function waktuWib(iso: string) {
  const d = new Date(new Date(iso).getTime() + 7 * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}.${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
function tanggalWib(iso: string) {
  const d = new Date(new Date(iso).getTime() + 7 * 3_600_000);
  return `${HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const kunciTutup = (id: number, st: StatusR) => `rapat_tutup_${id}_${st}`;
function sudahDitutup(id: number, st: StatusR) {
  try {
    return sessionStorage.getItem(kunciTutup(id, st)) === "1";
  } catch {
    return false;
  }
}

export default function ModalRapat() {
  const [r, setR] = useState<RapatP | null>(null);
  const [tutup, setTutup] = useState(false);
  const [token, setToken] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [baruHadir, setBaruHadir] = useState(false); // baru saja menekan Hadir pada sesi ini -> tampilkan konfirmasi
  const [salin, setSalin] = useState(false);
  const barisToken = useRef<HTMLInputElement>(null);

  const muat = useCallback(async () => {
    try {
      const d = await apiPortal<{ rapat: RapatP | null }>("/api/sigap/rapat");
      setR(d.rapat);
    } catch {
      /* gagal muat tidak boleh mengganggu beranda */
    }
  }, []);

  useEffect(() => {
    muat();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") muat();
    }, 20_000);
    const v = () => document.visibilityState === "visible" && muat();
    document.addEventListener("visibilitychange", v);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", v);
    };
  }, [muat]);

  // status berubah -> buka kembali modal yang ditutup untuk status sebelumnya
  useEffect(() => {
    if (r) setTutup(sudahDitutup(r.id, r.status));
  }, [r?.id, r?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!r) return null;
  if (r.status === "nonaktif") return null;
  if (r.status === "sudah" && !baruHadir) return null; // sudah hadir sebelumnya: jangan ganggu lagi
  if (tutup && !baruHadir) return null;

  const status: StatusR = baruHadir ? "sudah" : r.status;

  function tutupModal() {
    try {
      sessionStorage.setItem(kunciTutup(r!.id, r!.status), "1");
    } catch {
      /* abaikan */
    }
    setTutup(true);
    setBaruHadir(false);
  }

  async function hadir() {
    if (!r) return;
    setSibuk(true);
    setGalat(null);
    try {
      const d = await apiPortal<{ ok: boolean; hadir_at: string }>("/api/sigap/rapat", { method: "POST", body: JSON.stringify({ rapat_id: r.id, token }) });
      setR({ ...r, status: "sudah", hadir_at: d.hadir_at });
      setBaruHadir(true);
      setToken("");
    } catch (e) {
      if (e instanceof Error && e.message === "SESI_BERAKHIR") return;
      setGalat(e instanceof Error ? e.message : "Gagal mencatat hadir.");
      muat(); // jendela bisa saja baru ditutup
    } finally {
      setSibuk(false);
    }
  }

  async function salinPasscode() {
    try {
      await navigator.clipboard.writeText(r!.passcode ?? "");
      setSalin(true);
      setTimeout(() => setSalin(false), 1800);
    } catch {
      /* clipboard tidak tersedia */
    }
  }

  const judulStatus: Record<StatusR, { teks: string; warna: string }> = {
    belum: { teks: "Presensi belum dibuka", warna: "bg-[#EEF2F7] text-[#5B6B84]" },
    buka: { teks: "Presensi dibuka", warna: "bg-[#E3F6EC] text-[#13794B]" },
    sudah: { teks: "Hadir tercatat", warna: "bg-[#E3F6EC] text-[#13794B]" },
    tutup: { teks: "Presensi ditutup", warna: "bg-[#FDE8E8] text-[#B42329]" },
    nonaktif: { teks: "", warna: "" },
  };
  const st = judulStatus[status];
  const bisaIsi = status === "buka";

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#0B1530]/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Presensi rapat Zoom">
      <div className="max-h-[92vh] w-full max-w-[430px] overflow-y-auto rounded-t-[22px] bg-white shadow-2xl sm:rounded-[22px]">
        <div className="bg-[#1E2A47] px-5 pb-4 pt-5 text-white">
          <div className="flex items-center justify-between gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${st.warna}`}>{st.teks}</span>
            <button type="button" onClick={tutupModal} className="rounded-lg px-2 py-1 text-[12.5px] font-semibold text-white/80 hover:bg-white/10" aria-label="Tutup sementara">
              {status === "sudah" ? "Selesai" : "Nanti"}
            </button>
          </div>
          <h2 className="mt-2.5 text-[18px] font-extrabold leading-snug">{r.judul}</h2>
          <p className="mt-1 text-[13px] text-white/80">
            {tanggalWib(r.mulai_at)} · {waktuWib(r.mulai_at)}–{waktuWib(r.selesai_at)} WIB
          </p>
        </div>

        <div className="space-y-3.5 px-5 py-4">
          {status === "sudah" ? (
            <div className="rounded-xl bg-[#E3F6EC] px-3.5 py-3 text-[14px] text-[#0F5E3A]">
              <b>Kehadiran Anda tercatat</b>
              {r.hadir_at ? ` pukul ${waktuWib(r.hadir_at)} WIB.` : "."} Terima kasih, silakan lanjut mengikuti rapat.
            </div>
          ) : null}

          {/* Gabung Zoom */}
          {r.tautan ? (
            <a href={r.tautan} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-[#2D8CFF] px-4 py-3 text-[15px] font-extrabold text-white shadow-sm active:scale-[0.99]">
              🎥 Gabung Zoom
            </a>
          ) : (
            <div className="rounded-xl border border-dashed border-[#CBD6E6] bg-[#F7F9FC] px-3.5 py-3 text-[13px] text-[#5B6B84]">Tautan Zoom belum diisi panitia. Tanyakan ke panitia atau tunggu pemberitahuan.</div>
          )}
          {(r.meeting_id || r.passcode) && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-[#F3F6FB] px-3.5 py-2.5 text-[13px]">
              <div className="min-w-0 space-y-0.5">
                {r.meeting_id && (
                  <div>
                    ID rapat: <b className="tabular-nums">{r.meeting_id}</b>
                  </div>
                )}
                {r.passcode && (
                  <div>
                    Passcode: <b className="tabular-nums">{r.passcode}</b>
                  </div>
                )}
              </div>
              {r.passcode && (
                <button type="button" onClick={salinPasscode} className="shrink-0 rounded-lg border border-[#CBD6E6] bg-white px-3 py-1.5 text-[12.5px] font-bold text-[#1E2A47]">
                  {salin ? "Tersalin ✓" : "Salin"}
                </button>
              )}
            </div>
          )}

          {/* Presensi */}
          {status !== "sudah" && (
            <div className="rounded-xl border border-[#E3E8EE] p-3.5">
              <label htmlFor="token-rapat" className="block text-[13px] font-bold text-[#1E2A47]">
                Token hadir
              </label>
              <p className="mt-0.5 text-[12.5px] text-[#5B6B84]">Token diumumkan di dalam rapat Zoom. Ketik token lalu tekan Hadir.</p>
              <input
                id="token-rapat"
                ref={barisToken}
                type="text"
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                value={token}
                disabled={!bisaIsi || sibuk}
                onChange={(e) => {
                  setToken(e.target.value);
                  setGalat(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && token.trim() && bisaIsi && !sibuk && hadir()}
                placeholder={bisaIsi ? "Ketik token" : "Belum bisa diisi"}
                className="mt-2 w-full rounded-lg border border-[#CBD6E6] bg-white px-3 py-2.5 text-[16px] tracking-wide outline-none focus:border-[#1E2A47] disabled:bg-[#F3F5F8] disabled:text-[#9AA7BA]"
              />
              {galat && <p className="mt-2 rounded-lg bg-[#FDE8E8] px-3 py-2 text-[13px] font-semibold text-[#B42329]">{galat}</p>}
              {status === "belum" && <p className="mt-2 text-[12.5px] text-[#5B6B84]">Presensi dibuka pukul {waktuWib(r.buka_at)} WIB.</p>}
              {status === "tutup" && <p className="mt-2 text-[12.5px] font-semibold text-[#B42329]">Presensi sudah ditutup. Bila Anda ikut rapat, hubungi panitia.</p>}
              <button
                type="button"
                disabled={!bisaIsi || sibuk || !token.trim()}
                onClick={hadir}
                className="mt-3 w-full rounded-xl bg-[#E0A526] px-4 py-3 text-[15px] font-extrabold text-[#1E2A47] shadow-sm disabled:cursor-not-allowed disabled:bg-[#E8EBF1] disabled:text-[#9AA7BA]"
              >
                {sibuk ? "Memeriksa…" : "✓ Hadir"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
