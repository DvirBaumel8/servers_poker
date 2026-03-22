import { create } from "zustand";

export type ToastTone = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (message: string, tone?: ToastTone, duration?: number) => void;
  removeToast: (id: string) => void;
}

let toastCounter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, tone = "success", duration = 4000) => {
    const id = `toast-${++toastCounter}-${Date.now()}`;
    set((state) => ({
      toasts: [...state.toasts, { id, message, tone, duration }],
    }));
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, duration);
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

export function toast(message: string, tone?: ToastTone, duration?: number) {
  useToastStore.getState().addToast(message, tone, duration);
}
