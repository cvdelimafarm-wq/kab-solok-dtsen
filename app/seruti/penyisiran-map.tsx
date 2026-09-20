"use client";

// app/seruti/penyisiran-map.tsx
//
// Peta Leaflet utk tab Penyisiran Usaha. File ini SELALU dimuat lewat
// next/dynamic(..., { ssr: false }) dari penyisiran-usaha.tsx -- Leaflet
// butuh `window`/`document` yang tidak ada saat Next.js merender di
// server, jadi komponen ini tidak boleh ikut proses server-render sama
// sekali. Pakai CircleMarker (bukan L.marker/ikon default) utk marker
// SAMPEL supaya tidak kena masalah klasik "ikon default Leaflet patah" di
// bundler seperti Webpack/Next.js (ikon itu rujuk file gambar lewat path
// relatif yang tidak ikut ke-bundle).
//
// Marker LOKASI PENGGUNA (live tracking, lihat prop userLocation) BEDA
// caranya -- pakai L.marker + L.divIcon (elemen HTML sungguhan, bukan
// canvas) supaya animasi CSS "pulse" bisa jalan. Posisinya di-UPDATE lewat
// setLatLng() pada marker yang SAMA tiap kali koordinat berubah (bukan
// dihapus-buat-ulang spt marker sampel) -- krn GPS bisa update tiap
// beberapa detik, kalau ikut logika hapus/buat ulang spt marker sampel
// bisa boros & flicker.

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface MarkerRow {
  kode_identitas: string;
  nama_kk: string | null;
  alamat: string | null;
  nagari_nama: string | null;
  lat: number;
  lng: number;
  status_kunjungan: string;
}

export interface UserLocation {
  lat: number;
  lng: number;
  accuracy?: number | null;
}

const WARNA_STATUS: Record<string, string> = {
  belum: "#6b7280",
  ditemukan: "#0ca30c",
  tidak_ditemukan: "#fab219",
  tidak_bisa: "#d03b3b",
  sudah_didata_se2026: "#d03b3b",
};

const LABEL_STATUS: Record<string, string> = {
  belum: "Belum Dikunjungi",
  ditemukan: "Usaha Ditemukan",
  tidak_ditemukan: "Usaha Tidak Ditemukan",
  tidak_bisa: "Tidak Bisa Ditemui / Pindah",
  sudah_didata_se2026: "Sudah Didata di SE2026",
};

// Solok kira-kira -0.9 s/d -1.8 lintang, 100.5 s/d 101.5 bujur.
const PUSAT_DEFAULT: [number, number] = [-1.15, 100.9];

