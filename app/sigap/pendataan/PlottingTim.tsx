"use client";

// app/sigap/pendataan/PlottingTim.tsx
//
// (13 Okt 2026) Kartu plotting tim -- tampil PERTAMA di Lembar Pendataan (permintaan user). Tampilan SAMA untuk PML dan PPL; bedanya hanya bisa mengirim atau tidak:
// PML memilih maksimal 2 Sub SLS untuk didata hari ini, memilih PPL untuk tiap Sub SLS (dropdown sendiri-sendiri), lalu menekan Kirim untuk meminta daftar KK
// "keluar" di FASIH. Permintaan masuk ke admin; admin meng-assign di FASIH lalu menandai "Sudah keluar" -> status di kartu berubah, PML & PPL dikabari lewat notifikasi.
// PPL melihat pilihan dan statusnya, tanpa bisa mengubah.

import { useMemo, useState } from "react";
import { useData } from "@/app/portal/dataBersama";
import { apiPortal } from "@/app/portal/sesi";
import { namaDepan, waktuRingkas } from "./usePendataan";
import { API_PERMINTAAN, LABEL_STATUS_MINTA, MAKS_SUB_PER_HARI, urutPermintaan, type DataPermintaanTim, type Permintaan } from "@/lib/permintaanDaftar";
import type { Anggota, SubTim } from "@/lib/pendataan";

const namaSub = (s: Pick<SubTim, "nagari" | "sls" | "sub_sls">) => `${s.nagari} · ${s.sls}${s.sub_sls ? ` / ${s.sub_sls}` : ""}`;

