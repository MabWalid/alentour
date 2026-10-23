import type { Metadata, Viewport } from "next"
import { Bricolage_Grotesque, Outfit } from "next/font/google"
import { AppToaster } from "@/components/toaster"
import "./globals.css"

const sans = Outfit({
  variable: "--font-sans",
  subsets: ["latin"],
})

const heading = Bricolage_Grotesque({
  variable: "--font-heading",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Alentour",
  description:
    "Stages, alternances et jobs étudiants autour de chez toi, puis plus loin s’il le faut. Brouillons de candidature, données locales.",
  applicationName: "Alentour",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    title: "Alentour",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
}

export const viewport: Viewport = {
  themeColor: "#1b1733",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${sans.variable} ${heading.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        {children}
        <AppToaster />
      </body>
    </html>
  )
}
