import type { IngestionSummaryResponse } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { countTiles } from '@/lib/outcome-buckets';
import { cn } from '@/lib/utils';

export function SummaryCards({ summary }: { summary: IngestionSummaryResponse }) {
  const tiles = countTiles(summary);

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-7">
      {tiles.map((tile) => (
        <Card
          key={tile.key}
          role="group"
          aria-label={tile.label}
          className={cn(tile.alert && 'border-destructive/40')}
        >
          <CardHeader className="pb-2">
            <CardDescription>{tile.label}</CardDescription>
            <CardTitle className={cn('text-3xl tabular-nums', tile.alert && 'text-destructive')}>
              {tile.value}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-xs">{tile.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
