import type { TorWithMatch } from '@/features/tors/types';
import { TorCard } from './tor-card';

export function TorGrid({ tors }: { tors: TorWithMatch[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {tors.map((tor) => (
        <TorCard key={tor.id} tor={tor} />
      ))}
    </div>
  );
}
