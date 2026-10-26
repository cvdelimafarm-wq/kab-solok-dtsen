import { redirect } from "next/navigation";

// (26 Okt 2026) /sigap/kelola/delego -- Delego kini modul bawaan SIGAP (tampilan hijau, data sama) di /sigap/delego.
// Sebelumnya halaman ini meneruskan ke aplikasi Delego terpisah lewat portal_aplikasi (kode "delego"); tautan itu tidak dipakai lagi dari menu ini.

export const dynamic = "force-dynamic";

export default function KelolaDelego() {
  redirect("/sigap/delego");
}
