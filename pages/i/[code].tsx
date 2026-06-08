import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { AppStoreBadge, APP_STORE_URL } from '../../components/brand';

/**
 * Invite landing page: https://momento-web-zeta.vercel.app/i/{code}
 *
 * One link for every invite. Behaviour:
 *  - iOS + app installed  -> we attempt to hand off to the app via momento://invite/{code}.
 *                            If the app opens, iOS leaves this page in the background.
 *  - iOS, no app          -> the hand-off does nothing; this page stays and shows
 *                            "join [Gallery]" with Download + Upload-as-guest options.
 *  - Android / desktop    -> no hand-off; show the same join screen (no App Store
 *                            on Android since Momento is iOS-only; guest upload still works).
 *
 * The app's internal deep-link handler still parses momento://invite/{code}, unchanged.
 */

// ---- config -----------------------------------------------------------------
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL_FALLBACK || '';
const SUPABASE_ANON =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON ||
  '';

const GUEST_BASE = '/g'; // existing guest-upload page lives at /g/{guestCode}

const COLORS = {
  bg: '#FAF7F2',
  ink: '#1A1A1A',
  sub: '#555555',
  muted: '#8A8A8A',
  coral: '#FF6B5C',
  card: '#FFFFFF',
  border: '#ECE8E1',
};

// ---- types ------------------------------------------------------------------
type InviteInfo = {
  is_valid: boolean;
  reason: string;
  kind: 'gallery' | 'friend' | null;
  gallery_name: string | null;
  cover_photo_url: string | null;
  owner_display_name: string | null;
  owner_username: string | null;
  guest_code: string | null;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; reason: string }
  | { status: 'ready'; info: InviteInfo };

// ---- helpers ----------------------------------------------------------------
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iOSDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as Mac; detect touch to catch it.
  const iPadOS = /Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document;
  return iOSDevice || iPadOS;
}

async function fetchInviteInfo(code: string): Promise<InviteInfo | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_invite_gallery_info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
      },
      body: JSON.stringify({ p_code: code }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // PostgREST returns an array of rows for a TABLE-returning function
    const row = Array.isArray(data) ? data[0] : data;
    return (row as InviteInfo) ?? null;
  } catch {
    return null;
  }
}

// ---- component --------------------------------------------------------------
export default function InvitePage() {
  const router = useRouter();
  const rawCode = router.query.code;
  const code = typeof rawCode === 'string' ? rawCode : Array.isArray(rawCode) ? rawCode[0] : '';

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const handoffTried = useRef(false);

  // Attempt app hand-off on iOS (fires once, immediately, before/while info loads).
  useEffect(() => {
    if (!code || handoffTried.current) return;
    handoffTried.current = true;
    if (isIOS()) {
      // If the app is installed, iOS switches to it and this page is backgrounded.
      // If not, nothing happens and we fall through to the join screen below.
      const t = setTimeout(() => {
        try {
          window.location.href = `momento://invite/${code}`;
        } catch {
          /* no-op */
        }
      }, 400);
      return () => clearTimeout(t);
    }
  }, [code]);

  // Load invite info for the fallback UI.
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      const info = await fetchInviteInfo(code);
      if (cancelled) return;
      if (!info) {
        setState({ status: 'error', reason: 'network' });
        return;
      }
      if (!info.is_valid) {
        setState({ status: 'error', reason: info.reason || 'not_found' });
        return;
      }
      setState({ status: 'ready', info });
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const ios = typeof window !== 'undefined' ? isIOS() : true;

  return (
    <>
      <Head>
        <title>You&apos;re invited to Momento</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta property="og:title" content="You're invited to Momento" />
        <meta
          property="og:description"
          content="Join the gallery and add your photos. The place your friend group's memories actually live."
        />
        <meta property="og:type" content="website" />
      </Head>

      <main style={styles.page}>
        <div style={styles.shell}>
          <div style={styles.logoRow}>
            <span style={styles.wordmark}>Momento</span>
          </div>

          {state.status === 'loading' && <LoadingView ios={ios} code={code} />}
          {state.status === 'error' && <ErrorView reason={state.reason} />}
          {state.status === 'ready' && <ReadyView info={state.info} code={code} ios={ios} />}
        </div>
      </main>
    </>
  );
}

// ---- subviews ---------------------------------------------------------------
function LoadingView({ ios, code }: { ios: boolean; code: string }) {
  return (
    <div style={styles.card}>
      <div style={styles.spinner} />
      <p style={styles.sub}>
        {ios ? 'Opening Momento…' : 'Loading your invite…'}
      </p>
      {ios && code ? (
        <a href={`momento://invite/${code}`} style={styles.textLink}>
          Tap here if Momento didn&apos;t open
        </a>
      ) : null}
      <style jsx>{spinnerKeyframes}</style>
    </div>
  );
}

function ErrorView({ reason }: { reason: string }) {
  const map: Record<string, { title: string; body: string }> = {
    not_found: {
      title: 'This invite link isn’t active',
      body: 'It may have been removed or mistyped. Ask whoever sent it for a fresh link.',
    },
    network: {
      title: 'Couldn’t load this invite',
      body: 'Check your connection and try again.',
    },
  };
  const m = map[reason] || map.not_found;
  return (
    <div style={styles.card}>
      <div style={styles.bigIcon}>🔗</div>
      <h1 style={styles.h1}>{m.title}</h1>
      <p style={styles.body}>{m.body}</p>
      <div style={styles.ctaBlock}>
        <p style={styles.ctaLabel}>Get Momento</p>
        <AppStoreBadge width={200} />
      </div>
    </div>
  );
}

