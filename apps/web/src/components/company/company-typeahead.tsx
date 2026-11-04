'use client';

import { useEffect, useState } from 'react';
import { ChevronsUpDownIcon } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { searchCompanies, type CompanyResponse } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * Finds the Company a colleague already created.
 *
 * Membership is claimed rather than granted (ADR-0008): an officer searches the
 * names that exist, joins one, and only creates a new Company when nothing
 * matches — so two people at the same software house maintain one list instead
 * of two.
 *
 * The API does the matching, so cmdk's own filtering is switched off; filtering
 * a page of server results a second time would hide rows the search deliberately
 * returned.
 */
export function CompanyTypeahead({
  onJoin,
  onCreateNew,
  disabled = false,
}: {
  /** Join a company that already exists. */
  onJoin: (company: CompanyResponse) => void;
  /** Nothing matched — carry what was typed over to the create form. */
  onCreateNew: (name: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  /** Results carry the query they answered, so a stale page is never shown. */
  const [answer, setAnswer] = useState<{ query: string; companies: CompanyResponse[] } | null>(
    null,
  );

  const trimmed = query.trim();
  const results = answer?.query === trimmed ? answer.companies : null;
  const searching = trimmed !== '' && results === null;

  useEffect(() => {
    if (!open || trimmed === '') return;

    // Debounced, and `cancelled` guards against a slow early response landing
    // after a faster later one.
    let cancelled = false;
    const timer = setTimeout(() => {
      searchCompanies(trimmed).then(
        (data) => {
          if (!cancelled) setAnswer({ query: trimmed, companies: data.companies });
        },
        () => {
          // A search that failed is reported as no match rather than as a stuck
          // spinner; creating the company is still open to the officer.
          if (!cancelled) setAnswer({ query: trimmed, companies: [] });
        },
      );
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, trimmed]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(buttonVariants({ variant: 'outline' }), 'w-full justify-between font-normal')}
      >
        ค้นหาบริษัทที่มีอยู่แล้ว
        <ChevronsUpDownIcon className="opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) min-w-72 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="พิมพ์ชื่อบริษัทเป็นภาษาไทย"
          />
          <CommandList>
            {trimmed === '' ? (
              <CommandEmpty>พิมพ์เพื่อค้นหาบริษัท</CommandEmpty>
            ) : searching ? (
              <CommandEmpty>กำลังค้นหา…</CommandEmpty>
            ) : null}

            {results !== null && results.length > 0 ? (
              <CommandGroup heading="บริษัทที่พบ">
                {results.map((found) => (
                  <CommandItem
                    key={found.id}
                    value={found.id}
                    onSelect={() => {
                      setOpen(false);
                      onJoin(found);
                    }}
                  >
                    <span className="truncate">{found.name_th}</span>
                    {found.tin ? (
                      <span className="text-muted-foreground ml-auto text-xs">{found.tin}</span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {results !== null && results.length === 0 ? (
              // Being first must not be a dead end: the same search that found
              // nothing offers to create what was typed.
              <CommandGroup heading="ไม่พบบริษัทนี้">
                <CommandItem
                  value="create-new-company"
                  onSelect={() => {
                    setOpen(false);
                    onCreateNew(trimmed);
                  }}
                >
                  สร้างบริษัทใหม่ “{trimmed}”
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
