/** Warna situs. Admin memilih preset atau warna sendiri; tiap orang memilih kepadatan tampilan. */
import type { SiteContent, SiteTheme } from './types';

export interface Preset { id: string; name: string; primary: string; accent: string }
export const PRESETS: Preset[] = [
  { id: 'merah', name: 'Merah tinta (Academie)', primary: '#17171d', accent: '#d9142b' },
  { id: 'teal', name: 'Teal', primary: '#0f4c45', accent: '#0a9488' },
  { id: 'biru', name: 'Biru kampus', primary: '#1d3a7a', accent: '#2563eb' },
  { id: 'ungu', name: 'Ungu', primary: '#33256e', accent: '#6e5bd6' },
];
export const DEFAULT_PRESET = 'merah';

const HEX = /^#[0-9a-f]{6}$/i;
export function resolveTheme(t: SiteTheme | undefined): { primary: string; accent: string } {
  const p = PRESETS.find((x) => x.id === (t?.preset || DEFAULT_PRESET)) ?? PRESETS[0];
  return {
    primary: t?.primary && HEX.test(t.primary) ? t.primary : p.primary,
    accent: t?.accent && HEX.test(t.accent) ? t.accent : p.accent,
  };
}

/** Kontras WCAG antara dua warna hex. */
export function contrast(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** Pasang warna ke variabel CSS halaman. */
export function applyTheme(t: SiteTheme | undefined) {
  if (typeof document === 'undefined') return;
  const { primary, accent } = resolveTheme(t);
  const s = document.documentElement.style;
  s.setProperty('--primary', primary);
  s.setProperty('--primary-soft', `color-mix(in srgb, ${primary} 9%, #fff)`);
  s.setProperty('--accent', accent);
  s.setProperty('--series', accent);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', primary);
}

/** Teks halaman depan: isian admin, atau teks bawaan bila kosong. */
export const CONTENT_DEFAULTS: Required<Omit<SiteContent, 'intro_3d'>> & { intro_3d: boolean } = {
  hero_title: 'Les privat Teknik Industri',
  hero_accent: 'yang progresnya kelihatan.',
  hero_lead: 'Kamu pilih mata kuliah dan jam. Mentor yang mengajar mata kuliah itu menyiapkan materinya. Pretest di awal dan posttest di akhir menunjukkan seberapa jauh kamu naik.',
  cta_label: 'Masuk ke Academie',
  about: 'IE.Academie adalah les privat dan kelas kecil untuk mahasiswa Teknik Industri. Satu sesi 60 menit, maksimal lima orang, dan setiap topik punya nilai sebelum dan sesudah.',
  intro_3d: true,
};
export function content(c: SiteContent | undefined) {
  const out = { ...CONTENT_DEFAULTS };
  for (const k of Object.keys(CONTENT_DEFAULTS) as (keyof SiteContent)[]) {
    const v = c?.[k];
    if (typeof v === 'string' && v.trim()) (out as Record<string, unknown>)[k] = v.trim();
    if (typeof v === 'boolean') (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
