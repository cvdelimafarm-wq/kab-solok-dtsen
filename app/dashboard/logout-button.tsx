"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton({
  className = "text-sm font-medium text-navy-400 hover:text-navy-700",
}: {
  className?: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className={className}
    >
      Keluar
    </button>
  );
}
