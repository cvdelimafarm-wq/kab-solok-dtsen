"use client";

// app/sigap/pendataan/KolamWilayah.tsx
//
// (16 Okt 2026) KOLAM WILAYAH KERJA -- Sub SLS Terdampak yang belum terplot ke tim, dikelompokkan Kecamatan > Nagari.
// Dua bagian:
//  - <KolamTombol/>  tombol float berwarna ungu (khas, beda dari biru plotting tim) dengan lencana jumlah Sub SLS yang masih bebas;
//  - <KolamPanel/>   menggantikan kartu "Plotting tim hari ini" selama mode kolam terbuka: PML mencentang maks. 2 Sub SLS, memilih PPL, lalu Kirim --
//                    caranya sama dengan plotting tim biasa. PPL hanya melihat.
// Semua pelanggaran syarat (bukan PML, tambahan < 50%, > 2 Sub SLS, sudah dipilih tim lain, PPL belum dipilih) ditampilkan lewat MODAL
// supaya petugas paham sebabnya. Aturan yang sama dijaga ulang di database (bencana_kolam_pilih), jadi layar basi pun tidak bisa menembus syarat.

import { useMemo, useState } from "react";
import { useData } from "@/app/portal/dataBersama";
import { apiPortal } from "@/app/portal/sesi";
import { namaDepan, waktuRingkas } from "./usePendataan";
import { rapikanNama } from "@/lib/rekapIdentifikasi";
import { namaTampil } from "@/lib/namaTampil";
import type { Anggota } from "@/lib/pendataan";
import {
  API_KOLAM,
  MAKS_PILIH_KOLAM,
  SYARAT_TAMBAHAN_PERSEN,
  jumlahBebas,
  kelompokKolam,
  lolosTambahan,
  namaItemKolam,
  periksaAturanKolam,
  persen,
  pesanTolak,
  type DataKolam,
  type ItemKolam,
  type PesanAturan,
} from "@/lib/kolamWilayah";

const UNGU = "#7A2BA8";
const GRADIEN = "linear-gradient(135deg,#A33CD0,#6B1F96)";

/** Tombol float "Kolam wilayah" (kanan bawah; Capaian ada di kiri bawah). */
export function KolamTombol({ onBuka }: { onBuka: () => void }) {
  const d = useData<DataKolam>(API_KOLAM);
  const bebas = d.data ? jumlahBebas(d.data.item) : 0;
  if (!d.data || d.data.item.length === 0) return null;
  return (
    <button
      type="button"
      onClick={onBuka}
      aria-label={`Buka kolam wilayah kerja, ${bebas} Sub SLS masih bebas`}
      className="fixed bottom-6 right-4 z-30 flex min-h-[52px] items-center gap-2 rounded-full px-4 text-[14px] font-extrabold text-white shadow-[0_10px_24px_rgba(107,31,150,.45)] active:scale-95"
      style={{ background: GRADIEN }}
    >
      <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3c3.5 4.2 6 7 6 10a6 6 0 0 1-12 0c0-3 2.5-5.8 6-10z" />
      </svg>
      Kolam wilayah
      <span className="grid min-w-[26px] place-items-center rounded-full bg-white px-1.5 py-[1px] text-[12px] font-extrabold" style={{ color: UNGU }}>
        {bebas}
      </span>
    </button>
  );
}

function Bar({ nilai, syarat, lolos }: { nilai: number; syarat: number; lolos: boolean }) {
  return (
    <div className="relative mt-1.5 h-2 rounded-full bg-[#E9DDF3]" aria-hidden>
      <div className="h-2 rounded-full" style={{ width: `${Math.min(100, nilai)}%`, background: lolos ? "#13794B" : "#C98A00" }} />
      <span className="absolute -top-[3px] h-[14px] w-[2px] rounded bg-[#4A1470]" style={{ left: `${syarat}%` }} />
    </div>
  );
}

