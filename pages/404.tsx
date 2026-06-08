import Head from 'next/head';
import { MomentoMark, AppStoreBadge, COLORS } from '../components/brand';

export default function NotFound() {
  return (
    <>
      <Head>
        <title>Page not found · Momento</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <main style={st.page}>
        <div style={st.stack}>
          <MomentoMark size={48} />
          <h1 style={st.h1}>This page doesn&apos;t exist</h1>
          <p style={st.body}>
            The link may be broken or the page may have moved. If you were trying to join a gallery,
            ask whoever invited you for a fresh link.
          </p>
          <div style={{ marginTop: 8 }}>
            <AppStoreBadge width={220} />
          </div>
        </div>
      </main>
    </>
  );
}

const st: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh', background: COLORS.pageBg,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
  },
  stack: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16, maxWidth: 420 },
  h1: { margin: '8px 0 0', fontSize: 26, fontWeight: 700, color: COLORS.ink },
  body: { margin: 0, fontSize: 15, lineHeight: 1.5, color: COLORS.textMuted },
};
