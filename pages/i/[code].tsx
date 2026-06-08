import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase } from '../../lib/supabaseClient';
import { AppStoreBadge, MomentoMark, COLORS } from '../../components/brand';

/**
 * Invite landing page: https://momento-web-zeta.vercel.app/i/{code}
 *
 *  - iOS + app installed -> hand off to the app via momento://invite/{code}.
 *  - iOS no app / Android / desktop -> show "join [Gallery]" with Download +
 *    (if the gallery has an active guest link) "Add photos as a guest".
 *
 * The app's internal deep-link handler still parses momento://invite/{code}, unchanged.
 */

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
  const handoffTried = useRef(false);

  // iOS app hand-off (fires once).
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

  // Load invite info for fallback UI.
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
        if (!row || !row.is_valid) {
          setInfo(row || null);
          setLoadError(row?.reason || 'not_found');
        } else {
          setInfo(row);
        }
        setLoading(false);
      } catch {
        if (!cancelled) { setLoadError('network'); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [router.isReady, code]);

  const ios = typeof window !== 'undefined' ? isIOS() : true;

  return (
    <>
      <Head>
        <title>You&apos;re invited · Momento</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta property="og:title" content={info?.gallery_name ? `You're invited to ${info.gallery_name}` : "You're invited to Momento"} />
        <meta
          property="og:description"
          content="Join the gallery and add your photos — the place your friend group's memories actually live."
        />
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
          <ReadyView info={info} code={code} ios={ios} />
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
    <>
      <div style={s.centerBlock}>
        <div style={s.iconLg}>🔗</div>
        <h1 style={s.h1}>{m.title}</h1>
        <p style={s.body}>{m.body}</p>
      </div>
      <BigAppStoreCTA caption="Get Momento on iPhone" />
    </>
  );
}

function ReadyView({ info, code, ios }: { info: InviteInfo; code: string; ios: boolean }) {
  const isGallery = info.kind === 'gallery' && !!info.gallery_name;
  const owner = info.owner_display_name || (info.owner_username ? `@${info.owner_username}` : 'A friend');
  const guestCode = info.guest_code;

  // Pass origin context to the guest page so it knows the user came from an invite.
  const guestHref = guestCode
    ? `/g/${guestCode}?from=invite`
    : null;

  return (
    <>
      <div style={s.headerBlock}>
        {info.cover_photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={info.cover_photo_url} alt="" style={s.cover} />
        ) : (
          <div style={s.coverFallback}>📸</div>
        )}
        <p style={s.eyebrow}>{isGallery ? "You're invited to" : 'Join Momento'}</p>
        <h1 style={s.galleryTitle}>
          {isGallery ? info.gallery_name : `${owner} invited you`}
        </h1>
        <p style={s.subtle}>
          {isGallery ? `by ${owner}` : 'the place your friend group’s memories actually live'}
        </p>
      </div>

      {ios && (
        <a href={`momento://invite/${code}`} style={s.primaryBtn}>Open in Momento</a>
      )}

      {isGallery && guestHref ? (
        <a href={guestHref} style={s.secondaryBtn}>Add photos as a guest</a>
      ) : null}

      <BigAppStoreCTA
        caption={isGallery
          ? 'Download Momento to join, react, and keep these forever'
          : 'Download Momento to get started'}
        androidNote={!ios}
        guestAvailable={!!guestHref}
      />
    </>
  );
}

function BigAppStoreCTA({
  caption,
  androidNote,
  guestAvailable,
}: { caption: string; androidNote?: boolean; guestAvailable?: boolean }) {
  return (
    <div style={s.appStoreCTABlock}>
      <p style={s.appStoreCaption}>{caption}</p>
      <AppStoreBadge width={240} />
      <p style={s.appStoreSubcap}>
        Create your own galleries, save the memories you&apos;re already a part of, and meet up with friends.
      </p>
      {androidNote && (
        <p style={s.androidNote}>
          Momento is on iPhone for now.{guestAvailable ? ' You can still add photos as a guest above.' : ''}
        </p>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div style={s.spinner}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  topBar: {
    position: 'sticky', top: 0, zIndex: 10,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 20px',
    background: 'rgba(250, 250, 250, 0.94)',
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    borderBottom: `1px solid ${COLORS.hairline}`,
  },
  main: {
    maxWidth: 540, margin: '0 auto', padding: '24px 20px 56px',
    display: 'flex', flexDirection: 'column', gap: 16,
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  centerBlock: { textAlign: 'center', paddingTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' },
  headerBlock: { textAlign: 'center', paddingTop: 8, paddingBottom: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' },
  cover: { width: 96, height: 96, borderRadius: 16, objectFit: 'cover', marginBottom: 16 },
  coverFallback: {
    width: 96, height: 96, borderRadius: 16, background: COLORS.coralLight,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, marginBottom: 16,
  },
  eyebrow: { margin: 0, fontSize: 13, color: COLORS.textSubtle, textTransform: 'uppercase', letterSpacing: 0.5 },
  galleryTitle: { margin: '8px 0 4px', fontSize: 32, fontWeight: 700, lineHeight: 1.2, color: COLORS.ink },
  subtle: { margin: 0, fontSize: 14, color: COLORS.textMuted, maxWidth: 360 },
  iconLg: { fontSize: 56, marginBottom: 12 },
  h1: { fontSize: 28, fontWeight: 700, margin: 0, color: COLORS.ink },
  body: { fontSize: 16, color: '#555', maxWidth: 380, lineHeight: 1.5, margin: '12px 0 24px' },
  textLink: { fontSize: 14, color: COLORS.coral, textDecoration: 'underline' },
  primaryBtn: {
    display: 'block', width: '100%', padding: '18px', textAlign: 'center',
    fontSize: 17, fontWeight: 600, background: COLORS.coral, color: '#fff',
    borderRadius: 14, textDecoration: 'none', boxShadow: '0 2px 8px rgba(255,107,92,0.35)',
  },
  secondaryBtn: {
    display: 'block', width: '100%', padding: '16px', textAlign: 'center',
    fontSize: 16, fontWeight: 600, background: '#f0f0f0', color: COLORS.ink,
    borderRadius: 12, textDecoration: 'none', border: 'none',
  },
  appStoreCTABlock: { marginTop: 16, padding: '24px 20px', background: COLORS.coralLight, borderRadius: 14, textAlign: 'center' },
  appStoreCaption: { margin: 0, marginBottom: 12, fontSize: 15, fontWeight: 600, color: COLORS.ink },
  appStoreSubcap: { margin: '12px 0 0', fontSize: 13, color: COLORS.textMuted, lineHeight: 1.4 },
  androidNote: { margin: '12px 0 0', fontSize: 12, color: COLORS.textSubtle, lineHeight: 1.4 },
  spinner: {
    width: 32, height: 32, border: `3px solid #e5e5e5`, borderTopColor: COLORS.coral,
    borderRadius: '50%', animation: 'spin 0.7s linear infinite',
  },
};
