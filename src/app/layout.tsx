import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster'; // Import Toaster

export const metadata: Metadata = {
  title: 'Judgement', // Updated title
  description: 'A virtual card game for remote friends.', // Updated description
  icons: { // Add favicon information
    icon: '/favicon.ico',
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Add suppressHydrationWarning to the <html> tag
    // This helps ignore hydration mismatches often caused by browser extensions
    <html lang="en" className="dark" suppressHydrationWarning={true}>
      <body className={`antialiased bg-background text-foreground`}>
        {children}
        <Toaster /> {/* Add Toaster component */}
      </body>
    </html>
  );
}
