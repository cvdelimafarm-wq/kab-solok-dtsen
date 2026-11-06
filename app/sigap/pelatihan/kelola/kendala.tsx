"use client";

// app/sigap/pelatihan/kelola/kendala.tsx
//
// (3 Nov 2026) Tab "Kendala" di Kelola Pelatihan: tempat penyuntingan cepat saat ada kendala, dipakai terutama dari laptop. Tahap pertama: PETUGAS MENOLAK / MUNDUR.
// Satu klik "Tangani" membuka jendela dengan tiga pilihan: ganti dengan calon baru, biarkan kosong sementara, atau alihkan ke petugas yang sudah ada
// (tanpa pembagian otomatis: bebannya bisa ganda dan itu ditampilkan jelas sebelum diterapkan). Semua keputusan tercatat di Riwayat dan bisa diurungkan.
// API: /api/sigap/pelatihan/kendala. Tabel: SQL 20261103a_pelatihan_kendala (tanpa itu panel hanya menampilkan petunjuk).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bacaSesi, fetchJson, pesanGalat, SesiBerakhir, urlPelatihan } from "../../admin/api";
import { BTN, BTN_O, Chip, INPUT, Kartu, Memuat, Pesan } from "../../admin/ui";
import { Toast, useToast } from "../../admin/Toast";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";
import SelectCari from "@/app/components/SelectCari";

type Petugas = { akun_id: number; nama: string; peran: string; kelas: number | null; atasan_akun_id: number | null; bawahan: number; kecamatan: string | null; respons: "terima" | "tolak" | null };
type Perlu = { akun_id: number; nama: string; peran: string; kelas: number | null; bawahan: number; kecamatan: string | null; status: "menolak" | "kosong"; alasan: string | null; sejak: string | null };
type Riwayat = { id: number; akun_id: number; nama: string; keputusan: Keputusan; pengganti_nama: string | null; catatan: string | null; at: string; oleh_nama: string | null; dibatalkan_at: string | null; selesai_at: string | null; bisa_urung: boolean };
type Data = { tersedia: boolean; petugas: Petugas[]; perlu: Perlu[]; riwayat: Riwayat[]; boleh_kelola: boolean };
type Keputusan = "ganti" | "kosong" | "alihkan";
type Kandidat = { akun_id: number; nama: string; kecamatan: string | null; sewilayah: boolean };
type Sasaran = { akun_id: number; nama: string; peran: string; kelas: number | null; bawahan: number; kecamatan: string | null; alasan?: string | null; status: "aktif" | "menolak" | "kosong" };

const URL_API = "/api/sigap/pelatihan/kendala";
const LABEL_KEPUTUSAN: Record<Keputusan, string> = { ganti: "Diganti calon baru", kosong: "Dibiarkan kosong sementara", alihkan: "Dialihkan ke petugas yang ada" };
const peranTeks = (p: string) => p.toUpperCase();

function waktu(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
}

