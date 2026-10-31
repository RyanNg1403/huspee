'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
const ToastContext = createContext<((message: string) => void) | null>(null);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  function toast(text: string) {
    window.clearTimeout(timer.current);
    setMessage(text);
    timer.current = window.setTimeout(() => setMessage(''), 4000);
  }
  return (
    <ToastContext.Provider value={toast}>
      {children}
      {message && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-panel"
        >
          {message}
        </div>
      )}
    </ToastContext.Provider>
  );
}
export function useToast() {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error('ToastProvider required');
  return toast;
}
