"use client";

// app/sigap/revisi/versi/page.tsx
//
// (24 Okt 2026, tahap 18) Papan 7 mockup: "Sesudah revisi: versi berurutan, RPD, dan dampak". Hanya baca; tidak ada tulis ke basis data.
//  - Versi berurutan: versi POK sistem, total, perbandingan dua versi per RO (dikelompokkan per KRO) dan rincian baris yang berbeda.
//  - RPD sebelum dan sesudah: kertas kerja jadwal terpilih, disebar ke bulan menurut pola pencairan RAB baris yang sama.
//  - Dampak ke Booked dan Realisasi: pagu Menjadi baris yang berubah dibandingkan dengan realisasi terbaru; Booked belum punya sumber data.
//  - (25 Okt 2026) Tab Cek pagu per akun: pagu tiap akun per RO pada laporan realisasi terakhir (SPAN, GLP039) dibandingkan dengan POK berlaku atau
//    kertas kerja terpilih. Hanya pengecekan: bila beda ada peringatan dan tautan ke kertas kerja (yang dipakai seharusnya POK resmi).
// Logika murni: lib/keu/versi.ts dan lib/keu/cekPagu.ts. Alamat: /sigap/revisi/versi?tab=versi|rpd|dampak|cek&jadwal=<id>.

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  arahSelisih, bandingRincian, bandingRo, hitungDampak, hitungRpd, LABEL_DAMPAK, LABEL_STATUS_VERSI, labelVersi, pasanganVersi, selisihTeks, totalVersi, urutVersi,
  versiTerbaru, WARNA_DAMPAK, type BarisKkVersi, type DetailVersi, type NodeVersi, type PolaJadwal, type RealisasiVersi, type VersiPok,
} from "@/lib/keu/versi";
import { LABEL_JENIS_JADWAL, LABEL_STATUS_JADWAL, tglPanjang } from "@/lib/keu/revisi";
import { angka, urlBaca } from "@/lib/keu/ro";
import { bandingPaguAkun, paguDariGlp } from "@/lib/keu/cekPagu";
import KartuCekPagu, { useSisiSistem } from "../CekPaguAkun";
import { caps, Catatan, Chip, Galat, HalamanKeu, judulKartu, kartu, kolom, Kosong, label, Memuat, Potong, tombolAktif, tombolKecil } from "../../keu-ui";
import { useBacaKeu } from "../../ro/useKeu";

type Jadwal = { id: number; tahun: number; jenis: string; judul: string; status: string };
type Tab = "versi" | "rpd" | "dampak" | "cek";
const TAB: { k: Tab; nama: string }[] = [
  { k: "versi", nama: "Versi berurutan" }, { k: "rpd", nama: "RPD sebelum dan sesudah" }, { k: "dampak", nama: "Dampak ke Booked dan Realisasi" }, { k: "cek", nama: "Cek pagu per akun" },
];

const warnaSel = (v: number) => (v < 0 ? "text-[#9B1C23]" : v > 0 ? "text-[#1F5FD1]" : "text-[#5B6B84]");
const sel = (v: number) => selisihTeks(v);
const th = "px-2.5 py-2 text-left text-[11.5px] font-semibold text-[#5B6B84]";
const thn = `${th} text-right`;
const td = "px-2.5 py-1.5 align-top";
const tdn = `${td} text-right font-mono tabular-nums`;
const mono = "font-mono text-[12px] text-[#44546F]";

function Tabel({ children, lebar = 760 }: { children: React.ReactNode; lebar?: number }) {
  return <div className="overflow-x-auto"><table className="w-full border-collapse text-[13px]" style={{ minWidth: lebar }}>{children}</table></div>;
}

