'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { CoachMessage } from '@/types'

// --- Markdown rendering ---

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let remaining = text
  let k = 0
  while (remaining.length > 0) {
    const bold = remaining.match(/\*\*(.+?)\*\*/)
    if (bold && bold.index !== undefined) {
      if (bold.index > 0) parts.push(<span key={k++}>{remaining.slice(0, bold.index)}</span>)
      parts.push(<strong key={k++} className="font-semibold">{bold[1]}</strong>)
      remaining = remaining.slice(bold.index + bold[0].length)
    } else {
      parts.push(<span key={k++}>{remaining}</span>)
      break
    }
  }
  return <>{parts}</>
}

function renderMarkdown(text: string) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let listItems: string[] = []
  let key = 0

  function flushList() {
    if (listItems.length > 0) {
      elements.push(
        <ul key={key++} className="list-disc list-outside pl-4 space-y-0.5 my-1.5">
          {listItems.map((item, i) => (
            <li key={i} className="text-sm leading-relaxed">{renderInline(item)}</li>
          ))}
        </ul>
      )
      listItems = []
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || /^\d+\.\s/.test(trimmed)) {
      listItems.push(trimmed.replace(/^[-•]\s+/, '').replace(/^\d+\.\s+/, ''))
    } else {
      flushList()
      if (trimmed === '') {
        elements.push(<div key={key++} className="h-1.5" />)
      } else if (trimmed.startsWith('#')) {
        elements.push(<p key={key++} className="text-sm font-bold mt-2 mb-1">{renderInline(trimmed.replace(/^#+\s*/, ''))}</p>)
      } else {
        elements.push(<p key={key++} className="text-sm leading-relaxed">{renderInline(trimmed)}</p>)
      }
    }
  }
  flushList()
  return elements
}

// --- Quick action prompts ---

const QUICK_ACTIONS = [
  { label: 'Daglig brief', prompt: 'Gi meg en daglig brief basert på dagens status' },
  { label: 'Hva bør jeg fokusere på?', prompt: 'Hva bør jeg fokusere på?' },
  { label: 'Hvordan ligger jeg an denne uken?', prompt: 'Hvordan ligger jeg an denne uken?' },
  { label: 'Hjelp meg bryte ned et mål', prompt: 'Hjelp meg bryte ned et mål' },
]

// --- Component ---

export function CoachChat() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<CoachMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [initialLoaded, setInitialLoaded] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Get user on mount — fallback to hardcoded ID for single-user app
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? '89b04d8f-09a6-4fe7-9efe-5d0843d63519')
    })
  }, [])

  // Load messages when chat opens
  useEffect(() => {
    if (!open || !userId || initialLoaded) return
    const supabase = createClient()
    supabase
      .from('coach_messages')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setMessages((data as CoachMessage[]).reverse())
        setInitialLoaded(true)
      })
  }, [open, userId, initialLoaded])

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Auto-focus input when chat opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px'
    }
  }, [input])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading || !userId) return

    // Optimistic user message
    const userMsg: CoachMessage = {
      id: crypto.randomUUID(),
      user_id: userId,
      role: 'user',
      content: trimmed,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    // Save user message to DB
    const supabase = createClient()
    supabase.from('coach_messages').insert({
      user_id: userId,
      role: 'user',
      content: trimmed,
    }).then(() => { /* fire and forget */ })

    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      })
      const data = await res.json()

      if (data.error) throw new Error(data.error)

      const assistantMsg: CoachMessage = {
        id: crypto.randomUUID(),
        user_id: userId,
        role: 'assistant',
        content: data.response,
        created_at: new Date().toISOString(),
      }
      setMessages(prev => [...prev, assistantMsg])

      // Save assistant message to DB
      supabase.from('coach_messages').insert({
        user_id: userId,
        role: 'assistant',
        content: data.response,
      }).then(() => { /* fire and forget */ })
    } catch {
      const errorMsg: CoachMessage = {
        id: crypto.randomUUID(),
        user_id: userId,
        role: 'assistant',
        content: 'Noe gikk galt. Prøv igjen.',
        created_at: new Date().toISOString(),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setLoading(false)
    }
  }, [loading, userId])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  // Hide on login page or if no user
  if (pathname === '/login') return null

  return (
    <>
      {/* Closed state: floating chat button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-[76px] right-4 md:bottom-6 md:right-6 z-40 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105"
          style={{ backgroundColor: '#0c3230' }}
          aria-label="Åpne coach chat"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}

      {/* Open state */}
      {open && (
        <>
          {/* Mobile: full-screen overlay */}
          <div className="md:hidden fixed inset-0 z-50 flex flex-col bg-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#0c3230' }}>
                  <span className="text-xs" style={{ color: '#b8f04a' }}>◎</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">Coach</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Lukk chat"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {renderChatBody(messages, loading, messagesEndRef, (prompt) => sendMessage(prompt))}
            </div>

            {/* Input */}
            <div className="flex-shrink-0 border-t border-gray-100 px-4 pt-3 pb-4" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
              {renderInput(input, setInput, handleKeyDown, () => sendMessage(input), loading, inputRef)}
            </div>
          </div>

          {/* Desktop: right panel */}
          <div className="hidden md:flex fixed top-0 right-0 z-50 h-full w-[400px] flex-col bg-white border-l border-gray-200 shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#0c3230' }}>
                  <span className="text-xs" style={{ color: '#b8f04a' }}>◎</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">Coach</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Lukk chat"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {renderChatBody(messages, loading, messagesEndRef, (prompt) => sendMessage(prompt))}
            </div>

            {/* Input */}
            <div className="flex-shrink-0 border-t border-gray-100 px-4 pt-3 pb-4">
              {renderInput(input, setInput, handleKeyDown, () => sendMessage(input), loading, inputRef)}
            </div>
          </div>
        </>
      )}
    </>
  )
}

