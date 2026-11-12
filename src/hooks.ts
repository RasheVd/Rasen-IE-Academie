import { useEffect, useState } from 'react';

/** Waktu sekarang, diperbarui tiap menit supaya "sesi berikutnya" tetap benar. */
export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  return now;
}
export function useTitle(title: string) {
  useEffect(() => { document.title = title ? `${title} · IE.Academie` : 'IE.Academie'; }, [title]);
}
