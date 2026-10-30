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
        <div role="status" className="fixed bottom-5 right-5 z-50 rounded bg-gray-900 p-4 text-white">
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
