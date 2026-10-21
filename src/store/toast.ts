import { create } from 'zustand';

type ToastState = { message: string | null; id: number; show(message: string): void; hide(id: number): void };

export const useToast = create<ToastState>()((set, get) => ({
  message: null,
  id: 0,
  show(message) {
    const id = get().id + 1;
    set({ message, id });
    setTimeout(() => get().hide(id), 2600);
  },
  hide(id) {
    if (get().id === id) set({ message: null });
  },
}));