function Modal({ pesan, onTutup }: { pesan: PesanAturan | { judul: string; isi: string; angka?: undefined }; onTutup: () => void }) {
  const a = pesan.angka;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(15,42,82,.55)] px-5" role="dialog" aria-modal="true" aria-label={pesan.judul} onClick={onTutup}>
      <div className="w-full max-w-sm rounded-[20px] bg-white p-5 shadow-[0_20px_50px_rgba(15,42,82,.35)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 grid h-11 w-11 place-items-center rounded-full text-[22px] font-extrabold text-white" style={{ background: GRADIEN }} aria-hidden>
          !
        </div>
        <h2 className="text-[16px] font-extrabold leading-snug text-[#0F2A52]">{pesan.judul}</h2>
        <p className="mt-1.5 text-[13.5px] leading-snug text-[#3B4C66]">{pesan.isi}</p>
        {a && (
          <div className="mt-3 rounded-[14px] bg-[#F6EFFB] p-3">
            <p className="text-[13px] font-extrabold text-[#4A1470]">{a.judul}</p>
            <Bar nilai={a.persen} syarat={a.syarat} lolos={a.persen > a.syarat} />
            <p className="mt-1.5 text-[12.5px] leading-snug text-[#3B4C66]">{a.teks}</p>
            <p className="mt-1 text-[11.5px] text-[#6B7A90]">Garis tegak pada batang = syarat {a.syarat}%.</p>
          </div>
        )}
        <button type="button" onClick={onTutup} autoFocus className="mt-4 min-h-[48px] w-full rounded-[14px] text-[14px] font-extrabold text-white" style={{ background: GRADIEN }}>
          Saya mengerti
        </button>
      </div>
    </div>
  );
}

