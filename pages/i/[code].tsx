import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase } from '../../lib/supabaseClient';
import { AppStoreBadge, MomentoMark, COLORS } from '../../components/brand';

interface InviteInfo {
  is_valid: boolean;
  reason: string;
  kind: 'gallery' | 'friend' | null;
  gallery_name: string | null;
  cover_photo_url: string | null;
  owner_display_name: string | null;
  owner_username: string | null;
  guest_code: string | null;
}

const REASON_MESSAGES: Record<string, { title: string; body: string }> = {
  not_found: {
    title: 'This invite isn’t active',
    body: 'It may have been removed or mistyped. Ask whoever sent it for a fresh link.',
  },
  network: {
    title: 'Couldn’t load this invite',
    body: 'Check your connection and try again.',
  },
};

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iOSDevice = /iPad|iPhone|iPod/.test(ua);
  const iPadOS = /Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document;
  return iOSDevice || iPadOS;
}

export default function InvitePage() {
  const router = useRouter();
  const code = (router.query.code as string | undefined) || '';

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [guestLoading, setGuestLoading] = useState(false);
  const handoffTried = useRef(false);

  useEffect(() => {
    if (!router.isReady || !code || handoffTried.current) return;
    handoffTried.current = true;
    if (isIOS()) {
      const t = setTimeout(() => {
        try { window.location.href = `momento://invite/${code}`; } catch { /* no-op */ }
      }, 400);
      return () => clearTimeout(t);
    }
  }, [router.isReady, code]);

  useEffect(() => {
    if (!router.isReady || !code) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const { data, error } = await supabase.rpc('get_invite_gallery_info', { p_code: code });
        if (cancelled) return;
        if (error) { setLoadError('network'); setLoading(false); return; }
        const row: InviteInfo = Array.isArray(data) ? data[0] : data;
        if (!row || !row.is_valid) { setInfo(row || null); setLoadError(row?.reason || 'not_found'); }
        else { setInfo(row); }
        setLoading(false);
      } catch {
        if (!cancelled) { setLoadError('network'); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [router.isReady, code]);

  const handleContinueAsGuest = async () => {
    if (guestLoading) return;
    setGuestLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_or_mint_guest_code_for_invite', { p_invite_code: code });
      const row = Array.isArray(data) ? data[0] : data;
      const guestCode: string | null = row?.guest_code ?? null;
      if (error || !guestCode) {
        setGuestLoading(false);
        alert('Guest uploads aren’t available for this gallery. Download Momento to join.');
        return;
      }
      window.location.href = `/g/${guestCode}?from=invite`;
    } catch {
      setGuestLoading(false);
      alert('Couldn’t start guest upload. Try again.');
    }
  };

  const ios = typeof window !== 'undefined' ? isIOS() : true;

  return (
    <>
      <Head>
        <title>You&apos;re invited · Momento</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta property="og:title" content={info?.gallery_name ? `You're invited to ${info.gallery_name}` : "You're invited to Momento"} />
        <meta property="og:description" content="Join the gallery and add your photos." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://momento-web-zeta.vercel.app/og.png" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>

      <TopBar />
      <main style={s.main}>
        {loading || !router.isReady ? (
          <LoadingView ios={ios} code={code} />
        ) : loadError ? (
          <ErrorView reason={loadError} />
        ) : info ? (
          <ReadyView info={info} code={code} ios={ios} guestLoading={guestLoading} onContinueAsGuest={handleContinueAsGuest} />
        ) : (
          <ErrorView reason="not_found" />
        )}
      </main>
    </>
  );
}

function TopBar() {
  return (
    <div style={s.topBar}>
      <a href="/" style={{ textDecoration: 'none', display: 'inline-flex' }}>
        <MomentoMark size={28} />
      </a>
    </div>
  );
}

function LoadingView({ ios, code }: { ios: boolean; code: string }) {
  return (
    <div style={s.centerBlock}>
      <Spinner />
      <p style={s.body}>{ios ? 'Opening Momento…' : 'Loading your invite…'}</p>
      {ios && code ? (
        <a href={`momento://invite/${code}`} style={s.textLink}>Tap here if Momento didn&apos;t open</a>
      ) : null}
    </div>
  );
}

function ErrorView({ reason }: { reason: string }) {
  const m = REASON_MESSAGES[reason] || REASON_MESSAGES.not_found;
  return (
    <div style={s.centerBlock}>
      <div style={s.iconLg}>🔗</div>
      <h1 style={s.h1}>{m.title}</h1>
      <p style={s.body}>{m.body}</p>
      <div style={s.heroCta}>
        <AppStoreBadge width={240} />
        <p style={s.heroCaption}>Get Momento on iPhone.</p>
      </div>
    </div>
  );
}

function ReadyView({ info, code, ios, guestLoading, onContinueAsGuest }: {
  info: InviteInfo; code: string; ios: boolean; guestLoading: boolean; onContinueAsGuest: () => void;
}) {
  const isGallery = info.kind === 'gallery' && !!info.gallery_name;
  const owner = info.owner_display_name || (info.owner_username ? `@${info.owner_username}` : 'A friend');

  return (
    <div style={s.centerBlock}>
      {info.cover_photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={info.cover_photo_url} alt="" style={s.cover} />
      ) : (
        <div style={s.coverFallback}><MomentoMark size={44} /></div>
      )}

      <p style={s.eyebrow}>{isGallery ? "You're invited to" : 'Join Momento'}</p>
      <h1 style={s.galleryTitle}>{isGallery ? info.gallery_name : `${owner} invited you`}</h1>
      <p style={s.subtle}>
        {isGallery ? `${owner} wants you to add your photos` : 'where your friend group’s memories actually live'}
      </p>

      {/* HERO: download the app — the primary action */}
      <div style={s.heroCta}>
        <AppStoreBadge width={240} />
        <p style={s.heroCaption}>
          {isGallery
            ? 'Join the gallery, react, and keep these memories forever.'
            : 'The place your friend group’s memories actually live.'}
        </p>
      </div>

      {/* SECONDARY: lighter options below */}
      <div style={s.secondaryStack}>
        {ios && (
          <a href={`momento://invite/${code}`} style={s.textLink}>Already have Momento? Open the app</a>
        )}
        {isGallery && (
          <button type="button" onClick={onContinueAsGuest} disabled={guestLoading} style={s.guestLink}>
            {guestLoading ? 'One sec…' : 'Not now — continue as guest'}
          </button>
        )}
        {!ios && (
          <p style={s.androidNote}>Momento is on iPhone for now — guest upload works on any phone.</p>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (<div style={s.spinner}><style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style></div>);
}

const s: Record<string, React.CSSProperties> = {
  topBar: {
    position: 'sticky', top: 0, zIndex: 10,
    display: 'flex', alignItems: 'center', padding: '12px 20px',
    background: 'rgba(250, 250, 250, 0.94)',
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    borderBottom: `1px solid ${COLORS.hairline}`,
  },
  main: {
    maxWidth: 440, margin: '0 auto', padding: '40px 24px 56px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  centerBlock: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' },
  cover: { width: 88, height: 88, borderRadius: 20, objectFit: 'cover', marginBottom: 20 },
  coverFallback: {
    width: 88, height: 88, borderRadius: 20, background: '#fff',
    border: `1px solid ${COLORS.hairline}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  eyebrow: { margin: 0, fontSize: 13, color: COLORS.textSubtle, textTransform: 'uppercase', letterSpacing: 0.6 },
  galleryTitle: { margin: '8px 0 6px', fontSize: 30, fontWeight: 700, lineHeight: 1.2, color: COLORS.ink },
  subtle: { margin: 0, fontSize: 15, color: COLORS.textMuted, maxWidth: 340, lineHeight: 1.5 },
  iconLg: { fontSize: 52, marginBottom: 10 },
  h1: { fontSize: 26, fontWeight: 700, margin: 0, color: COLORS.ink },
  body: { fontSize: 15, color: COLORS.textMuted, maxWidth: 340, lineHeight: 1.5, margin: '12px 0 0' },
  textLink: { fontSize: 15, color: COLORS.coral, textDecoration: 'none', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: 0 },
  heroCta: {
    width: '100%', maxWidth: 320, marginTop: 28,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  heroCaption: { margin: '14px 0 0', fontSize: 14, color: COLORS.textMuted, lineHeight: 1.5, maxWidth: 300 },
  secondaryStack: {
    width: '100%', maxWidth: 320, marginTop: 24, paddingTop: 22,
    borderTop: `1px solid ${COLORS.hairline}`,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
  },
  guestLink: {
    fontSize: 15, color: COLORS.textMuted, fontWeight: 500,
    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
    textDecoration: 'underline', textUnderlineOffset: 3,
  },
  androidNote: { margin: '14px 0 0', fontSize: 12, color: COLORS.textSubtle, lineHeight: 1.4, maxWidth: 280 },
  spinner: {
    width: 32, height: 32, border: `3px solid ${COLORS.hairline}`, borderTopColor: COLORS.coral,
    borderRadius: '50%', animation: 'spin 0.7s linear infinite',
  },
};
