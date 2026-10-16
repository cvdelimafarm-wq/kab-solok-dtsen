"use client";

// app/sigap/kelola/pendataan/PermintaanDaftar.tsx
//
// (13 Okt 2026) Permintaan daftar KK ke FASIH dari kartu plotting tim (PML) -- permintaan user.
// Alur admin: lihat permintaan -> Ekspor templat FASIH (format Pengawas-Pencacah: PROVINSI, KABUPATEN/KOTA, KECAMATAN, DESA/KELURAHAN, SLS/SUBSLS, Email Pengawas, Email Pencacah)
// -> unggah & assign di FASIH -> "Tandai sudah keluar di FASIH" (PML dan PPL dikabari lewat notifikasi, status di kartu berubah).

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { waktuRingkas } from "@/app/sigap/pendataan/usePendataan";
import { rapikanNama } from "@/lib/rekapIdentifikasi";
import { API_PERMINTAAN, CATATAN_CEK_SUBMIT, CATATAN_KEROYOKAN, JUDUL_TEMPLAT_FASIH, LABEL_STATUS_MINTA, barisTemplatFasih, namaBerkasTemplat, periksaEmail, tanggalWib, tanpaEmail, urutPermintaan, type DataPermintaanAdmin, type PeranEmail, type PermintaanAdmin } from "@/lib/permintaanDaftar";

type Saring = "menunggu" | "sudah_keluar" | "dibatalkan";

const namaSub = (p: Pick<PermintaanAdmin, "nagari" | "sls" | "sub_sls">) => `${rapikanNama(p.sls)}${p.sub_sls ? ` Sub ${p.sub_sls}` : ""} · Nagari ${rapikanNama(p.nagari)}`;

