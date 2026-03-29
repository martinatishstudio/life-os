'use client'

import { createContext, useCallback, useContext, useState, useEffect, type ReactNode } from 'react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const typeStyles: Record<ToastType, string> = {
  success: 'bg-[#0c3230] text-[#b8f04a] border-[#b8f04a]/30',
  error: 'bg-[#3a1010] text-[#f07070] border-[#f07070]/30',
  info: 'bg-[#0c2a2e] text-[#3dbfb5] border-[#3dbfb5]/30',
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const [visible, setVisible] = useState(false)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    const showTimer = requestAnimationFrame(() => setVisible(true))
    const dismissTimer = setTimeout(() => {
      setExiting(true)
      setTimeout(() => onRemove(toast.id), 300)
    }, 3000)

    return () => {
      cancelAnimationFrame(showTimer)
      clearTimeout(dismissTimer)
    }
  }, [toast.id, onRemove])

  return (
    <div
      className={`
        px-4 py-3 rounded-xl border text-sm font-medium
        transition-all duration-300 ease-out
        ${typeStyles[toast.type]}
        ${visible && !exiting ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
      `}
    >
      {toast.message}
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev, { id, message, type }])
  }, [])

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 md:bottom-6 md:left-auto md:right-6 md:translate-x-0 z-50 flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
