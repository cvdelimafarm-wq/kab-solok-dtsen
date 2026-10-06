"use client";

// app/sigap/akses/PeranIzin.tsx
//
// (5 Okt 2026) Tab 🎭 Peran & Izin -- matriks menu × peran dikelompokkan per portal (mockup layar 6).
// Tiap sel select '–' / 'Lihat' / 'Kelola', disimpan langsung per perubahan (aksi simpan_izin) dgn
// indikator per sel. Form ＋ Peran baru / ubah peran (aksi buat_peran). -- permintaan user.

import { useState } from "react";
import { aksi, pesanGalat, SesiBerakhir } from "../admin/api";
import { BTN, BTN_O, Chip, INPUT, Kartu, Pesan, TabelKartu, TD, TH } from "../admin/ui";
import { ikonPortal, kelompokPortal, type DataAkses, type Izin, type Peran } from "./tipe";

type StatusSel = "simpan" | "ok" | "galat";

export default function PeranIzin({ data, setData, onMuatUlang }: { data: DataAkses; setData: React.Dispatch<React.SetStateAction<DataAkses | null>>; onMuatUlang: () => void | Promise<void> }) {
  const [status, setStatus] = useState<Record<string, StatusSel>>({});
  const [galat, setGalat] = useState<string | null>(null);
  const [formPeran, setFormPeran] = useState<Peran | "baru" | null>(null);
  const kelola = data.boleh_kelola;
  const grup = kelompokPortal(data.menu);
  const level = (peranId: number, menu: string) => data.izin.find((i) => i.peran_id === peranId && i.menu_kode === menu)?.level ?? null;

  async function ubahIzin(p: Peran, menu: string, lv: "lihat" | "kelola" | null) {
    const kunci = `${p.id}|${menu}`;
    const lamaLv = level(p.id, menu);
    // (5 Okt 2026) pembaruan fungsional supaya perubahan beruntun di sel lain tidak saling menimpa
    const pasang = (x: "lihat" | "kelola" | null) =>
      setData((d) => {
        if (!d) return d;
        const izin: Izin[] = d.izin.filter((i) => !(i.peran_id === p.id && i.menu_kode === menu));
        if (x) izin.push({ peran_id: p.id, menu_kode: menu, level: x });
        return { ...d, izin };
      });
    pasang(lv); // optimistis
    setStatus((s) => ({ ...s, [kunci]: "simpan" }));
    setGalat(null);
    try {
      await aksi("simpan_izin", { peran_id: p.id, menu_kode: menu, level: lv });
      setStatus((s) => ({ ...s, [kunci]: "ok" }));
      setTimeout(() => setStatus((s) => (s[kunci] === "ok" ? Object.fromEntries(Object.entries(s).filter(([k]) => k !== kunci)) : s)), 2000);
    } catch (e) {
      pasang(lamaLv);
      setStatus((s) => ({ ...s, [kunci]: "galat" }));
      if (!(e instanceof SesiBerakhir)) setGalat(`${p.nama} · ${menu}: ${pesanGalat(e)}`);
    }
  }

  return (
    <div className="space-y-3">
      {galat && <Pesan onTutup={() => setGalat(null)}>{galat}</Pesan>}
      <Kartu
        judul="Matriks izin per peran"
        ket="“Kelola” sudah termasuk “Lihat”. Perubahan langsung tersimpan."
        kanan={
          kelola ? (
            <button type="button" className={BTN_O} onClick={() => setFormPeran(formPeran === "baru" ? null : "baru")}>
              ＋ Peran baru
            </button>
          ) : undefined
        }
      />

      {formPeran && kelola && (
        <FormPeran
          key={formPeran === "baru" ? "baru" : formPeran.id}
          peran={formPeran === "baru" ? null : formPeran}
          onTutup={() => setFormPeran(null)}
          onTersimpan={async () => {
            setFormPeran(null);
            await onMuatUlang();
          }}
        />
      )}

      <TabelKartu>
        <thead>
          <tr>
            <th className={`${TH} sticky left-0 z-10 min-w-[220px]`}>Portal / menu</th>
            {data.peran.map((p) => (
              <th key={p.id} className={`${TH} min-w-[120px] text-center`}>
                <span className="block text-[11.5px] text-[#14202E]">{p.nama}</span>
                <span className="block font-semibold normal-case text-[#7B8794]">{p.butuh_lingkup ? "per kegiatan" : "semua kegiatan"}</span>
                {kelola && (
                  <button type="button" onClick={() => setFormPeran(p)} className="mt-0.5 text-[10.5px] font-bold text-[#1F6FD1] underline">
                    ubah
                  </button>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={data.peran.length + 1} className="border-t border-[#EDF0F4] bg-[#F8FAFC] px-3 py-2 font-extrabold">
              🚌 Transport Lokal (petugas)
            </td>
          </tr>
          <tr>
            <td className={`${TD} sticky left-0 z-10 bg-white`}>
              Isi laporan, foto, hari kerja, arsip SPJ saya
              <span className="block text-[11px] text-[#7B8794]">Otomatis untuk akun yang punya penugasan aktif (tidak diatur di sini).</span>
            </td>
            {data.peran.map((p) => (
              <td key={p.id} className={`${TD} text-center`}>
                <Chip>bila ditugaskan</Chip>
              </td>
            ))}
          </tr>
          {grup.map((g) => (
            <GrupPortal key={g.portal} judul={`${ikonPortal(g.portal)} ${g.portal}`} kolom={data.peran.length + 1}>
              {g.menu.map((m) => (
                <tr key={m.kode} className="hover:bg-[#FAFBFD]">
                  <td className={`${TD} sticky left-0 z-10 bg-white`}>
                    <span className="font-semibold">{m.nama}</span>
                    {m.keterangan && <span className="block text-[11px] text-[#7B8794]">{m.keterangan}</span>}
                  </td>
                  {data.peran.map((p) => {
                    const lv = level(p.id, m.kode);
                    const st = status[`${p.id}|${m.kode}`];
                    const terkunci = p.kode === "admin_anggaran" && m.kode === "akses.kelola";
                    return (
                      <td key={p.id} className={`${TD} text-center`}>
                        {kelola && !terkunci ? (
                          <span className="inline-flex items-center gap-1">
                            <select
                              value={lv ?? ""}
                              onChange={(e) => ubahIzin(p, m.kode, (e.target.value || null) as "lihat" | "kelola" | null)}
                              disabled={st === "simpan"}
                              aria-label={`${m.nama} untuk ${p.nama}`}
                              className={`${INPUT} py-1 text-[12px] font-bold ${lv === "kelola" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : lv === "lihat" ? "border-sky-200 bg-sky-50 text-sky-800" : "text-slate-400"}`}
                            >
                              <option value="">–</option>
                              <option value="lihat">Lihat</option>
                              <option value="kelola">Kelola</option>
                            </select>
                            <span className="w-3 text-[11px]" aria-live="polite">
                              {st === "simpan" ? "…" : st === "ok" ? <span className="text-emerald-700">✓</span> : st === "galat" ? <span className="text-red-600">!</span> : ""}
                            </span>
                          </span>
                        ) : lv ? (
                          <span title={terkunci ? "Dikunci agar sistem tidak terkunci" : undefined}>
                            <Chip w="ok">
                              {lv === "kelola" ? "Kelola" : "Lihat"}
                              {terkunci ? " 🔒" : ""}
                            </Chip>
                          </span>
                        ) : (
                          <span className="text-slate-400">–</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </GrupPortal>
          ))}
          <tr>
            <td colSpan={data.peran.length + 1} className="border-t border-[#EDF0F4] bg-[#F8FAFC] px-3 py-2 font-extrabold text-[#7B8794]">
              📊 RAB/POK · Revisi · Perjadin · Honor (menyusul — otomatis muncul di sini saat modulnya dibuat)
            </td>
          </tr>
        </tbody>
      </TabelKartu>
      <p className="px-1 text-[11.5px] text-[#7B8794]">Izin “Kelola Akses” milik Admin Anggaran dikunci, supaya selalu ada yang bisa mengatur akses.</p>
    </div>
  );
}

function GrupPortal({ judul, kolom, children }: { judul: string; kolom: number; children: React.ReactNode }) {
  return (
    <>
      <tr>
        <td colSpan={kolom} className="border-t border-[#EDF0F4] bg-[#F8FAFC] px-3 py-2 font-extrabold">
          {judul}
        </td>
      </tr>
      {children}
    </>
  );
}

// ---------------------------------------------------------------------- Form peran
function FormPeran({ peran, onTutup, onTersimpan }: { peran: Peran | null; onTutup: () => void; onTersimpan: () => void | Promise<void> }) {
  const [nama, setNama] = useState(peran?.nama ?? "");
  const [kode, setKode] = useState("");
  const [ket, setKet] = useState(peran?.keterangan ?? "");
  const [lingkup, setLingkup] = useState(peran?.butuh_lingkup ?? false);
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (!nama.trim()) return setGalat("Nama peran wajib diisi.");
    setBusy(true);
    setGalat(null);
    try {
      await aksi("buat_peran", { id: peran?.id, nama: nama.trim(), kode: peran ? undefined : kode.trim() || undefined, keterangan: ket.trim(), butuh_lingkup: lingkup });
      await onTersimpan();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setBusy(false);
    }
  }

  const label = "text-[11.5px] font-bold text-[#7B8794]";
  return (
    <Kartu judul={peran ? `Ubah peran: ${peran.nama}` : "Peran baru"} ket={peran ? `kode: ${peran.kode}${peran.sistem ? " · bawaan" : ""}` : "Izinnya diatur lewat matriks di bawah."}>
      <form onSubmit={simpan} className="grid max-w-2xl grid-cols-1 items-center gap-2 sm:grid-cols-[140px_1fr]">
        <span className={label}>Nama peran</span>
        <input value={nama} onChange={(e) => setNama(e.target.value)} className={INPUT} placeholder="mis. Bendahara" />
        {!peran && (
          <>
            <span className={label}>Kode (opsional)</span>
            <input value={kode} onChange={(e) => setKode(e.target.value)} className={INPUT} placeholder="otomatis dari nama bila kosong" />
          </>
        )}
        <span className={label}>Keterangan</span>
        <input value={ket} onChange={(e) => setKet(e.target.value)} className={INPUT} placeholder="mis. Memeriksa SPJ sebelum pembayaran" />
        <span className={label}>Butuh lingkup?</span>
        <select value={lingkup ? "1" : "0"} onChange={(e) => setLingkup(e.target.value === "1")} className={INPUT}>
          <option value="1">Ya — wajib pilih kegiatan saat diberikan</option>
          <option value="0">Tidak — boleh semua kegiatan</option>
        </select>
        <span />
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={BTN} disabled={busy}>
            {busy ? "Menyimpan…" : "Simpan peran"}
          </button>
          <button type="button" className={BTN_O} onClick={onTutup}>
            Batal
          </button>
        </div>
      </form>
      {galat && (
        <div className="mt-2">
          <Pesan onTutup={() => setGalat(null)}>{galat}</Pesan>
        </div>
      )}
    </Kartu>
  );
}
