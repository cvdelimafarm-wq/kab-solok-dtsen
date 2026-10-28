"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/page.tsx
//
// (25 Okt 2026) Satu survei: formulir identifikasi (A-F), pengesahan (PPK dan TU paralel, KPA terakhir), kematangan Fix/Perkiraan, penegasan H-15, cek anggaran terhadap POK RO,
// serta turunan hilir. Data dibaca lewat gerbang baca (keu_v_ident*), ditulis lewat fungsi keu_ident_* (hak ditegakkan basis data).
// Formulir terkunci selama menunggu persetujuan dan setelah sah; perubahan sesudahnya lewat Ajukan revisi.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import LencanaNotif from "../../notifikasi/LencanaNotif";
import { useParams } from "next/navigation";
import Bingkai from "@/app/sigap/kontrak/Bingkai";
import { Catatan, Chip, Galat, Kosong, Memuat } from "@/app/sigap/keu-ui";
import { aksiKeu, useKirim } from "@/app/sigap/ro/useKeu";
import { bedaForm, dampakRevisi, kematangan, normalisasi, periksa, sesudahH15, tanggalH15, tglIndo, type Form } from "@/lib/keu/identifikasi";
import { aksiTersedia, labelStatus, namaVersi, type AksiIdent, type UpdTercatat } from "@/lib/keu/identifikasiHilir";
import Formulir, { type OpsiRujukan } from "../Formulir";
import { KartuAnggaran, KartuH15, KartuHasil, KartuHilir, KartuKematangan, KartuPengesahan, KartuRiwayat } from "../Panel";
import { hariIniWib, useDaftarIdent, useIdent, usePokRo } from "../useIdent";

