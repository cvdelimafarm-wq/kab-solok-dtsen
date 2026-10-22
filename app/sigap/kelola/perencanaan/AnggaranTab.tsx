"use client";

// app/sigap/kelola/perencanaan/AnggaranTab.tsx
//
// (22 Okt 2026) Bagian "Anggaran" di tingkat RO halaman Perencanaan (uji coba, Admin Aplikasi): RAB berversi, vonis sisa/kurang,
// rencana penarikan dana (RPD) per bulan, dan saran pasangan revisi lintas RO.
// Logika: lib/anggaranRab.ts (murni, uji) + lib/anggaranRabUji.ts (penyimpanan versi di browser, kunci sigap_uji_rab_v1).
// Seperti bagian lain halaman ini, data hanya tersimpan di browser sampai aturan disetujui dan migrasi 20261022b diterapkan.
// Kewenangan persetujuan revisi SENGAJA tidak dikodekan: aplikasi hanya menandai jenis pergeseran dan memberi saran; keputusan di PPK/KPA.
// Angka rentang per versi, cadangan 5%, dan pola bayar per jenis item adalah USULAN AWAL (lihat claude/rancangan-anggaran-rab-kelola-mitra.md).

import { useEffect, useMemo, useState } from "react";
import { BTN, BTN_O, Chip, INPUT, Kartu, TD, TH } from "../../admin/ui";
import {
  CADANGAN_BAWAAN_PERSEN,
  alasanRevisiSah,
  bandingRpd,
  batasAmanGeser,
  cekSetujuRab,
  jumlahBaris,
  pasangkanRevisi,
  pergeseranTerjauh,
  polaBawaan,
  rp,
  rpdDariRab,
  totalRab,
  vonisRab,
  type BarisRab,
  type SelisihItem,
} from "@/lib/anggaranRab";
import {
  KUNCI_RAB,
  alasanSah,
  awalRab,
  bacaRab,
  bolehUbah,
  cocokDenganPok,
  paguPok,
  pilihVersi,
  selisihBaris,
  ubahBaris,
  versiBaru,
  versiDipilih,
  versiTerakhir,
  type DataRab,
  type RabRo,
} from "@/lib/anggaranRabUji";
import { kunciDetail } from "@/lib/perencanaanPok";
import type { DataUji, Ro } from "@/lib/perencanaanGsbpm";

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const sekarang = () => new Date().toISOString();
const angkaDari = (s: string): number => Number(s.replace(/\./g, "").replace(",", "."));
const jt = (n: number) => (n === 0 ? "–" : `${(n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`);
const programDari = (kodeRo: string) => kodeRo.split(".")[0] ?? kodeRo;

const JENIS_LABEL = { dalam_ro: "Dalam RO", antar_ro: "Antar RO", antar_program: "Antar program" } as const;

