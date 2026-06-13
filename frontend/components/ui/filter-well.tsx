import React from 'react';
import { ChevronDown } from 'lucide-react';

interface FilterWellProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: string[];
}

export function FilterWell({ label, options, ...props }: FilterWellProps) {
  return (
    <div className="relative flex h-9 items-center rounded-lg bg-slate-950/50 text-sm ring-1 ring-inset ring-slate-800 focus-within:ring-2 focus-within:ring-blue-500">
      <span className="pointer-events-none pl-3 text-slate-500">{label}:</span>
      <select 
        className="h-full cursor-pointer appearance-none bg-transparent py-0 pl-1.5 pr-8 text-slate-200 outline-none"
        {...props}
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-slate-900">{o}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-slate-500" />
    </div>
  );
}
