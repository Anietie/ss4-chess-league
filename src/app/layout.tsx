import { NavBar } from "@/components/layout/NavBar";
import { Providers } from "@/components/layout/Providers";
import { createServerClient } from "@/lib/supabase";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SS4 Chess League", template: "%s | SS4 Chess League" },
  description: "Parallel League Architecture · Glicko-2 · Champions League",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="font-body bg-ink text-chalk antialiased min-h-screen">
        <Providers>
          <NavBar />
          <main className="pt-16 min-h-screen">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}

export async function Footer() {
  const supabase = createServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  const isSignedIn = !!session?.user;

  return (
    <footer className="border-t border-ink-700 bg-ink-900 mt-16">
      <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-ink-500">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="SS4" className="h-5 w-auto" />
          <span className="font-display font-bold text-ink-300">SS4 Chess League</span>
        </div>
        <div className="text-center">The Board Remembers</div>
        <div className="flex items-center gap-4">
          <a href="/hall-of-champions" className="hover:text-ink-300 transition-colors">
            Hall of Fame
          </a>
          <a href="/players" className="hover:text-ink-300 transition-colors">
            Players
          </a>
          {!isSignedIn && (
            <a href="/register" className="hover:text-ink-300 transition-colors">
              Register
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}