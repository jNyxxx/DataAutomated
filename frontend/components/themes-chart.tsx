'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface ThemeEntry {
  name: string;
  count: number;
}

export default function ThemesChart({ data }: { data: ThemeEntry[] }) {
  if (data.length === 0) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h2 className="text-sm font-medium text-gray-700 mb-4">Themes</h2>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} layout="vertical">
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="count" fill="#6366f1" radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
