import type { SVGProps } from 'react';

const paths: Record<string, string> = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.2-4.2',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6 6 18',
  chevL: 'M15 6l-6 6 6 6',
  chevR: 'M9 6l6 6-6 6',
  chevD: 'M6 9l6 6 6-6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 4 2.8 20h18.4L12 4Zm0 6v4.5m0 2.8v.2',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 8v5m0-8.5v.2',
  trash: 'M5 7h14M10 7V4.5h4V7m-7 0 .8 12.5h8.4L17 7',
  menu: 'M4 7h16M4 12h16M4 17h16',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  pin: 'M9 4h6l-1 6 3 3H7l3-3-1-6Zm3 9v7',
  edit: 'M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5H5V6h5',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4.5V12l3 2',
  calendar: 'M4 6h16v14H4V6Zm0 4h16M8 3v4m8-4v4',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2m9-9h-2M5 12H3m15.4-6.4L17 7M7 17l-1.4 1.4m12.8 0L17 17M7 7 5.6 5.6',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm7.4 3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2.2-1.3L14.4 2h-4l-.4 2.4a7.5 7.5 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.5 7.5 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  download: 'M12 4v11m-5-5 5 5 5-5M5 20h14',
  upload: 'M12 20V9m-5 5 5-5 5 5M5 4h14',
  user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 20a8 8 0 0 1 16 0',
  note: 'M6 3h9l4 4v14H6V3Zm9 0v4h4M9 12h7M9 16h5',
  arrowR: 'M5 12h14m-5-5 5 5-5 5',
  sparkle: 'M12 3v4m0 10v4M3 12h4m10 0h4',
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 16, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      <path d={paths[name]} />
    </svg>
  );
}

/** Five-petal sakura mark, drawn with notched petals. */
export function Logo({ size = 22 }: { size?: number }) {
  const petal = 'M12 12 C 9.6 9.4, 9.6 5.6, 11.1 3.4 L 12 4.6 L 12.9 3.4 C 14.4 5.6, 14.4 9.4, 12 12 Z';
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {[0, 72, 144, 216, 288].map((a) => (
        <path key={a} d={petal} transform={`rotate(${a} 12 12)`} fill="currentColor" opacity={0.92} />
      ))}
      <circle cx="12" cy="12" r="1.5" fill="var(--paper)" />
    </svg>
  );
}
