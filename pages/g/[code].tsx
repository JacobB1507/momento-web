import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase, EDGE_FUNCTION_BASE } from '../../lib/supabaseClient';
import { AppStoreBadge, AppStoreBadgeCompact, MomentoMark, MomentoWordmark, COLORS, APP_STORE_URL } from '../../components/brand';

interface LinkInfo {
  is_valid: boolean;
  reason: string;
  gallery_name: string | null;
  owner_display_name: string | null;
  owner_username: string | null;
  uploads_remaining: number | null;
  expires_at: string | null;
}

interface QueuedPhoto {
  file: File;
  preview: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  errorMessage?: string;
}

const REASON_MESSAGES: Record<string, { title: string; body: string }> = {
  not_found: {
    title: 'Link not found',
    body: "This upload link doesn't exist. Double-check the QR code or ask the gallery owner for a new one.",
  },
  expired: {
    title: 'Link expired',
    body: 'This upload link has expired. Ask the gallery owner for a new one.',
  },
  revoked: {
    title: 'Link revoked',
    body: 'The gallery owner has revoked this upload link.',
  },
  limit_reached: {
    title: 'Upload limit reached',
    body: 'This gallery is no longer accepting more guest uploads.',
  },
};

export default function GuestUploadPage() {
  const router = useRouter();
  const code = (router.query.code as string | undefined)?.toUpperCase();

  const [linkInfo, setLinkInfo] = useState<LinkInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [guestName, setGuestName] = useState('');
  const [photos, setPhotos] = useState<QueuedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [profileTipOpen, setProfileTipOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refreshLinkInfo = useCallback(async () => {
    if (!code) return;
    const { data, error } = await supabase.rpc('get_guest_upload_link_info', { p_code: code });
    if (error) return;
    const info: LinkInfo = Array.isArray(data) ? data[0] : data;
    setLinkInfo(info);
  }, [code]);

  useEffect(() => {
    if (!router.isReady || !code) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase.rpc('get_guest_upload_link_info', { p_code: code });
        if (cancelled) return;
        if (error) {
          setError('Could not load this upload link. Try again in a moment.');
          setLoading(false);
          return;
        }
        const info: LinkInfo = Array.isArray(data) ? data[0] : data;
        setLinkInfo(info);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError('Could not load this upload link. Check your connection.');
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [router.isReady, code]);

  // Computed: how many MORE uploads can the user queue right now?
  // Accounts for photos already done + the server-side uploads_remaining.
  // This is the SAFETY VALVE that fixes the "10 more" bug:
  // remaining = server_remaining - photos_already_added_locally_but_not_done
  const photosInQueue = photos.filter(p => p.status !== 'done').length;
  const photosDone = photos.filter(p => p.status === 'done').length;
  const serverRemaining = linkInfo?.uploads_remaining ?? 10;
  const slotsAvailable = Math.max(0, serverRemaining - photosInQueue);

  const handleFilesSelected = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (files.length === 0) return;
    const allowed = files.slice(0, slotsAvailable);
    const newPhotos: QueuedPhoto[] = allowed.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      status: 'pending',
    }));
    setPhotos((prev) => [...prev, ...newPhotos]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [slotsAvailable]);

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      const removed = prev[index];
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const uploadOne = async (queued: QueuedPhoto): Promise<void> => {
    const signedUrlRes = await fetch(`${EDGE_FUNCTION_BASE}/guest-upload-signed-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify({
        code,
        contentType: queued.file.type || 'image/jpeg',
      }),
    });
    if (!signedUrlRes.ok) {
      const errJson = await signedUrlRes.json().catch(() => ({}));
      throw new Error(errJson?.error || 'upload_url_failed');
    }
    const { signedUrl, storagePath } = await signedUrlRes.json();

    const putRes = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': queued.file.type || 'image/jpeg' },
      body: queued.file,
    });
    if (!putRes.ok) throw new Error('storage_upload_failed');

    const commitRes = await fetch(`${EDGE_FUNCTION_BASE}/guest-upload-commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify({
        code,
        guestName: guestName.trim() || 'Guest',
        storagePath,
      }),
    });
    if (!commitRes.ok) {
      const errJson = await commitRes.json().catch(() => ({}));
      throw new Error(errJson?.error || 'commit_failed');
    }
  };

  const handleUpload = async () => {
    if (photos.length === 0 || uploading) return;
    if (!guestName.trim()) {
      alert('Please enter your name first.');
      return;
    }
    setUploading(true);
    let allOk = true;
    for (let i = 0; i < photos.length; i++) {
      if (photos[i].status === 'done') continue;
      setPhotos((prev) => prev.map((p, idx) => idx === i ? { ...p, status: 'uploading' } : p));
      try {
        await uploadOne(photos[i]);
        setPhotos((prev) => prev.map((p, idx) => idx === i ? { ...p, status: 'done' } : p));
      } catch (e: any) {
        allOk = false;
        setPhotos((prev) => prev.map((p, idx) => idx === i ? { ...p, status: 'error', errorMessage: e?.message || 'failed' } : p));
      }
    }
    setUploading(false);

    // After uploads finish, refresh the link info from the server so
    // uploads_remaining shows the truth (not the stale initial value).
    await refreshLinkInfo();

    if (allOk) setAllDone(true);
  };

  // === Render states ===

  if (loading || !router.isReady) {
    return (
      <Shell linkInfo={null}>
        <Spinner />
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell linkInfo={null}>
        <div style={s.centerBlock}>
          <h1 style={s.h1}>Something went wrong</h1>
          <p style={s.body}>{error}</p>
        </div>
        <BigAppStoreCTA caption="Get Momento on iPhone" />
      </Shell>
    );
  }

  if (!linkInfo || !linkInfo.is_valid) {
    const msg = REASON_MESSAGES[linkInfo?.reason || 'not_found'] || REASON_MESSAGES.not_found;
    return (
      <Shell linkInfo={null}>
        <div style={s.centerBlock}>
          <div style={s.iconLg}>⚠️</div>
          <h1 style={s.h1}>{msg.title}</h1>
          <p style={s.body}>{msg.body}</p>
        </div>
        <BigAppStoreCTA caption="Get Momento on iPhone" />
      </Shell>
    );
  }

  if (allDone) {
    return (
      <Shell linkInfo={linkInfo}>
        <div style={s.centerBlock}>
          <div style={s.iconLg}>✅</div>
          <h1 style={s.h1}>Uploaded!</h1>
          <p style={s.body}>
            {photosDone} photo{photosDone === 1 ? '' : 's'} added to <strong>{linkInfo.gallery_name}</strong>.
          </p>
          <button
            style={s.secondaryBtn}
            onClick={() => {
              setAllDone(false);
              setPhotos([]);
            }}
          >
            Add more photos
          </button>
        </div>
        <BigAppStoreCTA caption="Want the full Momento experience? Get the app." />
      </Shell>
    );
  }

  const ownerLabel =
    linkInfo.owner_display_name ||
    (linkInfo.owner_username ? `@${linkInfo.owner_username}` : 'Someone');

  return (
    <Shell linkInfo={linkInfo}>
      <Head>
        <title>Upload to {linkInfo.gallery_name} · Momento</title>
        <meta name="description" content={`Add your photos to ${linkInfo.gallery_name} on Momento.`} />
        <meta property="og:title" content={`📷 Upload to ${linkInfo.gallery_name}`} />
        <meta property="og:description" content={`${ownerLabel} invited you to add your photos.`} />
      </Head>

      <div style={s.headerBlock}>
        <p style={s.eyebrow}>You're invited to upload photos to</p>
        <h1 style={s.galleryTitle}>{linkInfo.gallery_name}</h1>
        <p style={s.subtle}>by {ownerLabel}</p>
      </div>

      <div style={s.card}>
        <label style={s.label} htmlFor="name-input">Your name</label>
        <input
          id="name-input"
          type="text"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value.slice(0, 50))}
          placeholder="e.g. Sarah"
          style={s.input}
          disabled={uploading}
          maxLength={50}
          autoCorrect="off"
          autoCapitalize="words"
        />
        <p style={s.fieldHint}>
          The gallery owner will see your photos labeled as &ldquo;{guestName.trim() || 'Guest'} (guest).&rdquo;
        </p>
      </div>

      <div style={s.card}>
        <label style={s.label}>Photos</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFilesSelected}
          disabled={uploading || slotsAvailable === 0}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          style={{ ...s.pickBtn, opacity: slotsAvailable === 0 ? 0.5 : 1 }}
          disabled={uploading || slotsAvailable === 0}
          onClick={() => fileInputRef.current?.click()}
        >
          + Choose photos
        </button>

        {photos.length > 0 && (
          <div style={s.grid}>
            {photos.map((p, i) => (
              <div key={p.preview} style={s.tile}>
                <img src={p.preview} alt="" style={s.tileImg} />
                {!uploading && p.status !== 'done' && (
                  <button
                    style={s.removeBtn}
                    onClick={() => removePhoto(i)}
                    type="button"
                    aria-label="Remove photo"
                  >×</button>
                )}
                {p.status === 'uploading' && (
                  <div style={s.tileOverlay}><Spinner small /></div>
                )}
                {p.status === 'done' && (
                  <div style={s.tileOverlayDone}>✓</div>
                )}
                {p.status === 'error' && (
                  <div style={s.tileOverlayError}>!</div>
                )}
              </div>
            ))}
          </div>
        )}

        <p style={s.fieldHint}>
          {slotsAvailable === 0
            ? 'No more uploads allowed on this link.'
            : `${slotsAvailable} upload${slotsAvailable === 1 ? '' : 's'} remaining.`}
        </p>
      </div>

      <button
        style={{
          ...s.uploadBtn,
          opacity: photos.length === 0 || uploading || !guestName.trim() ? 0.5 : 1,
        }}
        onClick={handleUpload}
        disabled={photos.length === 0 || uploading || !guestName.trim()}
      >
        {uploading
          ? `Uploading ${photosDone} of ${photos.length}…`
          : photos.length === 0
            ? 'Add photos to upload'
            : `Upload ${photos.length} photo${photos.length === 1 ? '' : 's'}`}
      </button>

      <BigAppStoreCTA caption="Want the full Momento experience? Get the app." />

      {profileTipOpen && (
        <ProfileTipModal onClose={() => setProfileTipOpen(false)} />
      )}
    </Shell>
  );
}

