"use client";

// app/seruti/penyisiran-map.tsx
//
// Peta Leaflet utk tab Penyisiran Usaha. File ini SELALU dimuat lewat
// next/dynamic(..., { ssr: false }) dari penyisiran-usaha.tsx -- Leaflet
// butuh `window`/`document` yang tidak ada saat Next.js merender di
// server, jadi komponen ini tidak boleh ikut proses server-render sama
// sekali. Pakai CircleMarker (bukan L.marker/ikon default) supaya tidak
// kena masalah klasik "ikon default Leaflet patah" di bundler seperti
// Webpack/Next.js (ikon itu rujuk file gambar lewat path relatif yang
// tidak ikut ke-bundle).

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

const WARNA_STATUS: Record<string, string> = {
  belum: "#6b7280",
  ditemukan: "#0ca30c",
  tidak_ditemukan: "#fab219",
  tidak_bisa: "#d03b3b",
};

const LABEL_STATUS: Record<string, string> = {
  belum: "Belum Dikunjungi",
  ditemukan: "Usaha Ditemukan",
  tidak_ditemukan: "Usaha Tidak Ditemukan",
  tidak_bisa: "Tidak Bisa Ditemui / Pindah",
};

// Solok kira-kira -0.9 s/d -1.8 lintang, 100.5 s/d 101.5 bujur.
const PUSAT_DEFAULT: [number, number] = [-1.15, 100.9];

export default function PenyisiranMap({ markers }: { markers: MarkerRow[] }) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  // Inisialisasi peta sekali saja.
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
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
    };
  }, []);

  // Render ulang marker tiap kali daftar berubah (filter/status berubah).
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
      marker.bindPopup(
        `<div style="font-size:12px;line-height:1.4">
           <b>${escapeHtml(m.nama_kk || "(tanpa nama)")}</b><br/>
           ${escapeHtml(m.alamat || "-")}<br/>
           <span style="color:${warna};font-weight:600">${escapeHtml(label)}</span><br/>
           <span style="color:#898781">${escapeHtml(m.nagari_nama || "")}</span>
         </div>`
      );
      marker.addTo(layer);
      bounds.push([m.lat, m.lng]);
    }

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 });
    }
  }, [markers]);

  return <div ref={mapDivRef} style={{ position: "absolute", inset: 0 }} />;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
