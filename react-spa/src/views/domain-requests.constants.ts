import type { RequestPriority, RequestStatus } from '@openpath/api';

export const PRIORITY_WEIGHT: Record<RequestPriority, number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
};

export const PRIORITY_COLORS: Record<RequestPriority, string> = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-amber-100 text-amber-700 border-amber-200',
  normal: 'bg-blue-100 text-blue-700 border-blue-200',
  low: 'bg-slate-100 text-slate-600 border-slate-200',
};

export const PRIORITY_LABELS: Record<RequestPriority, string> = {
  urgent: 'Urgente',
  high: 'Alta',
  normal: 'Normal',
  low: 'Baja',
};

export const STATUS_COLORS: Record<RequestStatus, string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  approved: 'bg-green-100 text-green-700 border-green-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
};

export const STATUS_LABELS: Record<RequestStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
};