// === Shell: wraps every page state with the top bar (logo + profile-tip) and bottom App Store CTA ===
function Shell({
  linkInfo,
  children,
}: { linkInfo: LinkInfo | null; children: React.ReactNode }) {
  const [tipOpen, setTipOpen] = useState(false);
  return (
    <>
      <TopBar onProfileClick={() => setTipOpen(true)} />
      <main style={s.main}>{children}</main>
      {tipOpen && <ProfileTipModal onClose={() => setTipOpen(false)} />}
    </>
  );
}

// === TopBar: small Momento logo on the left + faux profile icon on the right ===
function TopBar({ onProfileClick }: { onProfileClick: () => void }) {
  return (
    <div style={s.topBar}>
      <a href="/" style={{ textDecoration: 'none', display: 'inline-flex' }}>
        <MomentoMark size={28} />
      </a>
      <button onClick={onProfileClick} style={s.profileIconBtn} aria-label="Profile">
        <GuestAvatar size={32} />
      </button>
    </div>
  );
}

// === Big App Store CTA: shown on every page state ===
function BigAppStoreCTA({ caption }: { caption: string }) {
  return (
    <div style={s.appStoreCTABlock}>
      <p style={s.appStoreCaption}>{caption}</p>
      <AppStoreBadge width={240} />
      <p style={s.appStoreSubcap}>
        Create your own galleries, save the memories you're already a part of, and meet up with friends.
      </p>
    </div>
  );
}

