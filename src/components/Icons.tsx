export function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark ${small ? "small" : ""}`}>
      <svg width="29" height="29" viewBox="0 0 32 32" fill="none">
        <path d="M7 24C3 10 14 5 26 7c1 12-7 21-19 17Z" fill="currentColor" />
        <path
          d="M8 26 22 12M14 20l-1-6M18 16l6-1"
          stroke="var(--mark-line, #315B45)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
