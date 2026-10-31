// app/portal/lapisan.ts  (hanya klien)
//
// (29 Okt 2026) Tombol Back HP = tombol tutup untuk modal / layar penuh ("lapisan").
// Permintaan user: di HP, Back harus menutup modal foto (sama seperti ketuk ✕), bukan keluar dari halaman.
//
// Cara kerja:
//  - Lapisan terbuka -> satu entri riwayat penanda disisipkan (pushState, alamat sama, state membawa `sigapLapisan: <id>`).
//  - Back HP -> peramban mundur ke entri di bawah penanda -> kita menutup lapisan di atasnya (tumpukan: yang terakhir dibuka ditutup dulu).
//  - Lapisan ditutup dengan cara lain (✕, tombol Batal, dll.) -> penanda dibuang dengan history.back() bila masih entri teratas,
//    sehingga riwayat tidak menumpuk dan Back berikutnya tetap normal.
//  - Entri penanda "mati" (lapisan sudah tidak ada, mis. setelah pindah halaman lalu kembali) otomatis dilompati.
//  - popstate yang berasal dari lapisan diberi tanda; pemilik popstate lain (Lembar Pendataan, Admin, dst.) memanggil popDariLapisan()
//    dan mengabaikannya, supaya menutup modal tidak ikut menutup Sub SLS / tab.
// Logika ini bukan keamanan data, hanya kenyamanan navigasi.

type Lapisan = { id: string; tutup: () => void };

let tumpukan: Lapisan[] = [];
let cacah = 0;
let terpasang = false;
let tandaPop = false;
let kembaliSendiri: number[] = []; // waktu kedaluwarsa tiap history.back() yang kita panggil sendiri

const MASA_KEMBALI_MS = 1500;

function idDari(state: unknown): string | null {
  if (!state || typeof state !== "object") return null;
  const v = (state as Record<string, unknown>).sigapLapisan;
  return typeof v === "string" ? v : null;
}

function bersihkanKembali() {
  const sekarang = Date.now();
  kembaliSendiri = kembaliSendiri.filter((t) => t > sekarang);
}

function kembaliDariKita() {
  kembaliSendiri.push(Date.now() + MASA_KEMBALI_MS);
  window.history.back();
}

function saatPop(e: PopStateEvent) {
  bersihkanKembali();
  let dari = false;
  if (kembaliSendiri.length > 0) {
    kembaliSendiri.shift();
    dari = true;
  }
  const id = idDari(e.state);
  if (id !== null && !tumpukan.some((l) => l.id === id)) {
    // entri penanda mati: lompati. Popstate ke entri dasar sesudahnya TIDAK diberi tanda, jadi halaman (mis. Lembar Pendataan)
    // tetap menyelaraskan tampilannya dengan alamat seperti Back biasa.
    tandaPop = true;
    setTimeout(() => (tandaPop = false), 0);
    window.history.back();
    return;
  }
  const idx = id === null ? -1 : tumpukan.findIndex((l) => l.id === id);
  const ditutup = tumpukan.splice(idx + 1);
  if (ditutup.length > 0) dari = true;
  for (const l of ditutup.reverse()) {
    try {
      l.tutup();
    } catch {
      /* abaikan */
    }
  }
  tandaPop = dari;
  if (dari) setTimeout(() => (tandaPop = false), 0);
}

/** Dipasang sekali (PenjagaKembali di layout, dan oleh hook bila belum). Listener fase-tangkap supaya jalan lebih dulu dari popstate lain. */
export function pasangPenjagaLapisan() {
  if (terpasang || typeof window === "undefined") return;
  terpasang = true;
  window.addEventListener("popstate", saatPop, true);
}

/**
 * Dipanggil popstate milik halaman lain: true bila peristiwa ini hanya karena sebuah lapisan menutup/terbuka (abaikan saja).
 * Hanya bermakna di dalam penanganan popstate itu sendiri.
 */
export function popDariLapisan(): boolean {
  return tandaPop;
}

function lepas(id: string) {
  const i = tumpukan.findIndex((l) => l.id === id);
  if (i < 0) return;
  tumpukan.splice(i, 1);
  if (idDari(window.history.state) === id) kembaliDariKita();
}

function dorong(tutup: () => void): () => void {
  const id = `l${++cacah}`;
  const st = window.history.state;
  window.history.pushState({ ...(st && typeof st === "object" ? (st as Record<string, unknown>) : {}), sigapLapisan: id }, "", window.location.href);
  tumpukan.push({ id, tutup });
  return () => lepas(id);
}

/**
 * Daftarkan lapisan yang baru terbuka. Mengembalikan fungsi pelepas (panggil saat lapisan ditutup dari dalam).
 * Bila ada history.back() milik kita yang belum selesai, penyisipan ditunda sebentar agar tidak tertukar.
 */
export function daftarLapisan(tutup: () => void): () => void {
  pasangPenjagaLapisan();
  let batal = false;
  let pelepas: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const coba = (sisa: number) => {
    if (batal) return;
    bersihkanKembali();
    if (kembaliSendiri.length > 0 && sisa > 0) {
      timer = setTimeout(() => coba(sisa - 1), 40);
      return;
    }
    pelepas = dorong(tutup);
  };
  timer = setTimeout(() => coba(40), 0); // tunda satu putaran: aman terhadap StrictMode dan buka-tutup cepat
  return () => {
    batal = true;
    if (timer) clearTimeout(timer);
    pelepas?.();
  };
}

/**
 * Jalankan `fn` (biasanya router.push) SESUDAH lapisan yang baru ditutup selesai membuang entri penandanya.
 * (31 Okt 2026) Menutup lapisan memanggil history.back() yang tak sinkron; router.push yang dijalankan bersamaan dikalahkan oleh mundur itu, sehingga
 * tombol modal "Ya, lanjut" tidak berpindah halaman (Kamera dari bar bawah). Panggil SESUDAH menutup lapisan (setState false), bukan sebelumnya.
 */
export function setelahLapisanTutup(fn: () => void) {
  const coba = (sisa: number) => {
    bersihkanKembali();
    if (kembaliSendiri.length > 0 && sisa > 0) {
      setTimeout(() => coba(sisa - 1), 40);
      return;
    }
    fn();
  };
  setTimeout(() => coba(40), 60); // beri waktu agar pembersihan lapisan (unmount) sempat mendaftarkan history.back()-nya
}

/** Khusus uji: kembalikan keadaan modul. */
export function setelUlangLapisan() {
  tumpukan = [];
  cacah = 0;
  tandaPop = false;
  kembaliSendiri = [];
  if (terpasang && typeof window !== "undefined") window.removeEventListener("popstate", saatPop, true);
  terpasang = false;
}

/** Khusus uji: jumlah lapisan terdaftar. */
export function jumlahLapisan(): number {
  return tumpukan.length;
}
