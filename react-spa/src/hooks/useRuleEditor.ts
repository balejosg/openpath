import { useCallback, useState } from 'react';
import type { Dispatch, KeyboardEvent, SetStateAction } from 'react';

import type { Rule } from '../lib/rules';

interface UseRuleEditorOptions {
  onSave?: (id: string, data: { value?: string; comment?: string | null }) => Promise<boolean>;
  resolveRule: (id: string) => Rule | undefined;
}

interface UseRuleEditorResult {
  editingId: string | null;
  editValue: string;
  editComment: string;
  isSaving: boolean;
  startEdit: (rule: Rule) => void;
  cancelEdit: () => void;
  saveEdit: () => Promise<void>;
  setEditValue: Dispatch<SetStateAction<string>>;
  setEditComment: Dispatch<SetStateAction<string>>;
  handleEditKeyDown: (event: KeyboardEvent) => void;
}

export function useRuleEditor({ onSave, resolveRule }: UseRuleEditorOptions): UseRuleEditorResult {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editComment, setEditComment] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const startEdit = useCallback((rule: Rule) => {
    setEditingId(rule.id);
    setEditValue(rule.value);
    setEditComment(rule.comment ?? '');
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditValue('');
    setEditComment('');
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingId || !onSave || isSaving) return;

    const rule = resolveRule(editingId);
    if (!rule) return;

    const nextValue = editValue.trim();
    const valueChanged = nextValue !== rule.value;
    const commentChanged = editComment !== (rule.comment ?? '');

    if (!valueChanged && !commentChanged) {
      cancelEdit();
      return;
    }

    if (!nextValue) {
      return;
    }

    setIsSaving(true);
    const success = await onSave(editingId, {
      value: valueChanged ? nextValue : undefined,
      comment: commentChanged ? editComment.trim() || null : undefined,
    });

    if (success) {
      cancelEdit();
    }

    setIsSaving(false);
  }, [cancelEdit, editComment, editValue, editingId, isSaving, onSave, resolveRule]);

  const handleEditKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void saveEdit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      }
    },
    [cancelEdit, saveEdit]
  );

  return {
    editingId,
    editValue,
    editComment,
    isSaving,
    startEdit,
    cancelEdit,
    saveEdit,
    setEditValue,
    setEditComment,
    handleEditKeyDown,
  };
}
