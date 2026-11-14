/** Tautan WhatsApp (wa.me) dengan pesan siap kirim. Tidak memakai API; membuka WhatsApp di perangkat pengirim. */

/** 08xx, +62 8xx, 62-8xx menjadi 628xx. */
export function normalizePhone(raw: string): string {
  let d = (raw || '').replace(/[^0-9+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('0')) d = '62' + d.slice(1);
  if (d.startsWith('8')) d = '62' + d;
  return d;
}
/** +6285967072383 menjadi +62 859-6707-2383. */
export function prettyPhone(p: string): string {
  const d = normalizePhone(p);
  const m = d.match(/^62(\d{3})(\d{4})(\d+)$/);
  return m ? `+62 ${m[1]}-${m[2]}-${m[3]}` : p;
}
export function waLink(phone: string, text = ''): string {
  const n = normalizePhone(phone);
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
export function cancelMessage(p: { studentName: string; mentorName: string; code: string; course: string; when: string; reason: string; credit: boolean; site: string }) {
  return [
    `Halo ${p.studentName.split(' ')[0]}, ini ${p.mentorName} dari IE.Academie.`,
    `Mohon maaf, sesi ${p.code} (${p.course}) ${p.when} saya batalkan: ${p.reason}`,
    p.credit ? 'Pembayaranmu sudah jadi 1 kredit sesi. Silakan booking jadwal baru di website, kreditnya terpakai otomatis.' : 'Silakan booking jadwal baru di website.',
    `${p.site}/booking`,
  ].join('\n');
}
export function inviteMessage(p: { name: string; role: string; link: string }) {
  return [
    `Halo ${p.name.split(' ')[0]}, kamu diundang sebagai ${p.role} di IE.Academie.`,
    'Buka tautan ini untuk membuat kata sandi dan masuk (berlaku sekali pakai):',
    p.link,
  ].join('\n');
}
