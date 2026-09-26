const s = { fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const;

export const Crown = () => (
  <svg viewBox="0 0 24 24" class="crown" aria-hidden="true">
    <path
      d="M3.5 8.5 7.5 12l4.5-7 4.5 7 4-3.5-1.8 10H5.3z"
      fill="currentColor"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linejoin="round"
    />
    <rect x="5.2" y="19.6" width="13.6" height="2" rx="1" fill="currentColor" />
  </svg>
);

export const Cross = () => (
  <svg viewBox="0 0 24 24" class="cross" aria-hidden="true">
    <path d="M7 7l10 10M17 7 7 17" {...s} stroke-width={2.6} />
  </svg>
);

export const UndoIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 14 4 9l5-5" {...s} />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" {...s} />
  </svg>
);

export const ClearIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" {...s} />
  </svg>
);

export const HintIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" {...s} />
  </svg>
);

export const NewIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" {...s} />
  </svg>
);

export const ChevronDown = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" class="chev">
    <path d="m6 9 6 6 6-6" {...s} stroke-width={2.4} />
  </svg>
);
