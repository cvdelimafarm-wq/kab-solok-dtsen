"use client";

// app/sigap/kontrak/page.tsx
//
// (6 Okt 2026) Portal Pengadaan & Kontrak -- permintaan user: template kontrak dari file mail merge,
// halaman pengisian data yg terisi otomatis. Tab: 📦 Paket · 🏛 Master Tahun · 🏨 Penyedia.
// Paket tidak dihapus permanen (hanya "Batalkan"); penyedia hanya dinonaktifkan.

import { useCallback, useEffect, useState } from "react";
import { bacaSesi, keMasuk, pesanGalat, SesiBerakhir, waktuWib, tglSedang } from "../admin/api";
import { BTN, BTN_O, BTN_R, Chip, INPUT, Kartu, Memuat, Pesan, TabelKartu, TD, TH, type ItemTab } from "../admin/ui";
import Bingkai from "./Bingkai";
import { aksiK, ambilK } from "./api";
import { useDetak } from "../useDetak";
import type { Penyedia } from "@/lib/kontrak/isi";

type Tab = "paket" | "master" | "penyedia";
const TAB: ItemTab<Tab>[] = [
  { kode: "paket", label: "Paket pengadaan" },
  { kode: "master", label: "Master tahun" },
  { kode: "penyedia", label: "Penyedia" },
];
type BarisPaket = { id: number; nomor_urut: number | null; nama: string; status: string; penyedia: string | null; tanggal_mulai: string | null; jumlah_item: number; nilai: string | null; diubah_at: string; diubah_oleh: string | null };
type Daftar = { kelola: boolean; tahun: number; daftar_tahun: number[]; paket: BarisPaket[] };
type Ref = { kelola: boolean; tahun: number; master: Record<string, string>; master_info: { diubah_at: string; diubah_oleh: string | null } | null; penyedia: (Penyedia & { id: number })[]; nomor_berikut: number; field_master: { k: string; label: string; contoh?: string }[] };

