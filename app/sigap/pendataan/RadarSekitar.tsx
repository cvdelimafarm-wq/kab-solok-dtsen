"use client";

// app/sigap/pendataan/RadarSekitar.tsx
//
// (27 Okt 2026) Radar sekitar di Lembar Pendataan. Dinyalakan PPL/PML; selama menyala GPS dipantau terus (watchPosition) dan, selagi bergerak, dihitung KK di Sub SLS yang
// sedang dibuka yang berada dalam radius (bebas diatur 10-1000 m): berapa KK ada, berapa sudah punya hasil, berapa belum, plus KK belum didata terdekat (jarak + arah).
// Tampilan "Radar" (seperti radar pesawat/kapal): pusat = posisi Anda, utara di atas, sapuan berputar, tiap KK satu titik (kuning = belum, hijau = sudah) yang berkedip saat
// sapuan lewat; ketuk titik untuk membuka KK. Tampilan "Rincian" = angka + daftar terdekat.
// Hanya membaca: tidak menyimpan lokasi ke server. Pemantauan berhenti sendiri bila kartu ditutup / pindah tab / halaman ditinggalkan. Hitungan: lib/radarKk.ts.

import { useEffect, useMemo, useRef, useState } from "react";
import { HASIL_KK, type KkLembar } from "@/lib/pendataan";
import { KONFIG_BAWAAN, type KonfigLembar, type KonfigRadar } from "@/lib/lembarKonfig";
import {
  hitungRadar,
  mutuGps,
  normalisasiRadius,
  perluPerbarui,
  pesanGalatRadar,
  susunBlip,
  teksJarak,
  teksRingkasRadar,
  type Blip,
  type TitikRadar,
} from "@/lib/radarKk";

const KUNCI_RADIUS = "sigap_radar_radius";
const WARNA_MUTU = { baik: "bg-[#E3F6EC] text-[#13794B]", cukup: "bg-[#FFF4D6] text-[#8A6200]", lemah: "bg-[#FDE8E8] text-[#B42329]" } as const;
const TEKS_MUTU = { baik: "GPS baik", cukup: "GPS cukup", lemah: "GPS lemah" } as const;

function bacaRadiusTersimpan(c: KonfigRadar): number {
  try {
    const tersimpan = window.localStorage.getItem(KUNCI_RADIUS);
    return tersimpan === null ? c.radius_awal : normalisasiRadius(tersimpan, c.radius_awal, c.radius_min, c.radius_maks);
  } catch {
    return c.radius_awal;
  }
}

// (27 Okt 2026) detik per putaran sapuan: diatur per kegiatan (bawaan 4)
const cssRadar = (PUTAR_DETIK: number) => `
@keyframes radar-putar{to{transform:rotate(360deg)}}
@keyframes radar-kedip{0%{opacity:1}65%{opacity:.4}100%{opacity:.4}}
@keyframes radar-denyut{0%{transform:scale(.6);opacity:.8}100%{transform:scale(2.4);opacity:0}}
.radar-sapu{animation:radar-putar ${PUTAR_DETIK}s linear infinite}
.radar-blip{opacity:.4;animation:radar-kedip ${PUTAR_DETIK}s linear infinite}
.radar-denyut{animation:radar-denyut 2s ease-out infinite;transform-box:fill-box;transform-origin:center}
@media (prefers-reduced-motion: reduce){.radar-sapu,.radar-blip,.radar-denyut{animation:none!important}.radar-blip{opacity:1}}
`;
const PUSAT = 110;
const R = 100;
// ekor sapuan: irisan 5 derajat di sebelah kiri (berlawanan arah putaran) garis depan, makin ke ekor makin pudar
const IRISAN = Array.from({ length: 14 }, (_, i) => {
  const a1 = (i * 5 * Math.PI) / 180;
  const a2 = ((i + 1) * 5 * Math.PI) / 180;
  const t = (a: number) => `${(PUSAT - R * Math.sin(a)).toFixed(2)} ${(PUSAT - R * Math.cos(a)).toFixed(2)}`;
  return { d: `M${PUSAT} ${PUSAT} L${t(a1)} A${R} ${R} 0 0 0 ${t(a2)} Z`, o: 0.34 * (1 - i / 14) ** 1.6 };
});