export default function KendalaKelola() {
  const [d, setD] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sasaran, setSasaran] = useState<Sasaran | null>(null);
  const [pilihMundur, setPilihMundur] = useState("");
  const [sibuk, setSibuk] = useState<number | null>(null);
  const toast = useToast();

  const muat = useCallback(async () => {
    try {
      const r = await fetchJson<Data>(urlPelatihan(URL_API));
      setD(r);
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    if (!bacaSesi()) return;
    void muat();
  }, [muat]);

  async function urungkan(r: Riwayat) {
    setSibuk(r.id);
    toast.tampil("simpan", "Mengurungkan…");
    try {
      const h = await fetchJson<{ ringkas: string }>(urlPelatihan(URL_API), { method: "POST", body: JSON.stringify({ aksi: "urungkan", id: r.id }) });
      toast.tampil("ok", h.ringkas);
      await muat();
    } catch (e) {
      toast.tampil("galat", e instanceof SesiBerakhir ? "Sesi berakhir, masuk kembali." : pesanGalat(e));
    } finally {
      setSibuk(null);
    }
  }

  if (!d && !galat) return <Memuat />;
  const boleh = !!d?.boleh_kelola;
  const petugas = d?.petugas ?? [];

  return (
    <div className="space-y-3" data-testid="panel-kendala">
      {galat && <Pesan jenis="galat" onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {d && !d.tersedia && <Pesan jenis="peringatan">Panel Kendala belum aktif. Jalankan dulu SQL 20261103a_pelatihan_kendala di Supabase, lalu muat ulang halaman ini.</Pesan>}

      <Kartu judul="Perlu ditangani" ket="Petugas yang menolak undangan dan tempat yang masih kosong. Pilih satu cara menanganinya; semuanya bisa diurungkan.">
        {d && d.perlu.length === 0 && <p className="text-[13px] text-[#6B7A90]" data-testid="perlu-kosong">Tidak ada petugas yang perlu ditangani saat ini.</p>}
        {d && d.perlu.length > 0 && (
          <ul className="divide-y divide-[#E6ECF5] rounded-lg border border-[#DDE6F3]" data-testid="daftar-perlu">
            {d.perlu.map((p) => (
              <li key={p.akun_id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-[#1B2B4B]">{p.nama}</p>
                  <p className="text-[12px] text-[#6B7A90]">
                    {peranTeks(p.peran)}
                    {p.kelas != null ? ` · kelas ${p.kelas}` : ""}
                    {p.bawahan > 0 ? ` · ${p.bawahan} bawahan menunggu atasan` : ""}
                    {p.alasan ? ` · “${p.alasan}”` : ""}
                    {p.sejak ? ` · ${waktu(p.sejak)}` : ""}
                  </p>
                </div>
                <Chip w={p.status === "menolak" ? "bad" : "wait"}>{p.status === "menolak" ? "Menolak" : "Menunggu pengganti"}</Chip>
                {boleh && d.tersedia && (
                  <button type="button" className={BTN} onClick={() => setSasaran({ ...p, status: p.status })}>
                    Tangani
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Kartu>

      <Kartu judul="Petugas mundur atau berhalangan" ket="Petugas yang tadinya menerima tetapi kini tidak bisa. Pilih namanya, lalu tentukan penggantinya.">
        {boleh && d?.tersedia ? (
          <div className="flex flex-wrap items-center gap-2">
            <SelectCari className={`${INPUT} min-w-[16rem]`} value={pilihMundur} onChange={(e) => setPilihMundur(e.target.value)} aria-label="Pilih petugas yang mundur">
              <option value="">Pilih petugas…</option>
              {petugas.map((p) => (
                <option key={p.akun_id} value={p.akun_id}>
                  {p.nama} · {peranTeks(p.peran)}
                  {p.kelas != null ? ` · kelas ${p.kelas}` : ""}
                </option>
              ))}
            </SelectCari>
            <button
              type="button"
              className={BTN}
              disabled={!pilihMundur}
              onClick={() => {
                const p = petugas.find((x) => String(x.akun_id) === pilihMundur);
                if (p) setSasaran({ ...p, status: "aktif" });
              }}
            >
              Tangani
            </button>
          </div>
        ) : (
          <p className="text-[12.5px] text-[#6B7A90]">{d?.tersedia === false ? "Menunggu SQL dijalankan." : "Anda hanya dapat melihat; memutuskan kendala butuh izin Kelola."}</p>
        )}
      </Kartu>

      <Kartu judul="Riwayat keputusan" ket="Keputusan terbaru di atas. Urungkan mengembalikan petugas lama, atasan, dan bawahannya seperti sebelum keputusan.">
        {d && d.riwayat.length === 0 && <p className="text-[13px] text-[#6B7A90]">Belum ada keputusan.</p>}
        {d && d.riwayat.length > 0 && (
          <ul className="divide-y divide-[#E6ECF5] rounded-lg border border-[#DDE6F3]" data-testid="riwayat-kendala">
            {d.riwayat.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] text-[#1B2B4B]">
                    <span className="font-semibold">{r.nama}</span> · {LABEL_KEPUTUSAN[r.keputusan]}
                    {r.pengganti_nama ? <span className="font-semibold"> → {r.pengganti_nama}</span> : null}
                  </p>
                  <p className="text-[12px] text-[#6B7A90]">
                    {waktu(r.at)}
                    {r.oleh_nama ? ` · oleh ${r.oleh_nama}` : ""}
                    {r.catatan ? ` · ${r.catatan}` : ""}
                  </p>
                </div>
                {r.dibatalkan_at ? <Chip w="mut">Diurungkan</Chip> : r.selesai_at ? <Chip w="ok">Sudah diganti</Chip> : null}
                {boleh && r.bisa_urung && (
                  <button type="button" className={BTN_O} disabled={sibuk === r.id} onClick={() => void urungkan(r)}>
                    Urungkan
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Kartu>

      <p className="px-1 text-[12px] text-[#6B7A90]">Kendala lain (absen, tes, pindah kelas) akan ditambahkan di sini.</p>

      {sasaran && d && (
        <ModalTangani
          sasaran={sasaran}
          petugas={petugas}
          tutup={() => setSasaran(null)}
          selesai={async (ringkas) => {
            setSasaran(null);
            toast.tampil("ok", ringkas);
            await muat();
          }}
          galat={(teks) => toast.tampil("galat", teks)}
        />
      )}
      <Toast isi={toast.isi} onTutup={toast.tutup} />
    </div>
  );
}

// ----------------------------------------------------------------------
// Jendela keputusan
// ----------------------------------------------------------------------
function ModalTangani({ sasaran, petugas, tutup, selesai, galat }: { sasaran: Sasaran; petugas: Petugas[]; tutup: () => void; selesai: (ringkas: string) => void | Promise<void>; galat: (teks: string) => void }) {
  const [pilihan, setPilihan] = useState<Keputusan>("ganti");
  const [kata, setKata] = useState("");
  const [kandidat, setKandidat] = useState<Kandidat[]>([]);
  const [calon, setCalon] = useState<Kandidat | null>(null);
  const [penerima, setPenerima] = useState<number | "">("");
  const [catatan, setCatatan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const nomor = useRef(0);

  useTutupDenganBack(true, tutup); // Back HP / tombol Back menutup jendela ini (penjaga Back)

  // Esc menutup
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sibuk) tutup();
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [tutup, sibuk]);

  // saran (kata kosong) dan pencarian (>= 2 huruf); hasil lama diabaikan
  useEffect(() => {
    if (pilihan !== "ganti" || calon) return;
    const q = kata.trim();
    if (q.length === 1) {
      setKandidat([]);
      return;
    }
    const n = ++nomor.current;
    const t = setTimeout(async () => {
      try {
        const r = await fetchJson<{ kandidat: Kandidat[] }>(urlPelatihan(`${URL_API}?cari=${encodeURIComponent(q)}&akun=${sasaran.akun_id}`));
        if (n === nomor.current) setKandidat(r.kandidat);
      } catch {
        if (n === nomor.current) setKandidat([]);
      }
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [kata, pilihan, calon, sasaran.akun_id]);

  // petugas aktif seperan, selain yang bersangkutan
  const opsiPenerima = useMemo(() => petugas.filter((p) => p.akun_id !== sasaran.akun_id && p.peran === sasaran.peran && p.respons !== "tolak"), [petugas, sasaran]);
  const dipilih = opsiPenerima.find((p) => p.akun_id === penerima) ?? null;

  const siap = pilihan === "kosong" || (pilihan === "ganti" && !!calon) || (pilihan === "alihkan" && !!dipilih);

  async function terapkan() {
    if (!siap) return;
    setSibuk(true);
    try {
      const pengganti = pilihan === "ganti" ? calon?.akun_id : pilihan === "alihkan" ? dipilih?.akun_id : null;
      const h = await fetchJson<{ ringkas: string }>(urlPelatihan(URL_API), { method: "POST", body: JSON.stringify({ aksi: "putuskan", akun_id: sasaran.akun_id, keputusan: pilihan, pengganti_akun_id: pengganti ?? null, catatan: catatan.trim() || null }) });
      await selesai(h.ringkas);
    } catch (e) {
      galat(e instanceof SesiBerakhir ? "Sesi berakhir, masuk kembali." : pesanGalat(e));
      setSibuk(false);
    }
  }

  const sudahKosong = sasaran.status === "kosong";
  const warisan = `${peranTeks(sasaran.peran)}${sasaran.kelas != null ? `, kelas ${sasaran.kelas}` : ""}${sasaran.bawahan > 0 ? `, ${sasaran.bawahan} bawahan` : ""}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" role="dialog" aria-modal="true" aria-label={`Tangani ${sasaran.nama}`} data-testid="modal-kendala" onMouseDown={(e) => e.target === e.currentTarget && !sibuk && tutup()}>
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-4 shadow-xl">
        <div className="mb-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-[#6B7A90]">Tangani kendala petugas</p>
          <h3 className="text-[16px] font-bold text-[#1B2B4B]">{sasaran.nama}</h3>
          <p className="text-[12.5px] text-[#6B7A90]">
            {sasaran.status === "menolak" ? "Menolak undangan" : sasaran.status === "kosong" ? "Tempatnya masih kosong" : "Mundur / berhalangan"} · {warisan}
            {sasaran.alasan ? ` · “${sasaran.alasan}”` : ""}
          </p>
        </div>

        <div className="space-y-2" role="radiogroup" aria-label="Cara menangani">
          <Pilihan aktif={pilihan === "ganti"} onPilih={() => setPilihan("ganti")} judul="Ganti dengan calon baru" ket={`Calon mewarisi ${warisan} dan langsung masuk daftar; ia perlu menerima undangan di HP.`} />
          {pilihan === "ganti" && (
            <div className="ml-6 space-y-2" data-testid="pilih-calon">
              {calon ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#BFD3F6] bg-[#F5F8FE] px-3 py-2">
                  <span className="text-[13.5px] font-semibold text-[#1B2B4B]">{calon.nama}</span>
                  {calon.kecamatan && <span className="text-[12px] text-[#6B7A90]">{calon.kecamatan}</span>}
                  <button type="button" className="ml-auto text-[12.5px] text-[#1F5FD1] underline" onClick={() => setCalon(null)}>
                    ganti
                  </button>
                </div>
              ) : (
                <>
                  <input className={`${INPUT} w-full`} placeholder="Cari nama mitra (kosongkan untuk saran satu kecamatan)" value={kata} onChange={(e) => setKata(e.target.value)} autoFocus />
                  {kandidat.length === 0 ? (
                    <p className="text-[12.5px] text-[#6B7A90]">{kata.trim().length === 1 ? "Ketik minimal 2 huruf." : "Tidak ada calon yang cocok. Mitra yang sudah bertugas atau menolak pelatihan ini tidak ditampilkan."}</p>
                  ) : (
                    <ul className="max-h-52 overflow-y-auto rounded-lg border border-[#DDE6F3] bg-white">
                      {kandidat.map((k) => (
                        <li key={k.akun_id}>
                          <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-[#F5F8FE]" onClick={() => setCalon(k)}>
                            <span className="flex-1">{k.nama}</span>
                            <span className="text-[11.5px] text-[#6B7A90]">{k.kecamatan ?? ""}</span>
                            {k.sewilayah && <Chip w="ok">satu kecamatan</Chip>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}

          {!sudahKosong && <Pilihan aktif={pilihan === "kosong"} onPilih={() => setPilihan("kosong")} judul="Biarkan kosong sementara" ket="Tempatnya ditandai kosong dan tetap muncul di “Perlu ditangani” sampai ada pengganti." />}

          <Pilihan aktif={pilihan === "alihkan"} onPilih={() => setPilihan("alihkan")} judul="Alihkan ke petugas yang sudah ada" ket="Tidak dibagi rata: seluruh bawahan pindah ke satu petugas seperan, sehingga bebannya bisa ganda." />
          {pilihan === "alihkan" && (
            <div className="ml-6 space-y-2" data-testid="pilih-penerima">
              <SelectCari className={`${INPUT} w-full`} value={penerima} onChange={(e) => setPenerima(e.target.value === "" ? "" : Number(e.target.value))} aria-label="Petugas yang mengambil alih">
                <option value="">Pilih petugas yang mengambil alih…</option>
                {opsiPenerima.map((p) => (
                  <option key={p.akun_id} value={p.akun_id}>
                    {p.nama} · sekarang {p.bawahan} bawahan{p.kecamatan && sasaran.kecamatan === p.kecamatan ? " · satu kecamatan" : ""}
                  </option>
                ))}
              </SelectCari>
              {opsiPenerima.length === 0 && <p className="text-[12.5px] text-[#B45309]">Tidak ada petugas seperan ({peranTeks(sasaran.peran)}) yang bisa mengambil alih.</p>}
              {dipilih && (
                <p className="rounded-lg bg-[#FFF6E5] px-3 py-2 text-[12.5px] text-[#92400E]" data-testid="peringatan-beban">
                  {dipilih.nama} akan menanggung <b>beban ganda</b>: bawahan {dipilih.bawahan} → {dipilih.bawahan + sasaran.bawahan}
                  {sasaran.bawahan === 0 ? " (petugas ini tidak punya bawahan, jadi tidak ada yang dipindah)" : ""}.
                </p>
              )}
            </div>
          )}
        </div>

        <label className="mt-3 block text-[12.5px] font-semibold text-[#5B6B84]">
          Catatan (opsional)
          <textarea className={`${INPUT} mt-1 w-full`} rows={2} maxLength={500} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Mis. sakit, pindah tugas, tidak bisa hadir" />
        </label>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className={BTN_O} disabled={sibuk} onClick={tutup}>
            Batal
          </button>
          <button type="button" className={BTN} disabled={!siap || sibuk} onClick={() => void terapkan()}>
            {sibuk ? "Menerapkan…" : "Terapkan"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Pilihan({ aktif, onPilih, judul, ket }: { aktif: boolean; onPilih: () => void; judul: string; ket: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={aktif}
      onClick={onPilih}
      className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2.5 text-left ${aktif ? "border-[#1F5FD1] bg-[#F5F8FE]" : "border-[#DDE6F3] bg-white hover:bg-[#FAFCFF]"}`}
    >
      <span className={`mt-0.5 inline-block h-4 w-4 shrink-0 rounded-full border-2 ${aktif ? "border-[#1F5FD1] bg-[#1F5FD1] shadow-[inset_0_0_0_2px_#fff]" : "border-[#9FB0C8]"}`} aria-hidden="true" />
      <span>
        <span className="block text-[13.5px] font-semibold text-[#1B2B4B]">{judul}</span>
        <span className="block text-[12.5px] text-[#6B7A90]">{ket}</span>
      </span>
    </button>
  );
}
