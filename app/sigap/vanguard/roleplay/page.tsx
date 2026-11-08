// app/sigap/vanguard/roleplay/page.tsx
//
// (8 Nov 2026) Roleplay bareng kelas (Vanguard). /sigap/vanguard/roleplay?k=KEGIATAN&dari=PATH
// Peserta mengisi jawaban responden peran; instruktur dan panitia menjalankan sesi (Periksa, tandai jawaban benar, Lanjut, Selesaikan).

import { Suspense } from "react";
import RoleplayHalaman from "./RoleplayHalaman";

export const dynamic = "force-dynamic";

export default function HalamanRoleplay() {
  return (
    <Suspense fallback={null}>
      <RoleplayHalaman />
    </Suspense>
  );
}
