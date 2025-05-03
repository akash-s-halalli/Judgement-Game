import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster"; // Import Toaster

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
    // No need for suppressHydrationWarning if underlying issues are fixed
    <html lang="en" className="dark">
      <body className={`antialiased bg-background text-foreground`}>
        {children}
        <Toaster /> {/* Add Toaster component */}
      </body>
    </html>
  );
}