export default function PlottingTim({ anggota, sub, totalKk, sayaAkun }: { anggota: Anggota[]; sub: SubTim[]; totalKk: (idsubsls: string) => number; sayaAkun: number }) {
  const d = useData<DataPermintaanTim>(API_PERMINTAAN);
  const data = d.data;
  const [buka, setBuka] = useState(true);
  const [pilih, setPilih] = useState<Record<string, number>>({}); // idsubsls -> akun PPL (0 = belum dipilih)
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<{ nada: "ok" | "salah"; teks: string } | null>(null);

  const ppls = useMemo(() => anggota.filter((a) => a.peran === "ppl"), [anggota]);
  const bisaKirim = !!data?.bisa_kirim;
  const maks = data?.maks ?? MAKS_SUB_PER_HARI;
  const hariIni = useMemo(() => (data?.permintaan ?? []).filter((p) => p.tanggal === data?.tanggal).length, [data]);
  const sisa = Math.max(0, maks - hariIni);
  const terpilih = Object.keys(pilih);
  const adaPmlBelumPilihPpl = terpilih.some((k) => !pilih[k]);
  const bolehKirim = bisaKirim && !sibuk && terpilih.length > 0 && !adaPmlBelumPilihPpl;

  const aktifPer = useMemo(() => new Map((data?.permintaan ?? []).map((p) => [p.idsubsls, p])), [data]);
  const baris = useMemo(() => {
    const diminta = urutPermintaan(data?.permintaan ?? []).map((p) => p.idsubsls);
    const sudah = new Set(diminta);
    const peta = new Map(sub.map((s) => [s.idsubsls, s]));
    return [...diminta.map((id) => peta.get(id)).filter((s): s is SubTim => !!s), ...sub.filter((s) => !sudah.has(s.idsubsls))];
  }, [data, sub]);

  function ganti(id: string, tandai: boolean) {
    setPesan(null);
    setPilih((p) => {
      const n = { ...p };
      if (!tandai) delete n[id];
      else if (Object.keys(n).length < sisa) n[id] = ppls.length === 1 ? ppls[0].akun_id : 0;
      return n;
    });
  }

  async function kirim() {
    if (!bolehKirim) return;
    setSibuk(true);
    setPesan(null);
    try {
      await apiPortal(API_PERMINTAAN, { method: "POST", body: JSON.stringify({ aksi: "buat", pilihan: terpilih.map((id) => ({ idsubsls: id, ppl_akun_id: pilih[id] })) }) });
      setPilih({});
      setPesan({ nada: "ok", teks: "Terkirim ke admin. Status akan berubah jadi \"Sudah keluar di FASIH\" setelah daftar di-assign." });
      await d.muat();
    } catch (e) {
      setPesan({ nada: "salah", teks: e instanceof Error && e.message !== "SESI_BERAKHIR" ? e.message : "Gagal mengirim. Periksa sambungan lalu coba lagi." });
    } finally {
      setSibuk(false);
    }
  }

  async function batalkan(p: Permintaan) {
    if (sibuk) return;
    setSibuk(true);
    setPesan(null);
    try {
      await apiPortal(API_PERMINTAAN, { method: "POST", body: JSON.stringify({ aksi: "batalkan", id: p.id }) });
      setPesan({ nada: "ok", teks: "Permintaan dibatalkan. Kuota hari ini kembali." });
      await d.muat();
    } catch (e) {
      setPesan({ nada: "salah", teks: e instanceof Error && e.message !== "SESI_BERAKHIR" ? e.message : "Gagal membatalkan. Coba lagi." });
    } finally {
      setSibuk(false);
    }
  }

  const chip = (p: Permintaan) => (
    <span className={`flex-none rounded-full px-2 py-[2px] text-[10.5px] font-extrabold ${p.status === "sudah_keluar" ? "bg-[#E3F6EC] text-[#13794B]" : "bg-[#FFF4D6] text-[#8A6200]"}`}>{LABEL_STATUS_MINTA[p.status]}</span>
  );

  return (
    <section className="overflow-hidden rounded-[20px] bg-white shadow-[0_10px_28px_rgba(15,42,82,.12)]" aria-label="Plotting tim hari ini">
      <button type="button" onClick={() => setBuka((b) => !b)} aria-expanded={buka} className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left">
        <span className="min-w-0 flex-1">
          <b className="block text-[15px] text-[#0F2A52]">Plotting tim hari ini</b>
          <small className="block text-[12px] text-[#55657D]">
            {data ? `${hariIni} dari ${maks} Sub SLS sudah diminta hari ini` : "Memuat…"}
            {data && !bisaKirim ? " · hanya PML yang bisa mengisi" : ""}
          </small>
        </span>
        <span aria-hidden className="text-[18px] font-bold text-[#6B7A90]">{buka ? "−" : "+"}</span>
      </button>

      {buka && (
        <div className="border-t border-[#E8EDF5] px-4 pb-4 pt-3">
          <p className="rounded-[12px] bg-[#EAF1FC] px-3 py-2 text-[12.5px] leading-snug text-[#0F2A52]">
            <b>Upayakan pendataan awal ini dengan keroyokan.</b> Daftar keluarga akan di-assign ke salah satu akun PPL. Pilih maksimal {maks} Sub SLS untuk didata hari ini.
          </p>

          {d.galat && !data && <p className="mt-3 rounded-[12px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[12.5px] text-[#7A1D22]">Status permintaan belum termuat. {d.galat === "SESI_BERAKHIR" ? "" : d.galat}</p>}

          <ul className="mt-3 space-y-2">
            {baris.map((s) => {
              const p = aktifPer.get(s.idsubsls);
              const n = totalKk(s.idsubsls);
              const dipilih = s.idsubsls in pilih;
              const penuh = !dipilih && terpilih.length >= sisa;
              const nonaktif = !bisaKirim || !!p || n === 0 || penuh;
              return (
                <li key={s.idsubsls} className={`rounded-[14px] border px-3 py-2.5 ${dipilih ? "border-[#1F5FD1] bg-[#F1F6FE]" : "border-[#E3E8F0] bg-white"}`}>
                  <label className={`flex items-center gap-3 ${nonaktif ? "" : "cursor-pointer"}`}>
                    {p ? (
                      <span aria-hidden className={`grid h-6 w-6 flex-none place-items-center rounded-full text-[13px] font-extrabold text-white ${p.status === "sudah_keluar" ? "bg-[#13794B]" : "bg-[#C98A00]"}`}>{p.status === "sudah_keluar" ? "✓" : "…"}</span>
                    ) : (
                      <input type="checkbox" checked={dipilih} disabled={nonaktif && !dipilih} onChange={(e) => ganti(s.idsubsls, e.target.checked)} className="h-6 w-6 flex-none accent-[#1F5FD1] disabled:opacity-40" aria-label={`Pilih ${namaSub(s)}`} />
                    )}
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[13.5px] text-[#0F2A52]">{namaSub(s)}</b>
                      <small className="block truncate text-[11.5px] text-[#6B7A90]">
                        Kec. {s.kecamatan} · {n > 0 ? `${n} KK` : "daftar KK belum diunggah"}
                      </small>
                    </span>
                    {p && chip(p)}
                  </label>

                  {p && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-9 text-[12px] text-[#52627A]">
                      <span>
                        Untuk <b className="text-[#0F2A52]">{namaDepan(p.ppl_nama || "PPL")}</b>
                        {p.ppl_nama && p.ppl_nama.trim().split(/\s+/).length > 1 ? ` (${p.ppl_nama})` : ""} · diminta {waktuRingkas(p.diminta_at)}
                        {p.status === "sudah_keluar" && p.selesai_at ? ` · keluar ${waktuRingkas(p.selesai_at)}` : ""}
                      </span>
                      {bisaKirim && p.status === "menunggu" && (
                        <button type="button" disabled={sibuk} onClick={() => void batalkan(p)} className="min-h-[36px] rounded-full bg-white px-3 text-[12px] font-extrabold text-[#B42329] shadow-[0_2px_6px_rgba(15,42,82,.1)] disabled:opacity-50">
                          Batalkan
                        </button>
                      )}
                    </div>
                  )}

                  {dipilih && (
                    <div className="mt-2 pl-9">
                      <label className="block text-[11.5px] font-bold text-[#52627A]">
                        PPL yang di-assign
                        <select
                          value={pilih[s.idsubsls] || ""}
                          onChange={(e) => setPilih((x) => ({ ...x, [s.idsubsls]: Number(e.target.value) || 0 }))}
                          className="mt-1 h-11 w-full rounded-[12px] border border-[#D9E3F2] bg-white px-3 text-[13.5px] font-bold text-[#0F2A52]"
                        >
                          <option value="">Pilih nama PPL…</option>
                          {ppls.map((a) => (
                            <option key={a.akun_id} value={a.akun_id}>
                              {a.nama}
                              {a.akun_id === sayaAkun ? " (saya)" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {sisa === 0 && bisaKirim && <p className="mt-2 text-[12px] font-bold text-[#8A6200]">Batas {maks} Sub SLS untuk hari ini sudah terpakai. Batalkan permintaan yang masih menunggu bila ingin mengganti.</p>}

          <button type="button" disabled={!bolehKirim} onClick={() => void kirim()} className="mt-3 min-h-[50px] w-full rounded-[14px] bg-[#1F5FD1] px-4 text-[14px] font-extrabold text-white disabled:bg-[#A9BCD8]">
            {sibuk ? "Mengirim…" : terpilih.length > 0 ? `Kirim permintaan (${terpilih.length} Sub SLS)` : "Kirim permintaan"}
          </button>
          {bisaKirim && terpilih.length > 0 && adaPmlBelumPilihPpl && <p className="mt-1.5 text-[12px] font-bold text-[#8A6200]">Pilih nama PPL untuk setiap Sub SLS yang ditandai.</p>}

          {pesan && (
            <p role="status" className={`mt-2 rounded-[12px] px-3 py-2 text-[12.5px] font-semibold ${pesan.nada === "ok" ? "bg-[#E3F6EC] text-[#13794B]" : "border-l-4 border-[#B42329] bg-[#FDE8E8] text-[#7A1D22]"}`}>
              {pesan.teks}
            </p>
          )}

          <div className="mt-3 rounded-[12px] bg-[#F5F8FE] px-3 py-2.5 text-[12px] leading-snug text-[#52627A]">
            <p className="font-extrabold text-[#0F2A52]">Hanya PML yang dapat mengisi pilihan dan menekan Kirim.</p>
            <p className="mt-1">PPL hanya melihat pilihan dan statusnya di kartu ini; tombol tidak aktif bagi PPL.</p>
            <p className="mt-1">Setelah Kirim, permintaan masuk ke admin. Admin meng-assign daftar KK ke akun FASIH PPL yang dipilih, lalu status berubah dari &quot;Menunggu admin&quot; menjadi &quot;Sudah keluar di FASIH&quot; dan PML serta PPL dikabari lewat notifikasi. Batas {maks} Sub SLS per PML per hari (menurut tanggal WIB).</p>
          </div>
        </div>
      )}
    </section>
  );
}
