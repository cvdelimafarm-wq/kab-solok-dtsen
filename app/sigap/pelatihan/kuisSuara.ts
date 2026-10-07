// app/sigap/pelatihan/kuisSuara.ts
//
// (7 Okt 2026) Kuis Live -- musik & efek suara, disintesis langsung di browser (Web Audio API).
// Semua melodi ORIGINAL (bukan musik Kahoot atau lagu berhak cipta) dan tanpa berkas audio apa pun.
// Layar host: musik lobi + musik soal + tik detik terakhir + waktu habis + fanfare. HP peserta: efek pendek (default MATI).
// Browser baru boleh memutar suara setelah ada interaksi pengguna; AudioContext dibuat lazily dan di-resume saat dipakai.

export type NamaMusik = "lobi" | "soal";
export type NamaEfek = "klik" | "tik" | "habis" | "benar" | "salah" | "fanfare" | "selesai";

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

type Pola = { bpm: number; mel: (number | null)[]; bas: (number | null)[]; tipeMel: OscillatorType; tipeBas: OscillatorType; volMel: number; volBas: number };
const POLA: Record<NamaMusik, Pola> = {
  // lobi: ceria, tangga nada pentatonik C, 128 bpm (8 ketukan per putaran x 2)
  lobi: {
    bpm: 128,
    mel: [72, 76, 79, 76, 74, 77, 81, 77, 72, 76, 79, 84, 83, 79, 76, 74],
    bas: [48, null, 55, null, 53, null, 57, null, 48, null, 55, null, 55, null, 50, null],
    tipeMel: "triangle",
    tipeBas: "square",
    volMel: 0.16,
    volBas: 0.06,
  },
  // soal: tegang & berdetak, A minor, 152 bpm
  soal: {
    bpm: 152,
    mel: [69, null, 72, 69, 76, null, 72, 69, 67, null, 71, 67, 74, null, 71, 67],
    bas: [45, 45, 45, 45, 45, 45, 45, 45, 43, 43, 43, 43, 41, 41, 43, 43],
    tipeMel: "square",
    tipeBas: "triangle",
    volMel: 0.07,
    volBas: 0.14,
  },
};

type Ctx = AudioContext;
let ctx: Ctx | null = null;
let master: GainNode | null = null;
let aktif = false;
let musikSekarang: NamaMusik | null = null;
let pewaktu: ReturnType<typeof setInterval> | null = null;
let langkah = 0;
let nextT = 0;

function pastikanCtx(): Ctx | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  return ctx;
}

function nada(tipe: OscillatorType, freq: number, t: number, dur: number, vol: number, ke: AudioNode, akhirFreq?: number) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = tipe;
  o.frequency.setValueAtTime(freq, t);
  if (akhirFreq) o.frequency.exponentialRampToValueAtTime(akhirFreq, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(ke);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Nyalakan/matikan seluruh suara. Mematikan juga menghentikan musik. */
export function setSuaraAktif(v: boolean) {
  aktif = v;
  if (v) pastikanCtx();
  else hentikanMusik();
}
export const suaraAktif = () => aktif;

export function hentikanMusik() {
  if (pewaktu) clearInterval(pewaktu);
  pewaktu = null;
  musikSekarang = null;
  if (ctx && master) {
    // fade cepat lalu sambungkan master baru agar nada yang sudah terjadwal ikut senyap
    const lama = master;
    try {
      lama.gain.cancelScheduledValues(ctx.currentTime);
      lama.gain.setValueAtTime(lama.gain.value, ctx.currentTime);
      lama.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
      const baru = ctx.createGain();
      baru.gain.value = 0.9;
      baru.connect(ctx.destination);
      master = baru;
      setTimeout(() => {
        try {
          lama.disconnect();
        } catch {
          /* abaikan */
        }
      }, 300);
    } catch {
      /* abaikan */
    }
  }
}

/** Putar musik berulang. Memanggil lagi dengan musik yang sama tidak mengulang dari awal. */
export function putarMusik(nama: NamaMusik) {
  if (!aktif) return;
  if (musikSekarang === nama && pewaktu) return;
  const c = pastikanCtx();
  if (!c) return;
  hentikanMusik();
  musikSekarang = nama;
  const p = POLA[nama];
  const dt = 60 / p.bpm / 2; // satu langkah = not 1/8
  langkah = 0;
  nextT = c.currentTime + 0.08;
  const jadwal = () => {
    if (!ctx || !master || musikSekarang !== nama) return;
    while (nextT < ctx.currentTime + 0.3) {
      const m = p.mel[langkah % p.mel.length];
      const b = p.bas[langkah % p.bas.length];
      if (m != null) nada(p.tipeMel, hz(m), nextT, dt * 0.9, p.volMel, master);
      if (b != null) nada(p.tipeBas, hz(b - 12), nextT, dt * 0.95, p.volBas, master);
      langkah++;
      nextT += dt;
    }
  };
  jadwal();
  pewaktu = setInterval(jadwal, 60);
}

/** Efek pendek (tidak menghentikan musik). */
export function efek(nama: NamaEfek) {
  if (!aktif) return;
  const c = pastikanCtx();
  if (!c || !master) return;
  const t = c.currentTime + 0.01;
  const m = master;
  switch (nama) {
    case "klik":
      nada("sine", 660, t, 0.08, 0.25, m, 880);
      break;
    case "tik":
      nada("square", 1100, t, 0.05, 0.12, m);
      break;
    case "habis": // buzzer waktu habis
      nada("sawtooth", 220, t, 0.45, 0.2, m, 150);
      nada("sawtooth", 233, t, 0.45, 0.14, m, 155);
      break;
    case "benar": // naik ceria
      [72, 76, 79, 84].forEach((n, i) => nada("triangle", hz(n), t + i * 0.09, 0.22, 0.28, m));
      break;
    case "salah": // turun murung
      [64, 60].forEach((n, i) => nada("sawtooth", hz(n), t + i * 0.16, 0.3, 0.16, m));
      break;
    case "fanfare": // podium
      [72, 72, 72, 76, 79, 76, 79, 84].forEach((n, i) => {
        const at = t + (i < 3 ? i * 0.14 : 0.42 + (i - 3) * 0.2);
        nada("square", hz(n), at, i === 7 ? 0.9 : 0.2, 0.14, m);
        nada("triangle", hz(n - 12), at, i === 7 ? 0.9 : 0.2, 0.2, m);
      });
      break;
    case "selesai": // penutup sederhana di HP
      [76, 79, 84].forEach((n, i) => nada("triangle", hz(n), t + i * 0.12, 0.3, 0.26, m));
      break;
  }
}
