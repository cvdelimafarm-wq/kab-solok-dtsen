// lib/pedia/tsa.ts
//
// (7 Okt 2026) SIGAP PEDIA -- timestamp RFC 3161 atas SHA-256 file bukti -- permintaan user.
// Pilihan teknis: pkijs + asn1js (murni JavaScript), BUKAN `openssl ts`:
//   * tidak bergantung paket OS di container Railway (image Nixpacks tidak menjamin openssl CLI),
//   * request & validasi bisa dites tanpa jaringan (mock / TSA lokal),
//   * file .tsr yg disimpan tetap format standar, sehingga bisa diverifikasi mandiri dgn `openssl ts -verify`.
// Urutan TSA: FreeTSA -> DigiCert -> Sectigo (bisa diganti env PEDIA_TSA_URLS, dipisah koma).

import * as asn1js from "asn1js";
import * as pkijs from "pkijs";
import { webcrypto, randomBytes, createHash } from "crypto";

let mesinSiap = false;
function siapkanMesin() {
  if (mesinSiap) return;
  const engine = new pkijs.CryptoEngine({ name: "node", crypto: webcrypto as unknown as Crypto });
  pkijs.setEngine("node", engine);
  mesinSiap = true;
}

export const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest();

const OID_SHA256 = "2.16.840.1.101.3.4.2.1";
const OID_TSTINFO = "1.2.840.113549.1.9.16.1.4";

export type Tsa = { nama: string; url: string };
export const TSA_BAWAAN: Tsa[] = [
  { nama: "FreeTSA", url: "https://freetsa.org/tsr" },
  { nama: "DigiCert", url: "http://timestamp.digicert.com" },
  { nama: "Sectigo", url: "http://timestamp.sectigo.com" },
];

export function daftarTsa(): Tsa[] {
  const env = process.env.PEDIA_TSA_URLS?.trim();
  if (!env) return TSA_BAWAAN;
  return env
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean)
    .map((url) => ({ nama: TSA_BAWAAN.find((t) => t.url === url)?.nama ?? new URL(url).hostname, url }));
}

const keAB = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const hex = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString("hex");

/** TimeStampReq DER (SHA-256, certReq=true, nonce acak 8 byte positif). */
export function buatPermintaan(hashSha256: Buffer, nonce: Buffer = randomBytes(8)): { der: Buffer; nonce: Buffer } {
  siapkanMesin();
  if (hashSha256.length !== 32) throw new Error("Hash SHA-256 harus 32 byte");
  const n = Buffer.from(nonce);
  n[0] &= 0x7f; // bilangan positif
  if (n[0] === 0) n[0] = 1;
  const req = new pkijs.TimeStampReq({
    version: 1,
    messageImprint: new pkijs.MessageImprint({
      hashAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: OID_SHA256, algorithmParams: new asn1js.Null() }),
      hashedMessage: new asn1js.OctetString({ valueHex: keAB(hashSha256) }),
    }),
    nonce: new asn1js.Integer({ valueHex: keAB(n) }),
    certReq: true,
  });
  return { der: Buffer.from(req.toSchema().toBER(false)), nonce: n };
}

export type InfoToken = {
  genTime: string; // ISO UTC
  serial: string; // hex
  hashCocok: boolean;
  nonce: string | null;
  policy: string | null;
  tsaNama: string | null;
  tandaTanganValid: boolean;
  penanda: string | null; // subject sertifikat penanda tangan
  sertifikat: string[]; // PEM semua sertifikat yg disertakan token
};

function pem(der: ArrayBuffer): string {
  const b64 = Buffer.from(der).toString("base64").replace(/.{64}/g, "$&\n");
  return `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----\n`;
}

function subjek(c: pkijs.Certificate): string {
  const peta: Record<string, string> = { "2.5.4.3": "CN", "2.5.4.10": "O", "2.5.4.11": "OU", "2.5.4.6": "C" };
  return c.subject.typesAndValues.map((tv) => `${peta[tv.type] ?? tv.type}=${tv.value.valueBlock.value}`).join(", ");
}

/** Baca TimeStampResp (.tsr) -> status + token. Lempar galat bila TSA menolak. */
export function bacaRespons(der: Buffer): { resp: pkijs.TimeStampResp; status: number; pesan: string | null } {
  siapkanMesin();
  const asn = asn1js.fromBER(keAB(der));
  if (asn.offset === -1) throw new Error("Respons TSA bukan ASN.1 yg valid");
  const resp = new pkijs.TimeStampResp({ schema: asn.result });
  const status = resp.status.status;
  const pesan = resp.status.statusStrings?.map((s) => s.valueBlock.value).join("; ") ?? null;
  return { resp, status, pesan };
}

/**
 * Validasi token di dalam .tsr terhadap isi file ASLI (pkijs memverifikasi tanda tangan TSTInfo sekaligus
 * mencocokkan messageImprint dgn hash data, sehingga yg diberikan harus byte file, bukan hash-nya).
 * Tidak butuh jaringan.
 */
