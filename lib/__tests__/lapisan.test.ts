// (29 Okt 2026) Uji tombol Back HP = tutup modal (app/portal/lapisan.ts) dengan riwayat peramban tiruan.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { daftarLapisan, jumlahLapisan, popDariLapisan, setelUlangLapisan } from "@/app/portal/lapisan";

type Entri = { state: unknown; url: string };
type Pendengar = { fn: (e: { state: unknown }) => void; tangkap: boolean };

/** Peramban tiruan: riwayat bertumpuk, back() tak sinkron, popstate fase-tangkap lebih dulu. */
function buatPeramban() {
  const entri: Entri[] = [{ state: null, url: "/halaman" }];
  let idx = 0;
  const pendengar: Pendengar[] = [];
  const log: boolean[] = []; // nilai popDariLapisan() yang dilihat pendengar biasa
  const win = {
    location: { get href() { return entri[idx].url; } },
    history: {
      get state() { return entri[idx].state; },
      pushState(s: unknown, _t: string, u?: string) {
        entri.splice(idx + 1);
        entri.push({ state: s, url: u ?? entri[idx].url });
        idx++;
      },
      back() {
        if (idx > 0) {
          idx--;
          setTimeout(() => sebar(), 0);
        }
      },
    },
    addEventListener(t: string, fn: Pendengar["fn"], tangkap?: boolean) {
      if (t === "popstate") pendengar.push({ fn, tangkap: tangkap === true });
    },
    removeEventListener(t: string, fn: Pendengar["fn"]) {
      if (t !== "popstate") return;
      const i = pendengar.findIndex((p) => p.fn === fn);
      if (i >= 0) pendengar.splice(i, 1);
    },
  };
  function sebar() {
    const e = { state: entri[idx].state };
    for (const p of pendengar.filter((x) => x.tangkap)) p.fn(e);
    for (const p of pendengar.filter((x) => !x.tangkap)) p.fn(e);
  }
  win.addEventListener("popstate", () => log.push(popDariLapisan()), false); // pendengar halaman lain
  return {
    win,
    entri,
    get idx() { return idx; },
    log,
    /** Tombol Back HP. */
    backHp() {
      win.history.back();
    },
    /** Pindah ke halaman lain (seperti router.push milik Next). */
    pindahHalaman(url: string) {
      win.history.pushState({ __NA: true }, "", url);
    },
  };
}

const tunggu = (ms = 80) => new Promise((r) => setTimeout(r, ms));

let p: ReturnType<typeof buatPeramban>;
beforeEach(() => {
  setelUlangLapisan();
  p = buatPeramban();
  vi.stubGlobal("window", p.win);
});
afterEach(() => {
  setelUlangLapisan();
  vi.unstubAllGlobals();
});

describe("lapisan: tombol Back HP menutup modal", () => {
  it("membuka lapisan menyisipkan satu entri; Back HP menutupnya dan tidak keluar halaman", async () => {
    const tutup = vi.fn();
    daftarLapisan(tutup);
    await tunggu();
    expect(p.entri.length).toBe(2);
    expect(p.idx).toBe(1);
    p.backHp();
    await tunggu();
    expect(tutup).toHaveBeenCalledTimes(1);
    expect(jumlahLapisan()).toBe(0);
    expect(p.idx).toBe(0); // masih di halaman yang sama (entri dasar)
  });

  it("menutup lewat tombol (✕) membuang entri penanda dan tidak memanggil tutup lagi", async () => {
    const tutup = vi.fn();
    const lepas = daftarLapisan(tutup);
    await tunggu();
    expect(p.idx).toBe(1);
    lepas();
    await tunggu();
    expect(p.idx).toBe(0);
    expect(tutup).not.toHaveBeenCalled();
    expect(jumlahLapisan()).toBe(0);
  });

  it("dua lapisan bertumpuk: Back menutup yang paling atas dulu", async () => {
    const a = vi.fn();
    const b = vi.fn();
    daftarLapisan(a);
    await tunggu();
    daftarLapisan(b);
    await tunggu();
    expect(p.idx).toBe(2);
    p.backHp();
    await tunggu();
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
    expect(jumlahLapisan()).toBe(1);
    p.backHp();
    await tunggu();
    expect(a).toHaveBeenCalledTimes(1);
    expect(jumlahLapisan()).toBe(0);
    expect(p.idx).toBe(0);
  });

  it("lapisan atas ditutup dengan ✕: lapisan di bawahnya tetap terbuka dan Back berikutnya menutupnya", async () => {
    const a = vi.fn();
    const b = vi.fn();
    daftarLapisan(a);
    await tunggu();
    const lepasB = daftarLapisan(b);
    await tunggu();
    lepasB();
    await tunggu();
    expect(p.idx).toBe(1);
    expect(a).not.toHaveBeenCalled();
    p.backHp();
    await tunggu();
    expect(a).toHaveBeenCalledTimes(1);
    expect(p.idx).toBe(0);
  });

  it("dibuka lalu langsung ditutup sebelum sempat disisipkan (StrictMode): tidak ada entri", async () => {
    const lepas = daftarLapisan(vi.fn());
    lepas();
    await tunggu();
    expect(p.entri.length).toBe(1);
    expect(p.idx).toBe(0);
  });

  it("entri penanda mati (pindah halaman saat lapisan terbuka) dilompati saat Back dari halaman baru", async () => {
    const tutup = vi.fn();
    const lepas = daftarLapisan(tutup);
    await tunggu();
    p.pindahHalaman("/kamera"); // mis. ketuk "Ambil ulang foto"
    lepas(); // komponen dilepas karena rute berganti; penanda bukan entri teratas
    await tunggu();
    expect(p.idx).toBe(2);
    p.backHp(); // dari /kamera -> entri penanda yang sudah mati
    await tunggu(150);
    expect(tutup).not.toHaveBeenCalled();
    expect(p.idx).toBe(0); // langsung ke entri dasar halaman, bukan berhenti di entri mati
  });

  it("popDariLapisan() bernilai true untuk popstate karena lapisan dan false untuk popstate biasa", async () => {
    daftarLapisan(vi.fn());
    await tunggu();
    p.backHp();
    await tunggu();
    expect(p.log.at(-1)).toBe(true);
    // popstate biasa: pindah halaman lalu Back (tanpa lapisan)
    p.pindahHalaman("/lain");
    p.backHp();
    await tunggu();
    expect(p.log.at(-1)).toBe(false);
  });

  it("Back HP menutup lapisan tepat satu kali dan membersihkan tumpukan", async () => {
    const a = vi.fn();
    daftarLapisan(a);
    await tunggu();
    p.backHp();
    await tunggu();
    expect(a).toHaveBeenCalledTimes(1);
    expect(jumlahLapisan()).toBe(0);
  });
});
