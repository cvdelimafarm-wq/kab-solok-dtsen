"use client";

// app/sigap/pedia/kelola/[id]/page.tsx
//
// (7 Okt 2026) SIGAP PEDIA -- detail entri utk pengelola (id = "baru" utk entri baru) -- permintaan user:
// metadata, dasar hukum, tautan, riwayat status, viewer bukti, tabel file (hash/TSA/DKIM), Verifikasi Ulang,
// Paket Bukti, finalkan (kunci), batalkan (dgn alasan), koreksi (versi baru), audit log.

import Link from "next/link";
import { use as usePromise, useCallback, useEffect, useMemo, useState } from "react";
import { bacaSesi, keMasuk, pesanGalat, SesiBerakhir } from "../../../admin/api";
import { BTN, BTN_O, BTN_R, Chip, Memuat, Pesan } from "../../../admin/ui";
import Bingkai from "../../../kontrak/Bingkai";
import { aksiP, ambilP } from "../../api";
import { BadgeTinjau, type Detail } from "../../komponen";
import FormEntri, { FORM_KOSONG, type NilaiForm, type Referensi } from "../FormEntri";
import BagianFile, { type BarisFile } from "../BagianFile";
import { STATUS, waktuWibPanjang } from "@/lib/pedia/umum";

type Audit = { id: number; at: string; nama: string | null; ip: string | null; aksi: string; file_id: number | null; detail: Record<string, unknown> | null; hash: string };

const LABEL_AKSI: Record<string, string> = {
  buat: "Membuat entri",
  ubah: "Mengubah isi",
  ubah_kategori: "Mengubah kategori",
  ubah_status: "Mengubah status",
  finalkan: "Memfinalkan (kunci)",
  batalkan: "Membatalkan",
  koreksi: "Dibuat sebagai koreksi",
  digantikan: "Digantikan entri baru",
  tambah_file: "Menambah file bukti",
  isi_otomatis_eml: "Isi otomatis dari .eml",
  coba_ulang_tsa: "Coba ulang timestamp",
  verifikasi_ulang: "Verifikasi ulang",
  lihat: "Melihat entri",
  lihat_file: "Melihat file",
  unduh_file: "Mengunduh file",
  unduh_tsr: "Mengunduh token .tsr",
  unduh_paket_bukti: "Mengunduh Paket Bukti",
  tandai_tinjau: "Menandai perlu ditinjau",
  hapus_tanda_tinjau: "Menghapus tanda perlu ditinjau",
  otomatis_perlu_ditinjau: "Otomatis: perlu ditinjau (regulasi berubah)",
  tambah_tautan: "Menambah tautan",
};

function keForm(d: Detail): NilaiForm {
  const e = d.entri as Record<string, unknown>;
  const s = (k: string) => (e[k] == null ? "" : String(e[k]));
  return {
    kategori_id: d.kategori?.id ?? "",
    kanal: s("kanal") || "hai_djpb",
    kanal_lain: s("kanal_lain"),
    nomor_tiket: s("nomor_tiket"),
    tgl_diajukan: s("tgl_diajukan"),
    tgl_dijawab: s("tgl_dijawab"),
    sifat: s("sifat") || "referensi",
    judul: s("judul"),
    pertanyaan: s("pertanyaan"),
    jawaban: s("jawaban"),
    kesimpulan: s("kesimpulan"),
    url_tiket: s("url_tiket"),
    nota_dinas_srikandi: s("nota_dinas_srikandi"),
    keputusan_ppk: s("keputusan_ppk"),
    penanya_akun_id: e.penanya_akun_id ? Number(e.penanya_akun_id) : "",
    penanya_nama: s("penanya_nama"),
    tim: s("tim"),
    tag: d.tag,
    regulasi: d.regulasi.map((r) => ({ regulasi_id: r.id, pasal: r.pasal ?? "" })),
    tautan: d.tautan.map((t) => ({ jenis: t.jenis, ref_id: t.ref_id, ref_teks: t.ref_teks })),
  };
}

