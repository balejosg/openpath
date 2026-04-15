import { useState } from 'react';
import type { GroupVisibility } from '@openpath/shared';
import type { AllowedGroup, GroupsActiveView, LibraryGroup } from './useGroupsViewModel';

export function useGroupsViewModelState() {
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

  return {
    activeView,
    setActiveView,
    showNewModal,
    setShowNewModal,
    showConfigModal,
    setShowConfigModal,
    showCloneModal,
    setShowCloneModal,
    selectedGroup,
    setSelectedGroup,
    cloneSource,
    setCloneSource,
    newGroupName,
    setNewGroupName,
    newGroupDescription,
    setNewGroupDescription,
    newGroupError,
    setNewGroupError,
    cloneName,
    setCloneName,
    cloneDisplayName,
    setCloneDisplayName,
    cloneError,
    setCloneError,
    configDescription,
    setConfigDescription,
    configStatus,
    setConfigStatus,
    configVisibility,
    setConfigVisibility,
    saving,
    setSaving,
  };
}
