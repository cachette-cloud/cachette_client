import type { Metadata } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";
import { AuthProvider } from "@/lib/auth-context";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: "Cachette — Secure Cloud Storage",
  description: "Encrypted cloud storage built for speed. Upload, organize, and share your files with confidence. Up to 5 GB free.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={cn("h-full antialiased dark scroll-smooth font-sans")}
    >
      <body className="min-h-full flex flex-col bg-[#0a0a0a]">
        <AuthProvider>
          <TooltipProvider>
            {children}
          </TooltipProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
