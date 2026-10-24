"use client";

// app/sigap/ro/[kode]/page.tsx
//
// (24 Okt 2026) Ruang kerja satu Rincian Output (RO) -- Kertas Kerja Revisi POK, papan 9 mockup. Satu alamat per RO dan per tab (aturan D-24):
// /sigap/ro/<KODE>?tab=ringkasan|anggaran|rab|administrasi|kekurangan. Bilah tab menempel di atas saat menggulir; lencana oranye menandai
// pekerjaan yang menunggu (dokumen belum ada, RAB menunggu persetujuan, catatan kekurangan terbuka). "Pindah RO" mempertahankan tab.
// Semua pegawai organik boleh melihat; mengubah mengikuti hak (ditegakkan basis data).

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { kodeRoSah, LABEL_TAB, penugasanRo, tabDari, TAB_RO, urlBaca, type TabRo } from "@/lib/keu/ro";
import { Galat, HalamanKeu, Kosong, kolom } from "../../keu-ui";
import { useBacaKeu, usePenugasan } from "../useKeu";
import { TabKekurangan } from "./Kekurangan";
import { TabRab } from "./Rab";
import { TabAdministrasi, TabAnggaran, TabRingkasan } from "./Tab";

type RoRow = { kode: string; nama: string; sementara: boolean; aktif: boolean };

function Isi() {
  const { kode: kodeParam } = useParams<{ kode: string }>();
  const router = useRouter();
  const kode = decodeURIComponent(kodeParam ?? "");
  const tab = tabDari(useSearchParams().get("tab"));
  const sah = kodeRoSah(kode);
  const ro = useBacaKeu<RoRow>(sah ? urlBaca("keu_ro", { kode }, { batas: 1 }) : null);
  const semua = useBacaKeu<RoRow>(urlBaca("keu_ro", {}, { urut: "kode", batas: 2000, kolom: ["kode", "nama", "sementara", "aktif"] }));
  const adm = useBacaKeu<{ n_belum: number | string }>(sah ? urlBaca("keu_v_adm_ringkas", { ro_kode: kode }, { batas: 1, kolom: ["n_belum"] }) : null);
  const kek = useBacaKeu<{ n_terbuka: number | string }>(sah ? urlBaca("keu_v_kekurangan_ro", { ro_kode: kode }, { batas: 1, kolom: ["n_terbuka"] }) : null);
  const rab = useBacaKeu<{ status: string }>(sah ? urlBaca("keu_v_rab_ringkas", { ro_kode: kode }, { urut: "-nomor", batas: 1, kolom: ["status"] }) : null);
  const tugas = usePenugasan();
  const p = useMemo(() => (tugas.baris ? penugasanRo(tugas.baris, kode) : null), [tugas.baris, kode]);
  const baris = ro.baris?.[0] ?? null;

  // lencana: pekerjaan yang menunggu
  const lencana: Partial<Record<TabRo, number>> = {
    administrasi: Number(adm.baris?.[0]?.n_belum ?? 0),
    kekurangan: Number(kek.baris?.[0]?.n_terbuka ?? 0),
    rab: rab.baris?.[0] && ["menunggu_ketua", "menunggu_ppk"].includes(rab.baris[0].status) ? 1 : 0,
  };
  const daftarRo = (semua.baris ?? []).filter((r) => r.aktif);

  return (
    <HalamanKeu
      jejak={[{ t: "SIGAP", href: "/sigap" }, { t: "Perencanaan", href: "/sigap/ro" }, { t: "Anggaran", href: "/sigap/ro" }, { t: sah ? kode : "RO" }]}
      induk="/sigap/ro"
      labelKembali="Daftar RO"
      judul={sah ? <>{kode}{baris?.sementara ? " (sementara)" : ""} {baris?.nama ?? "Memuat…"}</> : "Kode RO tidak sah"}
      sub={sah && p ? <>Ketua tim: {p.adaKetua ? p.ketua.join(", ") : "belum ditugaskan"}{p.adminRo.length > 0 ? ` · Admin RO: ${p.adminRo.join(", ")}` : ""}</> : undefined}
    >
      {!sah && <Galat pesan="Kode RO tidak sah." />}
      {sah && <Galat pesan={ro.galat} />}
      {sah && ro.baris && !baris && <Kosong teks="RO ini tidak ditemukan." />}

      {sah && baris && (
        <>
          {daftarRo.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="pindah-ro" className="text-[12px] text-[#5B6B84]">Pindah RO</label>
              <select
                id="pindah-ro" className={`${kolom} !w-auto max-w-full`} value={kode}
                onChange={(e) => router.replace(`/sigap/ro/${encodeURIComponent(e.target.value)}?tab=${tab}`, { scroll: false })}
              >
                {daftarRo.map((r) => <option key={r.kode} value={r.kode}>{r.kode} {r.nama.slice(0, 50)}</option>)}
              </select>
            </div>
          )}
          <nav aria-label="Tab RO" className="sticky top-0 z-20 -mx-3 flex gap-1.5 overflow-x-auto border-b border-[#DCE3EE] bg-[#F3F5F8] px-3 py-2 sm:-mx-5 sm:px-5 lg:top-[56px] lg:-mx-6 lg:px-6">
            {TAB_RO.map((t) => (
              <Link
                key={t}
                replace
                scroll={false}
                href={`/sigap/ro/${encodeURIComponent(kode)}?tab=${t}`}
                aria-current={t === tab ? "page" : undefined}
                className={`flex min-h-[40px] flex-none items-center gap-1.5 rounded-md border px-3 text-[13px] font-semibold ${t === tab ? "border-[#1F5FD1] bg-[#1F5FD1] text-white" : "border-[#C5D0E2] bg-white text-[#1B2B4B] hover:bg-[#EEF2F7]"}`}
              >
                {LABEL_TAB[t]}
                {(lencana[t] ?? 0) > 0 && <span aria-label={`${lencana[t]} menunggu`} className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#B4540A] px-1.5 text-[11px] font-bold text-white">{lencana[t]}</span>}
              </Link>
            ))}
          </nav>
          {tab === "ringkasan" && <TabRingkasan kode={kode} />}
          {tab === "anggaran" && <TabAnggaran kode={kode} />}
          {tab === "rab" && <TabRab kode={kode} />}
          {tab === "administrasi" && <TabAdministrasi kode={kode} />}
          {tab === "kekurangan" && <TabKekurangan kode={kode} />}
        </>
      )}
    </HalamanKeu>
  );
}

export default function HalamanRo() {
  return (
    <Suspense fallback={null}>
      <Isi />
    </Suspense>
  );
}
