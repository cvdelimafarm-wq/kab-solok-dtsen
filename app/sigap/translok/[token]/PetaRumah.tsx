"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// (6 Okt 2026) Peta pemilih titik rumah utk verifikasi alamat petugas SIGAP.
// Pin bisa digeser / peta diketuk. Titik terdaftar (awal) digambar sbg titik biru + lingkaran batas 5 km,
// sehingga petugas langsung melihat kapan perubahan butuh alasan.

type Titik = { lat: number; lng: number };

export const BATAS_ALASAN_M = 5000;

export default function PetaRumah({ awal, titik, onPindah }: { awal: Titik | null; titik: Titik | null; onPindah: (lat: number, lng: number) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const peta = useRef<L.Map | null>(null);
  const pin = useRef<L.Marker | null>(null);
  const cb = useRef(onPindah);
  cb.current = onPindah;

  useEffect(() => {
    if (!el.current || peta.current) return;
    const pusat: [number, number] = titik ? [titik.lat, titik.lng] : awal ? [awal.lat, awal.lng] : [-0.95, 100.65];
    const m = L.map(el.current, { center: pusat, zoom: titik || awal ? 16 : 11 });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);

    if (awal) {
      L.circle([awal.lat, awal.lng], { radius: BATAS_ALASAN_M, color: "#D97706", weight: 1.5, dashArray: "6 6", fillOpacity: 0.04 }).addTo(m);
      L.circleMarker([awal.lat, awal.lng], { radius: 6, color: "#0F3D7A", weight: 2, fillColor: "#fff", fillOpacity: 1 }).bindTooltip("Titik terdaftar").addTo(m);
    }
    const ikon = L.divIcon({
      className: "",
      html: '<div style="font-size:30px;line-height:30px;transform:translate(-50%,-100%)">📍</div>',
      iconSize: [0, 0],
    });
    function taruh(lat: number, lng: number) {
      if (pin.current) pin.current.setLatLng([lat, lng]);
      else {
        const p = L.marker([lat, lng], { draggable: true, icon: ikon }).addTo(m);
        p.on("dragend", () => {
          const q = p.getLatLng();
          cb.current(q.lat, q.lng);
        });
        pin.current = p;
      }
    }
    if (titik) taruh(titik.lat, titik.lng);
    m.on("click", (e: L.LeafletMouseEvent) => {
      taruh(e.latlng.lat, e.latlng.lng);
      cb.current(e.latlng.lat, e.latlng.lng);
    });
    peta.current = m;
    setTimeout(() => m.invalidateSize(), 100);
    return () => {
      m.remove();
      peta.current = null;
      pin.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // titik berubah dari luar (mis. tombol "Pakai lokasi HP saya")
  useEffect(() => {
    const m = peta.current;
    if (!m || !titik) return;
    const ada = pin.current?.getLatLng();
    if (ada && Math.abs(ada.lat - titik.lat) < 1e-7 && Math.abs(ada.lng - titik.lng) < 1e-7) return;
    if (pin.current) pin.current.setLatLng([titik.lat, titik.lng]);
    else {
      const ikon = L.divIcon({ className: "", html: '<div style="font-size:30px;line-height:30px;transform:translate(-50%,-100%)">📍</div>', iconSize: [0, 0] });
      const p = L.marker([titik.lat, titik.lng], { draggable: true, icon: ikon }).addTo(m);
      p.on("dragend", () => {
        const q = p.getLatLng();
        cb.current(q.lat, q.lng);
      });
      pin.current = p;
    }
    m.setView([titik.lat, titik.lng], Math.max(m.getZoom(), 16));
  }, [titik]);

  return <div ref={el} className="h-64 w-full overflow-hidden rounded-xl border border-[#E3E8F0]" />;
}