// === Profile tip modal: "Download the app to make a profile" ===
function ProfileTipModal({ onClose }: { onClose: () => void }) {
  return (
    <div style={s.modalBackdrop} onClick={onClose}>
      <div style={s.modalCard} onClick={(e) => e.stopPropagation()}>
        <GuestAvatar size={64} />
        <h2 style={s.modalTitle}>Make it official</h2>
        <p style={s.modalBody}>
          Download the app to make a profile and relive memories with friends!
        </p>
        <div style={{ marginTop: 16 }}>
          <AppStoreBadge width={210} />
        </div>
        <button onClick={onClose} style={s.modalDismiss}>Maybe later</button>
      </div>
    </div>
  );
}

// === GuestAvatar: classic grey "empty person" circle ===
function GuestAvatar({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="32" cy="32" r="32" fill="#D1D1D6" />
      <circle cx="32" cy="25" r="10" fill="#FFFFFF" />
      <path
        d="M14 56c2-9 10-15 18-15s16 6 18 15"
        fill="#FFFFFF"
      />
    </svg>
  );
}

function Spinner({ small }: { small?: boolean }) {
  const size = small ? 18 : 32;
  return (
    <div
      style={{
        width: size,
        height: size,
        border: `${small ? 2 : 3}px solid #e5e5e5`,
        borderTopColor: COLORS.coral,
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// === Styles ===

const s: Record<string, React.CSSProperties> = {
  topBar: {
    position: 'sticky',
    top: 0,
    zIndex: 10,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 20px',
    background: 'rgba(250, 250, 250, 0.94)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    borderBottom: `1px solid ${COLORS.hairline}`,
  },
  profileIconBtn: {
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    display: 'inline-flex',
  },
  main: {
    maxWidth: 540,
    margin: '0 auto',
    padding: '24px 20px 56px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  centerBlock: {
    textAlign: 'center',
    paddingTop: 24,
  },
  headerBlock: {
    textAlign: 'center',
    paddingTop: 8,
    paddingBottom: 8,
  },
  eyebrow: {
    margin: 0,
    fontSize: 13,
    color: COLORS.textSubtle,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  galleryTitle: {
    margin: '8px 0 4px',
    fontSize: 32,
    fontWeight: 700,
    lineHeight: 1.2,
    color: COLORS.ink,
  },
  subtle: {
    margin: 0,
    fontSize: 14,
    color: COLORS.textMuted,
  },
  card: {
    background: COLORS.cardBg,
    borderRadius: 14,
    padding: 20,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    border: `1px solid ${COLORS.hairline}`,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: '#444',
    display: 'block',
    marginBottom: 8,
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    fontSize: 16,
    border: '1px solid #d4d4d4',
    borderRadius: 10,
    outline: 'none',
    background: '#fafafa',
  },
  fieldHint: {
    margin: '8px 0 0',
    fontSize: 12,
    color: COLORS.textSubtle,
  },
  pickBtn: {
    width: '100%',
    padding: '14px',
    fontSize: 16,
    fontWeight: 500,
    background: '#f0f0f0',
    color: COLORS.ink,
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 8,
    marginTop: 12,
  },
  tile: {
    position: 'relative',
    aspectRatio: '1 / 1',
    borderRadius: 8,
    overflow: 'hidden',
    background: '#eee',
  },
  tileImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  removeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: 'rgba(0,0,0,0.7)',
    color: '#fff',
    fontSize: 16,
    fontWeight: 600,
    lineHeight: '22px',
    padding: 0,
    border: 'none',
    cursor: 'pointer',
  },
  tileOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileOverlayDone: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(52, 199, 89, 0.55)',
    color: '#fff',
    fontSize: 28,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileOverlayError: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(255, 59, 48, 0.55)',
    color: '#fff',
    fontSize: 24,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The big coral upload button (Momento color)
  uploadBtn: {
    width: '100%',
    padding: '18px',
    fontSize: 17,
    fontWeight: 600,
    background: COLORS.coral,
    color: '#fff',
    borderRadius: 14,
    marginTop: 8,
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(255, 107, 92, 0.35)',
  },
  secondaryBtn: {
    padding: '12px 24px',
    fontSize: 16,
    fontWeight: 500,
    background: '#f0f0f0',
    color: COLORS.ink,
    borderRadius: 10,
    marginTop: 16,
    border: 'none',
    cursor: 'pointer',
  },
  // App Store CTA block visible on every screen state
  appStoreCTABlock: {
    marginTop: 32,
    padding: '24px 20px',
    background: COLORS.coralLight,
    borderRadius: 14,
    textAlign: 'center',
  },
  appStoreCaption: {
    margin: 0,
    marginBottom: 12,
    fontSize: 15,
    fontWeight: 600,
    color: COLORS.ink,
  },
  appStoreSubcap: {
    margin: '12px 0 0',
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 1.4,
  },
  // Modal
  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 100,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    background: '#fff',
    borderRadius: 18,
    padding: 28,
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 700,
    margin: '8px 0 0',
    color: COLORS.ink,
  },
  modalBody: {
    fontSize: 15,
    color: COLORS.textMuted,
    lineHeight: 1.5,
    margin: '4px 0 0',
  },
  modalDismiss: {
    marginTop: 14,
    padding: '8px 16px',
    fontSize: 14,
    color: COLORS.textMuted,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
  },
  h1: { fontSize: 28, fontWeight: 700, margin: 0, color: COLORS.ink },
  body: { fontSize: 16, color: '#555', maxWidth: 380, lineHeight: 1.5, margin: '12px 0 24px' },
  iconLg: { fontSize: 56, marginBottom: 12 },
};