export function KolamPanel({ anggota, sayaAkun, onTutup, onBuka }: { anggota: Anggota[]; sayaAkun: number; onTutup: () => void; onBuka?: (idsubsls: string) => void }) {
  const d = useData<DataKolam>(API_KOLAM);
  const data = d.data;
  const [pilih, setPilih] = useState<Record<string, number>>({}); // idsubsls -> akun PPL (0 = belum dipilih)
  const [terbuka, setTerbuka] = useState<Record<string, boolean>>({});
  const [modal, setModal] = useState<PesanAturan | { judul: string; isi: string; angka?: undefined } | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [sukses, setSukses] = useState<string | null>(null);

  const ppls = useMemo(() => anggota.filter((a) => a.peran === "ppl"), [anggota]);
  const grup = useMemo(() => kelompokKolam(data?.item ?? []), [data]);
  const progres = data?.progres;
  const bisaPilih = !!data?.bisa_pilih;
  const terpilih = Object.keys(pilih);
  const idPml = data?.pml.id ?? 0;

  const lolosT = progres ? lolosTambahan(progres) : true;
  const pctT = progres ? persen(progres.tambahan_didata, progres.tambahan_total) : 0;

  const kunci = (kec: string, nag: string) => `${kec}|${nag}`;
  const nagariBuka = (kec: string, nag: string, punyaPilihan: boolean) => terbuka[kunci(kec, nag)] ?? punyaPilihan;

  function tutupModal() {
    setModal(null);
  }

  function ganti(it: ItemKolam, tandai: boolean) {
    setSukses(null);
    if (!progres) return;
    if (!tandai) {
      setPilih((p) => {
        const n = { ...p };
        delete n[it.idsubsls];
        return n;
      });
      return;
    }
    if (it.diambil_pml_id) {
      setModal(pesanTolak("diambil", progres, { nama: it.diambil_nama ? namaTampil(it.diambil_nama) : undefined, waktu: it.diambil_at ? `pada ${waktuRingkas(it.diambil_at)}` : undefined, sub: namaItemKolam(it) }));
      return;
    }
    const jenis = periksaAturanKolam({ bisaPilih, progres, jumlahDipilih: terpilih.length });
    if (jenis) {
      setModal(pesanTolak(jenis, progres, { pml: data?.pml.nama }));
      return;
    }
    setPilih((p) => ({ ...p, [it.idsubsls]: ppls.length === 1 ? ppls[0].akun_id : 0 }));
  }

  async function kirim() {
    if (sibuk || !progres) return;
    if (terpilih.some((k) => !pilih[k])) {
      setModal(pesanTolak("ppl_kosong"));
      return;
    }
    setSibuk(true);
    setSukses(null);
    try {
      await apiPortal(API_KOLAM, { method: "POST", body: JSON.stringify({ aksi: "pilih", pilihan: terpilih.map((id) => ({ idsubsls: id, ppl_akun_id: pilih[id] })) }) });
      setPilih({});
      setSukses(`Terkirim: ${terpilih.length} Sub SLS dari kolam sudah menjadi wilayah tim Anda dan diteruskan ke admin untuk di-assign di FASIH. Kuota Plotting tim tidak berkurang.`);
      await d.muat();
    } catch (e) {
      const teks = e instanceof Error && e.message !== "SESI_BERAKHIR" ? e.message : "Gagal mengirim. Periksa sambungan lalu coba lagi.";
      setModal({ judul: "Pilihan belum bisa dikirim", isi: teks });
      setPilih({});
      await d.muat(); // layar bisa saja basi (Sub SLS keburu diambil tim lain / progres berubah)
    } finally {
      setSibuk(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-[20px] bg-white shadow-[0_10px_28px_rgba(15,42,82,.12)]" aria-label="Kolam wilayah kerja">
      <div className="px-4 py-3.5 text-white" style={{ background: GRADIEN }}>
        <div className="flex items-start gap-3">
          <span className="min-w-0 flex-1">
            <b className="block text-[16px] leading-tight">Kolam wilayah kerja</b>
            <small className="mt-0.5 block text-[12.5px] leading-snug text-[#EBD9F6]">
              {data ? `${jumlahBebas(data.item)} Sub SLS masih bebas dari ${data.item.length} di kolam` : "Memuat…"}
              {data && !bisaPilih ? " · hanya PML yang bisa memilih" : ""}
            </small>
          </span>
          <button type="button" onClick={onTutup} className="min-h-[40px] flex-none rounded-full bg-white/20 px-3 text-[12.5px] font-extrabold text-white active:bg-white/30">
            Kembali ke wilayah tim
          </button>
        </div>
      </div>

      <div className="px-4 pb-4 pt-3">
        <p className="rounded-[12px] bg-[#F6EFFB] px-3 py-2 text-[12.5px] leading-snug text-[#3B1A55]">
          Sub SLS Terdampak yang <b>belum diplot ke tim mana pun</b>. Semua tim boleh mengambilnya. Maksimal <mark className="rounded px-0.5 font-extrabold" style={{ background: "#FFE680" }}>{MAKS_PILIH_KOLAM} Sub SLS</mark> sekali pilih; pilih lagi setelah seluruh tambahan selesai {SYARAT_TAMBAHAN_PERSEN}% atau lebih. Pilihan dari kolam tidak mengurangi kuota Plotting tim.
        </p>

        {d.galat && !data && <p className="mt-3 rounded-[12px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[12.5px] text-[#7A1D22]">Kolam belum termuat. {d.galat === "SESI_BERAKHIR" ? "" : d.galat}</p>}

        {progres && (
          <div className="mt-3 grid gap-2">
            <div className="rounded-[14px] border border-[#E3D3F0] px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-extrabold text-[#0F2A52]">Tambahan dari kolam</span>
                <span className={`rounded-full px-2 py-[2px] text-[11px] font-extrabold ${lolosT ? "bg-[#E3F6EC] text-[#13794B]" : "bg-[#FFF4D6] text-[#8A6200]"}`}>
                  {progres.tambahan_sub === 0 ? "Belum ada tambahan" : lolosT ? "Boleh pilih lagi" : `Perlu ≥ ${SYARAT_TAMBAHAN_PERSEN}%`}
                </span>
              </div>
              {progres.tambahan_sub > 0 ? (
                <>
                  <Bar nilai={pctT} syarat={SYARAT_TAMBAHAN_PERSEN} lolos={lolosT} />
                  <p className="mt-1.5 text-[12px] text-[#52627A]">
                    <b className="text-[#0F2A52]">{String(pctT).replace(".", ",")}%</b> · {progres.tambahan_didata.toLocaleString("id-ID")} dari {progres.tambahan_total.toLocaleString("id-ID")} KK di {progres.tambahan_sub} Sub SLS tambahan
                  </p>
                </>
              ) : (
                <p className="mt-1 text-[12px] text-[#52627A]">Tim Anda belum mengambil Sub SLS dari kolam.</p>
              )}
            </div>
          </div>
        )}

        <div className="mt-3 space-y-3">
          {grup.map((k) => (
            <div key={k.kecamatan}>
              <p className="flex items-center gap-2 px-1 text-[12px] font-extrabold uppercase tracking-wide text-[#4A1470]">
                Kec. {rapikanNama(k.kecamatan)}
                <span className="rounded-full bg-[#F1E4FA] px-2 py-[1px] text-[11px] normal-case tracking-normal">
                  {k.sub} Sub SLS · {k.bebas} bebas
                </span>
              </p>
              <div className="mt-1.5 space-y-1.5">
                {k.nagari.map((n) => {
                  const punyaPilihan = n.item.some((x) => x.idsubsls in pilih);
                  const buka = nagariBuka(k.kecamatan, n.nagari, punyaPilihan);
                  return (
                    <div key={n.nagari} className="overflow-hidden rounded-[14px] border border-[#E3D3F0]">
                      <button
                        type="button"
                        aria-expanded={buka}
                        onClick={() => setTerbuka((t) => ({ ...t, [kunci(k.kecamatan, n.nagari)]: !buka }))}
                        className="flex min-h-[48px] w-full items-center gap-2 bg-[#FBF7FE] px-3 py-2 text-left"
                      >
                        <span className="min-w-0 flex-1">
                          <b className="block text-[14px] text-[#0F2A52]">Nagari {rapikanNama(n.nagari)}</b>
                          <small className="block text-[12px] text-[#6B7A90]">
                            {n.sub} Sub SLS · {n.kk.toLocaleString("id-ID")} KK · {n.bebas} bebas
                          </small>
                        </span>
                        <span aria-hidden className="text-[18px] font-bold text-[#6B7A90]">
                          {buka ? "−" : "+"}
                        </span>
                      </button>
                      {buka && (
                        <ul className="space-y-1.5 border-t border-[#E3D3F0] p-2">
                          {n.item.map((it) => {
                            const dipilih = it.idsubsls in pilih;
                            const diambil = !!it.diambil_pml_id;
                            const milikSaya = diambil && it.diambil_pml_id === idPml;
                            const tanpaKk = it.kk === 0 && !diambil;
                            return (
                              <li key={it.idsubsls} className={`rounded-[12px] border px-3 py-2 ${dipilih ? "border-[#7A2BA8] bg-[#F6EFFB]" : diambil ? "border-[#E3E8F0] bg-[#F5F7FA]" : "border-[#E3E8F0] bg-white"}`}>
                                <div className="flex items-center gap-3">
                                  {diambil ? (
                                    <span aria-hidden className="grid h-6 w-6 flex-none place-items-center rounded-full text-[13px] font-extrabold text-white" style={{ background: milikSaya ? "#13794B" : "#8A97AB" }}>
                                      ✓
                                    </span>
                                  ) : (
                                    <input
                                      type="checkbox"
                                      checked={dipilih}
                                      disabled={tanpaKk}
                                      onChange={(e) => ganti(it, e.target.checked)}
                                      className="h-6 w-6 flex-none cursor-pointer accent-[#7A2BA8] disabled:cursor-not-allowed disabled:opacity-40"
                                      aria-label={`Pilih ${namaItemKolam(it)} dari kolam`}
                                    />
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => (diambil ? (milikSaya ? onBuka?.(it.idsubsls) : ganti(it, true)) : tanpaKk ? undefined : ganti(it, !dipilih))}
                                    className="min-w-0 flex-1 text-left"
                                  >
                                    <b className="block break-words text-[13.5px] leading-snug text-[#0F2A52]">
                                      {rapikanNama(it.sls)}
                                      {it.sub_sls && <span className="ml-1.5 inline-block whitespace-nowrap rounded-full bg-[#F1E4FA] px-2 py-[1px] align-[1px] text-[11.5px] font-extrabold text-[#6B1F96]">Sub {it.sub_sls}</span>}
                                    </b>
                                    <small className="mt-0.5 block text-[12px] leading-snug text-[#6B7A90]">
                                      {tanpaKk ? "daftar KK belum diunggah admin" : <b className="text-[#0F2A52]">{it.kk} KK</b>}
                                      {diambil && it.kk > 0 ? ` · ${it.didata} didata` : ""}
                                    </small>
                                  </button>
                                  <span className={`flex-none rounded-full px-2 py-[2px] text-[10.5px] font-extrabold ${diambil ? "bg-[#ECEFF4] text-[#52627A]" : "bg-[#F1E4FA] text-[#6B1F96]"}`}>{diambil ? "Sudah dipilih" : "Kolam"}</span>
                                </div>
                                {diambil && (
                                  <p className="mt-1 pl-9 text-[12px] text-[#52627A]">
                                    Dipilih <b className="text-[#0F2A52]">{milikSaya ? "tim Anda" : `Tim ${namaDepan(it.diambil_nama ?? "tim lain")}`}</b> · {waktuRingkas(it.diambil_at)}
                                    {milikSaya && onBuka ? " · ketuk untuk membuka" : ""}
                                  </p>
                                )}
                                {dipilih && (
                                  <div className="mt-2 pl-9">
                                    <label className="block text-[11.5px] font-bold text-[#52627A]">
                                      PPL yang di-assign
                                      <select
                                        value={pilih[it.idsubsls] || ""}
                                        onChange={(e) => setPilih((x) => ({ ...x, [it.idsubsls]: Number(e.target.value) || 0 }))}
                                        className="mt-1 h-11 w-full rounded-[12px] border border-[#D9C6EA] bg-white px-3 text-[13.5px] font-bold text-[#0F2A52]"
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
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {data && data.item.length === 0 && <p className="rounded-[12px] bg-[#F5F8FE] px-3 py-3 text-[13px] text-[#55657D]">Kolam kosong. Semua Sub SLS Terdampak sudah terplot ke tim.</p>}
        </div>

        <button type="button" disabled={!bisaPilih || sibuk || terpilih.length === 0} onClick={() => void kirim()} className="mt-4 min-h-[50px] w-full rounded-[14px] px-4 text-[14px] font-extrabold text-white disabled:opacity-40" style={{ background: GRADIEN }}>
          {sibuk ? "Mengirim…" : terpilih.length > 0 ? `Kirim permintaan (${terpilih.length} Sub SLS)` : "Kirim permintaan"}
        </button>
        {bisaPilih && terpilih.length > 0 && terpilih.some((k) => !pilih[k]) && <p className="mt-1.5 text-[12px] font-bold text-[#8A6200]">Pilih nama PPL untuk setiap Sub SLS yang ditandai.</p>}
        {!bisaPilih && data && <p className="mt-1.5 text-[12px] font-bold text-[#8A6200]">Kolam ini hanya untuk dilihat. Yang bisa memilih adalah PML tim.</p>}

        {sukses && (
          <p role="status" className="mt-2 rounded-[12px] bg-[#E3F6EC] px-3 py-2 text-[12.5px] font-semibold text-[#13794B]">
            {sukses}
          </p>
        )}

        <div className="mt-3 rounded-[12px] bg-[#F5F8FE] px-3 py-2.5 text-[12px] leading-snug text-[#52627A]">
          <p className="font-extrabold text-[#0F2A52]">Salah pilih?</p>
          <p className="mt-1">PML dapat membatalkan lewat kartu <b>Plotting tim</b> (tombol Batalkan atau Ajukan pembatalan). Sub SLS kembali ke kolam, selama belum ada KK yang didata di dalamnya.</p>
        </div>
      </div>

      {modal && <Modal pesan={modal} onTutup={tutupModal} />}
    </section>
  );
}
