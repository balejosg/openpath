import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { GroupVisibility } from '@openpath/shared';
import { sanitizeSlug } from '@openpath/shared/slug';
import { trpc } from '../lib/trpc';
import { isAdmin, isTeacher, isTeacherGroupsFeatureEnabled } from '../lib/auth';
import { isDuplicateError, resolveTrpcErrorMessage } from '../lib/error-utils';
import { reportError } from '../lib/reportError';
import { useAllowedGroups } from './useAllowedGroups';
import { useMutationFeedback } from './useMutationFeedback';

type GroupsListOutput = Awaited<ReturnType<typeof trpc.groups.list.query>>;
export type AllowedGroup = GroupsListOutput[number];

type LibraryListOutput = Awaited<ReturnType<typeof trpc.groups.libraryList.query>>;
export type LibraryGroup = LibraryListOutput[number];

export type GroupsActiveView = 'my' | 'library';

export interface GroupCardViewModel {
  id: string;
  name: string;
  displayName: string;
  description: string;
  domainCount: number;
  status: 'Active' | 'Inactive';
  visibility: GroupVisibility;
}

interface UseGroupsViewModelOptions {
  onNavigateToRules: (group: { id: string; name: string; readOnly?: boolean }) => void;
}

export function useGroupsViewModel({ onNavigateToRules }: UseGroupsViewModelOptions) {
  const [activeView, setActiveView] = useState<GroupsActiveView>('my');
  const [showNewModal, setShowNewModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<AllowedGroup | null>(null);
  const [cloneSource, setCloneSource] = useState<LibraryGroup | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [newGroupError, setNewGroupError] = useState('');
  const [cloneName, setCloneName] = useState('');
  const [cloneDisplayName, setCloneDisplayName] = useState('');
  const [cloneError, setCloneError] = useState('');
  const [configDescription, setConfigDescription] = useState('');
  const [configStatus, setConfigStatus] = useState<'Active' | 'Inactive'>('Active');
  const [configVisibility, setConfigVisibility] = useState<GroupVisibility>('private');
  const [saving, setSaving] = useState(false);

  const admin = isAdmin();
  const teacherCanCreateGroups = isTeacher() && isTeacherGroupsFeatureEnabled();
  const canCreateGroups = admin || teacherCanCreateGroups;

  const {
    groups: allowedGroups,
    groupById: allowedGroupById,
    isLoading,
    error: groupsQueryError,
    refetch: refetchGroups,
  } = useAllowedGroups();

  const libraryQuery = useQuery({
    queryKey: ['groups.libraryList'],
    queryFn: () => trpc.groups.libraryList.query(),
    enabled: activeView === 'library',
  });

  const {
    error: configError,
    clearError: clearConfigError,
    captureError: captureConfigError,
  } = useMutationFeedback({
    badRequest: 'Revisa los datos del grupo antes de guardar.',
    conflict:
      'No se pudo guardar porque el grupo fue modificado recientemente. Recarga e intenta de nuevo.',
    fallback: 'No se pudo guardar la configuración del grupo. Intenta nuevamente.',
  });

  const libraryGroups: LibraryGroup[] = (libraryQuery.data ?? []) as LibraryGroup[];
  const libraryLoading =
    libraryQuery.status === 'pending' || libraryQuery.fetchStatus === 'fetching';
  const libraryError = libraryQuery.error ? 'Error al cargar biblioteca' : null;
  const visibleGroups = activeView === 'library' ? libraryGroups : allowedGroups;

  const groups = useMemo<GroupCardViewModel[]>(() => {
    return visibleGroups.map((group) => {
      const status: 'Active' | 'Inactive' = group.enabled ? 'Active' : 'Inactive';

      return {
        id: group.id,
        name: group.name,
        displayName: group.displayName || group.name,
        description: group.displayName || group.name,
        domainCount: group.whitelistCount + group.blockedSubdomainCount + group.blockedPathCount,
        status,
        visibility: (group.visibility as GroupVisibility | undefined) ?? 'private',
      };
    });
  }, [visibleGroups]);

  const loading = activeView === 'library' ? libraryLoading : isLoading;
  const error =
    activeView === 'library' ? libraryError : groupsQueryError ? 'Error al cargar grupos' : null;

  const refetchActiveView = async () => {
    if (activeView === 'library') {
      await libraryQuery.refetch();
      return;
    }

    await refetchGroups();
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      setNewGroupError('El nombre del grupo es obligatorio');
      return;
    }

    const slug = sanitizeSlug(newGroupName, { maxLength: 100, allowUnderscore: true });
    if (!slug) {
      setNewGroupError('El slug del grupo es inválido');
      return;
    }

    try {
      setSaving(true);
      setNewGroupError('');
      await trpc.groups.create.mutate({
        name: slug,
        displayName: newGroupDescription.trim() || newGroupName.trim(),
      });
      await refetchGroups();
      setNewGroupName('');
      setNewGroupDescription('');
      setShowNewModal(false);
    } catch (err) {
      reportError('Failed to create group:', err);
      if (isDuplicateError(err)) {
        setNewGroupError(
          `Ya existe un grupo con ese identificador (slug): "${slug}". Prueba con "${slug}-2".`
        );
        return;
      }

      setNewGroupError(
        resolveTrpcErrorMessage(err, {
          badRequest: 'Revisa el nombre del grupo (slug) antes de crear.',
          forbidden: 'No tienes permisos para crear grupos.',
          fallback: 'Error al crear grupo. Intenta nuevamente.',
        })
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!selectedGroup) return;

    try {
      setSaving(true);
      clearConfigError();
      await trpc.groups.update.mutate({
        id: selectedGroup.id,
        displayName: configDescription,
        enabled: configStatus === 'Active',
        visibility: configVisibility,
      });
      await refetchGroups();
      setShowConfigModal(false);
    } catch (err) {
      reportError('Failed to update group:', err);
      captureConfigError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleCloneGroup = async () => {
    if (!cloneSource) return;

    const trimmedName = cloneName.trim();
    const sanitizedName = trimmedName
      ? sanitizeSlug(trimmedName, { maxLength: 100, allowUnderscore: true })
      : '';

    if (trimmedName && !sanitizedName) {
      setCloneError('El slug del grupo es inválido');
      return;
    }

    try {
      setSaving(true);
      setCloneError('');

      const result = await trpc.groups.clone.mutate({
        sourceGroupId: cloneSource.id,
        name: sanitizedName || undefined,
        displayName: cloneDisplayName.trim() || undefined,
      });

      await refetchGroups();
      setActiveView('my');
      setShowCloneModal(false);
      setCloneSource(null);

      onNavigateToRules({
        id: result.id,
        name: cloneDisplayName.trim() || result.name,
      });
    } catch (err) {
      reportError('Failed to clone group:', err);
      setCloneError(
        resolveTrpcErrorMessage(err, {
          conflict: 'No se puede clonar un grupo inactivo.',
          forbidden: 'No tienes permisos para clonar este grupo.',
          fallback: 'No se pudo clonar el grupo. Intenta nuevamente.',
        })
      );
    } finally {
      setSaving(false);
    }
  };

  const openNewModal = () => {
    setNewGroupName('');
    setNewGroupDescription('');
    setNewGroupError('');
    setShowNewModal(true);
  };

  const closeNewModal = () => {
    setShowNewModal(false);
  };

  const openConfigModal = (groupId: string) => {
    const group = allowedGroupById.get(groupId);
    if (!group) return;

    setSelectedGroup(group);
    setConfigDescription(group.displayName || group.name);
    setConfigStatus(group.enabled ? 'Active' : 'Inactive');
    setConfigVisibility((group.visibility as GroupVisibility | undefined) ?? 'private');
    clearConfigError();
    setShowConfigModal(true);
  };

  const closeConfigModal = () => {
    clearConfigError();
    setShowConfigModal(false);
  };

  const openCloneModal = (groupId: string) => {
    const group = libraryGroups.find((candidate) => candidate.id === groupId);
    if (!group) return;

    setCloneSource(group);
    const baseDisplayName = group.displayName || group.name;
    setCloneDisplayName(`${baseDisplayName} Copia`);
    setCloneName(`${group.name}-copia`);
    setCloneError('');
    setShowCloneModal(true);
  };

  const closeCloneModal = () => {
    setShowCloneModal(false);
    setCloneSource(null);
    setCloneError('');
  };

  const handleNewGroupNameChange = (value: string) => {
    setNewGroupName(value);
    if (newGroupError) setNewGroupError('');
  };

  const handleCloneNameChange = (value: string) => {
    setCloneName(value);
    if (cloneError) setCloneError('');
  };

  const handleCloneDisplayNameChange = (value: string) => {
    setCloneDisplayName(value);
    if (cloneError) setCloneError('');
  };

  return {
    activeView,
    setActiveView,
    admin,
    teacherCanCreateGroups,
    canCreateGroups,
    groups,
    loading,
    error,
    refetchActiveView,
    showNewModal,
    showConfigModal,
    showCloneModal,
    selectedGroup,
    cloneSource,
    newGroupName,
    setNewGroupName,
    newGroupDescription,
    setNewGroupDescription,
    newGroupError,
    cloneName,
    setCloneName,
    cloneDisplayName,
    setCloneDisplayName,
    cloneError,
    configDescription,
    setConfigDescription,
    configStatus,
    setConfigStatus,
    configVisibility,
    setConfigVisibility,
    configError,
    saving,
    openNewModal,
    closeNewModal,
    openConfigModal,
    closeConfigModal,
    openCloneModal,
    closeCloneModal,
    handleNewGroupNameChange,
    handleCloneNameChange,
    handleCloneDisplayNameChange,
    handleCreateGroup,
    handleSaveConfig,
    handleCloneGroup,
  };
}
