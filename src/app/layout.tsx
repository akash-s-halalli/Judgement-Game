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
    <html lang="en" className="dark">
      {/* Add suppressHydrationWarning to potentially mitigate extension-related hydration errors */}
      <body className={`antialiased bg-background text-foreground`} suppressHydrationWarning={true}>
        {children}
        <Toaster /> {/* Add Toaster component */}
      </body>
    </html>
  );
}
