import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface DashboardPlaceholderProps {
  title: string;
  description?: ReactNode;
}

export default function DashboardPlaceholder({ title, description }: DashboardPlaceholderProps) {
  return (
    <section className={cn('rounded-lg border border-slate-200 bg-white p-6 shadow-sm')}>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {description ? <div className="mt-2 text-sm text-slate-600">{description}</div> : null}
    </section>
  );
}
