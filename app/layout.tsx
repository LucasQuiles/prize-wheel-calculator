import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import SidePanel from '@/components/side-panel'

export const metadata: Metadata = {
  title: 'Prize Wheel',
  description: 'Prize Wheel Calculator',
  generator: 'v0.dev',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="flex min-h-screen">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <SidePanel />
          <main className="flex-1 bg-background text-foreground">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  )
}
