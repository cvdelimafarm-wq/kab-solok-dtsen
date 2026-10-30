"use client";

// app/sigap/kelola/pendataan/BelumDiajukan.tsx
//
// (21 Okt 2026) Tab "Belum diajukan" pada kartu "Permintaan daftar KK ke FASIH" -- permintaan user: daftar Sub SLS yang belum diajukan PML, dengan info
// plotting awalnya, lalu admin dapat menugaskan (assign) ke PML plotting ataupun ke PML/tim lain. Penugasan menjadi permintaan "Menunggu admin" (tanda
// "Ditugaskan admin"), tidak memakai kuota pengajuan PML; alurnya selanjutnya sama (ekspor templat -> assign di FASIH -> tandai sudah keluar).

import { useMemo, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { rapikanNama } from "@/lib/rekapIdentifikasi";
import { API_PERMINTAAN, JUDUL_TEMPLAT_FASIH, barisTemplatFasih, namaBerkasTemplat, tanggalWib, tanpaEmail } from "@/lib/permintaanDaftar";
import { SARINGAN_AWAL, adaPlotting, pesanTandaKeluar, bawaanTugas, daftarKecamatan, emailPilihanTugas, labelSub, pplBawaan, ringkasPlotting, riwayatTerakhir, saringBelum, type BelumItem, type DataBelum, type SaringanBelum, type TugasPilihan } from "@/lib/belumDiajukan";

type Mode = "plotting" | "lain";

export default function BelumDiajukan({ data, onSelesai }: { data: DataBelum | null; onSelesai: () => Promise<void> }) {
  const [saring, setSaring] = useState<SaringanBelum>(SARINGAN_AWAL);
  const [pilih, setPilih] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>("plotting");
  const [pmlLain, setPmlLain] = useState<number | null>(null);
  const [pplLain, setPplLain] = useState<number | null>(null);
  const [yakin, setYakin] = useState(false);
  const [yakinKeluar, setYakinKeluar] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [unduh, setUnduh] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  const items = data?.items ?? [];
  const tim = useMemo(() => data?.tim ?? [], [data]);
  const boleh = !!data?.boleh_kelola;
  const tampil = useMemo(() => saringBelum(items, saring), [items, saring]);
  const kecamatan = useMemo(() => daftarKecamatan(items), [items]);
  const dipilih = useMemo(() => items.filter((b) => pilih.has(b.idsubsls)), [items, pilih]);
  const nPlot = items.filter(adaPlotting).length;

  const timLain = tim.find((t) => t.pml_id === pmlLain) ?? null;

  // pilihan yang akan dikirim menurut mode
  const rencana = useMemo(() => {
    const ok: TugasPilihan[] = [];
    const lewat: BelumItem[] = [];
    for (const b of dipilih) {
      if (mode === "plotting") {
        const w = bawaanTugas(b, tim);
        if (w.pml_id != null && w.ppl_akun_id != null) ok.push({ idsubsls: b.idsubsls, pml_id: w.pml_id, ppl_akun_id: w.ppl_akun_id });
        else lewat.push(b);
      } else if (pmlLain != null && pplLain != null) ok.push({ idsubsls: b.idsubsls, pml_id: pmlLain, ppl_akun_id: pplLain });
      else lewat.push(b);
    }
    const pindah = ok.filter((p) => {
      const b = dipilih.find((x) => x.idsubsls === p.idsubsls);
      return !!b && adaPlotting(b) && !b.plotting.some((x) => x.pml_id === p.pml_id);
    }).length;
    return { ok, lewat, pindah };
  }, [dipilih, mode, tim, pmlLain, pplLain]);

  function ubah(f: () => void) {
    setYakin(false);
    setYakinKeluar(false);
    setPesan(null);
    setGalat(null);
    f();
  }
  const centang = (id: string) =>
    ubah(() =>
      setPilih((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      }),
    );
  const semuaTampilDipilih = tampil.length > 0 && tampil.every((b) => pilih.has(b.idsubsls));
  const pilihSemuaTampil = () => ubah(() => setPilih((s) => (semuaTampilDipilih ? new Set([...s].filter((id) => !tampil.some((b) => b.idsubsls === id))) : new Set([...s, ...tampil.map((b) => b.idsubsls)]))));

  function gantiPml(id: number | null) {
    ubah(() => {
      setPmlLain(id);
      setPplLain(id == null ? null : pplBawaan(tim, id));
    });
  }

  async function tugaskan() {
    if (!rencana.ok.length || sibuk) return;
    setSibuk(true);
    setGalat(null);
    setPesan(null);
    try {
      const h = await apiPortal<{ ids: number[]; dikirim: number; dipindah: number }>(API_PERMINTAAN, { method: "POST", body: JSON.stringify({ aksi: "tugaskan", pilihan: rencana.ok }) });
      setPesan(`${h.ids.length} Sub SLS ditugaskan dan masuk tab Menunggu admin.${h.dipindah ? ` ${h.dipindah} dipindah dari plotting PML sebelumnya.` : ""} Notifikasi masuk ke ${h.dikirim} perangkat (PML dan PPL).`);
      setPilih(new Set());
      setYakin(false);
      await onSelesai();
    } catch (e) {
      setGalat(e instanceof Error && e.message !== "SESI_BERAKHIR" ? e.message : "Gagal menugaskan. Coba lagi.");
      setYakin(false);
    } finally {
      setSibuk(false);
    }
  }

  // (30 Okt 2026) Sub SLS yang sudah di-assign di FASIH di luar alur SIGAP: tandai langsung "sudah keluar" (pindah ke tab Sudah keluar; tanpa notifikasi dan kuota).
  async function tandaiKeluar() {
    if (!rencana.ok.length || sibuk) return;
    setSibuk(true);
    setGalat(null);
    setPesan(null);
    try {
      const h = await apiPortal<{ ids: number[]; ditolak: { idsubsls: string; label: string; alasan: string }[] }>(API_PERMINTAAN, { method: "POST", body: JSON.stringify({ aksi: "tandai_keluar", pilihan: rencana.ok }) });
      setPesan(pesanTandaKeluar(h.ids.length, h.ditolak));
      setPilih(new Set());
      setYakinKeluar(false);
      await onSelesai();
    } catch (e) {
      setGalat(e instanceof Error && e.message !== "SESI_BERAKHIR" ? e.message : "Gagal menandai. Coba lagi.");
      setYakinKeluar(false);
    } finally {
      setSibuk(false);
    }
  }

  // (24 Okt 2026) Unduh templat FASIH (Pengawas-Pencacah) untuk Sub SLS terpilih -- permintaan user: tab ini belum punya tombol unduh templat. Berkas memakai
  // tujuan yang sedang dipilih (PML plotting atau PML/tim lain); Sub SLS yang dilewati tidak ikut. Hanya membuat berkas, TIDAK menugaskan.
  async function unduhTemplat() {
    if (!rencana.ok.length || unduh) return;
    setUnduh(true);
    setGalat(null);
    setPesan(null);
    try {
      const XLSX = await import("xlsx");
      const isi = emailPilihanTugas(rencana.ok, tim);
      const baris = barisTemplatFasih(isi);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(baris, { header: [...JUDUL_TEMPLAT_FASIH] }), "Sheet0");
      XLSX.writeFile(wb, namaBerkasTemplat(tanggalWib(Date.now())));
      const kosong = isi.filter(tanpaEmail).length;
      setPesan(`Templat FASIH diunduh (${baris.length} baris).${kosong ? ` ${kosong} baris email-nya kosong, lengkapi dulu sebelum diunggah ke FASIH.` : ""} Berkas ini belum menugaskan; tekan Tugaskan agar tercatat di tab Menunggu admin.`);
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal membuat Excel.");
    } finally {
      setUnduh(false);
    }
  }
  const tombolUnduh = (
    <div>
      <button type="button" disabled={unduh || rencana.ok.length === 0} onClick={() => void unduhTemplat()} className="min-h-[46px] w-full rounded-[14px] bg-[#1F5FD1] px-4 text-[14px] font-extrabold text-white disabled:bg-[#9DB8E8]">
        {unduh ? "Membuat Excel…" : `Unduh templat FASIH (${rencana.ok.length} Sub SLS)`}
      </button>
      <p className="mt-1 text-[11.5px] text-[#6B7A90]">Format Pengawas-Pencacah untuk unggah dan assign di FASIH; PML sebagai pengawas, PPL penerima sebagai pencacah.</p>
    </div>
  );

  const jenis = (k: SaringanBelum["jenis"], teks: string, n: number) => (
    <button key={k} type="button" aria-pressed={saring.jenis === k} onClick={() => ubah(() => setSaring((s) => ({ ...s, jenis: k })))} className={`min-h-[38px] flex-1 rounded-full px-2 text-[12px] font-extrabold ${saring.jenis === k ? "bg-[#1F5FD1] text-white" : "bg-[#F5F8FE] text-[#55657D]"}`}>
      {teks} <b>{n}</b>
    </button>
  );

  return (
    <div>
      <p className="mt-3 text-[12.5px] leading-snug text-[#55657D]">
        Sub SLS yang <b>belum diajukan</b> PML dan belum didata. Kolom <b>Plotting awal</b> menunjukkan PML/PPL hasil plotting; Sub SLS tanpa plotting masih di kolam wilayah kerja. Admin dapat <b>menugaskan</b> ke PML plotting atau ke PML/tim lain. Hasilnya masuk tab Menunggu admin (bertanda <b>Ditugaskan admin</b>) dan <b>tidak memakai kuota</b> pengajuan PML. Setelah memilih Sub SLS, <b>templat FASIH</b> dapat diunduh dari panel di bawah daftar.
      </p>
      {galat && <p className="mt-3 rounded-[12px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>}

      <div className="mt-3 flex gap-2" role="group" aria-label="Saring jenis">
        {jenis("semua", "Semua", items.length)}
        {jenis("plotting", "Sudah diplot", nPlot)}
        {jenis("kolam", "Di kolam", items.length - nPlot)}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <select aria-label="Kecamatan" value={saring.kecamatan} onChange={(e) => ubah(() => setSaring((s) => ({ ...s, kecamatan: e.target.value })))} className="h-10 min-w-0 flex-1 basis-[140px] rounded-[10px] border border-[#D9E3F2] bg-white px-2 text-[13px]">
          <option value="">Semua kecamatan</option>
          {kecamatan.map((k) => (
            <option key={k} value={k}>
              {rapikanNama(k)}
            </option>
          ))}
        </select>
        <input type="search" value={saring.kata} onChange={(e) => setSaring((s) => ({ ...s, kata: e.target.value }))} placeholder="Cari jorong, nagari, PML, PPL" className="h-10 min-w-0 flex-[2] basis-[180px] rounded-[10px] border border-[#D9E3F2] bg-white px-3 text-[13px]" />
      </div>

      {data && tampil.length === 0 && <p className="mt-3 rounded-[12px] bg-[#F5F8FE] px-3 py-3 text-[13px] text-[#55657D]">{items.length === 0 ? "Semua Sub SLS sudah diajukan atau didata." : "Tidak ada Sub SLS yang cocok dengan saringan."}</p>}
      {!data && <p className="mt-3 rounded-[12px] bg-[#F5F8FE] px-3 py-3 text-[13px] text-[#55657D]">Memuat…</p>}

      {tampil.length > 0 && (
        <>
          <button type="button" onClick={pilihSemuaTampil} className="mt-3 min-h-[40px] rounded-full bg-[#F5F8FE] px-3 text-[12px] font-extrabold text-[#1F5FD1]">
            {semuaTampilDipilih ? "Batal pilih semua" : `Pilih semua yang tampil (${tampil.length})`}
          </button>
          <ul className="mt-2 overflow-hidden rounded-[14px] border border-[#EEF2F7]">
            {tampil.map((b) => {
              const riwayat = riwayatTerakhir(b.terakhir);
              return (
                <li key={b.idsubsls} className="border-t border-[#EEF2F7] first:border-t-0">
                  <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5">
                    <input type="checkbox" checked={pilih.has(b.idsubsls)} onChange={() => centang(b.idsubsls)} className="mt-0.5 h-6 w-6 flex-none accent-[#1F5FD1]" aria-label={`Pilih ${labelSub(b)}`} />
                    <span className="min-w-0 flex-1">
                      <b className="block text-[13.5px] text-[#0F2A52]">
                        {rapikanNama(b.sls)}
                        {b.sub_sls ? ` Sub ${b.sub_sls}` : ""} · Nagari {rapikanNama(b.nagari)}
                        {adaPlotting(b) ? <span className="ml-1.5 inline-block rounded-full bg-[#E1ECFB] px-2 py-[1px] align-[1px] text-[11px] font-extrabold text-[#1F4E9E]">Sudah diplot</span> : <span className="ml-1.5 inline-block rounded-full bg-[#F1E4FA] px-2 py-[1px] align-[1px] text-[11px] font-extrabold text-[#6B1F96]">Di kolam</span>}
                      </b>
                      <small className="block text-[12px] text-[#6B7A90]">
                        Kec. {rapikanNama(b.kecamatan)} · {b.kk} KK{b.didata ? ` · ${b.didata} sudah didata` : ""}
                      </small>
                      <small className="mt-0.5 block text-[12px] font-bold text-[#0F2A52]">Plotting awal: {ringkasPlotting(b)}</small>
                      {riwayat && <small className={`mt-0.5 block text-[11.5px] font-bold ${b.terakhir?.perlu_hapus ? "text-[#B42329]" : "text-[#6B7A90]"}`}>{riwayat}</small>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {dipilih.length > 0 && (
        <div className="mt-3 space-y-2 rounded-[14px] border border-[#D9E3F2] bg-[#F9FBFF] p-3">
          <p className="text-[13px] font-extrabold text-[#0F2A52]">Tugaskan {dipilih.length} Sub SLS terpilih</p>
          {!boleh ? (
            <>
              <p className="text-[12.5px] text-[#6B7A90]">Akun ini hanya boleh melihat dan mengunduh templat; menugaskan butuh izin kelola pendataan.</p>
              {tombolUnduh}
            </>
          ) : (
            <>
              <div className="flex gap-2" role="group" aria-label="Tujuan penugasan">
                <button type="button" aria-pressed={mode === "plotting"} onClick={() => ubah(() => setMode("plotting"))} className={`min-h-[44px] flex-1 rounded-[12px] px-2 text-[12.5px] font-extrabold ${mode === "plotting" ? "bg-[#0F2A52] text-white" : "bg-white text-[#55657D] shadow-sm"}`}>
                  Ke PML plotting
                </button>
                <button type="button" aria-pressed={mode === "lain"} onClick={() => ubah(() => setMode("lain"))} className={`min-h-[44px] flex-1 rounded-[12px] px-2 text-[12.5px] font-extrabold ${mode === "lain" ? "bg-[#0F2A52] text-white" : "bg-white text-[#55657D] shadow-sm"}`}>
                  Ke PML/tim lain
                </button>
              </div>

              {mode === "plotting" ? (
                <p className="text-[12.5px] text-[#52627A]">Tiap Sub SLS dikirim ke PML hasil plotting awalnya (PPL-nya ikut plotting; bila tidak ada di tim, PPL pertama tim). Sub SLS tanpa plotting dilewati.</p>
              ) : (
                <div className="space-y-2">
                  <label className="block text-[12px] font-bold text-[#52627A]">
                    PML (tim) tujuan
                    <select value={pmlLain ?? ""} onChange={(e) => gantiPml(e.target.value ? Number(e.target.value) : null)} className="mt-1 h-11 w-full rounded-[10px] border border-[#D9E3F2] bg-white px-2 text-[13px] font-normal text-[#0F2A52]">
                      <option value="">Pilih PML…</option>
                      {tim.map((t) => (
                        <option key={t.pml_id} value={t.pml_id}>
                          {rapikanNama(t.pml_nama)} · {t.sub} Sub SLS · {t.ppl.length} PPL
                        </option>
                      ))}
                    </select>
                  </label>
                  {timLain && (
                    <label className="block text-[12px] font-bold text-[#52627A]">
                      PPL penerima (akun yang dipakai login FASIH)
                      <select value={pplLain ?? ""} onChange={(e) => ubah(() => setPplLain(e.target.value ? Number(e.target.value) : null))} className="mt-1 h-11 w-full rounded-[10px] border border-[#D9E3F2] bg-white px-2 text-[13px] font-normal text-[#0F2A52]">
                        {timLain.ppl.map((p) => (
                          <option key={p.akun_id} value={p.akun_id}>
                            {rapikanNama(p.nama)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {timLain && timLain.ppl.length === 0 && <p className="text-[12px] font-bold text-[#B42329]">Tim ini belum punya PPL berakun aktif; pilih tim lain.</p>}
                </div>
              )}

              {rencana.lewat.length > 0 && (
                <p className="text-[12px] font-bold text-[#8A6200]">
                  {rencana.lewat.length} Sub SLS terpilih dilewati ({mode === "plotting" ? "belum ada plotting atau PML plottingnya tidak ada di daftar tim" : "pilih PML dan PPL tujuan dulu"}).
                </p>
              )}
              {rencana.pindah > 0 && <p className="text-[12px] font-bold text-[#B42329]">{rencana.pindah} Sub SLS akan DIPINDAH dari plotting PML sebelumnya ke PML tujuan.</p>}

              {tombolUnduh}

              {!yakinKeluar ? (
                <button type="button" disabled={sibuk || rencana.ok.length === 0} onClick={() => ubah(() => setYakinKeluar(true))} className="min-h-[46px] w-full rounded-[14px] border-2 border-[#13794B] bg-white px-4 text-[14px] font-extrabold text-[#13794B] disabled:border-[#9FCDB5] disabled:text-[#9FCDB5]">
                  Tandai sudah keluar di FASIH ({rencana.ok.length})…
                </button>
              ) : (
                <div className="rounded-[14px] border border-[#F2D58A] bg-[#FFF6E0] p-3">
                  <p className="text-[13px] font-bold text-[#6B4A0E]">
                    Tandai {rencana.ok.length} Sub SLS sebagai SUDAH KELUAR di FASIH? Pakai ini untuk Sub SLS yang <u>sudah Anda assign di FASIH</u> (di luar pengajuan SIGAP). Langsung pindah ke tab Sudah keluar. PML dan PPL tidak dikirimi notifikasi dan kuota pengajuan PML tidak terpakai.
                    {rencana.pindah > 0 ? ` ${rencana.pindah} di antaranya dipindah dari PML plotting sebelumnya.` : ""}
                  </p>
                  <p className="mt-1 text-[12px] text-[#6B4A0E]">Sub SLS tanpa daftar KK akan dilewati dan disebutkan setelahnya.</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setYakinKeluar(false)} className="min-h-[46px] rounded-[12px] bg-white text-[13.5px] font-extrabold text-[#0F2A52] shadow-sm">
                      Batal
                    </button>
                    <button type="button" disabled={sibuk} onClick={() => void tandaiKeluar()} className="min-h-[46px] rounded-[12px] bg-[#13794B] text-[13.5px] font-extrabold text-white disabled:bg-[#9FCDB5]">
                      {sibuk ? "Menandai…" : "Ya, sudah keluar"}
                    </button>
                  </div>
                </div>
              )}

              {!yakin ? (
                <button type="button" disabled={sibuk || rencana.ok.length === 0} onClick={() => setYakin(true)} className="min-h-[50px] w-full rounded-[14px] bg-[#13794B] px-4 text-[14px] font-extrabold text-white disabled:bg-[#9FCDB5]">
                  Tugaskan ({rencana.ok.length})…
                </button>
              ) : (
                <div className="rounded-[14px] border border-[#F2D58A] bg-[#FFF6E0] p-3">
                  <p className="text-[13px] font-bold text-[#6B4A0E]">
                    Tugaskan {rencana.ok.length} Sub SLS? Masuk ke tab Menunggu admin (Ditugaskan admin) dan PML serta PPL penerimanya dikabari lewat notifikasi.
                    {rencana.pindah > 0 ? ` ${rencana.pindah} di antaranya dipindah dari PML plotting sebelumnya (data plotting lama disimpan di catatan audit).` : ""} Kuota pengajuan PML tidak terpakai.
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setYakin(false)} className="min-h-[46px] rounded-[12px] bg-white text-[13.5px] font-extrabold text-[#0F2A52] shadow-sm">
                      Batal
                    </button>
                    <button type="button" disabled={sibuk} onClick={() => void tugaskan()} className="min-h-[46px] rounded-[12px] bg-[#13794B] text-[13.5px] font-extrabold text-white disabled:bg-[#9FCDB5]">
                      {sibuk ? "Menugaskan…" : "Ya, tugaskan"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {pesan && (
        <p role="status" className="mt-3 rounded-[12px] bg-[#E3F6EC] px-3 py-2 text-[13px] font-semibold text-[#13794B]">
          {pesan}
        </p>
      )}
    </div>
  );
}