function TabVersi({ versi, nodeRingkas }: { versi: VersiPok[]; nodeRingkas: NodeVersi[] }) {
  const urut = useMemo(() => urutVersi(versi), [versi]);
  const terbaru = useMemo(() => versiTerbaru(versi), [versi]);
  const pasang = useMemo(() => pasanganVersi(versi), [versi]);
  const [pilih, setPilih] = useState<number | null>(null);
  const [semua, setSemua] = useState(false);
  const idx = pilih !== null && pilih < pasang.length ? pilih : Math.max(0, pasang.length - 1);
  const ps = pasang[idx] ?? null;
  const nomor = (id: number) => urut.find((x) => x.id === id)?.nomor_revisi;

  const nodeRinci = useBacaKeu<NodeVersi>(ps ? urlBaca("keu_v_pok_node_tampil", { versi_id: [ps.a, ps.b] }, { batas: 5000, kolom: ["id", "versi_id", "induk_id", "tingkat", "kode", "nama", "pagu", "ro_kode"] }) : null);
  const detail = useBacaKeu<DetailVersi>(ps ? urlBaca("keu_pok_detail", { versi_id: [ps.a, ps.b] }, { batas: 10000, kolom: ["id", "versi_id", "akun_node_id", "kunci_stabil", "uraian", "jumlah"] }) : null);
  const banding = useMemo(() => (ps ? bandingRo(nodeRingkas, ps.a, ps.b, semua) : null), [ps, nodeRingkas, semua]);
  const beda = useMemo(() => (ps && nodeRinci.baris && detail.baris ? bandingRincian(nodeRinci.baris, detail.baris, ps.a, ps.b) : null), [ps, nodeRinci.baris, detail.baris]);
  const kolA = ps ? `Revisi ${nomor(ps.a)}` : "", kolB = ps ? `Revisi ${nomor(ps.b)}` : "";

  return (
    <>
      <section className={`${kartu} flex flex-col gap-3`}>
        <h2 className={judulKartu}>Daftar versi</h2>
        {urut.length === 0 ? <p className="text-[13px] text-[#5B6B84]">Belum ada versi POK di sistem.</p> : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
            {urut.map((v) => {
              const baru = terbaru?.id === v.id;
              return (
                <div key={v.id} className={`flex min-w-0 flex-col gap-1.5 rounded-lg border p-3 ${baru ? "border-[#1F5FD1] bg-[#EAF1FC]" : "border-[#DCE3EE] bg-white"}`}>
                  <span className="font-mono text-[11.5px] text-[#5B6B84]">Revisi {v.nomor_revisi}</span>
                  <h3 className="text-[14px] font-bold text-[#0F2A52]">{labelVersi(v)}{v.nomor_pok ? ` (${v.nomor_pok})` : ""}</h3>
                  <p className="text-[12.5px] text-[#5B6B84]">{v.tanggal_efektif ? `Efektif ${tglPanjang(v.tanggal_efektif)}.` : "Tanggal efektif belum tercatat."}{v.dibuat_at ? ` Masuk sistem ${tglPanjang(v.dibuat_at.slice(0, 10))}.` : ""}</p>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                    <Chip warna={baru ? "biru" : "abu"}>{baru ? "Terbaru" : (LABEL_STATUS_VERSI[v.status] ?? v.status)}</Chip>
                    <span className="font-mono text-[14px] font-bold tabular-nums text-[#0F2A52]">{angka(totalVersi(nodeRingkas, v.id))}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="max-w-[100ch] text-[12px] text-[#5B6B84]">Versi di sini adalah POK sistem: tiap PDF POK resmi yang diterima PPK pada halaman Unggah PDF POK menjadi satu versi. Revisi yang masih berupa kertas kerja (usulan dan geseran) belum menjadi versi sampai POK resminya diterima.</p>
      </section>

      <section className={`${kartu} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={judulKartu}>Bandingkan dua versi</h2>
          <div className="flex flex-wrap gap-1.5">
            {pasang.map((p, i) => <button key={`${p.a}-${p.b}`} type="button" onClick={() => setPilih(i)} className={`${i === idx ? tombolAktif : tombolKecil} !min-h-[32px] !px-2.5 !text-[12px]`}>{p.nama}</button>)}
          </div>
        </div>
        {!ps || !banding ? <p className="text-[13px] text-[#5B6B84]">Perbandingan butuh sekurangnya dua versi POK. Saat ini baru ada {urut.length}.</p> : (
          <>
            <label className="flex items-center gap-2 text-[12.5px] text-[#44546F]">
              <input type="checkbox" checked={semua} onChange={(e) => setSemua(e.target.checked)} className="h-4 w-4" />
              Tampilkan juga RO yang angkanya tidak berubah ({banding.nSemua - banding.nBeda} RO)
            </label>
            <Tabel lebar={720}>
              <thead><tr className="bg-[#F4F7FB]"><th className={th}>Kunci</th><th className={th}>Uraian</th><th className={thn}>{kolA}</th><th className={thn}>{kolB}</th><th className={thn}>Selisih</th></tr></thead>
              <tbody>
                {banding.kelompok.length === 0 && <tr><td colSpan={5} className={`${td} text-[#5B6B84]`}>Tidak ada RO yang angkanya berbeda antara kedua versi ini.</td></tr>}
                {banding.kelompok.map((g) => (
                  <FragmenKro key={g.kro} g={g} />
                ))}
                <tr className="bg-[#EEF2F7] font-bold">
                  <td colSpan={2} className={td}>Total seluruh RO ({banding.nSemua} RO; {banding.nBeda} berbeda)</td>
                  <td className={tdn}>{angka(banding.a)}</td><td className={tdn}>{angka(banding.b)}</td><td className={`${tdn} ${warnaSel(banding.d)}`}>{sel(banding.d)}</td>
                </tr>
              </tbody>
            </Tabel>

            <p className="text-[12px] text-[#5B6B84]">Rincian baris yang berbeda pada pasangan versi ini (dipasangkan lewat kunci stabil):</p>
            {(nodeRinci.galat || detail.galat) && <Galat pesan={nodeRinci.galat ?? detail.galat} />}
            {!beda && !nodeRinci.galat && !detail.galat && <Memuat tinggi="h-24" />}
            {(nodeRinci.terpotong || detail.terpotong) && <Potong />}
            {beda && (
              <Tabel lebar={860}>
                <thead><tr className="bg-[#F4F7FB]"><th className={th}>Kunci</th><th className={th}>Uraian</th><th className={th}>Akun</th><th className={thn}>{kolA}</th><th className={thn}>{kolB}</th><th className={thn}>Selisih</th><th className={th}>Keterangan</th></tr></thead>
                <tbody>
                  {beda.length === 0 && <tr><td colSpan={7} className={`${td} text-[#5B6B84]`}>Tidak ada baris rincian yang berbeda.</td></tr>}
                  {beda.map((r) => (
                    <tr key={r.kunci} className="border-t border-[#E7ECF4]">
                      <td className={`${td} ${mono}`}>{r.ro}</td><td className={td}>{r.uraian}</td><td className={`${td} ${mono}`}>{r.akun}</td>
                      <td className={tdn}>{angka(r.a)}</td><td className={tdn}>{angka(r.b)}</td><td className={`${tdn} ${warnaSel(r.d)}`}>{sel(r.d)}</td>
                      <td className={td}>{r.status === "berubah" ? <Chip warna="kuning">Angka berubah</Chip> : r.status === "baru" ? <Chip warna="biru">Baru di {kolB}</Chip> : <Chip warna="abu">Tidak ada di {kolB}</Chip>}</td>
                    </tr>
                  ))}
                </tbody>
              </Tabel>
            )}
          </>
        )}
      </section>
    </>
  );
}

function FragmenKro({ g }: { g: ReturnType<typeof bandingRo>["kelompok"][number] }) {
  return (
    <>
      {g.ro.map((r) => (
        <tr key={r.ro} className="border-t border-[#E7ECF4] bg-[#FAFBFD] font-medium">
          <td className={`${td} ${mono}`}>{r.ro}</td>
          <td className={td}>{r.nama}{r.ada === "hanyaA" ? <span className="ml-2 text-[11.5px] font-normal text-[#8A6200]">(tidak ada di versi kedua)</span> : r.ada === "hanyaB" ? <span className="ml-2 text-[11.5px] font-normal text-[#1F5FD1]">(baru di versi kedua)</span> : null}</td>
          <td className={tdn}>{angka(r.a)}</td><td className={tdn}>{angka(r.b)}</td><td className={`${tdn} ${warnaSel(r.d)}`}>{sel(r.d)}</td>
        </tr>
      ))}
      <tr className="border-t border-[#DCE3EE] bg-[#F4F7FB] text-[12px] font-semibold text-[#44546F]">
        <td colSpan={2} className={td}>Jumlah KRO {g.kro}</td>
        <td className={tdn}>{angka(g.a)}</td><td className={tdn}>{angka(g.b)}</td><td className={`${tdn} ${warnaSel(g.d)}`}>{sel(g.d)}</td>
      </tr>
    </>
  );
}

function PilihJadwal({ jadwal, jid, ubah }: { jadwal: Jadwal[]; jid: number | null; ubah: (id: number) => void }) {
  return (
    <div className="max-w-[560px]">
      <label className={label} htmlFor="pilih-jadwal">Kertas kerja jadwal</label>
      <select id="pilih-jadwal" className={kolom} value={jid ?? ""} onChange={(e) => ubah(Number(e.target.value))}>
        {jadwal.map((j) => <option key={j.id} value={j.id}>#{j.id} · {j.judul} · {LABEL_JENIS_JADWAL[j.jenis] ?? j.jenis} · {LABEL_STATUS_JADWAL[j.status] ?? j.status}</option>)}
      </select>
    </div>
  );
}

type PembandingCek = "pok" | "kertas";

/** Pagu per akun per RO: laporan realisasi terakhir (SPAN) vs POK berlaku atau kertas kerja terpilih. Hanya pengecekan. */
function TabCek({ jadwal, jid, ubahJadwal }: { jadwal: Jadwal[]; jid: number | null; ubahJadwal: (id: number) => void }) {
  const [pembanding, setPembanding] = useState<PembandingCek>("pok");
  const real = useBacaKeu<{ ro_kode: string; akun_kode: string; pagu: number | string; sampai_tanggal: string }>(
    urlBaca("keu_v_realisasi_terbaru", {}, { batas: 20000, kolom: ["ro_kode", "akun_kode", "pagu", "sampai_tanggal"] }),
  );
  const sumber = useMemo(() => (pembanding === "pok" ? { jenis: "pok" as const } : { jenis: "kertas" as const, jadwalId: jid ?? 0 }), [pembanding, jid]);
  const sisi = useSisiSistem(sumber, pembanding === "pok" || jid !== null);
  const resmi = useMemo(() => (real.baris ? paguDariGlp(real.baris) : null), [real.baris]);
  const hasil = useMemo(
    () => (resmi && resmi.length > 0 && sisi.sistem ? bandingPaguAkun(resmi, sisi.sistem, { lingkup: pembanding === "pok" ? "ro_resmi" : "irisan" }) : null),
    [resmi, sisi.sistem, pembanding],
  );
  const tanggal = real.baris?.[0]?.sampai_tanggal ?? null;
  const namaSistem = pembanding === "pok" ? "POK berlaku" : `kertas kerja #${jid ?? "-"}`;

  return (
    <>
      <section className={`${kartu} flex flex-col gap-3`}>
        <h2 className={judulKartu}>Bandingkan dengan</h2>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pembanding">
          <button type="button" aria-pressed={pembanding === "pok"} onClick={() => setPembanding("pok")} className={pembanding === "pok" ? tombolAktif : tombolKecil}>POK berlaku</button>
          <button type="button" aria-pressed={pembanding === "kertas"} onClick={() => setPembanding("kertas")} className={pembanding === "kertas" ? tombolAktif : tombolKecil}>Kertas kerja</button>
        </div>
        {pembanding === "kertas" && (jadwal.length > 0 ? <PilihJadwal jadwal={jadwal} jid={jid} ubah={ubahJadwal} /> : <p className="text-[13px] text-[#5B6B84]">Belum ada jadwal revisi.</p>)}
        <p className="text-[12.5px] text-[#5B6B84]">
          Acuan: laporan realisasi terakhir dari SPAN{tanggal ? ` (per ${tglPanjang(tanggal)})` : ""}. Laporan itu mencerminkan POK resmi di SPAN. Hanya jumlah pagu tiap akun pada tiap RO yang dibandingkan.
        </p>
      </section>
      {real.baris && real.baris.length === 0 && <Kosong teks="Belum ada laporan realisasi yang diunggah, jadi belum ada acuan POK resmi. Unggah laporan pada halaman Realisasi." />}
      {(real.baris === null || real.baris.length > 0) && (
        <KartuCekPagu
          hasil={hasil} memuat={!real.baris || sisi.memuat} galat={real.galat ?? sisi.galat} terpotong={real.terpotong || sisi.terpotong}
          namaResmi="laporan realisasi (POK resmi)" namaSistem={namaSistem} jadwalId={pembanding === "kertas" ? jid : null}
        />
      )}
    </>
  );
}

function TabRpd({ kk, pola, memuat }: { kk: BarisKkVersi[]; pola: PolaJadwal[]; memuat: boolean }) {
  const h = useMemo(() => hitungRpd(kk, pola), [kk, pola]);
  if (memuat) return <Memuat />;
  return (
    <section className={`${kartu} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={judulKartu}>Rencana penarikan dana (RPD) per bulan</h2>
        <div className="flex items-center gap-3 text-[12px] text-[#44546F]">
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-7 rounded-sm bg-[#8EA3C2]" />Semula</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-7 rounded-sm bg-[#1D5FB4]" />Menjadi</span>
        </div>
      </div>
      <p className="max-w-[100ch] text-[12.5px] text-[#5B6B84]">Perubahan pagu per baris ikut menggeser RPD pada bulan yang sama dengan pola pencairan baris itu (pola dari jadwal pencairan RAB, dicocokkan lewat kunci baris POK). Bulan yang bergeser ditandai, dan operator memeriksa sebelum RPD disampaikan.</p>
      {kk.length === 0 ? <p className="text-[13px] text-[#5B6B84]">Kertas kerja ini belum punya baris.</p> : (
        <>
          <p className="text-[12.5px] text-[#44546F]"><b>{h.nBerpola}</b> dari {kk.length} baris punya pola pencairan. Dari <b>{h.nBerubah}</b> baris yang berubah, <b>{h.nBerubah - h.nBerubahTanpaPola}</b> berpola dan <b>{h.nBerubahTanpaPola}</b> belum berpola.</p>
          <Tabel lebar={820}>
            <thead><tr className="bg-[#F4F7FB]"><th className={th}>Bulan</th><th className={th}>Perbandingan</th><th className={thn}>Semula</th><th className={thn}>Menjadi</th><th className={thn}>Selisih</th><th className={th}>Tanda</th></tr></thead>
            <tbody>
              {h.bulan.map((m) => (
                <tr key={m.no} className="border-t border-[#E7ECF4]">
                  <td className={`${td} font-semibold`}>{m.bulan}</td>
                  <td className={`${td} w-[36%]`}>
                    <div className="flex flex-col gap-[3px]" aria-hidden>
                      <div className="h-3 rounded-sm bg-[#8EA3C2]" style={{ width: `${(Math.max(m.a, 0) / h.maks) * 100}%` }} />
                      <div className="h-3 rounded-sm bg-[#1D5FB4]" style={{ width: `${(Math.max(m.b, 0) / h.maks) * 100}%` }} />
                    </div>
                  </td>
                  <td className={tdn}>{angka(m.a)}</td><td className={tdn}>{angka(m.b)}</td><td className={`${tdn} ${warnaSel(m.d)}`}>{sel(m.d)}</td>
                  <td className={td}>{m.geser ? <Chip warna="kuning">Bergeser</Chip> : null}</td>
                </tr>
              ))}
              {h.tanpaPola.n > 0 && (
                <tr className="border-t border-[#E7ECF4] bg-[#FFFBF0]">
                  <td className={`${td} font-semibold`}>Belum ada pola</td>
                  <td className={`${td} text-[12px] text-[#5C4300]`}>{h.tanpaPola.n} baris berubah belum punya jadwal pencairan RAB; bulannya tidak ditebak.</td>
                  <td className={tdn}>{angka(h.tanpaPola.a)}</td><td className={tdn}>{angka(h.tanpaPola.b)}</td><td className={`${tdn} ${warnaSel(h.tanpaPola.d)}`}>{sel(h.tanpaPola.d)}</td>
                  <td className={td}><Chip warna="kuning">Perlu pola</Chip></td>
                </tr>
              )}
              <tr className="border-t border-[#DCE3EE] bg-[#EEF2F7] font-bold">
                <td colSpan={2} className={td}>Total</td>
                <td className={tdn}>{angka(h.total.a)}</td><td className={tdn}>{angka(h.total.b)}</td><td className={`${tdn} ${warnaSel(h.total.d)}`}>{sel(h.total.d)}</td><td />
              </tr>
            </tbody>
          </Tabel>
          <p className="text-[12px] text-[#5B6B84]">Baris tanpa pola tidak ikut tabel bulanan, dan di baris "Belum ada pola" hanya baris yang berubah yang dihitung. Jadwal pencairan diisi pada tab RAB tiap RO.</p>
        </>
      )}
    </section>
  );
}

function TabDampak({ kk, real, memuat, terpotong }: { kk: BarisKkVersi[]; real: RealisasiVersi[]; memuat: boolean; terpotong: boolean }) {
  const h = useMemo(() => hitungDampak(kk, real), [kk, real]);
  if (memuat) return <Memuat />;
  return (
    <section className={`${kartu} flex flex-col gap-3`}>
      <h2 className={judulKartu}>Ruang pagu terhadap Booked dan Realisasi</h2>
      {terpotong && <Potong />}
      <div className="flex flex-wrap gap-2">
        {h.baris.length === 0 ? <Chip warna="abu">Belum ada baris yang berubah pada kertas kerja ini</Chip> : (
          <>
            {h.nBawah > 0 ? <Chip warna="merah">{h.nBawah} baris pagunya di bawah realisasi</Chip> : <Chip warna="hijau">Tidak ada baris di bawah realisasi</Chip>}
            {h.nBelum > 0 && <Chip warna="abu">{h.nBelum} baris belum punya data realisasi</Chip>}
          </>
        )}
      </div>
      {h.baris.length > 0 && (
        <Tabel lebar={960}>
          <thead><tr className="bg-[#F4F7FB]"><th className={th}>RO</th><th className={th}>Kunci</th><th className={th}>Uraian</th><th className={thn}>Pagu semula</th><th className={thn}>Pagu menjadi</th><th className={thn}>Booked</th><th className={thn}>Realisasi</th><th className={thn}>Ruang</th><th className={th}>Hasil</th></tr></thead>
          <tbody>
            {h.baris.map((r) => (
              <tr key={r.id} className="border-t border-[#E7ECF4]">
                <td className={`${td} ${mono}`}>{r.ro}</td><td className={`${td} ${mono}`}>{r.kode}</td><td className={td}>{r.uraian}</td>
                <td className={tdn}>{angka(r.semula)}</td><td className={tdn}>{angka(r.menjadi)}</td>
                <td className={`${tdn} text-[#8A97AD]`}>-</td>
                <td className={tdn}>{r.realisasi === null ? "-" : angka(r.realisasi)}</td>
                <td className={`${tdn} ${r.ruang === null ? "" : warnaSel(r.ruang < 0 ? -1 : 0)}`}>{r.ruang === null ? "-" : sel(r.ruang).replace(/^\+/, "")}</td>
                <td className={td}><Chip warna={WARNA_DAMPAK[r.status]}>{LABEL_DAMPAK[r.status]}</Chip></td>
              </tr>
            ))}
          </tbody>
        </Tabel>
      )}
      <Catatan>Booked belum punya sumber data di sistem, jadi kolomnya kosong dan tidak ikut perhitungan: "Aman" berarti pagu Menjadi masih menampung Realisasi terbaru, bukan Booked ditambah Realisasi. Realisasi dibaca dari unggahan realisasi terbaru (SPAN) dan dipasangkan lewat baris POK; baris tanpa pasangan bertanda "Belum ada realisasi". Baris di bawah realisasi perlu dikoreksi sebelum disetujui KPA. RAB tidak diubah oleh revisi POK; kecukupan terhadap RAB dinilai pada panel Kecukupan KRO.</Catatan>
    </section>
  );
}

function Isi() {
  const q = useSearchParams();
  const router = useRouter();
  const tab: Tab = (TAB.find((t) => t.k === q.get("tab"))?.k ?? "versi") as Tab;
  const jidQ = Number(q.get("jadwal")) || null;

  const versi = useBacaKeu<VersiPok>(urlBaca("keu_pok_versi", {}, { urut: "nomor_revisi", batas: 100, kolom: ["id", "tahun", "nomor_revisi", "jenis", "nomor_pok", "tanggal_efektif", "status", "dibuat_at"] }));
  const nodeRingkas = useBacaKeu<NodeVersi>(urlBaca("keu_v_pok_node_tampil", { tingkat: ["program", "ro"] }, { batas: 5000, kolom: ["id", "versi_id", "induk_id", "tingkat", "kode", "nama", "pagu", "ro_kode"] }));
  const jadwal = useBacaKeu<Jadwal>(urlBaca("keu_revisi_jadwal", {}, { urut: "-id", batas: 200, kolom: ["id", "tahun", "jenis", "judul", "status"] }));
  const daftarJadwal = jadwal.baris ?? [];
  const jid = jidQ && daftarJadwal.some((j) => j.id === jidQ) ? jidQ : (daftarJadwal[0]?.id ?? null);

  const perluKk = (tab === "rpd" || tab === "dampak") && jid !== null;
  const kk = useBacaKeu<BarisKkVersi>(perluKk ? urlBaca("keu_v_kk_baris", { jadwal_id: jid! }, { urut: "id", batas: 5000, kolom: ["id", "jadwal_id", "ro_kode", "detail_id", "pok_kunci", "akun_menjadi", "uraian_menjadi", "jumlah_semula", "jumlah_menjadi", "selisih", "baru"] }) : null);
  const pola = useBacaKeu<PolaJadwal>(tab === "rpd" ? urlBaca("keu_v_rab_jadwal_item", {}, { batas: 5000, kolom: ["pok_kunci", "bulan", "nilai"] }) : null);
  const real = useBacaKeu<RealisasiVersi>(tab === "dampak" ? urlBaca("keu_v_realisasi_terbaru", {}, { batas: 10000, kolom: ["detail_id", "real_sd"] }) : null);

  const ke = (t: Tab, j: number | null) => router.replace(`/sigap/revisi/versi?tab=${t}${j ? `&jadwal=${j}` : ""}`, { scroll: false });

  const galat = versi.galat ?? nodeRingkas.galat ?? jadwal.galat ?? kk.galat ?? pola.galat ?? real.galat;
  const dasar = versiTerbaru(versi.baris ?? []);

  return (
    <HalamanKeu
      jejak={[{ t: "SIGAP", href: "/sigap" }, { t: "Perencanaan", href: "/sigap/ro" }, { t: "Revisi anggaran", href: "/sigap/revisi" }, { t: "Versi, RPD, dampak" }]}
      induk="/sigap/revisi"
      labelKembali="Jadwal revisi"
      judul="Sesudah revisi: versi berurutan, RPD, dan dampak"
      sub={dasar ? <>POK berlaku: {labelVersi(dasar)}{dasar.tanggal_efektif ? `, efektif ${tglPanjang(dasar.tanggal_efektif)}` : ""}. Halaman ini hanya membaca; tidak ada yang diubah.</> : undefined}
    >
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Bagian halaman">
        {TAB.map((t) => <button key={t.k} type="button" role="tab" aria-selected={tab === t.k} onClick={() => ke(t.k, jid)} className={tab === t.k ? tombolAktif : tombolKecil}>{t.nama}</button>)}
      </div>
      <Galat pesan={galat} />

      {tab === "versi" && (versi.baris && nodeRingkas.baris ? <TabVersi versi={versi.baris} nodeRingkas={nodeRingkas.baris} /> : galat ? null : <Memuat />)}
      {nodeRingkas.terpotong && tab === "versi" && <Potong />}

      {tab === "cek" && <TabCek jadwal={daftarJadwal} jid={jid} ubahJadwal={(id) => ke("cek", id)} />}

      {(tab === "rpd" || tab === "dampak") && (
        <>
          {jadwal.baris && daftarJadwal.length === 0 && <Kosong teks="Belum ada jadwal revisi, jadi belum ada kertas kerja untuk dibandingkan." />}
          {daftarJadwal.length > 0 && <PilihJadwal jadwal={daftarJadwal} jid={jid} ubah={(id) => ke(tab, id)} />}
          {kk.terpotong && <Potong />}
          {tab === "rpd" && jid !== null && <TabRpd kk={kk.baris ?? []} pola={pola.baris ?? []} memuat={!kk.baris || !pola.baris} />}
          {tab === "dampak" && jid !== null && <TabDampak kk={kk.baris ?? []} real={real.baris ?? []} memuat={!kk.baris || !real.baris} terpotong={real.terpotong} />}
        </>
      )}
      <p className={caps}>Sumber: keu_pok_versi, keu_v_pok_node_tampil, keu_pok_detail, keu_v_kk_baris, keu_v_rab_jadwal_item, keu_v_realisasi_terbaru, keu_v_adm_lembar</p>
    </HalamanKeu>
  );
}

export default function HalamanVersi() {
  return (
    <Suspense fallback={null}>
      <Isi />
    </Suspense>
  );
}
