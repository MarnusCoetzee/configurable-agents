export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Cockpit brand"
    >
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7dd3fc" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <rect width="28" height="28" rx="7" fill="url(#bg)" />
      <path
        d="M7 18 L11 11 L14.5 15 L18 9 L21 14"
        stroke="#0b1220"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="21" cy="14" r="1.6" fill="#0b1220" />
    </svg>
  );
}
