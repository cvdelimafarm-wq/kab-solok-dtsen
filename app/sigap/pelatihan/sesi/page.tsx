"use client";

// app/sigap/pelatihan/sesi/page.tsx
//
// (9 Nov 2026) Tab "Pelatihan" untuk INSTRUKTUR / PANITIA / PJ (peserta tetap memakai /sigap/pelatihan?tab=pelatihan).
// Satu tempat untuk menjalankan sesi di hari H: Mulai / Selesaikan Pretest dan Posttest (agenda sesi), Roleplaying by Vanguard, Adu Sigap, dan pintasan ke Monitoring.
// Kartu agenda dan roleplay memutuskan sendiri tampil atau tidaknya (server menentukan hak akun).

import Link from "next/link";
import { BTN_O, Kartu, Memuat } from "../../admin/ui";
import KartuAgendaSesi from "../KartuAgendaSesi";
import KartuRoleplayHariIni from "../../KartuRoleplayHariIni";
import { Kerangka, useHub } from "../komponen";
import { useBenderaTab } from "../TabPelatihan";

export default function HalamanSesi() {
  const bendera = useBenderaTab();
  const id = bendera?.kegiatan_id ?? null;
  const { data: hub } = useHub(0, true);
  const tujuan = (tab: string, sub: string) => `/sigap/pelatihan/kelola?${id ? `kegiatan=${id}&` : ""}tab=${tab}&sub=${sub}`;
  return (
    <Kerangka aktif="pelatihan" judul="Sesi pelatihan" sub="Mulai dan selesaikan sesi kelas Anda" hub={hub}>
      {!id && <Memuat />}
      {id && (
        <>
          <KartuAgendaSesi kegiatanId={id} />
          <KartuRoleplayHariIni kegiatanId={id} />
          <Kartu judul="Adu Sigap (kuis live)">
            <p className="m-0 mb-3 text-[13px] leading-relaxed text-[#55657D]">Buka dan jalankan kuis bersama kelas dari layar pengaturan Adu Sigap.</p>
            <Link href={tujuan("harih", "adusigap")} className={BTN_O}>
              Buka Adu Sigap
            </Link>
          </Kartu>
          <Kartu judul="Pantau">
            <div className="flex flex-wrap gap-2">
              <Link href="/sigap/pelatihan/monitoring" className={BTN_O}>
                Monitoring peserta
              </Link>
              <Link href={tujuan("harih", "agenda")} className={BTN_O}>
                Atur agenda sesi
              </Link>
            </div>
          </Kartu>
        </>
      )}
    </Kerangka>
  );
}
