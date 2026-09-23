import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import './globals.css';
import PwaBoot from '@/components/PwaBoot';
import { AuthProvider } from '@/lib/auth';
import Splash from '@/components/Splash';

export const metadata: Metadata = {
  title: 'Wander · plan, split, chat, share',
  description: 'One place for your group trip: itinerary, expenses & UPI settle-up, group chat and shared photos.',
  applicationName: 'Wander',
  appleWebApp: { capable: true, title: 'Wander', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
  icons: { icon: '/favicon.png', apple: '/apple-touch-icon.png' },
};
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#08070c', interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: "try{if(sessionStorage.getItem('wander.splash'))document.documentElement.dataset.splash='skip'}catch(e){}" }} />
        <Splash />
        <div className="atmos" aria-hidden>
          <div className="blob b1" /><div className="blob b2" /><div className="blob b3" /><div className="blob b4" />
          <div className="vignette" />
        </div>
        <AuthProvider>{children}</AuthProvider>
        <PwaBoot />
        <div className="noise-dark" aria-hidden />
        <div className="noise" aria-hidden />
      </body>
    </html>
  );
}
