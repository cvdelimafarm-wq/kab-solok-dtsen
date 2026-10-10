import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// (11 Okt 2026) Penjaga server mode SIMULASI "masuk sebagai" -- keputusan user: akun super boleh mencoba mengisi/unggah seperti petugas,
// tetapi datanya TIDAK dikirim/disimpan. Penahan utama ada di klien (app/portal/simulasi.ts); ini lapis kedua bila ada jalur yang lolos.
// Sesi "masuk sebagai" berformat `akunId.exp.aktorId.tanda` (4 bagian; sesi biasa 3 bagian, lib/sigapAkses.ts). Penulisan (selain GET/HEAD)
// ke /api/* dengan sesi 4 bagian dijawab tiruan 200 { ok, simulasi } tanpa diteruskan ke route. Tanda tangan tidak diperiksa di sini:
// sesi 4 bagian palsu hanya membuat penulisan pemiliknya sendiri tidak tersimpan (tidak memberi akses apa pun).
// Pengecualian: /api/sigap/masuk (ganti/kembali akun) dan /api/portal/sso (membuka aplikasi penyisiran) -- hanya menerbitkan sesi.
const BEBAS_SIMULASI = ["/api/sigap/masuk", "/api/portal/sso"];

function sesiSimulasi(request: NextRequest): boolean {
  const h = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  if (!m) return false;
  return m[1].split(".").length === 4;
}

export async function middleware(request: NextRequest) {
  const jalur = request.nextUrl.pathname;
  if (jalur.startsWith("/api/")) {
    const metode = request.method.toUpperCase();
    if (metode !== "GET" && metode !== "HEAD" && metode !== "OPTIONS" && !BEBAS_SIMULASI.some((b) => jalur === b || jalur.startsWith(`${b}/`)) && sesiSimulasi(request)) {
      return NextResponse.json({ ok: true, simulasi: true, pesan: "Simulasi: data tidak dikirim ke server." }, { headers: { "X-Simulasi": "1" } });
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