export default function AnggaranTab({ data, ro, keBarisPok }: { data: DataUji; ro: Ro; keBarisPok: () => void }) {
  const [rab, setRab] = useState<DataRab>({});
  const [siap, setSiap] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [alasan, setAlasan] = useState("");
  const [bulanMulai, setBulanMulai] = useState(() => Math.min(12, Math.max(1, new Date().getMonth() + 1)));
  const [bulanSelesai, setBulanSelesai] = useState(12);
  const [alasanRevisi, setAlasanRevisi] = useState("");
  const [konfirmasiUlang, setKonfirmasiUlang] = useState(false);

  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(KUNCI_RAB);
    } catch {
      raw = null;
    }
    setRab(bacaRab(raw));
    setSiap(true);
  }, []);

  const simpan = (roId: string, r: RabRo) => {
    const baru = { ...rab, [roId]: r };
    setRab(baru);
    try {
      localStorage.setItem(KUNCI_RAB, JSON.stringify(baru));
      setGalat(null);
    } catch {
      setGalat("Browser menolak menyimpan RAB (penyimpanan penuh atau mode privat). Perubahan hanya bertahan sampai halaman ditutup.");
    }
  };

  const pokRo = useMemo(() => data.pok.filter((d) => d.roId === ro.id), [data.pok, ro.id]);
  const pagu = paguPok(pokRo);
  const r = rab[ro.id] ?? null;

  const paguBaris = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of pokRo) m.set(kunciDetail(d), (m.get(kunciDetail(d)) ?? 0) + d.jumlah);
    return m;
  }, [pokRo]);

  // Saran revisi lintas RO: memakai versi TERPILIH tiap RO yang sudah punya RAB.
  const revisi = useMemo(() => {
    const item: SelisihItem[] = [];
    for (const x of data.ro) {
      const rr = rab[x.id];
      if (!rr) continue;
      item.push(...selisihBaris(data.pok.filter((d) => d.roId === x.id), versiDipilih(rr).baris, programDari(x.kode), x.kode));
    }
    return pasangkanRevisi(item);
  }, [data.ro, data.pok, rab]);

  if (!siap) return null;

  if (pokRo.length === 0)
    return (
      <Kartu judul="Anggaran (RAB)">
        <p className="text-[13px] text-[#6B7A90]">Muat baris POK dulu. RAB v1 disalin dari POK, jadi pagu dan rincian harus ada lebih dulu.</p>
        <button type="button" className={`${BTN} mt-3`} onClick={keBarisPok}>
          Ke Baris POK
        </button>
      </Kartu>
    );

  if (!r)
    return (
      <Kartu judul="Anggaran (RAB)" ket={`Pagu POK ${rp(pagu)} · ${pokRo.length} baris`}>
        <p className="text-[13px] text-[#4D5B6B]">
          RAB adalah perkiraan kebutuhan yang diperbarui bertahap (v1, v2, v3, …), tidak pernah menimpa versi lama. Mulai dengan v1 = salinan POK.
        </p>
        <button type="button" className={`${BTN} mt-3`} onClick={() => simpan(ro.id, awalRab(pokRo, sekarang()))}>
          Mulai RAB v1 (salin POK)
        </button>
      </Kartu>
    );

  const selaras = cocokDenganPok(r, pokRo);
  const v = versiDipilih(r);
  const akhir = versiTerakhir(r);
  const total = totalRab(v.baris);
  const vonis = vonisRab(pagu, total, v.rentangPersen);
  const setuju = cekSetujuRab(total, pagu);
  const bisaUbah = bolehUbah(r, v.no);
  const warnaVonis = vonis.vonis === "sisa_pasti" ? "ok" : vonis.vonis === "kurang_pasti" ? "bad" : "wait";

  const adaJadwal = (b: BarisRab[]) => b.map((x) => ({ ...x, jadwal: x.jadwal ?? polaBawaan(x.akun, x.uraian, bulanMulai, Math.max(bulanMulai, bulanSelesai)) }));
  const rpd = rpdDariRab(adaJadwal(v.baris), bulanSelesai);
  const rpdV1 = rpdDariRab(adaJadwal(r.versi[0].baris), bulanSelesai);
  const banding = bandingRpd(rpd, rpdV1);

  const sisaRo = pagu - total;
  const batasAman = batasAmanGeser(sisaRo, total);
  const pasanganRo = revisi.pasangan.filter((p) => p.dari.roKode === ro.kode || p.ke.roKode === ro.kode);
  const terjauh = pergeseranTerjauh(revisi.pasangan);

  return (
    <div className="space-y-3">
      {galat && <p className="rounded-lg bg-[#FDE8E8] px-3 py-2 text-[12.5px] text-[#9B1C23]">{galat}</p>}

      {!selaras.sama && (
        <div role="alert" className="rounded-xl border border-[#F2D58A] bg-[#FFF4D6] px-3.5 py-3 text-[12.5px] text-[#5E4300]">
          <p className="font-bold">POK berubah sejak RAB v1 dibuat.</p>
          <p className="mt-1">
            v1 (salinan POK) bernilai {rp(selaras.paguV1)}, sedangkan POK sekarang {rp(selaras.paguPok)}
            {selaras.baru + selaras.hilang > 0 ? `; ${selaras.baru} baris POK baru dan ${selaras.hilang} baris v1 tidak ada lagi di POK` : ""}. Angka vonis, selisih, dan RPD di bawah masih memakai RAB lama.
            Bila POK memang sudah diganti (mis. Kembalikan contoh awal atau muat ulang), mulai ulang RAB dari POK sekarang.
          </p>
          {!konfirmasiUlang ? (
            <button type="button" className={`${BTN_O} mt-2`} onClick={() => setKonfirmasiUlang(true)}>
              Mulai ulang RAB dari POK
            </button>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="font-semibold">Semua versi RAB RO ini ({r.versi.length}) akan dihapus dan diganti v1 baru. Lanjut?</span>
              <button
                type="button"
                className={BTN}
                onClick={() => {
                  simpan(ro.id, awalRab(pokRo, sekarang()));
                  setKonfirmasiUlang(false);
                }}
              >
                Ya, mulai ulang
              </button>
              <button type="button" className={BTN_O} onClick={() => setKonfirmasiUlang(false)}>
                Batal
              </button>
            </div>
          )}
        </div>
      )}

      <Kartu judul="Ringkasan anggaran RO" ket={`RO ${ro.kode} · TA ${ro.tahun}`}>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Angka label="Pagu POK" nilai={rp(pagu)} />
          <Angka label={`RAB v${v.no}${v.no === akhir.no ? " (terakhir)" : ""}`} nilai={rp(total)} />
          <Angka label={sisaRo >= 0 ? "Sisa terhadap pagu" : "Kekurangan"} nilai={rp(Math.abs(sisaRo))} />
          <Angka label="Rentang versi ini" nilai={`± ${v.rentangPersen}%`} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Chip w={warnaVonis}>{vonis.teks}</Chip>
          {v.no === 1 ? (
            <Chip w="navy">v1 = salinan POK, bukan untuk disetujui (mulai v2)</Chip>
          ) : (
            <Chip w={setuju.boleh ? "ok" : "bad"}>{setuju.boleh ? `Layak disetujui (batas ${rp(setuju.batas)})` : "Belum layak disetujui"}</Chip>
          )}
        </div>
        {v.no > 1 && setuju.pesan && <p className="mt-2 text-[12.5px] text-[#9B1C23]">{setuju.pesan}</p>}
        <p className="mt-2 text-[12px] text-[#6B7A90]">
          Vonis memakai rentang ketidakpastian versi (v1 ±22%, v2 ±14%, v3 ±8%, v4 ke atas ±5%; usulan awal, bisa diubah di versi yang masih terbuka). Cadangan persetujuan {CADANGAN_BAWAAN_PERSEN}%.
        </p>
      </Kartu>

      <Kartu
        judul="Versi RAB"
        ket="Versi lama membeku; hanya versi terakhir (mulai v2) yang bisa diubah."
        kanan={
          <div className="flex flex-wrap gap-1.5">
            {r.versi.map((x) => (
              <button
                key={x.no}
                type="button"
                onClick={() => simpan(ro.id, pilihVersi(r, x.no))}
                className={`min-h-[36px] rounded-lg px-3 text-[12.5px] ${x.no === v.no ? "bg-[#E3EEFB] font-bold text-[#1F5FD1]" : "border border-[#E3E8EE] text-[#4D5B6B] hover:bg-[#F8FAFC]"}`}
              >
                v{x.no}
              </button>
            ))}
          </div>
        }
      >
        <p className="text-[12.5px] text-[#4D5B6B]">
          v{v.no} · {new Date(v.tanggal).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })} · alasan: {v.alasan}
          {!bisaUbah && <span className="ml-1 font-semibold text-[#6B7A90]">(terkunci)</span>}
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-[12px]">
            <thead>
              <tr>
                <th className={TH}>Akun</th>
                <th className={TH}>Uraian</th>
                <th className={`${TH} text-right`}>Volume</th>
                <th className={TH}>Satuan</th>
                <th className={`${TH} text-right`}>Harga</th>
                <th className={`${TH} text-right`}>Jumlah RAB</th>
                <th className={`${TH} text-right`}>Pagu POK</th>
                <th className={`${TH} text-right`}>Selisih</th>
              </tr>
            </thead>
            <tbody>
              {v.baris.map((b, i) => {
                const paguB = b.kunci ? paguBaris.get(b.kunci) ?? 0 : 0;
                const sel = paguB - jumlahBaris(b);
                return (
                  <tr key={`${i}-${b.kunci ?? "luar"}`}>
                    <td className={TD}>{b.akun}</td>
                    <td className={`${TD} max-w-[280px]`}>{b.uraian}</td>
                    <td className={`${TD} text-right`}>
                      {bisaUbah ? (
                        <input
                          key={`v${v.no}-${i}-${b.volume}`}
                          className={`${INPUT} w-24 text-right`}
                          inputMode="decimal"
                          defaultValue={b.volume}
                          aria-label={`Volume ${b.uraian}`}
                          onBlur={(e) => {
                            const n = angkaDari(e.target.value);
                            if (Number.isFinite(n) && n >= 0 && n !== b.volume) simpan(ro.id, ubahBaris(r, v.no, i, { volume: n }));
                            else e.target.value = String(b.volume);
                          }}
                        />
                      ) : (
                        <span className="tabular-nums">{b.volume.toLocaleString("id-ID")}</span>
                      )}
                    </td>
                    <td className={TD}>{b.satuan}</td>
                    <td className={`${TD} text-right`}>
                      {bisaUbah ? (
                        <input
                          key={`h${v.no}-${i}-${b.harga}`}
                          className={`${INPUT} w-32 text-right`}
                          inputMode="decimal"
                          defaultValue={b.harga}
                          aria-label={`Harga ${b.uraian}`}
                          onBlur={(e) => {
                            const n = angkaDari(e.target.value);
                            if (Number.isFinite(n) && n >= 0 && n !== b.harga) simpan(ro.id, ubahBaris(r, v.no, i, { harga: n }));
                            else e.target.value = String(b.harga);
                          }}
                        />
                      ) : (
                        <span className="tabular-nums">{b.harga.toLocaleString("id-ID")}</span>
                      )}
                    </td>
                    <td className={`${TD} text-right font-semibold tabular-nums`}>{rp(jumlahBaris(b))}</td>
                    <td className={`${TD} text-right tabular-nums`}>{b.kunci ? rp(paguB) : "–"}</td>
                    <td className={`${TD} text-right tabular-nums ${sel < 0 ? "font-semibold text-[#9B1C23]" : sel > 0 ? "text-[#0B6B3F]" : ""}`}>{sel === 0 ? "–" : rp(sel)}</td>
                  </tr>
                );
              })}
              <tr>
                <td className={`${TD} font-bold`} colSpan={5}>
                  Total
                </td>
                <td className={`${TD} text-right font-bold tabular-nums`}>{rp(total)}</td>
                <td className={`${TD} text-right font-bold tabular-nums`}>{rp(pagu)}</td>
                <td className={`${TD} text-right font-bold tabular-nums`}>{rp(pagu - total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {bisaUbah && (
          <label className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-[#4D5B6B]">
            Rentang versi ini (%)
            <input
              key={`r${v.no}-${v.rentangPersen}`}
              className={`${INPUT} w-20 text-right`}
              inputMode="decimal"
              defaultValue={v.rentangPersen}
              onBlur={(e) => {
                const n = angkaDari(e.target.value);
                if (Number.isFinite(n) && n >= 0 && n <= 100) simpan(ro.id, ubahBaris(r, v.no, 0, { rentangPersen: n }));
                else e.target.value = String(v.rentangPersen);
              }}
            />
          </label>
        )}

        <div className="mt-4 rounded-xl border border-[#E3E8EE] bg-[#F8FAFC] p-3">
          <p className="text-[13px] font-bold text-[#13213A]">Buat versi baru (v{akhir.no + 1})</p>
          <p className="mt-0.5 text-[12px] text-[#6B7A90]">Menyalin versi terakhir; versi v{akhir.no} lalu membeku. Alasan minimal 10 karakter, mis. "Penugasan petugas sudah final".</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input className={`${INPUT} min-w-[240px] flex-1`} value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Alasan versi baru" />
            <button
              type="button"
              className={BTN}
              disabled={!alasanSah(alasan)}
              onClick={() => {
                const baru = versiBaru(r, alasan, sekarang());
                if (baru) {
                  simpan(ro.id, baru);
                  setAlasan("");
                }
              }}
            >
              Buat v{akhir.no + 1}
            </button>
          </div>
        </div>
      </Kartu>

      <Kartu judul="Rencana penarikan dana (RPD)" ket={v.no === 1 ? "Dari RAB v1 (salinan POK); perbandingan muncul mulai v2" : `Dari RAB v${v.no}, dibanding v1 (salinan POK)`}>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[12.5px] text-[#4D5B6B]">
          Pelaksanaan bulan
          <select className={INPUT} value={bulanMulai} onChange={(e) => setBulanMulai(Number(e.target.value))} aria-label="Bulan mulai">
            {BULAN.map((b, i) => (
              <option key={b} value={i + 1}>
                {b}
              </option>
            ))}
          </select>
          s.d.
          <select className={INPUT} value={bulanSelesai} onChange={(e) => setBulanSelesai(Number(e.target.value))} aria-label="Bulan selesai">
            {BULAN.map((b, i) => (
              <option key={b} value={i + 1}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-[12px]">
            <thead>
              <tr>
                <th className={TH}> </th>
                {BULAN.map((b) => (
                  <th key={b} className={`${TH} text-right`}>
                    {b}
                  </th>
                ))}
                <th className={`${TH} text-right`}>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={`${TD} font-semibold`}>RPD v{v.no}</td>
                {banding.map((x) => (
                  <td key={x.bulan} className={`${TD} text-right tabular-nums`} title={rp(x.rpd)}>
                    {jt(x.rpd)}
                  </td>
                ))}
                <td className={`${TD} text-right font-bold tabular-nums`}>{jt(rpd.reduce((s, n) => s + n, 0))}</td>
              </tr>
              {v.no > 1 && (
              <tr>
                <td className={`${TD} font-semibold`}>RPD v1</td>
                {banding.map((x) => (
                  <td key={x.bulan} className={`${TD} text-right tabular-nums`} title={rp(x.v1)}>
                    {jt(x.v1)}
                  </td>
                ))}
                <td className={`${TD} text-right font-bold tabular-nums`}>{jt(rpdV1.reduce((s, n) => s + n, 0))}</td>
              </tr>
              )}
              {v.no > 1 && (
              <tr>
                <td className={`${TD} font-semibold`}>Selisih</td>
                {banding.map((x) => (
                  <td key={x.bulan} className={`${TD} text-right tabular-nums ${x.selisih < 0 ? "text-[#0B6B3F]" : x.selisih > 0 ? "font-semibold text-[#9B1C23]" : ""}`} title={rp(x.selisih)}>
                    {jt(x.selisih)}
                  </td>
                ))}
                <td className={`${TD} text-right font-bold tabular-nums`}>{jt(banding[11].kumulatifRpd - banding[11].kumulatifV1)}</td>
              </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[12px] text-[#6B7A90]">
          Angka dalam juta rupiah (arahkan kursor untuk nilai lengkap). Pola bayar bawaan (usulan awal): pelatihan/rapat di bulan mulai, transport merata sepanjang pelaksanaan, honor sebulan setelah selesai.
          Selisih positif = penarikan lebih besar dari v1.
        </p>
      </Kartu>

      <Kartu judul="Saran revisi (lintas RO)" ket="Sisa dipasangkan ke kekurangan, terdekat dulu: dalam RO, antar RO, lalu antar program. Hanya saran.">
        {Object.keys(rab).length < 1 ? null : (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Angka label="Sisa RO ini" nilai={rp(sisaRo)} />
              <Angka label="Batas aman digeser" nilai={rp(batasAman)} />
              <Angka label="Total pergeseran (semua RO)" nilai={rp(revisi.totalDigeser)} />
              <Angka label="Pergeseran terjauh" nilai={terjauh ? JENIS_LABEL[terjauh] : "–"} />
            </div>
            <p className="mt-1 text-[12px] text-[#6B7A90]">
              Batas aman = sisa dikurangi cadangan {CADANGAN_BAWAAN_PERSEN}% dari RAB. Perbandingan lintas RO hanya mencakup RO yang sudah punya RAB di browser ini; kode program diambil dari bagian pertama kode RO.
            </p>
            {pasanganRo.length === 0 ? (
              <p className="mt-3 text-[13px] text-[#4D5B6B]">Belum ada pasangan sisa-kekurangan yang melibatkan RO ini pada versi RAB terpilih.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-[12px]">
                  <thead>
                    <tr>
                      <th className={TH}>Dari (sisa)</th>
                      <th className={TH}>Ke (kekurangan)</th>
                      <th className={`${TH} text-right`}>Jumlah</th>
                      <th className={TH}>Jenis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pasanganRo.map((p, i) => (
                      <tr key={i}>
                        <td className={`${TD} max-w-[260px]`}>
                          <span className="font-semibold">{p.dari.roKode}</span> · {p.dari.uraian}
                        </td>
                        <td className={`${TD} max-w-[260px]`}>
                          <span className="font-semibold">{p.ke.roKode}</span> · {p.ke.uraian}
                        </td>
                        <td className={`${TD} text-right tabular-nums`}>{rp(p.jumlah)}</td>
                        <td className={TD}>
                          <Chip w={p.jenis === "dalam_ro" ? "ok" : p.jenis === "antar_ro" ? "wait" : "bad"}>{JENIS_LABEL[p.jenis]}</Chip>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {revisi.kurangBelumTertutup.length > 0 && (
              <p className="mt-2 text-[12.5px] text-[#9B1C23]">
                Kekurangan yang belum tertutup sisa mana pun: {rp(revisi.kurangBelumTertutup.reduce((s, k) => s + k.jumlah, 0))} pada {revisi.kurangBelumTertutup.length} baris.
              </p>
            )}
            <div className="mt-4 rounded-xl border border-[#E3E8EE] bg-[#F8FAFC] p-3">
              <p className="text-[13px] font-bold text-[#13213A]">Catatan alasan revisi (draf, tidak disimpan)</p>
              <textarea className={`${INPUT} mt-2 min-h-[72px] w-full`} value={alasanRevisi} onChange={(e) => setAlasanRevisi(e.target.value)} placeholder="Alasan revisi, minimal 20 karakter" />
              <p className={`mt-1 text-[12px] ${alasanRevisiSah(alasanRevisi) ? "text-[#0B6B3F]" : "text-[#6B7A90]"}`}>
                {alasanRevisiSah(alasanRevisi) ? "Alasan memenuhi syarat panjang." : `${alasanRevisi.trim().length}/20 karakter`}
              </p>
              <p className="mt-2 text-[12px] text-[#6B7A90]">
                Alur revisi: Draf → Telaah PPK → Persetujuan KPA → Pengajuan tingkat atas bila diperlukan → DIPA/POK revisi → Unggah POK baru. Jenjang persetujuan mengikuti ketentuan pengelolaan anggaran yang berlaku;
                aplikasi ini hanya menandai jenis pergeseran dan tidak memutuskan.
              </p>
            </div>
          </>
        )}
      </Kartu>

      <button type="button" className={BTN_O} onClick={keBarisPok}>
        Ke Baris POK
      </button>
    </div>
  );
}

function Angka({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div className="rounded-xl border border-[#E3E8EE] bg-white px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7A90]">{label}</div>
      <div className="mt-0.5 text-[15px] font-extrabold tabular-nums text-[#13213A]">{nilai}</div>
    </div>
  );
}
