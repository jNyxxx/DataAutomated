import { getTokenServerSide } from '@/lib/auth';
import { fetchSignals } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { SignalCard } from '@/components/signals/SignalCard';

export default async function SignalsPage() {
  const token = getTokenServerSide()!;
  const data = await fetchSignals(token, { limit: 20 }).catch(() => ({
    signals: [],
    total: 0,
  }));

  return (
    <div>
      <Header
        title="Competitive Signals"
        description="Real-time intelligence on competitor moves, pricing, hiring, and strategic shifts"
      />

      {data.signals.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center gap-2">
          <p className="text-muted-foreground">No signals yet.</p>
          <p className="text-sm text-muted-foreground">
            Configure competitor monitoring in Settings to start receiving signals.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {data.signals.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      )}
    </div>
  );
}
