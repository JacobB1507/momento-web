import Head from 'next/head';

export default function Home() {
  return (
    <>
      <Head>
        <title>Momento</title>
        <meta name="description" content="Shared photo galleries for your group." />
      </Head>
      <main style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '24px',
        textAlign: 'center',
      }}>
        <h1 style={{ fontSize: 48, fontWeight: 700, margin: 0 }}>Momento</h1>
        <p style={{ fontSize: 18, color: '#666', marginTop: 16, maxWidth: 460 }}>
          Shared photo galleries for your group. Capture moments together.
        </p>
        <p style={{ fontSize: 14, color: '#999', marginTop: 32 }}>
          Available on iOS · Coming soon to Android
        </p>
      </main>
    </>
  );
}
