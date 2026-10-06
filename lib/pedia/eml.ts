// lib/pedia/eml.ts
//
// (7 Okt 2026) SIGAP PEDIA -- parsing email .eml (mailparser) & verifikasi DKIM (mailauth) -- permintaan user.
// DKIM diverifikasi SAAT UNGGAH dan kunci publik DNS ({selector}._domainkey.{domain} TXT) disimpan sebagai
// snapshot, karena instansi bisa mengganti kunci DKIM-nya kelak sehingga verifikasi ulang bisa gagal walau
// emailnya asli. Verifikasi ulang menjalankan DKIM dgn DNS saat itu DAN dgn snapshot tersimpan.

import { simpleParser, type AddressObject } from "mailparser";
import { promises as dnsP } from "dns";
// mailauth: modul CommonJS; dkimVerify ada di lib/dkim/verify
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { dkimVerify } = require("mailauth/lib/dkim/verify") as {
  dkimVerify: (input: Buffer, opts: { resolver?: (name: string, rr: string) => Promise<unknown>; curTime?: Date }) => Promise<HasilMailauth>;
};

type HasilMailauth = {
  headerFrom?: string[];
  results?: {
    signingDomain?: string;
    selector?: string;
    algo?: string;
    format?: string;
    signature?: string;
    status?: { result?: string; comment?: string; aligned?: string | false };
    info?: string;
    rr?: string;
  }[];
};

export type HeaderEmail = {
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string | null; // ISO
  message_id: string | null;
  in_reply_to: string | null;
  references: string[];
  lampiran: { nama: string; mime: string; ukuran: number }[];
};

export type LampiranEml = { nama: string; mime: string; data: Buffer };
export type EmailTerurai = { header: HeaderEmail; teks: string; html: string | null; lampiran: LampiranEml[] };

const alamat = (a: AddressObject | AddressObject[] | undefined) => (Array.isArray(a) ? a.map((x) => x.text).join(", ") : a?.text ?? "");

export async function uraiEml(buf: Buffer): Promise<EmailTerurai> {
  const m = await simpleParser(buf, { skipImageLinks: true, skipTextToHtml: true });
  const lampiran: LampiranEml[] = (m.attachments ?? [])
    .filter((a) => a.content && a.content.length > 0)
    .map((a, i) => ({ nama: a.filename || `lampiran-${i + 1}`, mime: a.contentType || "application/octet-stream", data: a.content }));
  const refs = m.references ? (Array.isArray(m.references) ? m.references : [m.references]) : [];
  return {
    header: {
      from: alamat(m.from),
      to: alamat(m.to),
      cc: alamat(m.cc),
      subject: m.subject ?? "",
      date: m.date ? m.date.toISOString() : null,
      message_id: m.messageId ?? null,
      in_reply_to: m.inReplyTo ?? null,
      references: refs,
      lampiran: lampiran.map((l) => ({ nama: l.nama, mime: l.mime, ukuran: l.data.length })),
    },
    teks: m.text ?? "",
    html: typeof m.html === "string" ? m.html : null,
    lampiran,
  };
}

export type SnapshotDns = { nama: string; rr: string; jawaban: string[][] | null; galat: string | null; at: string };
export type TandaTanganDkim = { status: string; komentar: string | null; domain: string | null; selector: string | null; algoritma: string | null; selaras: string | false | null };
export type HasilDkim = {
  status: "pass" | "fail" | "none" | "neutral" | "temperror" | "policy" | "permerror";
  domain: string | null; // d= dari tanda tangan utama (yg pass, atau yg pertama)
  selector: string | null;
  algoritma: string | null;
  header_from: string | null;
  tanda_tangan: TandaTanganDkim[];
  snapshot_dns: SnapshotDns[];
  diverifikasi_at: string;
  mode: "dns_langsung" | "snapshot";
};

type Resolver = (name: string, rr: string) => Promise<string[][]>;

/**
 * Verifikasi DKIM. `snapshot` diisi -> pakai jawaban DNS tersimpan (tanpa jaringan).
 * `waktu` = waktu acuan (mis. saat unggah) supaya tanda tangan ber-x= tidak dianggap kedaluwarsa.
 * `resolverUji` hanya utk test.
 */
export async function verifikasiDkim(buf: Buffer, opsi: { snapshot?: SnapshotDns[]; waktu?: Date; resolverUji?: Resolver } = {}): Promise<HasilDkim> {
  const catatan: SnapshotDns[] = [];
  const resolver = async (name: string, rr: string) => {
    const at = new Date().toISOString();
    if (opsi.snapshot) {
      const s = opsi.snapshot.find((x) => x.nama.toLowerCase() === name.toLowerCase() && x.rr === rr);
      if (!s || !s.jawaban) {
        const e = new Error("tidak ada di snapshot") as Error & { code: string };
        e.code = "ENOTFOUND";
        throw e;
      }
      catatan.push({ ...s });
      return s.jawaban;
    }
    try {
      const jawaban = (await (opsi.resolverUji ? opsi.resolverUji(name, rr) : (dnsP.resolve(name, rr as "TXT") as Promise<string[][]>))) as string[][];
      catatan.push({ nama: name, rr, jawaban, galat: null, at });
      return jawaban;
    } catch (e) {
      const err = e as Error & { code?: string };
      catatan.push({ nama: name, rr, jawaban: null, galat: err.code ?? err.message, at });
      throw e;
    }
  };
  const r = await dkimVerify(buf, { resolver, curTime: opsi.waktu });
  const ttd: TandaTanganDkim[] = (r.results ?? []).map((x) => ({
    status: x.status?.result ?? "none",
    komentar: x.status?.comment ?? null,
    domain: x.signingDomain ?? null,
    selector: x.selector ?? null,
    algoritma: x.algo ?? null,
    selaras: x.status?.aligned ?? null,
  }));
  const utama = ttd.find((t) => t.status === "pass") ?? ttd[0];
  return {
    status: (utama?.status as HasilDkim["status"]) ?? "none",
    domain: utama?.domain ?? null,
    selector: utama?.selector ?? null,
    algoritma: utama?.algoritma ?? null,
    header_from: r.headerFrom?.[0] ?? null,
    tanda_tangan: ttd,
    snapshot_dns: catatan,
    diverifikasi_at: new Date().toISOString(),
    mode: opsi.snapshot ? "snapshot" : "dns_langsung",
  };
}

/** Tebak nomor tiket dari subjek/isi (mis. "20261002-GTZWQS"). */
export function tebakNomorTiket(teks: string): string | null {
  const m = teks.match(/\b(20\d{6}-[A-Z0-9]{4,10})\b/) ?? teks.match(/\b(?:tiket|ticket|no\.?\s*tiket)\s*[:#]?\s*([A-Z0-9-]{6,24})\b/i);
  return m ? m[1] : null;
}
