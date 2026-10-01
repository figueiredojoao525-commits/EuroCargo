// Small inline icon set (stroke icons, 24x24) to avoid an icon library dependency.
const PATHS = {
  box: 'M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8',
  truck: 'M1 5h13v11H1zM14 9h4l3 3v4h-7M5.5 19a2 2 0 100-4 2 2 0 000 4zM17.5 19a2 2 0 100-4 2 2 0 000 4z',
  home: 'M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9z',
  arrowRight: 'M4 12h15M13 6l6 6-6 6',
  arrowLeft: 'M20 12H5M11 6l-6 6 6 6',
  globe: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5',
  bell: 'M6 16V11a6 6 0 1112 0v5l2 2H4l2-2zM10 21h4',
  headset: 'M4 14v-2a8 8 0 0116 0v2M4 14h3v6H5a1 1 0 01-1-1v-5zM20 14h-3v6h2a1 1 0 001-1v-5z',
  menu: 'M3 6h18M3 12h18M3 18h18',
  close: 'M6 6l12 12M18 6L6 18',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  phone: 'M5 3h4l2 5-3 2a11 11 0 006 6l2-3 5 2v4a2 2 0 01-2 2A17 17 0 013 5a2 2 0 012-2z',
  pin: 'M12 21s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12zM12 11a2 2 0 100-4 2 2 0 000 4z',
  chevronDown: 'M6 9l6 6 6-6',
  check: 'M5 12l5 5L20 7',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3zM9 12l2 2 4-4',
  cart: 'M3 4h2l2.4 11.2a1 1 0 001 .8h9.2a1 1 0 001-.8L21 8H6.2M9 20a1 1 0 100-2 1 1 0 000 2zM18 20a1 1 0 100-2 1 1 0 000 2z',
  chat: 'M21 12a8 8 0 01-11.7 7.1L4 20l1-4.6A8 8 0 1121 12z',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  car: 'M3 13l2-6h14l2 6v4H3v-4zM3 13h18M7 17v2M17 17v2M7 15h.01M17 15h.01',
  wrench: 'M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.1-.4-.4-2.1 2.5-2.5z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4',
  plus: 'M12 5v14M5 12h14',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01',
  filter: 'M4 5h16l-6 8v6l-4-2v-4L4 5z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  tag: 'M3 12V4h8l9 9-8 8-9-9zM7.5 8.5h.01',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0012 3z',
  brake: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 15a3 3 0 100-6 3 3 0 000 6z',
  engine: 'M4 10h2V8h4V6h4v2h3l2 3h2v5h-2l-2 3H8l-2-3H4v-6z',
  suspension: 'M8 3h8M8 21h8M8 6l8 2-8 3 8 2-8 3 8 2',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
  cooling: 'M12 2v20M4.9 7l14.2 10M19.1 7L4.9 17',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 13a7.6 7.6 0 000-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 00-1.7-1L15 3.5h-4L10.6 6a7.4 7.4 0 00-1.7 1l-2.4-1-2 3.4L4.6 11a7.6 7.6 0 000 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 001.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 001.7-1l2.4 1 2-3.4-2-1.6z',
  clutch: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 16a4 4 0 100-8 4 4 0 000 8zM12 3v5M12 16v5M3 12h5M16 12h5',
  snow: 'M12 2v20M4.2 6.5l15.6 11M19.8 6.5L4.2 17.5M9 4l3 2 3-2M9 20l3-2 3 2',
  steering: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 14a2 2 0 100-4 2 2 0 000 4zM3.5 10h6.7M13.8 10h6.7M12 14v7',
  exhaust: 'M2 14h11a3 3 0 003-3V9h4v6h-4M2 14v3h13M18 19c1-1 2-1 3 0M16 21c1-1 2-1 3 0',
  drop: 'M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3z',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