export default function PortalKontrak() {
  const [tab, setTab] = useState<Tab>("paket");
  const [tahun, setTahun] = useState(() => new Date().getFullYear());
  const [daftar, setDaftar] = useState<Daftar | null>(null);
  const [ref, setRef] = useState<Ref | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sesiDetak] = useState(() => (typeof window === "undefined" ? null : bacaSesi()));
  useDetak({ sesi: sesiDetak }, "kontrak");

  const muat = useCallback(async () => {
    try {
      const [d, r] = await Promise.all([ambilK<Daftar>({ bagian: "daftar", tahun }), ambilK<Ref>({ bagian: "referensi", tahun })]);
      setDaftar(d);
      setRef(r);
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, [tahun]);
  useEffect(() => {
    if (!bacaSesi()) return keMasuk();
    muat();
  }, [muat]);

  const kelola = !!daftar?.kelola;
  const pilihanTahun = Array.from(new Set([...(daftar?.daftar_tahun ?? []), new Date().getFullYear(), tahun])).sort();

  const pilihTahun = (gelap: boolean) => (
    <select
      value={tahun}
      onChange={(e) => setTahun(Number(e.target.value))}
      className={gelap ? "rounded-full bg-white/15 px-2 py-1 text-[12px] font-bold text-white" : "h-8 rounded-[7px] border border-[#E3E8EE] bg-white px-2 text-[13px] text-[#14202E]"}
      aria-label="Tahun anggaran"
    >
      {pilihanTahun.map((t) => (
        <option key={t} value={t} className="text-black">
          TA {t}
        </option>
      ))}
    </select>
  );

  return (
    <Bingkai
      jejak={["Pelaksanaan", "Pengadaan & kontrak"]}
      judul="Pengadaan & kontrak"
      sub="Isi data inti paket — nomor, tanggal, nilai & terbilang terisi otomatis. Unduh 21 dokumen kontrak per dokumen."
      kanan={pilihTahun}
      tab={TAB}
      aktifTab={tab}
      onTab={setTab}
    >
      {galat && <Pesan onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {info && (
        <Pesan jenis="ok" onTutup={() => setInfo(null)}>
          {info}
        </Pesan>
      )}
      {!daftar || !ref ? (
        <Memuat />
      ) : tab === "paket" ? (
        <TabPaket daftar={daftar} kelola={kelola} tahun={tahun} nomorBerikut={ref.nomor_berikut} onGalat={setGalat} onMuat={muat} />
      ) : tab === "master" ? (
        <TabMaster ref_={ref} kelola={kelola} tahun={tahun} onGalat={setGalat} onInfo={setInfo} onMuat={muat} />
      ) : (
        <TabPenyedia ref_={ref} kelola={kelola} onGalat={setGalat} onInfo={setInfo} onMuat={muat} />
      )}
    </Bingkai>
  );
}

function TabPaket({ daftar, kelola, tahun, nomorBerikut, onGalat, onMuat }: { daftar: Daftar; kelola: boolean; tahun: number; nomorBerikut: number; onGalat: (s: string) => void; onMuat: () => void }) {
  const [nama, setNama] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [saring, setSaring] = useState<"semua" | "draf" | "final" | "batal">("semua");
  const [cari, setCari] = useState("");
  const [bukaBaru, setBukaBaru] = useState(false);

  async function buat() {
    if (!nama.trim()) return onGalat("Isi nama kegiatan pengadaan dulu.");
    setSibuk(true);
    try {
      const r = await aksiK<{ id: number }>("buat_paket", { nama: nama.trim(), tahun });
      window.location.href = `/sigap/kontrak/${r.id}`;
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) onGalat(pesanGalat(e));
      setSibuk(false);
    }
  }
  async function duplikat(id: number) {
    setSibuk(true);
    try {
      const r = await aksiK<{ id: number }>("duplikat", { id, tahun });
      window.location.href = `/sigap/kontrak/${r.id}`;
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) onGalat(pesanGalat(e));
      setSibuk(false);
    }
  }
  async function status(id: number, st: string) {
    try {
      await aksiK("ubah_status", { id, status: st });
      onMuat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) onGalat(pesanGalat(e));
    }
  }

  // (6 Okt 2026) Tabel gaya desain user: toolbar (judul, saring status, cari, tombol utama), baris bisa diklik.
  const q = cari.trim().toLowerCase();
  const tampil = daftar.paket.filter(
    (p) => (saring === "semua" ? p.status !== "batal" : p.status === saring) && (!q || `${p.nama} ${p.penyedia ?? ""} ${p.nomor_urut ?? ""}`.toLowerCase().includes(q))
  );
  const jml = (st: string) => daftar.paket.filter((p) => p.status === st).length;
  const nDraf = jml("draf");
  const SARING: [typeof saring, string][] = [
    ["semua", "Semua"],
    ["draf", `Draf (${nDraf})`],
    ["final", `Final (${jml("final")})`],
    ["batal", `Dibatalkan (${jml("batal")})`],
  ];
  return (
    <>
      {nDraf > 0 && saring === "semua" && (
        <Pesan jenis="peringatan">
          <b>{nDraf} paket masih draf.</b> Periksa isian & peringatan di halaman paket, lalu tandai Final setelah dokumen diunduh dan ditandatangani.
        </Pesan>
      )}
      <section className="overflow-hidden rounded-[10px] border border-[#E3E8EE] bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#E3E8EE] px-[18px] py-3.5">
          <h2 className="mr-auto text-[15px] font-semibold">Daftar paket TA {tahun}</h2>
          <div className="flex overflow-hidden rounded-lg border border-[#E3E8EE]" role="group" aria-label="Saring status">
            {SARING.map(([k, l], i) => (
              <button
                key={k}
                type="button"
                aria-pressed={saring === k}
                onClick={() => setSaring(k)}
                className={`px-3 py-1.5 text-[13px] ${i > 0 ? "border-l border-[#E3E8EE]" : ""} ${saring === k ? "bg-[#E3EEFB] font-semibold text-[#1F6FD1]" : "bg-white text-[#4D5B6B] hover:bg-[#F8FAFC]"}`}
              >
                {l}
              </button>
            ))}
          </div>
          <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari paket / penyedia" aria-label="Cari paket" className={`${INPUT} h-[34px] w-full sm:w-[200px]`} />
          {kelola && (
            <button type="button" className={`${BTN} h-[34px]`} onClick={() => setBukaBaru((v) => !v)}>
              + Paket baru
            </button>
          )}
        </div>
        {kelola && bukaBaru && (
          <div className="border-b border-[#E3E8EE] bg-[#F8FAFC] px-[18px] py-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input autoFocus value={nama} onChange={(e) => setNama(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buat()} placeholder="Nama kegiatan pengadaan, mis. Pengadaan Paket Meeting Pelatihan Petugas …" className={`${INPUT} h-[34px] flex-1`} />
              <button type="button" className={`${BTN} h-[34px]`} disabled={sibuk} onClick={buat}>
                Buat & isi data
              </button>
            </div>
            <p className="mt-1.5 text-[12px] text-[#7B8794]">Nomor urut berikutnya {nomorBerikut} (bisa diubah). Paket yang mirip lebih cepat lewat “Salin” — item, MAK & penyedia ikut tersalin.</p>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-[13.5px]">
            <thead>
              <tr>
                <th className={TH}>No</th>
                <th className={TH}>Paket</th>
                <th className={TH}>Mulai kerja</th>
                <th className={`${TH} text-right`}>Nilai kontrak</th>
                <th className={TH}>Status</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {tampil.map((p) => (
                <tr key={p.id} tabIndex={0} onClick={() => (window.location.href = `/sigap/kontrak/${p.id}`)} onKeyDown={(e) => e.key === "Enter" && (window.location.href = `/sigap/kontrak/${p.id}`)} className="cursor-pointer hover:bg-[#F8FAFC] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#1F6FD1]">
                  <td className={`${TD} font-semibold tabular-nums`}>{p.nomor_urut ?? "–"}</td>
                  <td className={`${TD} max-w-[460px]`}>
                    <div className="truncate font-semibold text-[#14202E]" title={p.nama}>
                      {p.nama || "(tanpa nama)"}
                    </div>
                    <div className="text-[12px] text-[#7B8794]">
                      {p.penyedia ?? "penyedia belum dipilih"} · {p.jumlah_item} item · diubah {waktuWib(p.diubah_at)}
                      {p.diubah_oleh ? ` oleh ${p.diubah_oleh}` : ""}
                    </div>
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>{p.tanggal_mulai ? tglSedang(p.tanggal_mulai) : "–"}</td>
                  <td className={`${TD} whitespace-nowrap text-right tabular-nums`}>{p.nilai ? `Rp${p.nilai}` : "–"}</td>
                  <td className={TD}>
                    <Chip w={p.status === "final" ? "ok" : p.status === "batal" ? "bad" : "wait"}>{p.status === "final" ? "Final" : p.status === "batal" ? "Dibatalkan" : "Draf"}</Chip>
                  </td>
                  <td className={`${TD} whitespace-nowrap`} onClick={(e) => e.stopPropagation()}>
                    {kelola && (
                      <div className="flex justify-end gap-1.5">
                        <button type="button" className={BTN_O} disabled={sibuk} onClick={() => duplikat(p.id)} title="Buat paket baru dari salinan paket ini">
                          Salin
                        </button>
                        {p.status === "draf" && (
                          <button type="button" className={BTN_O} onClick={() => status(p.id, "final")} title="Tandai paket selesai">
                            Final
                          </button>
                        )}
                        {p.status !== "batal" ? (
                          <button type="button" className={BTN_R} onClick={() => confirm("Batalkan paket ini? Data tetap tersimpan dan bisa dipulihkan.") && status(p.id, "batal")}>
                            Batalkan
                          </button>
                        ) : (
                          <button type="button" className={BTN_O} onClick={() => status(p.id, "draf")}>
                            Pulihkan
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tampil.length === 0 && (
            <div className="px-[18px] py-10 text-center text-[#4D5B6B]">
              Tidak ada paket yang cocok.{" "}
              {(q || saring !== "semua") && (
                <button
                  type="button"
                  className="text-[#1F6FD1]"
                  onClick={() => {
                    setCari("");
                    setSaring("semua");
                  }}
                >
                  Hapus saringan
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-between border-t border-[#E3E8EE] px-[18px] py-2.5 text-[12.5px] text-[#7B8794]">
          <span>
            Menampilkan {tampil.length} dari {daftar.paket.length} paket
          </span>
          <span>Klik baris untuk membuka & mengisi data</span>
        </div>
      </section>
    </>
  );
}

function TabMaster({ ref_, kelola, tahun, onGalat, onInfo, onMuat }: { ref_: Ref; kelola: boolean; tahun: number; onGalat: (s: string) => void; onInfo: (s: string) => void; onMuat: () => void }) {
  const [data, setData] = useState<Record<string, string>>(ref_.master);
  const [sibuk, setSibuk] = useState(false);
  useEffect(() => setData(ref_.master), [ref_.master]);
  const kosong = ref_.field_master.filter((f) => !String(data[f.k] ?? "").trim());

  async function simpan() {
    setSibuk(true);
    try {
      await aksiK("simpan_master", { tahun, data });
      onInfo(`Master TA ${tahun} tersimpan. Paket TA ${tahun} otomatis memakai data ini.`);
      onMuat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) onGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }
  return (
    <Kartu
      judul={`Master TA ${tahun}`}
      ket={ref_.master_info ? `diubah ${waktuWib(ref_.master_info.diubah_at)}${ref_.master_info.diubah_oleh ? " · " + ref_.master_info.diubah_oleh : ""}` : "belum ada — isi lalu simpan"}
      kanan={
        kelola && (
          <button type="button" className={BTN} disabled={sibuk} onClick={simpan}>
            Simpan master
          </button>
        )
      }
    >
      {kosong.length > 0 && (
        <Pesan jenis="peringatan">
          Belum diisi: {kosong.map((f) => f.label).join(", ")}. Isian kosong akan tampil kosong di dokumen.
        </Pesan>
      )}
      <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
        {ref_.field_master.map((f) => (
          <label key={f.k} className={`flex flex-col gap-1 ${f.k === "DIPA" || f.k === "Alamat" ? "sm:col-span-2" : ""}`}>
            <span className="text-[11.5px] font-bold text-[#4D5B6B]">{f.label}</span>
            <input value={data[f.k] ?? ""} placeholder={f.contoh ?? ""} disabled={!kelola} onChange={(e) => setData((d) => ({ ...d, [f.k]: e.target.value }))} className={`${INPUT} ${!String(data[f.k] ?? "").trim() ? "border-amber-400 bg-amber-50" : ""}`} />
          </label>
        ))}
      </div>
    </Kartu>
  );
}

const KOLOM_PENYEDIA: { k: keyof Penyedia; label: string; lebar?: boolean }[] = [
  { k: "nama", label: "Nama badan usaha (sesuai akta)", lebar: true },
  { k: "bidang", label: "Bidang pekerjaan" },
  { k: "kota", label: "Kota" },
  { k: "alamat", label: "Alamat lengkap", lebar: true },
  { k: "npwp", label: "NPWP" },
  { k: "nik", label: "NIK pimpinan" },
  { k: "label_pimpinan", label: "Jabatan pimpinan (mis. Direktur, Manager)" },
  { k: "nama_pimpinan", label: "Nama pimpinan" },
  { k: "bank", label: "Bank" },
  { k: "nomor_rekening", label: "Nomor rekening" },
  { k: "nama_rekening", label: "Nama pada rekening" },
];

function TabPenyedia({ ref_, kelola, onGalat, onInfo, onMuat }: { ref_: Ref; kelola: boolean; onGalat: (s: string) => void; onInfo: (s: string) => void; onMuat: () => void }) {
  const [edit, setEdit] = useState<(Penyedia & { id?: number }) | null>(null);
  const [sibuk, setSibuk] = useState(false);
  async function simpan(p: Penyedia & { id?: number; aktif?: boolean }) {
    setSibuk(true);
    try {
      await aksiK("simpan_penyedia", { penyedia: p });
      onInfo(p.aktif === false ? "Penyedia dinonaktifkan." : "Penyedia tersimpan.");
      setEdit(null);
      onMuat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) onGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }
  return (
    <>
      {edit && (
        <Kartu judul={edit.id ? "Ubah penyedia" : "Penyedia baru"}>
          <div className="grid gap-2.5 sm:grid-cols-3">
            {KOLOM_PENYEDIA.map((c) => (
              <label key={c.k} className={`flex flex-col gap-1 ${c.lebar ? "sm:col-span-3" : ""}`}>
                <span className="text-[11.5px] font-bold text-[#4D5B6B]">{c.label}</span>
                <input value={String(edit[c.k] ?? "")} onChange={(e) => setEdit({ ...edit, [c.k]: e.target.value })} className={INPUT} />
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" className={BTN} disabled={sibuk} onClick={() => simpan(edit)}>
              Simpan
            </button>
            <button type="button" className={BTN_O} onClick={() => setEdit(null)}>
              Batal
            </button>
          </div>
        </Kartu>
      )}
      <Kartu
        judul="Daftar penyedia"
        ket={`${ref_.penyedia.length} aktif · dipakai sebagai penyedia terpilih maupun pembanding survei harga`}
        kanan={
          kelola && (
            <button type="button" className={BTN} onClick={() => setEdit({ nama: "" })}>
              + Penyedia
            </button>
          )
        }
      />
      <TabelKartu>
        <thead>
          <tr>
            <th className={TH}>Nama</th>
            <th className={TH}>Bidang</th>
            <th className={TH}>Kota</th>
            <th className={TH}>Pimpinan</th>
            <th className={TH}>NPWP</th>
            <th className={TH}>Rekening</th>
            <th className={TH}></th>
          </tr>
        </thead>
        <tbody>
          {ref_.penyedia.map((p) => {
            const kurang = !p.npwp || !p.alamat || !p.nama_pimpinan || !p.nomor_rekening;
            return (
              <tr key={p.id} className="hover:bg-[#F8FAFC]">
                <td className={`${TD} font-semibold`}>
                  {p.nama} {kurang && <Chip w="wait">data belum lengkap</Chip>}
                </td>
                <td className={`${TD} text-[12px]`}>{p.bidang ?? "–"}</td>
                <td className={TD}>{p.kota ?? "–"}</td>
                <td className={`${TD} text-[12px]`}>{p.nama_pimpinan ? `${p.nama_pimpinan} (${p.label_pimpinan ?? "–"})` : "–"}</td>
                <td className={`${TD} text-[12px]`}>{p.npwp ?? "–"}</td>
                <td className={`${TD} text-[12px]`}>{p.nomor_rekening ? `${p.bank ?? ""} ${p.nomor_rekening}` : "–"}</td>
                <td className={`${TD} whitespace-nowrap`}>
                  {kelola && (
                    <div className="flex gap-1.5">
                      <button type="button" className={BTN_O} onClick={() => setEdit(p)}>
                        Ubah
                      </button>
                      <button type="button" className={BTN_R} onClick={() => confirm(`Nonaktifkan ${p.nama}? (tidak dihapus)`) && simpan({ ...p, aktif: false })}>
                        Nonaktifkan
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </TabelKartu>
    </>
  );
}
