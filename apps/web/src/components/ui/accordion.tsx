'use client';

import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

function Accordion({ className, ...props }: AccordionPrimitive.Root.Props) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      className={cn('flex w-full flex-col', className)}
      {...props}
    />
  );
}

function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn('border-border border-b last:border-b-0', className)}
      {...props}
    />
  );
}

/** The whole row is the button; the chevron turns when it is open. */
function AccordionTrigger({ className, children, ...props }: AccordionPrimitive.Trigger.Props) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          'group/accordion-trigger hover:bg-muted/50 focus-visible:ring-ring/50 flex w-full items-start gap-3 rounded-lg px-2 py-3 text-start text-sm outline-none focus-visible:ring-3',
          className,
        )}
        {...props}
      >
        <ChevronRight
          aria-hidden="true"
          className="text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform group-aria-expanded/accordion-trigger:rotate-90"
        />
        {children}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({ className, children, ...props }: AccordionPrimitive.Panel.Props) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className="h-(--accordion-panel-height) overflow-hidden text-sm transition-[height] duration-150 data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none"
      {...props}
    >
      <div className={cn('ps-9 pe-2 pb-4', className)}>{children}</div>
    </AccordionPrimitive.Panel>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