// --- Shared render helpers ---

function renderChatBody(
  messages: CoachMessage[],
  loading: boolean,
  messagesEndRef: React.RefObject<HTMLDivElement>,
  onQuickAction: (prompt: string) => void,
) {
  return (
    <>
      {messages.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center h-full text-center px-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: '#0c3230' }}>
            <span className="text-xl" style={{ color: '#b8f04a' }}>◎</span>
          </div>
          <p className="text-base font-bold text-gray-900 mb-1">Din personlige coach</p>
          <p className="text-sm text-gray-500 max-w-sm mb-6">
            Still spørsmål, be om råd, eller diskuter strategi.
          </p>
          <div className="flex flex-wrap gap-2 justify-center max-w-sm">
            {QUICK_ACTIONS.map((qa) => (
              <button
                key={qa.label}
                onClick={() => onQuickAction(qa.prompt)}
                className="text-xs px-3 py-2 rounded-xl border border-gray-200 text-gray-600 hover:border-gray-400 transition-colors"
              >
                {qa.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[85%] rounded-xl px-4 py-3 ${
              msg.role === 'user'
                ? 'text-white'
                : 'border border-gray-100'
            }`}
            style={msg.role === 'user'
              ? { backgroundColor: '#0c3230' }
              : { backgroundColor: '#f5f7f5' }
            }
          >
            {msg.role === 'user' ? (
              <p className="text-sm leading-relaxed">{msg.content}</p>
            ) : (
              <div className="text-gray-800">{renderMarkdown(msg.content)}</div>
            )}
          </div>
        </div>
      ))}

      {loading && (
        <div className="flex justify-start">
          <div className="rounded-xl px-4 py-3 border border-gray-100" style={{ backgroundColor: '#f5f7f5' }}>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#3dbfb5', animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#3dbfb5', animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#3dbfb5', animationDelay: '300ms' }} />
              </div>
              <span className="text-xs text-gray-400">Claude tenker...</span>
            </div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </>
  )
}

function renderInput(
  input: string,
  setInput: (v: string) => void,
  handleKeyDown: (e: React.KeyboardEvent) => void,
  onSend: () => void,
  loading: boolean,
  inputRef: React.RefObject<HTMLTextAreaElement>,
) {
  return (
    <div className="flex gap-2 items-end">
      <textarea
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Skriv til coachen din..."
        rows={1}
        className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-gray-400 leading-relaxed"
        style={{ maxHeight: '120px' }}
      />
      <button
        onClick={onSend}
        disabled={!input.trim() || loading}
        className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-colors disabled:opacity-30"
        style={{ backgroundColor: '#0c3230' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b8f04a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </div>
  )
}
