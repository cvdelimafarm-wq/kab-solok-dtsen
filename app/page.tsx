import { createClient } from "@/lib/supabase/server";
import PortalDepan from "@/app/portal/PortalDepan";

// (7 Okt 2026) Portal satu login -- permintaan user: "buat portal login hanya 1 saja di depan, kemudian user bisa
// menggunakan/akses kartu/menu sesuai periodenya". Halaman depan = form masuk tunggal + beranda kartu sesuai peran
// & periode (app/portal/*). Server hanya membaca status login DTSEN (cookie Supabase operator Wali Nagari);
// sesi akun SIGAP disimpan di browser dan kartu dihitung di /api/portal/beranda.
export const dynamic = "force-dynamic";

export default async function PortalPage() {
  let dtsen: { nama: string; role: string | null } | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from("profiles").select("nama, role").eq("id", user.id).maybeSingle();
      dtsen = { nama: (profile?.nama as string | undefined) ?? user.email ?? "Operator", role: (profile?.role as string | undefined) ?? null };
    }
  } catch {
    dtsen = null;
  }
  return <PortalDepan dtsen={dtsen} />;
}
