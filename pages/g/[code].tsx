import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase, EDGE_FUNCTION_BASE } from '../../lib/supabaseClient';

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
  preview: string; // object URL for thumbnail
  status: 'pending' | 'uploading' | 'done' | 'error';
  errorMessage?: string;
}

const REASON_MESSAGES: Record<string, { title: string; body: string }> = {
  not_found: {
    title: 'Link not found',
    body: 'This upload link doesn\'t exist. Double-check the QR code or ask the gallery owner for a new one.',
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

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Validate the code once it's available
  useEffect(() => {
    if (!router.isReady || !code) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase.rpc('get_guest_upload_link_info', {
          p_code: code,
        });
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

  const handleFilesSelected = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (files.length === 0) return;
    const remaining = linkInfo?.uploads_remaining ?? 50;
    const allowed = files.slice(0, Math.max(0, remaining - photos.length));
    const newPhotos: QueuedPhoto[] = allowed.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      status: 'pending',
    }));
    setPhotos((prev) => [...prev, ...newPhotos]);
    // Reset input so the same file can be picked again later if removed
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [linkInfo, photos.length]);

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      const next = prev.filter((_, i) => i !== index);
      // revoke the removed preview's URL to avoid memory leaks
      const removed = prev[index];
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return next;
    });
  };

  const uploadOne = async (queued: QueuedPhoto, index: number): Promise<void> => {
    // 1. Get signed URL from edge function
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

    // 2. Upload directly to storage
    const putRes = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': queued.file.type || 'image/jpeg' },
      body: queued.file,
    });
    if (!putRes.ok) {
      throw new Error('storage_upload_failed');
    }

    // 3. Commit the upload (creates the gallery_photos row)
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
        await uploadOne(photos[i], i);
        setPhotos((prev) => prev.map((p, idx) => idx === i ? { ...p, status: 'done' } : p));
      } catch (e: any) {
        allOk = false;
        setPhotos((prev) => prev.map((p, idx) => idx === i ? { ...p, status: 'error', errorMessage: e?.message || 'failed' } : p));
      }
    }
    setUploading(false);
    if (allOk) setAllDone(true);
  };

  // --- Render states ---

  if (loading || !router.isReady) {
    return <CenteredLayout><Spinner /></CenteredLayout>;
  }

  if (error) {
    return (
      <CenteredLayout>
        <h1 style={styles.h1}>Something went wrong</h1>
        <p style={styles.body}>{error}</p>
      </CenteredLayout>
    );
  }

  if (!linkInfo || !linkInfo.is_valid) {
    const msg = REASON_MESSAGES[linkInfo?.reason || 'not_found'] || REASON_MESSAGES.not_found;
    return (
      <CenteredLayout>
        <div style={styles.iconLg}>⚠️</div>
        <h1 style={styles.h1}>{msg.title}</h1>
        <p style={styles.body}>{msg.body}</p>
        <a href="/" style={styles.footerLink}>About Momento</a>
      </CenteredLayout>
    );
  }

  if (allDone) {
    const doneCount = photos.filter(p => p.status === 'done').length;
    return (
      <CenteredLayout>
        <div style={styles.iconLg}>✅</div>
        <h1 style={styles.h1}>Uploaded!</h1>
        <p style={styles.body}>
          {doneCount} photo{doneCount === 1 ? '' : 's'} added to <strong>{linkInfo.gallery_name}</strong>.
        </p>
        <button
          style={styles.secondaryBtn}
          onClick={() => {
            setAllDone(false);
            setPhotos([]);
          }}
        >
          Add more photos
        </button>
        <div style={{ marginTop: 32 }}>
          <p style={styles.footerNote}>Want the full app?</p>
          <a
            href="https://apps.apple.com/app/momento"
            target="_blank"
            rel="noopener noreferrer"
            style={styles.footerLink}
          >
            Get Momento for iPhone
          </a>
        </div>
      </CenteredLayout>
    );
  }

  const ownerLabel = linkInfo.owner_display_name || (linkInfo.owner_username ? `@${linkInfo.owner_username}` : 'Someone');

  return (
    <>
      <Head>
        <title>Upload to {linkInfo.gallery_name} · Momento</title>
        <meta name="description" content={`Add your photos to ${linkInfo.gallery_name} on Momento.`} />
        <meta property="og:title" content={`📷 Upload to ${linkInfo.gallery_name}`} />
        <meta property="og:description" content={`${ownerLabel} invited you to add your photos.`} />
      </Head>
      <main style={styles.main}>
        <div style={styles.headerBlock}>
          <p style={styles.eyebrow}>You're invited to upload photos to</p>
          <h1 style={styles.galleryTitle}>{linkInfo.gallery_name}</h1>
          <p style={styles.subtle}>by {ownerLabel}</p>
        </div>

        <div style={styles.card}>
          <label style={styles.label} htmlFor="name-input">Your name</label>
          <input
            id="name-input"
            type="text"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value.slice(0, 50))}
            placeholder="e.g. Sarah"
            style={styles.input}
            disabled={uploading}
            maxLength={50}
            autoCorrect="off"
            autoCapitalize="words"
          />
          <p style={styles.fieldHint}>The gallery owner will see your photos as &ldquo;from {guestName.trim() || 'Guest'}.&rdquo;</p>
        </div>

        <div style={styles.card}>
          <label style={styles.label}>Photos</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFilesSelected}
            disabled={uploading}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            style={styles.pickBtn}
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            + Choose photos
          </button>

          {photos.length > 0 && (
            <div style={styles.grid}>
              {photos.map((p, i) => (
                <div key={p.preview} style={styles.tile}>
                  <img src={p.preview} alt="" style={styles.tileImg} />
                  {!uploading && p.status !== 'done' && (
                    <button
                      style={styles.removeBtn}
                      onClick={() => removePhoto(i)}
                      type="button"
                      aria-label="Remove photo"
                    >×</button>
                  )}
                  {p.status === 'uploading' && (
                    <div style={styles.tileOverlay}><Spinner small /></div>
                  )}
                  {p.status === 'done' && (
                    <div style={styles.tileOverlayDone}>✓</div>
                  )}
                  {p.status === 'error' && (
                    <div style={styles.tileOverlayError}>!</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {linkInfo.uploads_remaining !== null && (
            <p style={styles.fieldHint}>
              {linkInfo.uploads_remaining - photos.filter(p => p.status === 'done').length} of {linkInfo.uploads_remaining} uploads remaining
            </p>
          )}
        </div>

        <button
          style={{ ...styles.uploadBtn, opacity: photos.length === 0 || uploading || !guestName.trim() ? 0.5 : 1 }}
          onClick={handleUpload}
          disabled={photos.length === 0 || uploading || !guestName.trim()}
        >
          {uploading
            ? `Uploading ${photos.filter(p => p.status === 'done').length} of ${photos.length}…`
            : photos.length === 0
              ? 'Add photos to upload'
              : `Upload ${photos.length} photo${photos.length === 1 ? '' : 's'}`}
        </button>

        <p style={styles.footerNote}>
          Powered by <a href="/" style={styles.footerLink}>Momento</a>
        </p>
      </main>
    </>
  );
}

// --- Small components ---

function CenteredLayout({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ ...styles.main, justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
      {children}
    </main>
  );
}

function Spinner({ small }: { small?: boolean }) {
  const size = small ? 18 : 32;
  return (
    <div style={{
      width: size, height: size,
      border: `${small ? 2 : 3}px solid #e5e5e5`,
      borderTopColor: '#111',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// --- Styles ---

const styles: Record<string, React.CSSProperties> = {
  main: {
    maxWidth: 540,
    margin: '0 auto',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    padding: '32px 20px 48px',
    gap: 16,
  },
  headerBlock: {
    textAlign: 'center',
    paddingTop: 16,
    paddingBottom: 8,
  },
  eyebrow: {
    margin: 0,
    fontSize: 13,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  galleryTitle: {
    margin: '8px 0 4px',
    fontSize: 32,
    fontWeight: 700,
    lineHeight: 1.2,
  },
  subtle: {
    margin: 0,
    fontSize: 14,
    color: '#666',
  },
  card: {
    background: '#fff',
    borderRadius: 14,
    padding: 20,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    border: '1px solid #efefef',
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
    color: '#888',
  },
  pickBtn: {
    width: '100%',
    padding: '14px',
    fontSize: 16,
    fontWeight: 500,
    background: '#f0f0f0',
    color: '#111',
    borderRadius: 10,
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
  uploadBtn: {
    width: '100%',
    padding: '16px',
    fontSize: 17,
    fontWeight: 600,
    background: '#111',
    color: '#fff',
    borderRadius: 12,
    marginTop: 8,
  },
  secondaryBtn: {
    padding: '12px 24px',
    fontSize: 16,
    fontWeight: 500,
    background: '#f0f0f0',
    color: '#111',
    borderRadius: 10,
    marginTop: 16,
  },
  footerNote: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    marginTop: 24,
  },
  footerLink: {
    color: '#666',
    textDecoration: 'underline',
    fontSize: 14,
  },
  h1: { fontSize: 28, fontWeight: 700, margin: 0 },
  body: { fontSize: 16, color: '#555', maxWidth: 380, lineHeight: 1.5, margin: '12px 0 24px' },
  iconLg: { fontSize: 56, marginBottom: 12 },
};