function Isi() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = /^\d+$/.test(idParam ?? "") ? Number(idParam) : null;
  const { row, riwayat, hak, hakSiap, memuat, galat, muatSemua } = useIdent(id);
  const daftar = useDaftarIdent();
  const pokRo = usePokRo(row?.ro_kode ?? null);
  const kirim = useKirim(muatSemua);

  const [f, setF] = useState<Form | null>(null);
  const [dirty, setDirty] = useState(false);
  const [alasan, setAlasan] = useState("");
  const [pa, setPa] = useState("");
  const [paHilir, setPaHilir] = useState("");
  const dimuat = useRef<string | null>(null);

  // isi lokal diambil dari basis data bila belum ada suntingan lokal; hanya saat baris benar-benar berganti (id atau waktu ubah)
  useEffect(() => {
    if (!row || dirty) return;
    const tanda = `${row.id}|${row.diubah_at}`;
    if (dimuat.current === tanda) return;
    dimuat.current = tanda;
    setF(normalisasi(row.form));
    setAlasan(row.alasan_revisi ?? "");
  }, [row, dirty]);

  const ubah = useCallback((fn: (g: Form) => void) => {
    setF((prev) => {
      if (!prev) return prev;
      const g = JSON.parse(JSON.stringify(prev)) as Form;
      fn(g);
      return g;
    });
    setDirty(true);
  }, []);

  const tahun = row?.tahun ?? new Date().getFullYear();
  const terkunciStatus = !row || !(row.status === "draf" || row.status === "revisi");
  const bolehSusun = hak.susun && !terkunciStatus;
  const formSah = useMemo(() => (row?.form_sah ? normalisasi(row.form_sah) : null), [row?.form_sah]);
  const upd = (row?.upd ?? null) as Record<string, UpdTercatat> | null;

  const rujukan = useMemo<OpsiRujukan[]>(() => (daftar.baris ?? []).filter((r) => r.id !== id && r.status !== "dibatalkan").map((r) => ({ nama: r.nama, ro: r.ro_kode, sah: r.ver >= 1 })), [daftar.baris, id]);
  const rujukanDipilih = f?.berbagi && f.rujukan ? rujukan.find((r) => r.nama === f.rujukan) ?? null : null;
  const hasil = useMemo(() => (f ? periksa(f, tahun, { rujukan: rujukanDipilih }) : { masalah: [], peringatan: [] }), [f, tahun, rujukanDipilih]);
  const kem = useMemo(() => (f ? kematangan(f) : { butir: [], nFix: 0, nPerk: 0 }), [f]);
  const beda = useMemo(() => (f && formSah ? bedaForm(formSah, f) : []), [f, formSah]);
  const dampak = useMemo(() => (f && formSah ? dampakRevisi(formSah, f) : ""), [f, formSah]);

  const syarat: string[] = [];
  if (row && (row.status === "draf" || row.status === "revisi")) {
    if (hasil.masalah.length > 0) syarat.push(`${hasil.masalah.length} hal wajib belum lengkap (lihat Hasil identifikasi).`);
    if (row.status === "revisi" && alasan.trim().length < 10) syarat.push("Alasan revisi wajib diisi (minimal 10 huruf).");
    if (row.status === "revisi" && beda.length === 0) syarat.push("Belum ada perubahan dibanding versi yang berlaku.");
  }

  const simpanArgs = useCallback(() => ({
    p_id: id, p_form: f, p_diubah: row?.diubah_at, ...(row?.status === "revisi" ? { p_alasan: alasan } : {}),
  }), [id, f, row?.diubah_at, row?.status, alasan]);

  const simpan = useCallback(async () => {
    if (!f) return;
    const ok = await kirim.jalankan(() => aksiKeu("keu_ident_simpan", simpanArgs()));
    if (ok) setDirty(false);
  }, [f, kirim, simpanArgs]);

  const lakukan = useCallback(async (a: AksiIdent, catatan: string) => {
    if (!row || !f) return;
    const butuhSimpan = dirty && (a === "kirim");
    const ok = await kirim.jalankan(async () => {
      if (butuhSimpan) {
        const r = await aksiKeu("keu_ident_simpan", simpanArgs());
        if (!r.ok) return r;
      }
      return aksiKeu("keu_ident_aksi", { p_id: row.id, p_aksi: a, ...(catatan ? { p_catatan: catatan } : {}) });
    });
    if (ok) setDirty(false);
  }, [row, f, dirty, kirim, simpanArgs]);

  const h15 = useKirim(muatSemua);
  const petakan = useKirim(pokRo.muat);

  const st = row ? labelStatus(row) : null;
  const tersedia = row ? aksiTersedia(row, hak, hak.akun ?? null).filter((a) => (a === "simpan" || a === "kirim" ? bolehSusun : true)) : [];
  const fHilir = row && formSah && !(row.status === "draf" || row.status === "revisi") ? formSah : f;
  const sumber = !row ? "" : row.ver === 0 ? "Pratinjau dari draf. Belum dipakai modul lain." : (row.status === "revisi" || row.status === "draf")
    ? `Pratinjau revisi. Modul lain tetap memakai ${namaVersi(row.ver).toLowerCase()}.` : `Bersumber dari ${namaVersi(row.ver).toLowerCase()}.`;
  const bolehPetakan = hak.susun || hak.ppk;

  return (
    <Bingkai
      aktif="identifikasi_survei"
      kecil="SIGAP · Identifikasi survei"
      jejak={["SIGAP", "Perencanaan", "Identifikasi survei", row?.nama ?? "Survei"]}
      judul={row ? <>{row.nama}</> : "Identifikasi survei"}
      sub={row ? <>RO {row.ro_kode} · Tahun {row.tahun}</> : undefined}
      kanan={(gelap) => <LencanaNotif gelap={gelap} />}
      kembali={{ induk: "/sigap/kelola/perencanaan/identifikasi", label: "Daftar survei" }}
    >
      <div className="flex flex-col gap-3.5 text-[#1B2B4B]">
        {id === null && <Galat pesan="Alamat survei tidak sah." />}
        <Galat pesan={galat} />
        {memuat && <Memuat tinggi="h-48" />}
        {row && st && (
          <div className="flex flex-wrap items-center gap-2">
            <Chip warna={st.nada}>{st.teks}</Chip>
            {dirty && !terkunciStatus && <Chip warna="kuning">Ada perubahan belum disimpan</Chip>}
            {hakSiap && !hak.susun && <span className="text-[12.5px] text-[#5B6B84]">Anda dapat melihat; menyusun hanya untuk ketua tim, admin RO, atau PPK RO ini.</span>}
            {row.ver >= 1 && row.status !== "dibatalkan" && (
              <Link
                href={`/sigap/kelola/perencanaan/identifikasi/${row.id}/lanjutan`}
                className="ml-auto rounded-md border border-[#1F5FD1] bg-[#E3EEFF] px-3 py-2 text-[13px] font-semibold text-[#1F5FD1] hover:bg-[#D3E4FF]"
              >Identifikasi lanjutan (Fix, petugas, dokumen) →</Link>
            )}
          </div>
        )}
        {row && f && (() => {
          const h15 = tanggalH15(row.ver > 0 && formSah ? formSah : f, row.tahun);
          if (!h15 || !(sesudahH15(row.ver > 0 && formSah ? formSah : f, row.tahun, hariIniWib()))) return null;
          return row.ver > 0
            ? <Catatan><ul className="m-0 list-disc space-y-0.5 pl-5"><li>H-15 ({tglIndo(h15)}) sudah lewat; versi terakhir dianggap final.</li><li>Revisi yang dikirim sekarang hanya perlu persetujuan KPA dan dicatat untuk evaluasi.</li></ul></Catatan>
            : <Catatan><ul className="m-0 list-disc space-y-0.5 pl-5"><li>H-15 ({tglIndo(h15)}) sudah lewat; identifikasi awal ini terlambat dan dicatat untuk evaluasi.</li><li>Semua identifikasi wajib selesai disahkan paling lambat H-15.</li></ul></Catatan>;
        })()}
        {row && f && (
          <>
            <KartuPengesahan
              row={row} tersedia={tersedia} syarat={syarat} beda={beda} dampak={dampak} nPerk={kem.nPerk} alasan={alasan}
              setAlasan={(s) => { setAlasan(s); setDirty(true); }} dirty={dirty} mengirim={kirim.mengirim} galat={kirim.galat}
              onAksi={(a, c) => void lakukan(a, c)} onSimpan={() => void simpan()}
            />
            <div className="grid min-w-0 items-start gap-3.5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
              <Formulir f={f} ubah={ubah} tahun={tahun} mati={!bolehSusun || kirim.mengirim} pa={pa} setPa={setPa} rujukan={rujukan} />
              <div className="flex min-w-0 flex-col gap-3.5 xl:sticky xl:top-[68px] xl:max-h-[calc(100vh-84px)] xl:overflow-y-auto xl:pr-1 xl:[scrollbar-width:thin]">
                <KartuHasil masalah={hasil.masalah} peringatan={hasil.peringatan} />
                <KartuKematangan butir={kem.butir} nFix={kem.nFix} nPerk={kem.nPerk} />
                {formSah && (
                  <KartuH15
                    formSah={formSah} tahun={tahun} upd={upd} hariIni={hariIniWib()} bisa={hak.susun} mengirim={h15.mengirim} galat={h15.galat}
                    onSimpan={(p, m, s) => void h15.kirim("keu_ident_h15", { p_id: row.id, p_periode: p, p_mulai: m, p_selesai: s })}
                  />
                )}
                {fHilir && (
                  <KartuAnggaran
                    f={fHilir} pok={pokRo.baris} memuat={pokRo.memuat} galat={pokRo.galat ?? petakan.galat} bisaPetakan={bolehPetakan} mengirim={petakan.mengirim} ro={row.ro_kode}
                    onPetakan={(kunci, paket) => void petakan.kirim("keu_ident_paket_atur", { p_ro: row.ro_kode, p_kunci: kunci, p_paket: paket })}
                  />
                )}
                {fHilir && <KartuHilir f={fHilir} tahun={tahun} upd={upd} sumber={sumber} pa={paHilir} setPa={setPaHilir} />}
                <KartuRiwayat riwayat={riwayat} />
              </div>
            </div>
          </>
        )}
        {!memuat && !row && id !== null && !galat && <Kosong teks="Survei tidak ditemukan." />}
      </div>
    </Bingkai>
  );
}

export default function HalamanIdentifikasi() {
  return (
    <Suspense fallback={null}>
      <Isi />
    </Suspense>
  );
}
