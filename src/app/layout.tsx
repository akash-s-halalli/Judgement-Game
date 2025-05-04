// src/app/layout.tsx
import type { Metadata } from "next";
import { Toaster } from "@/components/ui/toaster"; // Import Toaster
import "./globals.css";

// Metadata configuration
export const metadata: Metadata = {
  title: "Judgement",
  description: "A virtual card game for remote friends.",
  icons: {
     icon: '/favicon.ico', // Add reference to your favicon
  },
};

/**
 * Root layout component for the application.
 * Applies global styles, dark mode, and includes the Toaster.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // This helps ignore hydration mismatches often caused by browser extensions
    <html lang="en" className="dark" suppressHydrationWarning={true}>
      {/* Removed suppressHydrationWarning from body as it's already on html */}
      <body className={`antialiased bg-background text-foreground`}>
        {children}
        <Toaster /> {/* Add Toaster component */}
      </body>
    </html>
  );
}
