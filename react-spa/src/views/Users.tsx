import type React from 'react';

import { UsersCreateModal } from '../components/users/UsersCreateModal';
import { UsersDeleteDialog } from '../components/users/UsersDeleteDialog';
import { UsersEditModal } from '../components/users/UsersEditModal';
import { UsersResetDialogs } from '../components/users/UsersResetDialogs';
import { UsersTable } from '../components/users/UsersTable';
import { UsersToolbar } from '../components/users/UsersToolbar';
import { useUsersViewModel } from '../hooks/useUsersViewModel';

const UsersView = (): React.JSX.Element => {
  const viewModel = useUsersViewModel();

  return (
    <div className="space-y-6">
      <UsersToolbar
        exportMessage={viewModel.exportMessage}
        onExportUsers={viewModel.handleExportUsers}
        onOpenNewUser={viewModel.openNewModal}
        searchQuery={viewModel.searchQuery}
        setSearchQuery={viewModel.setSearchQuery}
      />

      <UsersTable
        deleting={viewModel.deleting}
        error={viewModel.error}
        fetchUsers={viewModel.fetchUsers}
        fetching={viewModel.fetching}
        filteredUsers={viewModel.filteredUsers}
        hasData={viewModel.hasData}
        hasNextPage={viewModel.hasNextPage}
        hasPreviousPage={viewModel.hasPreviousPage}
        hasVisibleData={viewModel.totalCount > 0}
        rangeEnd={viewModel.rangeEnd}
        rangeStart={viewModel.rangeStart}
        setPageIndex={viewModel.setPageIndex}
        showInitialLoading={viewModel.showInitialLoading}
        totalCount={viewModel.totalCount}
        visibleUsers={viewModel.visibleUsers}
        onOpenEditModal={viewModel.openEditModal}
        onRequestDeleteUser={viewModel.requestDeleteUser}
        onRequestPasswordReset={viewModel.requestPasswordReset}
      />

      <UsersEditModal
        closeEditModal={viewModel.closeEditModal}
        editEmail={viewModel.editEmail}
        editName={viewModel.editName}
        saving={viewModel.saving}
        saveEdit={viewModel.saveEdit}
        selectedUser={viewModel.selectedUser}
        setEditEmail={viewModel.setEditEmail}
        setEditName={viewModel.setEditName}
        showEditModal={viewModel.showEditModal}
      />

      <UsersCreateModal
        closeNewModal={viewModel.closeNewModal}
        createError={viewModel.createError}
        createUser={viewModel.createUser}
        newEmail={viewModel.newEmail}
        newName={viewModel.newName}
        newPassword={viewModel.newPassword}
        newRole={viewModel.newRole}
        resetNewUserForm={viewModel.resetNewUserForm}
        saving={viewModel.saving}
        setCreateError={viewModel.setCreateError}
        setNewEmail={viewModel.setNewEmail}
        setNewName={viewModel.setNewName}
        setNewPassword={viewModel.setNewPassword}
        setNewRole={viewModel.setNewRole}
        showNewModal={viewModel.showNewModal}
      />

      <UsersResetDialogs
        closeResetFlow={viewModel.closeResetFlow}
        confirmGenerateResetToken={viewModel.confirmGenerateResetToken}
        generatedResetToken={viewModel.generatedResetToken}
        resetError={viewModel.resetError}
        resetFlow={viewModel.resetFlow}
        resetUser={viewModel.resetUser}
        resettingPassword={viewModel.resettingPassword}
      />

      <UsersDeleteDialog
        clearDeleteState={viewModel.clearDeleteState}
        deleteError={viewModel.deleteError}
        deleteTarget={viewModel.deleteTarget}
        deleting={viewModel.deleting}
        handleConfirmDeleteUser={viewModel.handleConfirmDeleteUser}
      />
    </div>
  );
};

export default UsersView;
