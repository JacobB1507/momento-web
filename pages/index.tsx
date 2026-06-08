import Head from 'next/head';
import { MomentoWordmark, AppStoreBadge, COLORS } from '../components/brand';

export default function Home() {
  return (
    <>
      <Head>
        <title>Momento — where your friend group&apos;s memories live</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="description" content="Private shared photo galleries for your friend group. No algorithm, no ads." />
        <meta property="og:title" content="Momento" />
        <meta property="og:description" content="The place your friend group's memories actually live." />
        <meta property="og:image" content="https://momento-web-zeta.vercel.app/og.png" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <main style={st.page}>
        <div style={st.stack}>
          <MomentoWordmark size={52} />
          <p style={st.tagline}>The place your friend group&apos;s memories actually live.</p>
          <div style={{ marginTop: 8 }}>
            <AppStoreBadge width={240} />
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
  stack: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 20, maxWidth: 420 },
  tagline: { margin: 0, fontSize: 17, lineHeight: 1.5, color: COLORS.textMuted },
};
