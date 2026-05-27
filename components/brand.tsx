// Shared brand components: Momento wordmark and Apple-style App Store badge.

import React from 'react';

export const COLORS = {
  coral: '#FF6B5C',
  coralDark: '#E85A4C',
  coralLight: '#FFE5E2',
  ink: '#111111',
  textMuted: '#666666',
  textSubtle: '#999999',
  cardBg: '#FFFFFF',
  pageBg: '#FAFAFA',
  hairline: '#EFEFEF',
  appStoreBlack: '#000000',
};

// Update this to the real App Store URL once the app is live there.
// Until then, link to TestFlight or your landing page.
export const APP_STORE_URL = 'https://apps.apple.com/app/momento';

// === Momento wordmark ===
// Uses a coral M monogram circle + the word "Momento". Lightweight inline SVG.

export function MomentoWordmark({ size = 48, color = COLORS.coral }: { size?: number; color?: string }) {
  const fontSize = size * 0.7;
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: size * 0.25,
      }}
    >
      <MomentoMark size={size} color={color} />
      <span
        style={{
          fontSize,
          fontWeight: 700,
          letterSpacing: -1,
          color: COLORS.ink,
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
        }}
      >
        Momento
      </span>
    </div>
  );
}

// Stand-alone monogram (the M-in-a-circle) for places where we want a compact mark
export function MomentoMark({ size = 32, color = COLORS.coral }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Momento"
    >
      <circle cx="32" cy="32" r="32" fill={color} />
      <path
        d="M16 46 V18 H21 L32 36 L43 18 H48 V46 H43 V27 L34 41 H30 L21 27 V46 Z"
        fill="white"
      />
    </svg>
  );
}

// === Apple-style App Store badge ===
// We don't use Apple's official SVG asset (would need approval to redistribute),
// but we render a close visual analog: black pill, "Download on the" + "App Store".
// Big tap target. Centered. Recognizable.

export function AppStoreBadge({ width = 220 }: { width?: number }) {
  const height = width * 0.32;
  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 18px',
        height,
        minWidth: width,
        background: COLORS.appStoreBlack,
        color: '#fff',
        borderRadius: 12,
        textDecoration: 'none',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        transition: 'transform 0.1s',
      }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      onTouchStart={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
      onTouchEnd={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
    >
      <AppleLogo size={28} />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1, textAlign: 'left' }}>
        <span style={{ fontSize: 10, opacity: 0.9, letterSpacing: 0.4 }}>Download on the</span>
        <span style={{ fontSize: 19, fontWeight: 600, marginTop: 2 }}>App Store</span>
      </div>
    </a>
  );
}

// Compact (mobile-friendly) variant — same component, smaller dimensions
export function AppStoreBadgeCompact() {
  return <AppStoreBadge width={170} />;
}

function AppleLogo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M16.365 1.43c0 1.14-.43 2.22-1.27 3.05-.84.84-2.21 1.49-3.32 1.4-.13-1.13.41-2.27 1.21-3.06.86-.87 2.32-1.45 3.38-1.39zM21.5 17.05c-.6 1.36-.88 1.97-1.65 3.17-1.08 1.68-2.61 3.78-4.51 3.8-1.69.02-2.12-1.1-4.41-1.09-2.29.01-2.77 1.11-4.46 1.09-1.9-.02-3.35-1.91-4.43-3.59C-.34 16.05-.66 10.46 1.86 7.71c1.18-1.3 2.86-2.04 4.49-2.04 1.66 0 2.7.91 4.07.91 1.33 0 2.13-.91 4.05-.91 1.45 0 2.99.79 4.09 2.16-3.59 1.97-3 7.13.94 9.22z"/>
    </svg>
  );
}
