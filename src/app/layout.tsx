import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster'; // Import Toaster

export const metadata: Metadata = {
  title: 'Judgement', // Updated title
  description: 'A virtual card game for remote friends.', // Updated description
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Apply dark mode globally via className
    // Add suppressHydrationWarning to <html> to mitigate errors from browser extensions
    <html lang="en" className="dark" suppressHydrationWarning={true}>
      <body className={`antialiased bg-background text-foreground`}>
        {children}
        <Toaster /> {/* Add Toaster component */}
      </body>
    </html>
  );
}
