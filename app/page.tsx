import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Navigation } from "@/components/navigation";
import { HeroSection } from "@/components/home/hero-section";
import { AUTH_COOKIE_KEY, AUTH_ROLE_COOKIE_KEY } from "@/lib/auth";

export default async function HomePage() {
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.get(AUTH_COOKIE_KEY)?.value === "true";
  const role = cookieStore.get(AUTH_ROLE_COOKIE_KEY)?.value;

  if (isAuthenticated) {
    redirect(role === "employee" ? "/employee" : "/dashboard");
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#070b14]">
      {/* Immersive dark background to highlight the 3D materials */}
      {/* Set navigation to dark aesthetic by wrapping or just letting it inherit depending on its implementation */}
      <div className="relative z-50">
        <Navigation />
      </div>

      <main className="relative flex-1">
        <HeroSection />
      </main>
    </div>
  );
}