export async function validasiRespons(der: Buffer, dataAsli: Uint8Array, nonceHarap?: Buffer | null): Promise<InfoToken> {
  const hashSha256 = sha256(dataAsli);
  const { resp, status, pesan } = bacaRespons(der);
  if (status !== 0 && status !== 1) throw new Error(`TSA menolak (status ${status}${pesan ? `: ${pesan}` : ""})`);
  if (!resp.timeStampToken) throw new Error("Respons TSA tanpa token");
  const sd = new pkijs.SignedData({ schema: resp.timeStampToken.content });
  if (sd.encapContentInfo.eContentType !== OID_TSTINFO) throw new Error("Isi token bukan TSTInfo");
  const eContent = sd.encapContentInfo.eContent;
  if (!eContent) throw new Error("TSTInfo kosong");
  const tstBytes = eContent.getValue();
  const tst = new pkijs.TSTInfo({ schema: asn1js.fromBER(tstBytes).result });

  const imprint = Buffer.from(tst.messageImprint.hashedMessage.valueBlock.valueHexView);
  const algo = tst.messageImprint.hashAlgorithm.algorithmId;
  const hashCocok = algo === OID_SHA256 && imprint.equals(hashSha256);
  const nonce = tst.nonce ? hex(tst.nonce.valueBlock.valueHexView) : null;
  if (nonceHarap && nonce && Buffer.from(nonce, "hex").toString("hex").replace(/^0+/, "") !== nonceHarap.toString("hex").replace(/^0+/, ""))
    throw new Error("Nonce respons TSA tidak sama dgn permintaan");

  let tandaTanganValid = false;
  try {
    const v = await sd.verify({ signer: 0, data: keAB(dataAsli), checkChain: false, extendedMode: true });
    tandaTanganValid = !!(typeof v === "object" ? v.signatureVerified : v);
  } catch {
    tandaTanganValid = false;
  }
  const certs = (sd.certificates ?? []).filter((c): c is pkijs.Certificate => c instanceof pkijs.Certificate);
  let penanda: string | null = null;
  const si = sd.signerInfos[0];
  if (si && si.sid instanceof pkijs.IssuerAndSerialNumber) {
    const sn = hex(si.sid.serialNumber.valueBlock.valueHexView);
    const c = certs.find((x) => hex(x.serialNumber.valueBlock.valueHexView) === sn);
    if (c) penanda = subjek(c);
  } else if (certs[0]) penanda = subjek(certs[0]);

  let tsaNama: string | null = null;
  try {
    const gn = tst.tsa as pkijs.GeneralName | undefined;
    if (gn && gn.type === 4 && gn.value instanceof pkijs.RelativeDistinguishedNames)
      tsaNama = gn.value.typesAndValues.map((tv) => String(tv.value.valueBlock.value)).join(", ");
  } catch {
    tsaNama = null;
  }

  return {
    genTime: tst.genTime.toISOString(),
    serial: hex(tst.serialNumber.valueBlock.valueHexView),
    hashCocok,
    nonce,
    policy: tst.policy ?? null,
    tsaNama,
    tandaTanganValid,
    penanda,
    sertifikat: certs.map((c) => pem(c.toSchema().toBER(false))),
  };
}

export type HasilTsa =
  | { ok: true; tsa: Tsa; tsr: Buffer; info: InfoToken }
  | { ok: false; galat: string[] };

/** Minta timestamp ke daftar TSA berurutan. `kirim` bisa diganti mock di test. */
export async function mintaTimestamp(
  dataAsli: Uint8Array,
  opsi: { daftar?: Tsa[]; batasMs?: number; kirim?: (url: string, body: Buffer, batasMs: number) => Promise<Buffer>; nonce?: Buffer } = {}
): Promise<HasilTsa> {
  const daftar = opsi.daftar ?? daftarTsa();
  const batasMs = opsi.batasMs ?? 15000;
  const kirim = opsi.kirim ?? kirimHttp;
  const galat: string[] = [];
  const hashSha256 = sha256(dataAsli);
  for (const tsa of daftar) {
    try {
      const { der, nonce } = buatPermintaan(hashSha256, opsi.nonce); // nonce tetap hanya utk test
      const tsr = await kirim(tsa.url, der, batasMs);
      const info = await validasiRespons(tsr, dataAsli, nonce);
      if (!info.hashCocok) throw new Error("hash di token tidak sama dgn hash file");
      if (!info.tandaTanganValid) throw new Error("tanda tangan token tidak valid");
      return { ok: true, tsa, tsr, info };
    } catch (e) {
      galat.push(`${tsa.nama}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { ok: false, galat };
}

async function kirimHttp(url: string, body: Buffer, batasMs: number): Promise<Buffer> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), batasMs);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/timestamp-query", Accept: "application/timestamp-reply" },
      body: new Uint8Array(body),
      signal: ac.signal,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  } finally {
    clearTimeout(t);
  }
}


