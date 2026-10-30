// app/api/portal/pendataan/dokumen/route.ts  --  DIHAPUS (30 Okt 2026)
//
// Unggah PDF hasil pemeriksaan PML tidak dipakai di Pendataan Pascabencana; fitur ini hanya untuk SPDT NTP -> /api/portal/spdt-dokumen.
// Berkas ini sengaja dikosongkan (hanya membalas 410) sampai dihapus dengan:  git rm app/api/portal/pendataan/dokumen/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GONE = () => NextResponse.json({ error: "Fitur ini hanya ada di SPDT NTP (tab Dokumen)." }, { status: 410 });
export const GET = GONE;
export const POST = GONE;
