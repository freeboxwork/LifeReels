import type { ReactNode } from "react";

interface AppHeaderProps {
  /** Optional content rendered on the right side of the header */
  rightContent?: ReactNode;
  /** Extra CSS classes for the header element */
  className?: string;
}

/**
 * Shared app header used by Generate, Loading, and Result pages.
 * Displays the Life Reels logo + branding with an optional right slot.
 */
export default function AppHeader({ rightContent, className = "" }: AppHeaderProps) {
  return (
    <header
      className={
        "relative z-20 flex h-16 items-center justify-between shrink-0 " +
        "border-b border-white/20 px-6 lg:px-10 " +
        "bg-background-light/90 backdrop-blur-md " +
        className
      }
    >
      <div className="flex items-center gap-3 text-text-main">
        <div className="size-8 rounded-lg bg-primary/20 flex items-center justify-center text-[#c88c10]">
          <span className="material-symbols-outlined text-[22px]">movie_filter</span>
        </div>
        <span className="text-lg font-bold tracking-tight select-none">Life Reels</span>
      </div>

      {rightContent ? (
        <div className="flex items-center gap-3">{rightContent}</div>
      ) : null}
    </header>
  );
}
