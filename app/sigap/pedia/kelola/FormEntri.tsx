"use client";

// app/sigap/pedia/kelola/FormEntri.tsx
//
// (7 Okt 2026) SIGAP PEDIA -- formulir entri (buat / ubah / koreksi) -- permintaan user (field bagian 2a).

import { useEffect, useMemo, useState } from "react";
import { BTN, BTN_O, INPUT } from "../../admin/ui";
import { KANAL, SIFAT, JENIS_TAUTAN } from "@/lib/pedia/umum";
import { ambilP } from "../api";
import { SesiBerakhir } from "../../admin/api";

export type Referensi = {
  kategori: { id: number; kode: string; nama: string; induk_id: number | null; aktif: boolean }[];
  regulasi: { id: number; jenis: string; nomor: string; tahun: number; judul: string | null; status: string }[];
  kegiatan: { id: number; nama: string }[];
  kontrak: { id: number; tahun: number; nomor_urut: number | null; nama: string }[];
  organik: { id: number; nama: string }[];
};

export type NilaiForm = {
  kategori_id: number | "";
  kanal: string;
  kanal_lain: string;
  nomor_tiket: string;
  tgl_diajukan: string;
  tgl_dijawab: string;
  sifat: string;
  judul: string;
  pertanyaan: string;
  jawaban: string;
  kesimpulan: string;
  url_tiket: string;
  nota_dinas_srikandi: string;
  keputusan_ppk: string;
  penanya_akun_id: number | "";
  penanya_nama: string;
  tim: string;
  tag: string[];
  regulasi: { regulasi_id: number; pasal: string }[];
  tautan: { jenis: string; ref_id: number | null; ref_teks: string | null }[];
};

export const FORM_KOSONG: NilaiForm = {
  kategori_id: "",
  kanal: "hai_djpb",
  kanal_lain: "",
  nomor_tiket: "",
  tgl_diajukan: "",
  tgl_dijawab: "",
  sifat: "referensi",
  judul: "",
  pertanyaan: "",
  jawaban: "",
  kesimpulan: "",
  url_tiket: "",
  nota_dinas_srikandi: "",
  keputusan_ppk: "",
  penanya_akun_id: "",
  penanya_nama: "",
  tim: "",
  tag: [],
  regulasi: [],
  tautan: [],
};

const LABEL = "text-[12px] font-semibold text-[#4D5B6B]";

