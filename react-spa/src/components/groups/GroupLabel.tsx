import React from 'react';
import type { CurrentGroupSource } from '../../types';
import { cn } from '../../lib/utils';

export interface GroupLike {
  id: string;
  name: string;
  displayName?: string | null;
  enabled?: boolean | number | null;
  status?: string | null;
}

export function isGroupEnabled(group: GroupLike): boolean {
  const enabledValue = group.enabled;

  if (typeof enabledValue === 'boolean') return enabledValue;
  if (typeof enabledValue === 'number') return enabledValue === 1;

  if (group.status === 'Active' || group.status === 'active') return true;
  if (group.status === 'Inactive' || group.status === 'inactive') return false;

  return true;
}

export function inferGroupSource(input: {
  currentGroupSource?: CurrentGroupSource | null;
  activeGroupId?: string | null;
  currentGroupId?: string | null;
  defaultGroupId?: string | null;
}): CurrentGroupSource {
  if (input.currentGroupSource) return input.currentGroupSource;
  if (input.activeGroupId) return 'manual';
  if (!input.currentGroupId) return 'none';
  if (input.defaultGroupId && input.currentGroupId === input.defaultGroupId) return 'default';
  return 'schedule';
}

export function getGroupSourceTag(source: CurrentGroupSource): string {
  if (source === 'manual') return 'manual';
  if (source === 'schedule') return 'horario';
  if (source === 'default') return 'defecto';
  return '';
}

export function getGroupSourcePhrase(source: CurrentGroupSource): string {
  if (source === 'default') return 'por defecto';
  if (source === 'schedule') return 'por horario';
  if (source === 'manual') return 'manual';
  return '';
}

export function resolveGroupDisplayName(params: {
  groupId: string | null | undefined;
  group?: GroupLike | null;
  source: CurrentGroupSource;
  revealUnknownId?: boolean;
  noneLabel?: string;
}): string {
  const { groupId, group, source, revealUnknownId, noneLabel } = params;

  if (!groupId) return noneLabel ?? 'Sin grupo';
  if (group) return group.displayName ?? group.name;
  if (revealUnknownId) return groupId;

  if (source === 'manual') return 'Aplicado por otro profesor';
  if (source === 'default') return 'Asignado por admin';
  if (source === 'schedule') return 'Reservado por otro profesor';

  return 'Grupo no disponible';
}

export function getGroupBadgeVariant(source: CurrentGroupSource, enabled: boolean): string {
  if (!enabled) return 'bg-slate-100 text-slate-600 border-slate-200';

  if (source === 'manual') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (source === 'schedule') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (source === 'default') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return 'bg-slate-100 text-slate-500 border-slate-200';
}

export interface GroupLabelProps {
  groupId: string | null | undefined;
  group?: GroupLike | null;
  source: CurrentGroupSource;
  revealUnknownId?: boolean;
  noneLabel?: string;

  variant?: 'badge' | 'text';
  showSourceTag?: boolean;
  showInactiveTag?: boolean;
  className?: string;
  title?: string;
}

export const GroupLabel: React.FC<GroupLabelProps> = ({
  groupId,
  group,
  source,
  revealUnknownId,
  noneLabel,
  variant = 'badge',
  showSourceTag = true,
  showInactiveTag = false,
  className,
  title,
}) => {
  const enabled = group ? isGroupEnabled(group) : true;
  const name = resolveGroupDisplayName({ groupId, group, source, revealUnknownId, noneLabel });

  const parts: string[] = [name];
  const sourceTag = showSourceTag ? getGroupSourceTag(source) : '';
  if (sourceTag) parts.push(sourceTag);
  if (showInactiveTag && !enabled) parts.push('inactivo');
  const text = parts.join(' · ');

  if (variant === 'text') {
    return (
      <span className={className} title={title}>
        {text}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'px-2 py-0.5 rounded-full border',
        getGroupBadgeVariant(source, enabled),
        className
      )}
      title={title}
    >
      {text}
    </span>
  );
};