const bodiForm = (v: NilaiForm) => ({ ...v, kategori_id: v.kategori_id || null, penanya_akun_id: v.penanya_akun_id || null });

export default function KelolaEntri({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const baru = id === "baru";
  const [refr, setRefr] = useState<Referensi | null>(null);
  const [d, setD] = useState<Detail | null>(null);
  const [auditLog, setAudit] = useState<Audit[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [modeKoreksi, setModeKoreksi] = useState(false);
  const [tampilAudit, setTampilAudit] = useState(false);

  const muat = useCallback(async () => {
    try {
      const r = await ambilP<Referensi>({ bagian: "referensi" });
      setRefr(r);
      if (!baru) {
        const [x, a] = await Promise.all([ambilP<Detail>({ bagian: "detail", id }), ambilP<{ audit: Audit[] }>({ bagian: "audit", id })]);
        setD(x);
        setAudit(a.audit);
      }
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, [id, baru]);
  useEffect(() => {
    if (!bacaSesi()) return keMasuk();
    muat();
  }, [muat]);

  const awal = useMemo(() => (d ? keForm(d) : FORM_KOSONG), [d]);
  const e = d?.entri;
  const terkunci = !!e && (e.status === "final" || e.status === "dibatalkan");

  async function jalankan(fn: () => Promise<unknown>, ok?: string) {
    setSibuk(true);
    setGalat(null);
    try {
      await fn();
      if (ok) setInfo(ok);
      await muat();
    } catch (err) {
      if (!(err instanceof SesiBerakhir)) setGalat(pesanGalat(err));
    } finally {
      setSibuk(false);
    }
  }

  async function simpan(v: NilaiForm) {
    setSibuk(true);
    setGalat(null);
    try {
      if (baru || modeKoreksi) {
        const r = await aksiP<{ id: number; nomor_registrasi: string }>(modeKoreksi ? "koreksi" : "buat", { ...bodiForm(v), id: modeKoreksi ? Number(id) : undefined });
        window.location.href = `/sigap/kelola/pedia/${r.id}?baru=${encodeURIComponent(r.nomor_registrasi)}`;
        return;
      }
      await aksiP("ubah", { id: Number(id), ...bodiForm(v) });
      setInfo("Perubahan tersimpan.");
      await muat();
    } catch (err) {
      if (!(err instanceof SesiBerakhir)) setGalat(pesanGalat(err));
    } finally {
      setSibuk(false);
    }
  }

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("baru");
    if (p) setInfo(`Entri tersimpan dengan nomor registrasi ${p}. Lanjutkan dengan mengunggah file bukti.`);
  }, []);

  const riwayatStatus = (auditLog ?? []).filter((a) => ["buat", "koreksi", "ubah_status", "finalkan", "batalkan", "ubah_kategori", "digantikan", "tandai_tinjau", "hapus_tanda_tinjau", "otomatis_perlu_ditinjau"].includes(a.aksi)).reverse();

  return (
    <Bingkai
      aktif="pedia_kelola"
      kecil="SIGAP PEDIA · Penatausahaan"
      jejak={["SIGAP PEDIA", "Register", baru ? "Entri baru" : e?.nomor_registrasi ?? "…"]}
      judul={baru ? "Entri baru" : modeKoreksi ? `Koreksi ${e?.nomor_registrasi ?? ""}` : e?.nomor_registrasi ?? "Memuat…"}
      sub={baru ? "Nomor registrasi dibuat otomatis oleh database saat disimpan dan tidak bisa diubah." : e?.judul}
      kanan={(gelap) => (
        <>
          <Link href="/sigap/kelola/pedia" className={gelap ? "rounded-full bg-white/10 px-3 py-1 text-[11.5px] font-semibold hover:bg-white/20" : BTN_O}>
            ← Register
          </Link>
          {!baru && (
            <Link href={`/sigap/pedia/${id}`} className={gelap ? "rounded-full bg-white/10 px-3 py-1 text-[11.5px] font-semibold hover:bg-white/20" : BTN_O}>
              Tampilan pegawai
            </Link>
          )}
        </>
      )}
    >
      {galat && <Pesan onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {info && (
        <Pesan jenis="ok" onTutup={() => setInfo(null)}>
          {info}
        </Pesan>
      )}
      {!refr || (!baru && !d) ? (
        !galat && <Memuat />
      ) : (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-3">
            {!baru && e && (
              <section className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[#E3E8EE] bg-white px-4 py-3">
                <span className="font-mono text-[13px] font-semibold">{e.nomor_registrasi}</span>
                <Chip w={STATUS[e.status]?.w ?? "mut"}>{STATUS[e.status]?.label ?? e.status}</Chip>
                {e.perlu_ditinjau && <BadgeTinjau alasan={e.alasan_tinjau} />}
                {terkunci && e.status === "final" && <span className="text-[12px] text-[#7B8794]">🔒 terkunci sejak {waktuWibPanjang(e.difinalkan_at)}</span>}
                <div className="flex-1" />
                {!terkunci && (
                  <>
                    <select
                      value={e.status}
                      disabled={sibuk}
                      onChange={(x) => jalankan(() => aksiP("status", { id: Number(id), status: x.target.value }), "Status diperbarui.")}
                      className="h-8 rounded-[7px] border border-[#E3E8EE] bg-white px-2 text-[13px]"
                      aria-label="Ubah status"
                    >
                      {["diajukan", "dijawab", "ditindaklanjuti"].map((s) => (
                        <option key={s} value={s}>
                          {STATUS[s].label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={BTN}
                      disabled={sibuk}
                      onClick={() =>
                        confirm(`Finalkan ${e.nomor_registrasi}?\n\nSetelah final, isi entri dan file bukti TIDAK BISA diubah atau dihapus oleh siapa pun. Koreksi hanya lewat versi baru.`) &&
                        jalankan(() => aksiP("finalkan", { id: Number(id) }), "Entri difinalkan dan dikunci.")
                      }
                    >
                      Finalkan
                    </button>
                  </>
                )}
                {e.status === "final" && !modeKoreksi && (
                  <button type="button" className={BTN_O} disabled={sibuk} onClick={() => setModeKoreksi(true)}>
                    Buat koreksi (versi baru)
                  </button>
                )}
                {e.status !== "dibatalkan" && (
                  <>
                    <button
                      type="button"
                      className={BTN_O}
                      disabled={sibuk}
                      onClick={() => {
                        if (e.perlu_ditinjau) return jalankan(() => aksiP("tinjau", { id: Number(id), nilai: false }), "Tanda perlu ditinjau dihapus.");
                        const alasan = prompt("Alasan entri perlu ditinjau:");
                        if (alasan !== null) jalankan(() => aksiP("tinjau", { id: Number(id), nilai: true, alasan }), "Ditandai perlu ditinjau.");
                      }}
                    >
                      {e.perlu_ditinjau ? "Selesai ditinjau" : "Tandai perlu ditinjau"}
                    </button>
                    <button
                      type="button"
                      className={BTN_R}
                      disabled={sibuk}
                      onClick={() => {
                        const alasan = prompt(`Batalkan ${e.nomor_registrasi}? Record tetap tersimpan.\n\nAlasan pembatalan:`);
                        if (alasan && alasan.trim().length >= 5) jalankan(() => aksiP("batalkan", { id: Number(id), alasan }), "Entri dibatalkan.");
                        else if (alasan !== null) setGalat("Alasan pembatalan minimal 5 karakter.");
                      }}
                    >
                      Batalkan
                    </button>
                  </>
                )}
              </section>
            )}

            {d && d.digantikan_oleh.length > 0 && (
              <Pesan jenis="peringatan">
                Entri ini digantikan oleh{" "}
                {d.digantikan_oleh.map((g) => (
                  <Link key={g.id} href={`/sigap/kelola/pedia/${g.id}`} className="font-semibold underline">
                    {g.nomor_registrasi}
                  </Link>
                ))}
                .
              </Pesan>
            )}
            {d?.menggantikan && (
              <Pesan jenis="info">
                Koreksi atas{" "}
                <Link href={`/sigap/kelola/pedia/${d.menggantikan.id}`} className="font-semibold underline">
                  {d.menggantikan.nomor_registrasi}
                </Link>
                .
              </Pesan>
            )}
            {e?.status === "dibatalkan" && (
              <Pesan>
                Dibatalkan oleh {String(e.dibatalkan_oleh ?? "–")} pada {waktuWibPanjang(String(e.dibatalkan_at ?? ""))}: {e.dibatalkan_alasan}
              </Pesan>
            )}

            <section className="rounded-[10px] border border-[#E3E8EE] bg-white p-4">
              <h2 className="mb-3 text-[15px] font-semibold">{baru ? "Data entri" : modeKoreksi ? "Isi versi koreksi (nomor registrasi baru akan dibuat)" : terkunci ? "Data entri (terkunci)" : "Data entri"}</h2>
              <FormEntri
                awal={awal}
                refr={refr}
                mati={terkunci && !modeKoreksi}
                sibuk={sibuk}
                labelSimpan={baru ? "Simpan & dapatkan nomor registrasi" : modeKoreksi ? "Simpan sebagai entri koreksi" : "Simpan perubahan"}
                onSimpan={simpan}
                onBatal={modeKoreksi ? () => setModeKoreksi(false) : undefined}
              />
            </section>

            {!baru && d && (
              <BagianFile
                entriId={Number(id)}
                nomor={String(e?.nomor_registrasi ?? "")}
                file={d.file as unknown as BarisFile[]}
                bolehTambah={!terkunci}
                verifTerakhir={d.verifikasi_terakhir}
                onBerubah={muat}
              />
            )}
          </div>

          {!baru && (
            <aside className="space-y-3">
              <section className="rounded-[10px] border border-[#E3E8EE] bg-white p-4">
                <h2 className="text-[14px] font-semibold">Riwayat status</h2>
                <ol className="mt-2 space-y-2 border-l border-[#E3E8EE] pl-3">
                  {riwayatStatus.map((a) => (
                    <li key={a.id} className="text-[12.5px]">
                      <p className="font-semibold">{LABEL_AKSI[a.aksi] ?? a.aksi}</p>
                      <p className="text-[11.5px] text-[#7B8794]">
                        {waktuWibPanjang(a.at)} · {a.nama ?? "–"}
                      </p>
                      {a.detail && (a.aksi === "ubah_status" || a.aksi === "batalkan" || a.aksi === "ubah_kategori") && (
                        <p className="text-[11.5px] text-[#4D5B6B]">
                          {a.aksi === "ubah_status" ? `${String(a.detail.dari)} → ${String(a.detail.ke)}` : a.aksi === "batalkan" ? String(a.detail.alasan) : `kategori #${String(a.detail.dari)} → #${String(a.detail.ke)} (nomor tetap)`}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
              <section className="rounded-[10px] border border-[#E3E8EE] bg-white p-4">
                <button type="button" className="flex w-full items-center text-left text-[14px] font-semibold" onClick={() => setTampilAudit((x) => !x)}>
                  <span className="flex-1">Audit log ({auditLog?.length ?? 0})</span>
                  <span className="text-[12px] text-[#1F6FD1]">{tampilAudit ? "tutup" : "buka"}</span>
                </button>
                {tampilAudit && (
                  <ul className="mt-2 max-h-[480px] space-y-1.5 overflow-y-auto text-[12px]">
                    {(auditLog ?? []).map((a) => (
                      <li key={a.id} className="border-b border-[#EDF0F4] pb-1">
                        <span className="font-semibold">{LABEL_AKSI[a.aksi] ?? a.aksi}</span>
                        <span className="block text-[11px] text-[#7B8794]">
                          {waktuWibPanjang(a.at)} · {a.nama ?? "–"} · IP {a.ip ?? "–"}
                        </span>
                        <span className="block font-mono text-[10.5px] text-[#9AA5B8]" title="hash rantai audit">
                          #{a.id} {a.hash.slice(0, 16)}…
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </aside>
          )}
        </div>
      )}
    </Bingkai>
  );
}