function ReadyView({ info, code, ios }: { info: InviteInfo; code: string; ios: boolean }) {
  const isGallery = info.kind === 'gallery' && !!info.gallery_name;
  const owner = info.owner_display_name || (info.owner_username ? `@${info.owner_username}` : 'A friend');
  const guestCode = info.guest_code;

  return (
    <div style={styles.card}>
      {info.cover_photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={info.cover_photo_url} alt="" style={styles.cover} />
      ) : (
        <div style={styles.coverFallback}>📸</div>
      )}

      <h1 style={styles.h1}>
        {isGallery ? (
          <>
            You&apos;re invited to <span style={{ color: COLORS.coral }}>{info.gallery_name}</span>
          </>
        ) : (
          <>{owner} invited you to Momento</>
        )}
      </h1>
      <p style={styles.body}>
        {isGallery
          ? `${owner} wants you to add your photos to this gallery.`
          : 'Join Momento — the place your friend group’s memories actually live.'}
      </p>

      {/* Primary: open in app (iOS) */}
      {ios && (
        <a href={`momento://invite/${code}`} style={styles.primaryBtn}>
          Open in Momento
        </a>
      )}

      {/* Guest upload, only when a gallery + an active guest link exists */}
      {isGallery && guestCode ? (
        <a href={`${GUEST_BASE}/${guestCode}`} style={styles.secondaryBtn}>
          Add photos as a guest
        </a>
      ) : null}

      {/* Download CTA — always present on iOS; on Android we still show it so people know it's an iOS app */}
      <div style={styles.ctaBlock}>
        <p style={styles.ctaLabel}>
          {isGallery
            ? 'Download Momento to join, react, and keep these forever'
            : 'Download Momento to get started'}
        </p>
        <AppStoreBadge width={200} />
        {!ios && (
          <p style={styles.androidNote}>
            Momento is on iPhone for now. {guestCode ? 'You can still add photos as a guest above.' : ''}
          </p>
        )}
      </div>
    </div>
  );
}

// ---- styles -----------------------------------------------------------------
const spinnerKeyframes = `
@keyframes mz-spin { to { transform: rotate(360deg); } }
`;

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: COLORS.bg,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '32px 18px 48px',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  shell: { width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', alignItems: 'center' },
  logoRow: { padding: '8px 0 22px' },
  wordmark: { fontSize: 24, fontWeight: 700, letterSpacing: -0.4, color: COLORS.ink },
  card: {
    width: '100%',
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 20,
    padding: '28px 22px 26px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    boxShadow: '0 6px 24px rgba(0,0,0,0.05)',
  },
  cover: { width: 96, height: 96, borderRadius: 16, objectFit: 'cover', marginBottom: 16 },
  coverFallback: {
    width: 96,
    height: 96,
    borderRadius: 16,
    background: COLORS.bg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 40,
    marginBottom: 16,
  },
  bigIcon: { fontSize: 48, marginBottom: 10 },
  h1: { fontSize: 24, fontWeight: 700, lineHeight: 1.25, margin: '0 0 8px', color: COLORS.ink },
  body: { fontSize: 15, color: COLORS.sub, lineHeight: 1.5, maxWidth: 360, margin: '0 0 22px' },
  sub: { fontSize: 15, color: COLORS.sub, margin: '14px 0 4px' },
  primaryBtn: {
    display: 'block',
    width: '100%',
    maxWidth: 320,
    padding: '15px 20px',
    background: COLORS.coral,
    color: '#fff',
    fontSize: 16,
    fontWeight: 600,
    borderRadius: 14,
    textDecoration: 'none',
    boxShadow: '0 4px 14px rgba(255,107,92,0.35)',
    marginBottom: 12,
  },
  secondaryBtn: {
    display: 'block',
    width: '100%',
    maxWidth: 320,
    padding: '14px 20px',
    background: 'transparent',
    color: COLORS.ink,
    fontSize: 15,
    fontWeight: 600,
    borderRadius: 14,
    border: `1.5px solid ${COLORS.border}`,
    textDecoration: 'none',
    marginBottom: 8,
  },
  textLink: { fontSize: 14, color: COLORS.coral, textDecoration: 'underline', marginTop: 6 },
  ctaBlock: {
    width: '100%',
    marginTop: 18,
    paddingTop: 20,
    borderTop: `1px solid ${COLORS.border}`,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  ctaLabel: { fontSize: 13, color: COLORS.muted, margin: '0 0 12px', maxWidth: 300, lineHeight: 1.4 },
  androidNote: { fontSize: 12, color: COLORS.muted, margin: '12px 0 0', maxWidth: 300, lineHeight: 1.4 },
  spinner: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    border: `3px solid ${COLORS.border}`,
    borderTopColor: COLORS.coral,
    animation: 'mz-spin 0.8s linear infinite',
  },
};
