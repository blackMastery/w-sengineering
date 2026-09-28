"use client";

import { openSearch } from "./search-overlay";

export function FindByPartButton({ className = "" }: { className?: string }) {
  return (
    <button type="button" onClick={openSearch} className={className}>
      Find by part # <span className="ml-1.5 hidden font-mono text-xs opacity-70 md:inline">⌘K</span>
    </button>
  );
}
