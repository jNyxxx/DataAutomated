import React from 'react';
import { Search } from 'lucide-react';

export function SearchWell({ placeholder = "Search...", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex h-9 items-center gap-2 rounded-lg bg-slate-950/50 px-3 text-sm ring-1 ring-inset ring-slate-800 focus-within:ring-2 focus-within:ring-blue-500">
      <Search className="size-4 text-slate-500" />
      <input 
        type="search" 
        placeholder={placeholder} 
        className="w-40 bg-transparent text-slate-200 outline-none placeholder:text-slate-500 sm:w-56" 
        {...props} 
      />
    </label>
  );
}
