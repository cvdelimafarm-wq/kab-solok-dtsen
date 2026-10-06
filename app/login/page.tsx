import { redirect } from "next/navigation";

// (7 Okt 2026) Portal satu login: halaman /login lama (nomor HP + PIN DTSEN) dipindah ke halaman depan.
// Operator Wali Nagari cukup mengetik nomor HP di form masuk depan. ?next= diteruskan sbg ?lanjut=.
export default async function LoginLama({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : null;
  redirect(next ? `/?lanjut=${encodeURIComponent(next)}` : "/");
}