function Kolom({ label, children, lebar = false, ket }: { label: string; children: React.ReactNode; lebar?: boolean; ket?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${lebar ? "sm:col-span-2" : ""}`}>
      <span className={LABEL}>{label}</span>
      {children}
      {ket && <span className="text-[11.5px] text-[#7B8794]">{ket}</span>}
    </label>
  );
}

function InputTag({ nilai, onUbah, mati }: { nilai: string[]; onUbah: (t: string[]) => void; mati: boolean }) {
  const [ketik, setKetik] = useState("");
  const [saran, setSaran] = useState<string[]>([]);
  useEffect(() => {
    const t = setTimeout(() => {
      ambilP<{ tag: string[] }>({ bagian: "tag", q: ketik })
        .then((d) => setSaran(d.tag.filter((x) => !nilai.includes(x))))
        .catch((e) => !(e instanceof SesiBerakhir) && setSaran([]));
    }, 200);
    return () => clearTimeout(t);
  }, [ketik, nilai]);
  const tambah = (t: string) => {
    const x = t.toLowerCase().trim().replace(/^#/, "");
    if (x && !nilai.includes(x)) onUbah([...nilai, x]);
    setKetik("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 rounded-lg border border-[#E3E8EE] bg-white p-1.5">
        {nilai.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-[#E3EEFB] px-2 py-0.5 text-[12px] text-[#1F6FD1]">
            #{t}
            {!mati && (
              <button type="button" aria-label={`Hapus tag ${t}`} onClick={() => onUbah(nilai.filter((x) => x !== t))}>
                ×
              </button>
            )}
          </span>
        ))}
        {!mati && (
          <input
            value={ketik}
            onChange={(e) => setKetik(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                tambah(ketik);
              }
            }}
            list="saran-tag"
            placeholder="ketik tag lalu Enter (mis. pulang-pergi, visum)"
            className="min-w-[180px] flex-1 border-0 bg-transparent px-1 text-[13px] outline-none"
          />
        )}
        <datalist id="saran-tag">
          {saran.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
      {!mati && saran.length > 0 && ketik && (
        <div className="mt-1 flex flex-wrap gap-1">
          {saran.slice(0, 8).map((s) => (
            <button key={s} type="button" className="rounded-full bg-[#F3F5F8] px-2 py-0.5 text-[11.5px] text-[#4D5B6B] hover:bg-[#E3EEFB]" onClick={() => tambah(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FormEntri({
  awal,
  refr,
  mati,
  sibuk,
  labelSimpan,
  onSimpan,
  onBatal,
}: {
  awal: NilaiForm;
  refr: Referensi;
  mati: boolean;
  sibuk: boolean;
  labelSimpan: string;
  onSimpan: (v: NilaiForm) => void;
  onBatal?: () => void;
}) {
  const [v, setV] = useState<NilaiForm>(awal);
  useEffect(() => setV(awal), [awal]);
  const set = <K extends keyof NilaiForm>(k: K, x: NilaiForm[K]) => setV((o) => ({ ...o, [k]: x }));
  const induk = useMemo(() => refr.kategori.filter((k) => !k.induk_id), [refr]);
  const [tautJenis, setTautJenis] = useState("kegiatan");
  const [tautRef, setTautRef] = useState("");
  const [tautTeks, setTautTeks] = useState("");

  const labelTautan = (t: NilaiForm["tautan"][number]) => {
    if (t.jenis === "kegiatan") return refr.kegiatan.find((k) => k.id === t.ref_id)?.nama ?? `Kegiatan #${t.ref_id}`;
    if (t.jenis === "kontrak_paket") {
      const k = refr.kontrak.find((x) => x.id === t.ref_id);
      return k ? `Paket ${k.tahun} No ${k.nomor_urut ?? "-"} · ${k.nama}` : `Paket #${t.ref_id}`;
    }
    return `${JENIS_TAUTAN[t.jenis] ?? t.jenis}: ${t.ref_id ? `#${t.ref_id} ` : ""}${t.ref_teks ?? ""}`;
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSimpan(v);
      }}
      className="space-y-4"
    >
      <fieldset disabled={mati} className="grid gap-3 sm:grid-cols-2">
        <Kolom label="Sub-kategori *" ket="Menentukan kode nomor registrasi (mis. PD.04). Kode lama tetap bila dikoreksi kemudian.">
          <select required value={v.kategori_id} onChange={(e) => set("kategori_id", e.target.value ? Number(e.target.value) : "")} className={INPUT}>
            <option value="">— pilih —</option>
            {induk.map((k) => (
              <optgroup key={k.id} label={`${k.kode} ${k.nama}`}>
                {refr.kategori
                  .filter((s) => s.induk_id === k.id && (s.aktif || s.id === v.kategori_id))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.kode} {s.nama}
                      {s.aktif ? "" : " (nonaktif)"}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </Kolom>
        <Kolom label="Sifat jawaban">
          <select value={v.sifat} onChange={(e) => set("sifat", e.target.value)} className={INPUT}>
            {Object.entries(SIFAT).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Kolom>
        <Kolom label="Kanal">
          <select value={v.kanal} onChange={(e) => set("kanal", e.target.value)} className={INPUT}>
            {Object.entries(KANAL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Kolom>
        {v.kanal === "lainnya" ? (
          <Kolom label="Nama kanal lain">
            <input value={v.kanal_lain} onChange={(e) => set("kanal_lain", e.target.value)} className={INPUT} />
          </Kolom>
        ) : (
          <Kolom label="Nomor tiket / surat kanal" ket="Contoh: 20261002-GTZWQS. Terisi otomatis dari .eml bila kosong.">
            <input value={v.nomor_tiket} onChange={(e) => set("nomor_tiket", e.target.value)} className={`${INPUT} font-mono`} />
          </Kolom>
        )}
        {v.kanal === "lainnya" && (
          <Kolom label="Nomor tiket / surat kanal">
            <input value={v.nomor_tiket} onChange={(e) => set("nomor_tiket", e.target.value)} className={`${INPUT} font-mono`} />
          </Kolom>
        )}
        <Kolom label="Tanggal pertanyaan diajukan">
          <input type="date" value={v.tgl_diajukan} onChange={(e) => set("tgl_diajukan", e.target.value)} className={INPUT} />
        </Kolom>
        <Kolom label="Tanggal jawaban diterima" ket="Terisi otomatis dari tanggal .eml bila kosong.">
          <input type="date" value={v.tgl_dijawab} onChange={(e) => set("tgl_dijawab", e.target.value)} className={INPUT} />
        </Kolom>
        <Kolom label="Judul (dalam bentuk pertanyaan) *" lebar>
          <input required value={v.judul} onChange={(e) => set("judul", e.target.value)} placeholder="Apakah SPD perjalanan PP harian wajib ditandatangani pejabat tujuan setiap hari?" className={INPUT} />
        </Kolom>
        <Kolom label="Pertanyaan lengkap" lebar>
          <textarea rows={5} value={v.pertanyaan} onChange={(e) => set("pertanyaan", e.target.value)} className={INPUT} />
        </Kolom>
        <Kolom label="Jawaban lengkap" lebar>
          <textarea rows={7} value={v.jawaban} onChange={(e) => set("jawaban", e.target.value)} className={INPUT} />
        </Kolom>
        <Kolom label="Kesimpulan praktis (1–3 kalimat)" lebar ket="Ditampilkan di kartu ensiklopedia — tulis yang langsung bisa dipakai pegawai lain.">
          <textarea rows={3} value={v.kesimpulan} onChange={(e) => set("kesimpulan", e.target.value)} className={INPUT} />
        </Kolom>
        <Kolom label="Tag" lebar>
          <InputTag nilai={v.tag} onUbah={(t) => set("tag", t)} mati={mati} />
        </Kolom>

        <div className="sm:col-span-2">
          <span className={LABEL}>Dasar hukum</span>
          <div className="mt-1 space-y-1.5">
            {v.regulasi.map((r, i) => {
              const reg = refr.regulasi.find((x) => x.id === r.regulasi_id);
              return (
                <div key={r.regulasi_id} className="flex flex-wrap items-center gap-2 rounded-lg border border-[#E3E8EE] bg-[#F8FAFC] px-2.5 py-1.5 text-[13px]">
                  <span className="font-semibold">
                    {reg ? `${reg.jenis} ${reg.nomor}` : `#${r.regulasi_id}`}
                  </span>
                  {reg && reg.status !== "berlaku" && <span className="text-[11.5px] font-semibold text-[#B5352D]">({reg.status})</span>}
                  <input
                    value={r.pasal}
                    onChange={(e) => set("regulasi", v.regulasi.map((x, j) => (j === i ? { ...x, pasal: e.target.value } : x)))}
                    placeholder="pasal/ayat (opsional)"
                    className={`${INPUT} h-8 w-48`}
                  />
                  {!mati && (
                    <button type="button" className="ml-auto text-[12px] text-[#B5352D]" onClick={() => set("regulasi", v.regulasi.filter((_, j) => j !== i))}>
                      hapus
                    </button>
                  )}
                </div>
              );
            })}
            {!mati && (
              <select
                value=""
                onChange={(e) => {
                  const id = Number(e.target.value);
                  if (id && !v.regulasi.some((r) => r.regulasi_id === id)) set("regulasi", [...v.regulasi, { regulasi_id: id, pasal: "" }]);
                }}
                className={INPUT}
              >
                <option value="">+ tambah dasar hukum dari master regulasi…</option>
                {refr.regulasi.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.jenis} {r.nomor} ({r.tahun}){r.status !== "berlaku" ? ` — ${r.status}` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="sm:col-span-2">
          <span className={LABEL}>Tautan ke kegiatan / SPJ / paket di SIGAP</span>
          <div className="mt-1 space-y-1.5">
            {v.tautan.map((t, i) => (
              <div key={`${t.jenis}-${t.ref_id}-${t.ref_teks}`} className="flex items-center gap-2 rounded-lg border border-[#E3E8EE] bg-[#F8FAFC] px-2.5 py-1.5 text-[13px]">
                <span className="flex-1">{labelTautan(t)}</span>
                {!mati && (
                  <button type="button" className="text-[12px] text-[#B5352D]" onClick={() => set("tautan", v.tautan.filter((_, j) => j !== i))}>
                    hapus
                  </button>
                )}
              </div>
            ))}
            {!mati && (
              <div className="flex flex-wrap gap-2">
                <select value={tautJenis} onChange={(e) => (setTautJenis(e.target.value), setTautRef(""), setTautTeks(""))} className={INPUT}>
                  {Object.entries(JENIS_TAUTAN).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
                {tautJenis === "kegiatan" ? (
                  <select value={tautRef} onChange={(e) => setTautRef(e.target.value)} className={`${INPUT} min-w-[220px] flex-1`}>
                    <option value="">— pilih kegiatan —</option>
                    {refr.kegiatan.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.nama}
                      </option>
                    ))}
                  </select>
                ) : tautJenis === "kontrak_paket" ? (
                  <select value={tautRef} onChange={(e) => setTautRef(e.target.value)} className={`${INPUT} min-w-[220px] flex-1`}>
                    <option value="">— pilih paket —</option>
                    {refr.kontrak.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.tahun} No {k.nomor_urut ?? "-"} · {k.nama}
                      </option>
                    ))}
                  </select>
                ) : tautJenis === "penugasan" ? (
                  <input value={tautRef} onChange={(e) => setTautRef(e.target.value.replace(/\D/g, ""))} placeholder="ID penugasan (lihat Admin > Penugasan)" className={`${INPUT} w-60`} />
                ) : (
                  <input value={tautTeks} onChange={(e) => setTautTeks(e.target.value)} placeholder={tautJenis === "akun_anggaran" ? "MAK / akun, mis. 054.01.GG.2902.524113" : "uraian"} className={`${INPUT} min-w-[220px] flex-1`} />
                )}
                <button
                  type="button"
                  className={BTN_O}
                  onClick={() => {
                    const ref_id = tautRef ? Number(tautRef) : null;
                    const ref_teks = tautTeks.trim() || null;
                    if (!ref_id && !ref_teks) return;
                    set("tautan", [...v.tautan, { jenis: tautJenis, ref_id, ref_teks }]);
                    setTautRef("");
                    setTautTeks("");
                  }}
                >
                  + Tautkan
                </button>
              </div>
            )}
          </div>
        </div>

        <Kolom label="Penanya (pegawai)">
          <select
            value={v.penanya_akun_id}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : "";
              setV((o) => ({ ...o, penanya_akun_id: id, penanya_nama: id ? refr.organik.find((x) => x.id === id)?.nama ?? o.penanya_nama : o.penanya_nama }));
            }}
            className={INPUT}
          >
            <option value="">— pilih pegawai organik —</option>
            {refr.organik.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nama}
              </option>
            ))}
          </select>
        </Kolom>
        <Kolom label="Tim">
          <input value={v.tim} onChange={(e) => set("tim", e.target.value)} placeholder="mis. Tim Kesra" className={INPUT} />
        </Kolom>
        <Kolom label="Nomor Nota Dinas SRIKANDI (opsional)">
          <input value={v.nota_dinas_srikandi} onChange={(e) => set("nota_dinas_srikandi", e.target.value)} className={INPUT} />
        </Kolom>
        <Kolom label="Keputusan PPK (opsional)">
          <input value={v.keputusan_ppk} onChange={(e) => set("keputusan_ppk", e.target.value)} className={INPUT} />
        </Kolom>
        <Kolom label="URL tiket asli di portal" lebar ket="Disimpan sebagai teks saja — tiket portal bisa kedaluwarsa; bukti utama adalah file yang diunggah.">
          <input value={v.url_tiket} onChange={(e) => set("url_tiket", e.target.value)} className={INPUT} />
        </Kolom>
      </fieldset>
      {!mati && (
        <div className="flex gap-2">
          <button type="submit" className={BTN} disabled={sibuk}>
            {sibuk ? "Menyimpan…" : labelSimpan}
          </button>
          {onBatal && (
            <button type="button" className={BTN_O} onClick={onBatal}>
              Batal
            </button>
          )}
        </div>
      )}
    </form>
  );
}
