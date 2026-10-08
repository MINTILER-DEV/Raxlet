import type { Metadata } from "next";
import { Toaster } from "sonner";
import { Shell } from "@/components/shell";
import "./globals.css";
export const metadata:Metadata={title:{default:"Raxlet — Your web, your scripts",template:"%s · Raxlet"},description:"Discover, manage, and manually run userscripts with a portable browser launcher."};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en" suppressHydrationWarning><body><Shell>{children}</Shell><Toaster richColors position="bottom-right"/></body></html>;}
