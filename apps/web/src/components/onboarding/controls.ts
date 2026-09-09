/**
 * Control sizing for the sign-in and sign-up flow.
 *
 * The shadcn defaults (`h-8`) are tuned for dense consoles like the ingestion
 * table. These pages are the opposite: a handful of fields, often on a phone,
 * filled once. They get a comfortable target instead — and they get it from one
 * place, because the three pages drifted to three different heights the last
 * time each wrote its own.
 */

/** Text inputs and textareas. */
export const FLOW_FIELD = 'h-11 rounded-lg px-3.5 text-base md:text-sm';

/** Buttons that submit or move the flow along. */
export const FLOW_ACTION = 'h-11 rounded-lg px-4 text-sm';

/** The gap between a label and its input, per the form pattern used throughout. */
export const FLOW_FIELD_GROUP = 'grid gap-2';
