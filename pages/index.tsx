import Head from 'next/head';
import { AppStoreBadge, MomentoWordmark } from '../components/brand';

export default function Home() {
  return (
    <>
      <Head>
        <title>Momento — Shared photo galleries for your group</title>
        <meta name="description" content="Capture moments together. Create shared galleries, drop a QR code at any event, and watch every photo land in one place." />
        <meta property="og:title" content="Momento" />
        <meta property="og:description" content="Shared photo galleries for your group." />
      </Head>
      <main style={s.main}>
        <div style={s.center}>
          <MomentoWordmark size={64} />
          <p style={s.tagline}>Shared photo galleries for your group.</p>
          <p style={s.subtle}>Drop a QR code at any event. Watch every photo land in one place.</p>

          <div style={{ marginTop: 36 }}>
            <AppStoreBadge />
          </div>

          <p style={s.footnote}>Coming soon to Android · TestFlight beta open now</p>
        </div>
      </main>
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
  main: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  center: { textAlign: 'center', maxWidth: 520 },
  tagline: { fontSize: 22, color: '#111', marginTop: 24, marginBottom: 12, fontWeight: 500 },
  subtle: { fontSize: 16, color: '#666', lineHeight: 1.5 },
  footnote: { marginTop: 24, fontSize: 13, color: '#999' },
};