// Jarak lurus (haversine, km) -- salinan kecil dari helper yang sama di
// penyisiran-usaha.tsx (sengaja tidak diimpor lintas file dynamic-import
// supaya komponen peta ini tetap berdiri sendiri/gampang dipisah).
function jarakKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Ikon "titik biru + cincin pulse" utk lokasi pengguna -- CSS murni (bukan
// gambar), jadi tidak ada masalah bundling ikon spt marker default
// Leaflet. Dibuat sekali (module-level), dipakai ulang tiap render.
const USER_ICON = L.divIcon({
  className: "",
  html: `<span style="position:relative;display:block;width:16px;height:16px;">
           <span style="position:absolute;inset:-10px;border-radius:9999px;background:rgba(65,84,126,0.25);animation:penyisiran-pulse 1.8s ease-out infinite;"></span>
           <span style="position:absolute;inset:0;border-radius:9999px;background:#2563eb;border:2px solid #ffffff;box-shadow:0 0 0 1px rgba(0,0,0,0.15);"></span>
         </span>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

let pulseStyleInjected = false;
function pastikanPulseStyle() {
  if (pulseStyleInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.textContent = `@keyframes penyisiran-pulse {
    0% { transform: scale(0.4); opacity: 0.9; }
    100% { transform: scale(1); opacity: 0; }
  }`;
  document.head.appendChild(style);
  pulseStyleInjected = true;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default function PenyisiranMap({
  markers,
  userLocation,
  onLihatDetail,
}: {
  markers: MarkerRow[];
  userLocation?: UserLocation | null;
  // Diklik dari tombol "Lihat Detail" pada popup marker -- BEDA dari
  // tombol "🧭 Navigasi" (tetap link Google Maps spt sebelumnya). Sesuai
  // permintaan user: "Lihat Detail" TIDAK lagi membuka Google Maps,
  // melainkan menggulung layar ke kartu keluarga yg sama di daftar
  // (lihat pemanggilnya di penyisiran-usaha.tsx -- dioper
  // handleKlikSampelTerdekat yg sudah ada, scroll+highlight+buka mode
  // Detail).
  onLihatDetail?: (kode: string) => void;
}) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const userAccuracyRef = useRef<L.Circle | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  // Koordinat pengguna TERBARU disimpan di ref (bukan cuma prop) supaya
  // handler klik marker sampel (dipasang sekali per marker) selalu bisa
  // baca posisi terkini tanpa perlu menghapus-pasang ulang seluruh layer
  // sampel tiap kali GPS bergerak.
  const userLocRef = useRef<UserLocation | null | undefined>(userLocation);
  userLocRef.current = userLocation;
  // Sama pola dgn userLocRef di atas -- disimpan di ref (bukan dipakai
  // langsung sbg closure/dependency effect) supaya callback ini SELALU
  // yg terbaru tanpa memaksa effect gambar-marker di bawah re-run tiap
  // kali parent re-render (onLihatDetail dari penyisiran-usaha.tsx bukan
  // fungsi yg di-useCallback, jadi identitasnya beda tiap render).
  const onLihatDetailRef = useRef<((kode: string) => void) | undefined>(onLihatDetail);
  onLihatDetailRef.current = onLihatDetail;

  // Inisialisasi peta sekali saja.
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    pastikanPulseStyle();
    const map = L.map(mapDivRef.current, { preferCanvas: true }).setView(PUSAT_DEFAULT, 10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      userMarkerRef.current = null;
      userAccuracyRef.current = null;
      routeLineRef.current = null;
    };
  }, []);

  function gambarGarisRute(sasaran: [number, number]) {
    const map = mapRef.current;
    const u = userLocRef.current;
    if (!map) return;
    if (routeLineRef.current) {
      routeLineRef.current.remove();
      routeLineRef.current = null;
    }
    if (!u) return;
    routeLineRef.current = L.polyline(
      [
        [u.lat, u.lng],
        sasaran,
      ],
      { color: "#41547E", weight: 2.5, dashArray: "6 6", opacity: 0.8 }
    ).addTo(map);
  }

  // Render ulang marker SAMPEL tiap kali daftar berubah (filter/status
  // berubah) -- pola LAMA tetap dipertahankan (hapus semua, gambar ulang)
  // krn daftar sampel memang tidak sesering berubah spt posisi GPS.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    const bounds: [number, number][] = [];

    for (const m of markers) {
      const warna = WARNA_STATUS[m.status_kunjungan] ?? WARNA_STATUS.belum;
      const marker = L.circleMarker([m.lat, m.lng], {
        radius: 7,
        color: "#ffffff",
        weight: 1.5,
        fillColor: warna,
        fillOpacity: 0.9,
      });
      const label = LABEL_STATUS[m.status_kunjungan] ?? m.status_kunjungan;
      const u = userLocRef.current;
      const jarakTxt = u ? `${jarakKm(u.lat, u.lng, m.lat, m.lng).toFixed(1)} km dari Anda` : null;
      const mapsViewUrl = `https://www.google.com/maps?q=${m.lat},${m.lng}`;
      const navUrl = u
        ? `https://www.google.com/maps/dir/?api=1&origin=${u.lat},${u.lng}&destination=${m.lat},${m.lng}`
        : mapsViewUrl;
      // "Lihat Detail" SEKARANG tombol (bukan link Google Maps lagi) --
      // dipasangi listener klik di popupopen di bawah, memanggil
      // onLihatDetail (scroll ke kartu keluarga yg sama di daftar).
      // "🧭 Navigasi" TETAP link Google Maps spt sebelumnya, tidak berubah.
      marker.bindPopup(
        `<div style="font-size:12px;line-height:1.5;min-width:170px">
           <b>${escapeHtml(m.nama_kk || "(tanpa nama)")}</b><br/>
           <span style="color:#898781">ID: ${escapeHtml(m.kode_identitas)}</span><br/>
           ${escapeHtml(m.alamat || "-")}<br/>
           <span style="color:${warna};font-weight:600">● ${escapeHtml(label)}</span><br/>
           <span style="color:#898781">${escapeHtml(m.nagari_nama || "")}</span>
           ${jarakTxt ? `<br/><span style="color:#41547E;font-weight:600">📍 ${jarakTxt}</span>` : ""}
           <div style="margin-top:6px;display:flex;gap:6px">
             <button type="button" class="popup-lihat-detail"
                style="flex:1;text-align:center;padding:4px 6px;border:1px solid #d8d5cd;border-radius:6px;background:#ffffff;color:#1B2A4A;font:inherit;font-weight:600;cursor:pointer">Lihat Detail</button>
             <a href="${navUrl}" target="_blank" rel="noreferrer"
                style="flex:1;text-align:center;padding:4px 6px;border-radius:6px;background:#1B2A4A;color:#ffffff;text-decoration:none;font-weight:600">🧭 Navigasi</a>
           </div>
         </div>`
      );
      marker.on("popupopen", () => {
        gambarGarisRute([m.lat, m.lng]);
        // Tombol dibuat SEKALI oleh bindPopup (bukan setiap popup dibuka),
        // jadi listener klik cuma dipasang sekali jg (ditandai
        // dataset.bound) supaya tidak dobel-terpasang tiap popup
        // dibuka-tutup berkali-kali.
        const popupEl = marker.getPopup()?.getElement();
        const btn = popupEl?.querySelector<HTMLButtonElement>(".popup-lihat-detail");
        if (btn && btn.dataset.bound !== "1") {
          btn.dataset.bound = "1";
          btn.addEventListener("click", () => {
            map.closePopup();
            onLihatDetailRef.current?.(m.kode_identitas);
          });
        }
      });
      marker.on("popupclose", () => {
        if (routeLineRef.current) {
          routeLineRef.current.remove();
          routeLineRef.current = null;
        }
      });
      marker.addTo(layer);
      bounds.push([m.lat, m.lng]);
    }

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 });
    }
  }, [markers]);

  // Marker lokasi PENGGUNA -- dibuat SEKALI, lalu posisinya diperbarui
  // lewat setLatLng() tiap koordinat baru masuk (TIDAK dihapus-buat ulang)
  // sesuai permintaan optimasi performa. Lingkaran akurasi GPS (radius
  // meter) ikut digambar/diperbarui bersamaan kalau datanya ada.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!userLocation) {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      if (userAccuracyRef.current) {
        userAccuracyRef.current.remove();
        userAccuracyRef.current = null;
      }
      return;
    }

    const latlng: [number, number] = [userLocation.lat, userLocation.lng];

    if (!userMarkerRef.current) {
      userMarkerRef.current = L.marker(latlng, { icon: USER_ICON, zIndexOffset: 1000 })
        .addTo(map)
        .bindTooltip("Lokasi Anda", { direction: "top", offset: [0, -8] });
      // Kali pertama lokasi terdeteksi, geser peta supaya lokasi pengguna
      // ikut terlihat (tidak memaksa zoom in berlebihan).
      map.panTo(latlng);
    } else {
      userMarkerRef.current.setLatLng(latlng);
    }

    if (userLocation.accuracy != null && Number.isFinite(userLocation.accuracy)) {
      if (!userAccuracyRef.current) {
        userAccuracyRef.current = L.circle(latlng, {
          radius: userLocation.accuracy,
          color: "#2563eb",
          weight: 1,
          fillColor: "#2563eb",
          fillOpacity: 0.08,
        }).addTo(map);
      } else {
        userAccuracyRef.current.setLatLng(latlng);
        userAccuracyRef.current.setRadius(userLocation.accuracy);
      }
    }
  }, [userLocation]);

  // Tombol "pusatkan ke lokasi saya" -- pakai koordinat TERBARU dari ref
  // (bukan closure atas prop userLocation) supaya tombolnya selalu akurat
  // walau live tracking baru saja aktif/berpindah sesaat sebelum diklik.
  // Sengaja TIDAK mengubah zoom kalau pengguna sudah zoom in lebih jauh
  // dari level 15 -- hanya menaikkan zoom kalau saat ini masih lebih jauh.
  function handlePusatkanLokasi() {
    const map = mapRef.current;
    const u = userLocRef.current;
    if (!map || !u) return;
    map.setView([u.lat, u.lng], Math.max(map.getZoom(), 15));
  }

  return (
    <>
      <div ref={mapDivRef} style={{ position: "absolute", inset: 0 }} />
      <button
        type="button"
        onClick={handlePusatkanLokasi}
        disabled={!userLocation}
        title={userLocation ? "Pusatkan peta ke lokasi saya" : "Aktifkan lokasi langsung dulu"}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 1000,
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          border: "1px solid #d8d5cd",
          background: "#ffffff",
          fontSize: 16,
          lineHeight: 1,
          boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
          cursor: userLocation ? "pointer" : "not-allowed",
          opacity: userLocation ? 1 : 0.5,
        }}
      >
        🎯
      </button>
    </>
  );
}
