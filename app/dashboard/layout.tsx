import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "./logout-button";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("nama, role")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-medium text-navy-400">
              Usulan Update Data DTSEN
            </p>
            <p className="text-xs text-ink/50">
              {profile?.nama ?? user.email} &middot;{" "}
              {profile?.role === "bps"
                ? "BPS Kabupaten Solok"
                : "Operator Wali Nagari"}
            </p>
          </div>
          <LogoutButton />
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
    </div>
  );
}
