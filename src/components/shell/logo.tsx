/** Seeds mark: a sprouting seed. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-label="Seeds" role="img">
      <rect width="40" height="40" rx="10" fill="#2f7d4f" />
      <path d="M20 31V19" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M20 21c0-5 3.5-8.5 9-8.5 0 5.2-3.6 8.5-9 8.5z" fill="#cdeccf" />
      <path d="M20 23.5c0-4.2-3-7.2-7.6-7.2 0 4.4 3 7.2 7.6 7.2z" fill="#fff" />
    </svg>
  );
}