function LayarRadar({ blip, radius, ringkas, onPilih, putar }: { blip: Blip[]; radius: number; ringkas: string; onPilih: (id: number) => void; putar: number }) {
  return (
    <div className="mx-auto w-full max-w-[340px]">
      <style>{cssRadar(putar)}</style>
      <svg viewBox="0 0 220 220" role="img" aria-label={`Radar sekitar, utara di atas. ${ringkas}`} className="block h-auto w-full select-none rounded-full shadow-[0_8px_24px_rgba(4,20,28,.35)]">
        <defs>
          <radialGradient id="radar-latar" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0B3B36" />
            <stop offset="100%" stopColor="#04141C" />
          </radialGradient>
        </defs>
        <circle cx={PUSAT} cy={PUSAT} r={R + 6} fill="#0A2530" stroke="#1B6B4A" strokeWidth="1.5" />
        <circle cx={PUSAT} cy={PUSAT} r={R} fill="url(#radar-latar)" />
        {[1 / 3, 2 / 3, 1].map((f) => (
          <g key={f}>
            <circle cx={PUSAT} cy={PUSAT} r={R * f} fill="none" stroke="#2FBF8A" strokeOpacity={0.4} strokeWidth="0.8" />
            <text x={PUSAT + 2} y={PUSAT - R * f + 7} fontSize="6.5" fill="#7FE3BC" fillOpacity={0.85}>{Math.round(radius * f)} m</text>
          </g>
        ))}
        <path d={`M${PUSAT} ${PUSAT - R}V${PUSAT + R}M${PUSAT - R} ${PUSAT}H${PUSAT + R}`} stroke="#2FBF8A" strokeOpacity={0.3} strokeWidth="0.7" />
        {[45, 135, 225, 315].map((d) => (
          <line key={d} x1={PUSAT} y1={PUSAT} x2={PUSAT + R * Math.sin((d * Math.PI) / 180)} y2={PUSAT - R * Math.cos((d * Math.PI) / 180)} stroke="#2FBF8A" strokeOpacity={0.15} strokeWidth="0.6" />
        ))}
        <text x={PUSAT} y="9" textAnchor="middle" fontSize="8" fontWeight="700" fill="#9DF0CD">U</text>
        <text x={PUSAT} y="219" textAnchor="middle" fontSize="8" fill="#7FE3BC" fillOpacity={0.8}>S</text>
        <text x="214" y="113" textAnchor="middle" fontSize="8" fill="#7FE3BC" fillOpacity={0.8}>T</text>
        <text x="6" y="113" textAnchor="middle" fontSize="8" fill="#7FE3BC" fillOpacity={0.8}>B</text>

        <g className="radar-sapu" style={{ transformOrigin: `${PUSAT}px ${PUSAT}px` }} aria-hidden="true">
          {IRISAN.map((x, i) => (
            <path key={i} d={x.d} fill="#3DDC97" fillOpacity={x.o} />
          ))}
          <line x1={PUSAT} y1={PUSAT} x2={PUSAT} y2={PUSAT - R} stroke="#9DF0CD" strokeWidth="1.2" strokeOpacity={0.9} />
        </g>

        {blip.map((b) => {
          const cx = PUSAT + b.x * R;
          const cy = PUSAT - b.y * R;
          return (
            <g key={b.id} onClick={() => onPilih(b.id)} style={{ cursor: "pointer" }}>
              <circle cx={cx} cy={cy} r="9" fill="transparent" />
              <circle cx={cx} cy={cy} r={b.sudah ? 3 : 4} fill={b.sudah ? "#3DDC97" : "#FFB020"} stroke={b.sudah ? "#CFFBE6" : "#FFE7B0"} strokeWidth="0.8" className="radar-blip" style={{ animationDelay: `${((b.sudut / 360) * putar).toFixed(2)}s` }}>
                <title>{`${b.nama} · ${b.sudah ? "sudah" : "belum"} didata · ${teksJarak(b.jarak)}`}</title>
              </circle>
            </g>
          );
        })}

        <circle cx={PUSAT} cy={PUSAT} r="4" fill="#5CC8FF" fillOpacity={0.6} className="radar-denyut" />
        <path d={`M${PUSAT} ${PUSAT - 6}L${PUSAT + 4.6} ${PUSAT + 4.6}L${PUSAT} ${PUSAT + 2.2}L${PUSAT - 4.6} ${PUSAT + 4.6}Z`} fill="#FFFFFF" stroke="#5CC8FF" strokeWidth="1" />
      </svg>
      <p className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-semibold text-[#52627A]">
        <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full bg-[#FFB020]" />belum didata</span>
        <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full bg-[#3DDC97]" />sudah didata</span>
        <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full bg-[#5CC8FF]" />Anda</span>
      </p>
      <p className="text-center text-[10.5px] text-[#6B7A90]">Utara di atas · cincin = jarak dari Anda · ketuk titik untuk membuka KK</p>
    </div>
  );
}

export default function RadarSekitar({ kk, sayaAkun, onPosisi, onPilih, konfig = KONFIG_BAWAAN }: { kk: KkLembar[]; sayaAkun: number; onPosisi?: (p: TitikRadar) => void; onPilih: (id: number) => void; konfig?: KonfigLembar }) {
  const cfg = konfig.radar;
  const [aktif, setAktif] = useState(false);
  const [radius, setRadius] = useState(cfg.radius_awal);
  const [ketik, setKetik] = useState(String(cfg.radius_awal));
  const [posisi, setPosisi] = useState<TitikRadar | null>(null);
  const [akurasi, setAkurasi] = useState<number | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [semuaTerdekat, setSemuaTerdekat] = useState(false);
  const [tampilan, setTampilan] = useState<"radar" | "rincian">(cfg.tampilan_awal);
  const terakhir = useRef<{ posisi: TitikRadar; waktu: number } | null>(null);
  const onPosisiRef = useRef(onPosisi);
  onPosisiRef.current = onPosisi;
  const aturanRef = useRef(cfg);
  aturanRef.current = cfg;

  useEffect(() => {
    const r = bacaRadiusTersimpan(cfg);
    setRadius(r);
    setKetik(String(r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.radius_awal, cfg.radius_min, cfg.radius_maks]);

  useEffect(() => {
    if (!aktif) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGalat("Perangkat ini tidak punya GPS.");
      setAktif(false);
      return;
    }
    setGalat(null);
    terakhir.current = null;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const baru = { posisi: { lat: p.coords.latitude, lng: p.coords.longitude }, waktu: Date.now() };
        setAkurasi(Number.isFinite(p.coords.accuracy) ? Math.round(p.coords.accuracy) : null);
        setGalat(null);
        if (perluPerbarui(terakhir.current, baru, { gerak_m: aturanRef.current.gerak_minimal_m, jeda_detik: aturanRef.current.jeda_detik })) {
          terakhir.current = baru;
          setPosisi(baru.posisi);
          onPosisiRef.current?.(baru.posisi);
        }
      },
      (e) => {
        setGalat(pesanGalatRadar(e?.code));
        if (e?.code === 1) setAktif(false); // izin ditolak: tidak ada gunanya terus mencoba
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [aktif]);

  function simpanRadius(nilai: unknown) {
    const r = normalisasiRadius(nilai, radius, cfg.radius_min, cfg.radius_maks);
    setRadius(r);
    setKetik(String(r));
    try {
      window.localStorage.setItem(KUNCI_RADIUS, String(r));
    } catch {
      /* penyimpanan peramban tidak tersedia: radius hanya berlaku selama halaman terbuka */
    }
  }

  const hasil = useMemo(() => (aktif && posisi ? hitungRadar(kk, posisi, radius, sayaAkun) : null), [aktif, posisi, kk, radius, sayaAkun]);
  const blip = useMemo(() => (aktif && posisi ? susunBlip(kk, posisi, radius) : []), [aktif, posisi, kk, radius]);
  const mutu = mutuGps(akurasi);

  if (!cfg.aktif) return null; // radar dimatikan admin untuk kegiatan ini

  return (
    <section aria-label="Radar sekitar" className="mx-2.5 mt-2.5 rounded-[16px] bg-white p-3 shadow-[0_8px_22px_rgba(15,42,82,.08)]">
      <div className="flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="text-[13.5px] font-extrabold text-[#0F2A52]">Radar sekitar</h2>
          <p className="text-[11.5px] leading-snug text-[#6B7A90]">
            {aktif ? (hasil ? teksRingkasRadar(hasil) : "Mencari posisi Anda…") : "Hitung KK di sekitar Anda selagi bergerak: sudah dan belum didata."}
          </p>
        </div>
        <button
          type="button"
          aria-pressed={aktif}
          onClick={() => {
            setAktif((x) => !x);
            if (aktif) setPosisi(null);
          }}
          className={`min-h-[44px] flex-none rounded-full px-4 text-[13px] font-extrabold ${aktif ? "bg-[#FDE8E8] text-[#B42329]" : "bg-[#1F5FD1] text-white"}`}
        >
          {aktif ? "Matikan" : "Nyalakan"}
        </button>
      </div>

      {galat && <p className="mt-2 rounded-[10px] bg-[#FDE8E8] px-3 py-2 text-[12px] font-semibold leading-snug text-[#7A1D22]">{galat}</p>}

      {aktif && (
        <div className="mt-2.5 space-y-2.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="text-[11.5px] font-bold text-[#52627A]">Radius</span>
            {cfg.radius_pilihan.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={radius === r}
                onClick={() => simpanRadius(r)}
                className={`min-h-[40px] rounded-full px-3 text-[12px] font-extrabold ${radius === r ? "bg-[#0F2A52] text-white" : "bg-[#EEF2F7] text-[#55657D]"}`}
              >
                {r} m
              </button>
            ))}
            <label className="inline-flex min-h-[40px] items-center gap-1 rounded-full bg-[#EEF2F7] pl-3 pr-2 text-[12px] font-bold text-[#55657D]">
              Atur
              <input
                type="number"
                inputMode="numeric"
                min={cfg.radius_min}
                max={cfg.radius_maks}
                step={10}
                value={ketik}
                aria-label={`Radius dalam meter, ${cfg.radius_min} sampai ${cfg.radius_maks}`}
                onChange={(e) => setKetik(e.target.value)}
                onBlur={() => simpanRadius(ketik)}
                onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur(), undefined)}
                className="h-[32px] w-[64px] rounded-[8px] border border-[#CBD6E6] bg-white px-1.5 text-center text-[13px] font-extrabold text-[#0F2A52]"
              />
              m
            </label>
          </div>

          {posisi && (
            <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#6B7A90]">
              <span className={`rounded-full px-2 py-0.5 font-extrabold ${WARNA_MUTU[mutu]}`}>{TEKS_MUTU[mutu]}{akurasi !== null ? ` ±${akurasi} m` : ""}</span>
              {mutu === "lemah" && <span>Hitungan bisa meleset; keluar ke tempat terbuka.</span>}
            </p>
          )}

          {hasil && (
            <>
              <div role="group" aria-label="Tampilan radar" className="grid grid-cols-2 gap-1 rounded-[12px] bg-[#EEF2F7] p-1">
                {(
                  [
                    ["radar", "Radar"],
                    ["rincian", "Rincian"],
                  ] as ["radar" | "rincian", string][]
                ).map(([k, t]) => (
                  <button key={k} type="button" aria-pressed={tampilan === k} onClick={() => setTampilan(k)} className={`min-h-[40px] rounded-[9px] text-[12.5px] font-extrabold ${tampilan === k ? "bg-white text-[#0F2A52] shadow-sm" : "text-[#52627A]"}`}>
                    {t}
                  </button>
                ))}
              </div>
              {tampilan === "radar" && <LayarRadar blip={blip} radius={radius} ringkas={teksRingkasRadar(hasil)} onPilih={onPilih} putar={cfg.putar_detik} />}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-[12px] bg-[#F1F5FC] px-1 py-2">
                  <b className="block text-[20px] leading-none text-[#0F2A52]">{hasil.total}</b>
                  <small className="text-[11px] text-[#6B7A90]">KK ada</small>
                </div>
                <div className="rounded-[12px] bg-[#E3F6EC] px-1 py-2">
                  <b className="block text-[20px] leading-none text-[#13794B]">{hasil.sudah}</b>
                  <small className="text-[11px] text-[#13794B]">sudah didata</small>
                </div>
                <div className="rounded-[12px] bg-[#FFF4D6] px-1 py-2">
                  <b className="block text-[20px] leading-none text-[#8A6200]">{hasil.belum}</b>
                  <small className="text-[11px] text-[#8A6200]">belum</small>
                </div>
              </div>
              {hasil.total > 0 && (
                <div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#FFE2A0]" role="img" aria-label={`${hasil.sudah} dari ${hasil.total} KK sudah didata`}>
                    <div className="h-full rounded-full bg-[#157A3E]" style={{ width: `${hasil.persen}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] text-[#6B7A90]">
                    {hasil.persen}% sudah{HASIL_KK.filter((h) => konfig.hasil[h].aktif || hasil[h] > 0).map((h) => ` · ${konfig.hasil[h].label_pendek.toLowerCase()} ${hasil[h]}`).join("")}
                    {hasil.oleh_saya > 0 ? ` · oleh saya ${hasil.oleh_saya}` : ""}
                  </p>
                </div>
              )}

              {hasil.terdekat_belum.length > 0 && (
                <div>
                  <p className="mb-1 text-[11.5px] font-extrabold text-[#52627A]">Belum didata, terdekat</p>
                  <ul className="divide-y divide-[#EEF2F7]">
                    {(semuaTerdekat ? hasil.terdekat_belum : hasil.terdekat_belum.slice(0, 3)).map((t) => (
                      <li key={t.id}>
                        <button type="button" onClick={() => onPilih(t.id)} className="flex min-h-[44px] w-full items-center gap-2 text-left text-[13px]">
                          <span className="min-w-0 flex-1 truncate font-bold text-[#1B2B4B]">{t.no ? `${t.no}. ` : ""}{t.nama}</span>
                          <span className="flex-none text-[12px] font-bold text-[#1F5FD1]">
                            {teksJarak(t.jarak)} · {t.arah}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {hasil.terdekat_belum.length > 3 && (
                    <button type="button" onClick={() => setSemuaTerdekat((x) => !x)} className="min-h-[44px] text-[12px] font-extrabold text-[#1F5FD1]">
                      {semuaTerdekat ? "Tampilkan lebih sedikit" : `Tampilkan ${hasil.terdekat_belum.length} terdekat`}
                    </button>
                  )}
                </div>
              )}
              {hasil.terdekat_belum.length === 0 && hasil.terdekat_belum_jauh && (
                <p className="rounded-[10px] bg-[#EEF4FF] px-3 py-2 text-[12px] text-[#1B2B4B]">
                  Semua KK di radius ini sudah didata. KK belum didata terdekat: <b>{hasil.terdekat_belum_jauh.nama}</b>, {teksJarak(hasil.terdekat_belum_jauh.jarak)} ke {hasil.terdekat_belum_jauh.arah}.
                </p>
              )}
              {hasil.tanpa_koordinat > 0 && <p className="text-[11px] text-[#6B7A90]">{hasil.tanpa_koordinat} KK di Sub SLS ini tanpa koordinat tidak ikut dihitung (lihat di Daftar KK).</p>}
              <p className="text-[11px] text-[#6B7A90]">Hanya KK Sub SLS yang sedang dibuka. Lokasi Anda tidak dikirim ke server.</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
