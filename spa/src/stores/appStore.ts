import { create } from 'zustand';
import type { Group, RuleType } from '@/types';

interface AppState {
  currentGroup: Group | null;
  currentRuleType: RuleType;
  allGroups: Group[];
  sidebarOpen: boolean;

  setCurrentGroup: (group: Group | null) => void;
  setCurrentRuleType: (type: RuleType) => void;
  setAllGroups: (groups: Group[]) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentGroup: null,
  currentRuleType: 'whitelist',
  allGroups: [],
  sidebarOpen: false,

  setCurrentGroup: (group) => { set({ currentGroup: group }); },
  setCurrentRuleType: (type) => { set({ currentRuleType: type }); },
  setAllGroups: (groups) => { set({ allGroups: groups }); },
  setSidebarOpen: (open) => { set({ sidebarOpen: open }); },
  toggleSidebar: () => { set((state) => ({ sidebarOpen: !state.sidebarOpen })); },
}));
