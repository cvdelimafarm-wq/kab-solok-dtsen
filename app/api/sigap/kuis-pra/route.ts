// app/api/sigap/kuis-pra/route.ts
//
// (31 Okt 2026) ALAMAT LAMA. Rute sebenarnya kini di /api/sigap/pelatihan/kuis-pra (klien menyisipkan ?kegiatan=ID otomatis hanya untuk /api/sigap/pelatihan*).
// Berkas ini hanya meneruskan; boleh dihapus dari repo setelah tidak ada yang memanggilnya.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export { GET, POST } from "@/app/api/sigap/pelatihan/kuis-pra/route";
