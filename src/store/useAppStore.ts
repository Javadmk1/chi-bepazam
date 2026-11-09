import { create } from "zustand";

type AppState = {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedRecipeId: string | null;
  setSelectedRecipeId: (id: string | null) => void;
};

export const useAppStore = create<AppState>((set) => ({
  activeTab: "خانه",
  setActiveTab: (activeTab) => set({ activeTab }),
  selectedRecipeId: null,
  setSelectedRecipeId: (selectedRecipeId) => set({ selectedRecipeId })
}));