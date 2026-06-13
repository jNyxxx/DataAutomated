import Link from 'next/link';
import { TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface CompSignalCardProps {
  unreadSignals: number | null;
}

export function CompSignalCard({ unreadSignals }: CompSignalCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-primary" />
          Competitive Signals
        </CardTitle>
      </CardHeader>
      <CardContent>
        {unreadSignals !== null ? (
          <>
            <p className="text-3xl font-bold tabular-nums">{unreadSignals}</p>
            <p className="text-sm text-muted-foreground mt-1">unread signals</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No signals yet</p>
        )}
        <Link href="/signals" className="text-xs text-primary hover:underline mt-4 block">
          View all signals →
        </Link>
      </CardContent>
    </Card>
  );
}
