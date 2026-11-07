import type { ReactNode } from "react";
import { ModalTanggapanRevisi } from "./tanggapan/TanggapanRevisi";

// (7 Nov 2026) Semua halaman /sigap/revisi/*: modal siklus revisi muncul bila ada RO milik ketua tim/wakil yang wajib ditanggapi
// (kecuali di halaman Tanggapan sendiri, yang memuat daftar lengkapnya).
export default function RevisiLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ModalTanggapanRevisi />
    </>
  );
}
