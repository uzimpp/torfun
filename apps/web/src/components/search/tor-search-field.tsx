'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Search } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * The one way into `/search`, wherever it appears.
 *
 * It is a real `GET` form pointed at `/search`, so submitting it works before
 * hydration and without JavaScript at all; `onSubmit` only upgrades that to a
 * client-side navigation. Keeping the native form is also what makes the
 * on-screen keyboard show a search key on a phone.
 */
export function TorSearchField({
  size = 'compact',
  defaultValue = '',
  value: controlledValue,
  onValueChange,
  onSubmit,
  label = 'ค้นหาประกาศ TOR',
  suggestions,
  autoFocus = false,
  className,
}: {
  /** `hero` is the landing page's centrepiece; `compact` rides in the header. */
  size?: 'hero' | 'compact';
  defaultValue?: string;
  /**
   * Controlled mode: pass `value` + `onValueChange` when a caller (the search
   * page) needs to react to every keystroke, e.g. to debounce. Everywhere else
   * the field just tracks its own text and only reports it on submit.
   */
  value?: string;
  onValueChange?: (value: string) => void;
  /** Overrides the default submit behaviour (navigate to `/search`). */
  onSubmit?: (query: string) => void;
  label?: string;
  /** Example queries, offered as one-tap starting points below the field. */
  suggestions?: readonly string[];
  autoFocus?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const value = controlledValue ?? uncontrolledValue;
  const setValue = onValueChange ?? setUncontrolledValue;
  const hero = size === 'hero';

  function goTo(query: string) {
    if (onSubmit) onSubmit(query);
    else router.push(`/search?q=${encodeURIComponent(query)}`);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    goTo(value.trim());
  }

  return (
    <div className={className}>
      <form
        role="search"
        action="/search"
        method="get"
        onSubmit={handleSubmit}
        aria-label={label}
        className={cn(
          'group bg-card border-input flex items-center border transition-[box-shadow,border-color] duration-300',
          'focus-within:border-ring focus-within:ring-ring/25 focus-within:ring-4',
          hero
            ? 'shadow-soft has-[input:focus-visible]:shadow-lifted gap-2 rounded-2xl p-2 sm:gap-3'
            : 'gap-2 rounded-xl py-1 pr-1 pl-3',
        )}
      >
        <label htmlFor={inputId} className="sr-only">
          {label}
        </label>
        <Search
          aria-hidden="true"
          className={cn(
            'text-muted-foreground group-focus-within:text-primary shrink-0 transition-colors',
            hero ? 'ms-3 size-5' : 'size-4',
          )}
        />
        <input
          id={inputId}
          ref={inputRef}
          name="q"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoFocus={autoFocus}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={hero ? 'เช่น ระบบสารสนเทศ, พัฒนาเว็บไซต์, จัดจ้างซอฟต์แวร์' : 'ค้นหา TOR'}
          className={cn(
            'placeholder:text-muted-foreground/80 min-w-0 flex-1 bg-transparent outline-none',
            '[&::-webkit-search-cancel-button]:hidden',
            hero ? 'py-3 text-base sm:text-lg' : 'py-2 text-sm',
          )}
        />
        <button
          type="submit"
          className={cn(
            'bg-primary text-primary-foreground inline-flex shrink-0 items-center justify-center',
            'focus-visible:ring-ring/50 font-medium transition-[transform,background-color] outline-none',
            'hover:bg-primary/90 focus-visible:ring-4 active:translate-y-px',
            hero
              ? 'h-12 gap-2 rounded-xl px-4 text-sm sm:px-6 sm:text-base'
              : 'size-8 rounded-lg text-xs',
          )}
        >
          {/* The label is always in the accessibility tree; on a narrow screen
              it simply stops taking up room next to the arrow. */}
          <span className={hero ? 'sr-only sm:not-sr-only' : 'sr-only'}>ค้นหา</span>
          <ArrowRight aria-hidden="true" className="size-4" />
        </button>
      </form>

      {suggestions && suggestions.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground me-1 text-xs">ลองค้นหา</span>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                setValue(suggestion);
                goTo(suggestion);
              }}
              className={cn(
                'border-border/80 bg-card/60 text-muted-foreground rounded-full border px-3 py-1.5 text-xs',
                'hover:border-primary/40 hover:text-foreground focus-visible:ring-ring/50 transition-colors',
                'focus-visible:ring-3 focus-visible:outline-none active:translate-y-px',
              )}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