export default function PermintaanDaftar() {
  const [data, setData] = useState<DataPermintaanAdmin | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [saring, setSaring] = useState<Saring>("menunggu");
  const [pilih, setPilih] = useState<Set<number>>(new Set());
  const [yakin, setYakin] = useState(false);
  const [sibuk, setSibuk] = useState<"muat" | "ekspor" | "tandai" | "tarik" | "hapus" | null>(null);
  const [yakinTarik, setYakinTarik] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [surel, setSurel] = useState<Record<string, string>>({});
  const [simpanSurel, setSimpanSurel] = useState<string | null>(null);

  const muat = useCallback(async () => {
    setSibuk("muat");
    try {
      setData(await apiPortal<DataPermintaanAdmin>(`${API_PERMINTAAN}?admin=1`));
      setGalat(null);
    } catch (e) {
      setGalat(e instanceof Error && e.message !== "SESI_BERAKHIR" ? e.message : "Gagal memuat permintaan.");
    } finally {
      setSibuk(null);
    }
  }, []);
  useEffect(() => {
    void muat();
  }, [muat]);

  const semua = useMemo(() => urutPermintaan(data?.permintaan ?? []), [data]);
  const menunggu = useMemo(() => semua.filter((p) => p.status === "menunggu"), [semua]);
  const keluar = useMemo(() => semua.filter((p) => p.status === "sudah_keluar"), [semua]);
  const batal = useMemo(() => semua.filter((p) => p.status === "dibatalkan"), [semua]);
  const batalPerSub = useMemo(() => new Set(batal.map((p) => p.idsubsls)), [batal]);
  const tampil = saring === "menunggu" ? menunggu : saring === "sudah_keluar" ? keluar : batal;
  const dipilih = useMemo(() => semua.filter((p) => pilih.has(p.id)), [semua, pilih]);
  const dipilihMenunggu = dipilih.filter((p) => p.status === "menunggu");
  const dipilihKeluar = dipilih.filter((p) => p.status === "sudah_keluar");
  const dipilihAktif = dipilih.filter((p) => p.status !== "dibatalkan"); // pembatalan tidak ikut templat FASIH
  const dipilihBatal = dipilih.filter((p) => p.status === "dibatalkan");
  const tanpaSurel = dipilihAktif.filter(tanpaEmail).length;
  const boleh = !!data?.boleh_kelola;

  function centang(id: number) {
    setYakin(false);
    setPesan(null);
    setPilih((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  const pilihSemuaTampil = () => {
    setYakin(false);
    setPilih((s) => (tampil.every((p) => s.has(p.id)) ? new Set([...s].filter((id) => !tampil.some((p) => p.id === id))) : new Set([...s, ...tampil.map((p) => p.id)])));
  };

  async function ekspor() {
    if (dipilihAktif.length === 0 || sibuk) return;
    setSibuk("ekspor");
    setPesan(null);
    try {
      const XLSX = await import("xlsx");
      const baris = barisTemplatFasih(dipilihAktif);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(baris, { header: [...JUDUL_TEMPLAT_FASIH] }), "Sheet0");
      XLSX.writeFile(wb, namaBerkasTemplat(tanggalWib(Date.now())));
      setPesan(`Templat FASIH diunduh (${baris.length} baris).${tanpaSurel ? ` ${tanpaSurel} baris email-nya kosong, lengkapi dulu sebelum diunggah ke FASIH.` : ""}`);
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Gagal membuat Excel.");
    } finally {
      setSibuk(null);
    }
  }

  async function simpanEmail(p: PermintaanAdmin, sebagai: PeranEmail) {
    const kunci = `${p.id}:${sebagai}`;
    const nilai = periksaEmail(surel[kunci]);
    if (!nilai) return setGalat("Format email tidak sah.");
    setSimpanSurel(kunci);
    setGalat(null);
    try {
      await apiPortal(API_PERMINTAAN, { method: "POST", body: JSON.stringify({ aksi: "email", id: p.id, sebagai, email: nilai }) });
      setSurel((s) => ({ ...s, [kunci]: "" }));
      setPesan(`Email ${sebagai === "pengawas" ? "PML" : "PPL"} tersimpan: ${nilai}`);
      await muat();
    } catch (e) {
      setGalat(e instanceof Error && e.message !== "SESI_BERAKHIR" ? e.message : "Gagal menyimpan email. Coba lagi.");
    } finally {
      setSimpanSurel(null);
    }
  }

  async function tandai() {
    if (dipilihMenunggu.length === 0 || sibuk) return;
    setSibuk("tandai");
    setPesan(null);
    try {
      const h = await apiPortal<{ selesai: number; dikirim: number }>(API_PERMINTAAN, { method: "POST", body: JSON.stringify({ aksi: "selesai", ids: dipilihMenunggu.map((p) => p.id) }) });
      setPesan(`${h.selesai} permintaan ditandai sudah keluar. Notifikasi masuk ke ${h.dikirim} perangkat (PML dan PPL).`);
      setPilih(new Set());
      setYakin(false);
      await muat();
    } catch (e) {
      setGalat(e instanceof Error && e.message !== "SESI_BERAKHIR" ? e.message : "Gagal menandai. Coba lagi.");
      setYakin(false);
    } finally {
      setSibuk(null);
    }
  }

  async function tarik() {
    if (dipilihKeluar.length === 0 || sibuk) return;
    setSibuk("tarik");
    setPesan(null);
    try {
      const h = await apiPortal<{ ditarik: number }>(API_PERMINTAAN, { method: "POST", body: JSON.stringify({ aksi: "tarik", ids: dipilihKeluar.map((p) => p.id) }) });
      setPesan(`${h.ditarik} permintaan dikembalikan ke Menunggu admin. Tidak ada notifikasi yang dikirim.`);
      setPilih(new Set());
      setYakinTarik(false);
      await muat();
    } catch (e) {
      setGalat(e instanceof Error && e.message !== "SESI_BERAKHIR" ? e.message : "Gagal menarik kembali. Coba lagi.");
      setYakinTarik(false);
    } finally {
      setSibuk(null);
    }
  }

  async function hapusSudah() {
    if (dipilihBatal.length === 0 || sibuk) return;
    setSibuk("hapus");
    setPesan(null);
    try {
      const h = await apiPortal<{ diproses: number }>(API_PERMINTAAN, { method: "POST", body: JSON.stringify({ aksi: "batal_diproses", ids: dipilihBatal.map((p) => p.id) }) });
      setPesan(`${h.diproses} pembatalan ditandai sudah dihapus di FASIH.`);
      setPilih(new Set());
      await muat();
    } catch (e) {
      setGalat(e instanceof Error && e.message !== "SESI_BERAKHIR" ? e.message : "Gagal menandai. Coba lagi.");
    } finally {
      setSibuk(null);
    }
  }

  const tombolSaring = (k: Saring, teks: string, n: number) => (
    <button key={k} type="button" aria-pressed={saring === k} onClick={() => { setSaring(k); setYakin(false); setYakinTarik(false); }} className={`min-h-[40px] flex-1 rounded-full px-3 text-[12.5px] font-extrabold ${saring === k ? "bg-[#0F2A52] text-white" : "bg-[#F5F8FE] text-[#55657D]"}`}>
      {teks} <b>{n}</b>
    </button>
  );

  return (
    <section className="mt-5 rounded-[18px] bg-white p-4 shadow-[0_8px_22px_rgba(15,42,82,.08)]">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-[15px] font-extrabold text-[#0F2A52]">Permintaan daftar KK ke FASIH</h2>
        <button type="button" onClick={() => void muat()} disabled={sibuk === "muat"} className="min-h-[40px] flex-none rounded-full bg-[#F5F8FE] px-3 text-[12px] font-extrabold text-[#1F5FD1] disabled:opacity-50">
          {sibuk === "muat" ? "Memuat…" : "Segarkan"}
        </button>
      </div>
      <p className="mt-1 text-[12.5px] leading-snug text-[#55657D]">
        PML mengajukan Sub SLS beserta PPL-nya (batas total per PML naik bertahap: 7 pada 15 Okt, 9 pada 16 Okt, 11 mulai 17 Okt 2026). Alurnya: <b>Ekspor templat FASIH</b> → unggah dan assign di FASIH → <b>Tandai sudah keluar</b>. PML dan PPL langsung dikabari lewat notifikasi dan status di kartu plotting mereka berubah. PML juga dapat <b>mengajukan pembatalan</b> assignment yang sudah keluar; itu langsung berlaku tanpa persetujuan, dan tab <b>Hapus di FASIH</b> mencatat assignment lama yang perlu Anda hapus di FASIH.
      </p>
      {galat && <p className="mt-3 rounded-[12px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>}

      <div className="mt-3 flex gap-2" role="group" aria-label="Saring status">
        {tombolSaring("menunggu", LABEL_STATUS_MINTA.menunggu, menunggu.length)}
        {tombolSaring("sudah_keluar", "Sudah keluar", keluar.length)}
        {tombolSaring("dibatalkan", "Hapus di FASIH", batal.length)}
      </div>
      {batal.length > 0 && saring !== "dibatalkan" && (
        <p className="mt-2 rounded-[12px] bg-[#FDE8E8] px-3 py-2 text-[12.5px] font-bold text-[#7A1D22]">
          {batal.length} assignment dibatalkan PML dan perlu dihapus di FASIH.{" "}
          <button type="button" onClick={() => { setSaring("dibatalkan"); setYakin(false); setYakinTarik(false); }} className="underline">Lihat daftar</button>
        </p>
      )}

      <div className="mt-3 rounded-[12px] bg-[#F5F8FE] px-3 py-2.5 text-[12px] leading-snug text-[#52627A]">
        <p>{CATATAN_CEK_SUBMIT}</p>
        <p className="mt-1.5 rounded-[8px] px-2 py-1 font-extrabold" style={{ background: "#FFE680", color: "#4A3500" }}>
          Catatan: {CATATAN_KEROYOKAN}
        </p>
      </div>

      {data && tampil.length === 0 && <p className="mt-3 rounded-[12px] bg-[#F5F8FE] px-3 py-3 text-[13px] text-[#55657D]">{saring === "menunggu" ? "Tidak ada permintaan yang menunggu." : saring === "sudah_keluar" ? "Belum ada permintaan yang ditandai sudah keluar." : "Tidak ada pembatalan yang perlu dihapus di FASIH."}</p>}

      {tampil.length > 0 && (
        <>
          <button type="button" onClick={pilihSemuaTampil} className="mt-3 min-h-[40px] rounded-full bg-[#F5F8FE] px-3 text-[12px] font-extrabold text-[#1F5FD1]">
            {tampil.every((p) => pilih.has(p.id)) ? "Batal pilih semua" : "Pilih semua di daftar ini"}
          </button>
          <ul className="mt-2 overflow-hidden rounded-[14px] border border-[#EEF2F7]">
            {tampil.map((p) => (
              <li key={p.id} className="border-t border-[#EEF2F7] first:border-t-0">
                <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5">
                  <input type="checkbox" checked={pilih.has(p.id)} onChange={() => centang(p.id)} className="mt-0.5 h-6 w-6 flex-none accent-[#1F5FD1]" aria-label={`Pilih ${namaSub(p)}`} />
                  <span className="min-w-0 flex-1">
                    <b className="block text-[13.5px] text-[#0F2A52]">
                      {namaSub(p)}
                      {p.dari_kolam && <span className="ml-1.5 inline-block rounded-full bg-[#F1E4FA] px-2 py-[1px] align-[1px] text-[11px] font-extrabold text-[#6B1F96]">Dari kolam</span>}
                    </b>
                    <small className="block text-[12px] text-[#6B7A90]">
                      Kec. {p.kecamatan} · PML {p.pml_nama} → PPL {p.ppl_nama}
                    </small>
                    <small className="block text-[11.5px] text-[#6B7A90]">
                      Diminta {waktuRingkas(p.diminta_at)}
                      {p.selesai_at ? ` · keluar ${waktuRingkas(p.selesai_at)}` : ""}
                      {p.status === "dibatalkan" && p.dibatalkan_at ? ` · dibatalkan PML ${waktuRingkas(p.dibatalkan_at)}` : ""}
                    </small>
                    {p.status === "dibatalkan" && <small className="mt-0.5 block text-[11.5px] font-bold text-[#B42329]">Hapus assignment {p.ppl_nama} untuk Sub SLS ini di FASIH. PML sudah bisa memilih PPL pengganti.</small>}
                    {p.status === "menunggu" && batalPerSub.has(p.idsubsls) && <small className="mt-0.5 block text-[11.5px] font-bold text-[#B42329]">Sub SLS ini punya pembatalan lama yang belum dihapus di FASIH; hapus dulu sebelum meng-assign ulang.</small>}
                  </span>
                </label>
                {p.status !== "dibatalkan" && tanpaEmail(p) && (
                  <div className="space-y-1.5 px-3 pb-3 pl-[52px]">
                    {([["pengawas", "PML", p.email_pengawas], ["pencacah", "PPL", p.email_pencacah]] as [PeranEmail, string, string][])
                      .filter(([, , v]) => !v.trim())
                      .map(([sebagai, label]) => {
                        const kunci = `${p.id}:${sebagai}`;
                        return (
                          <div key={sebagai}>
                            <small className="block text-[11.5px] font-bold text-[#B42329]">Email {label} belum ada. {boleh ? "Isi di sini:" : "Minta admin pengelola mengisinya."}</small>
                            {boleh && (
                              <div className="mt-1 flex gap-2">
                                <input type="email" inputMode="email" autoComplete="off" value={surel[kunci] ?? ""} onChange={(e) => setSurel((s) => ({ ...s, [kunci]: e.target.value }))} placeholder={`email akun FASIH ${label}`} className="h-10 min-w-0 flex-1 rounded-[10px] border border-[#D9E3F2] bg-white px-3 text-[13px]" />
                                <button type="button" disabled={simpanSurel !== null || !periksaEmail(surel[kunci])} onClick={() => void simpanEmail(p, sebagai)} className="min-h-[40px] flex-none rounded-[10px] bg-[#1F5FD1] px-3 text-[12.5px] font-extrabold text-white disabled:bg-[#A9BCD8]">
                                  {simpanSurel === kunci ? "Menyimpan…" : "Simpan"}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {dipilih.length > 0 && (
        <div className="mt-3 space-y-2">
          {dipilihAktif.length > 0 && (
            <button type="button" disabled={sibuk !== null} onClick={() => void ekspor()} className="min-h-[50px] w-full rounded-[14px] bg-[#1F5FD1] px-4 text-[14px] font-extrabold text-white disabled:bg-[#A9BCD8]">
              {sibuk === "ekspor" ? "Membuat Excel…" : `Ekspor templat FASIH (${dipilihAktif.length} Sub SLS)`}
            </button>
          )}
          {dipilihBatal.length > 0 &&
            (boleh ? (
              <button type="button" disabled={sibuk !== null} onClick={() => void hapusSudah()} className="min-h-[50px] w-full rounded-[14px] bg-[#0F2A52] px-4 text-[14px] font-extrabold text-white disabled:opacity-50">
                {sibuk === "hapus" ? "Menandai…" : `Sudah dihapus di FASIH (${dipilihBatal.length})`}
              </button>
            ) : (
              <p className="text-[12.5px] text-[#6B7A90]">Menandai pembatalan butuh izin kelola pendataan.</p>
            ))}
          {tanpaSurel > 0 && <p className="text-[12px] font-bold text-[#B42329]">{tanpaSurel} baris terpilih email-nya kosong; kolomnya dikosongkan di Excel.</p>}

          {dipilihMenunggu.length > 0 &&
            (boleh ? (
              !yakin ? (
                <button type="button" disabled={sibuk !== null} onClick={() => setYakin(true)} className="min-h-[50px] w-full rounded-[14px] bg-[#13794B] px-4 text-[14px] font-extrabold text-white disabled:bg-[#9FCDB5]">
                  Sudah keluar di FASIH ({dipilihMenunggu.length})…
                </button>
              ) : (
                <div className="rounded-[14px] border border-[#F2D58A] bg-[#FFF6E0] p-3">
                  <p className="text-[13px] font-bold text-[#6B4A0E]">Tandai {dipilihMenunggu.length} Sub SLS sudah keluar di FASIH? PML dan PPL-nya langsung dikabari lewat notifikasi berisi rincian jorong dan nama PPL penerima, pengingat memeriksa submit identifikasi, dan catatan keroyokan.</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setYakin(false)} className="min-h-[46px] rounded-[12px] bg-white text-[13.5px] font-extrabold text-[#0F2A52] shadow-sm">
                      Batal
                    </button>
                    <button type="button" disabled={sibuk !== null} onClick={() => void tandai()} className="min-h-[46px] rounded-[12px] bg-[#13794B] text-[13.5px] font-extrabold text-white disabled:bg-[#9FCDB5]">
                      {sibuk === "tandai" ? "Menandai…" : "Ya, tandai"}
                    </button>
                  </div>
                </div>
              )
            ) : (
              <p className="text-[12.5px] text-[#6B7A90]">Akun ini hanya boleh melihat dan mengekspor; menandai butuh izin kelola pendataan.</p>
            ))}
          {dipilihKeluar.length > 0 &&
            (boleh ? (
              !yakinTarik ? (
                <button type="button" disabled={sibuk !== null} onClick={() => setYakinTarik(true)} className="min-h-[50px] w-full rounded-[14px] border-2 border-[#B42329] bg-white px-4 text-[14px] font-extrabold text-[#B42329] disabled:opacity-50">
                  Tarik kembali ke Menunggu ({dipilihKeluar.length})…
                </button>
              ) : (
                <div className="rounded-[14px] border border-[#F2B8BA] bg-[#FDE8E8] p-3">
                  <p className="text-[13px] font-bold text-[#7A1D22]">Kembalikan {dipilihKeluar.length} Sub SLS ke Menunggu admin? Untuk salah klik. Tidak ada notifikasi ke PML/PPL, dan penugasan di FASIH tidak ikut berubah (batalkan sendiri di FASIH bila perlu).</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setYakinTarik(false)} className="min-h-[46px] rounded-[12px] bg-white text-[13.5px] font-extrabold text-[#0F2A52] shadow-sm">
                      Batal
                    </button>
                    <button type="button" disabled={sibuk !== null} onClick={() => void tarik()} className="min-h-[46px] rounded-[12px] bg-[#B42329] text-[13.5px] font-extrabold text-white disabled:opacity-50">
                      {sibuk === "tarik" ? "Menarik…" : "Ya, tarik kembali"}
                    </button>
                  </div>
                </div>
              )
            ) : (
              <p className="text-[12.5px] text-[#6B7A90]">Menarik kembali butuh izin kelola pendataan.</p>
            ))}
        </div>
      )}
      {pesan && <p role="status" className="mt-3 rounded-[12px] bg-[#E3F6EC] px-3 py-2 text-[13px] font-semibold text-[#13794B]">{pesan}</p>}
    </section>
  );
}
