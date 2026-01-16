import type { AppState, GitHubAPIInstance, User } from '../types/index.js';

/**
 * Global Application State
 */
export const state: AppState = {
    github: null,
    currentGroup: null,
    currentGroupData: null,
    currentGroupSha: null,
    currentRuleType: 'whitelist',
    allGroups: [],
    currentUser: null,
    canEdit: false
};

// Getters and setters for convenience
export function setGithub(api: GitHubAPIInstance): void { state.github = api; }
export function setCurrentUser(user: User): void { state.currentUser = user; }
export function setCanEdit(value: boolean): void { state.canEdit = value; }
