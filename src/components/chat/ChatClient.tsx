'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { CATEGORIES } from '@/types'

interface Message {
  role: 'user' | 'assistant'
  content: string
}


// Simple markdown inline rendering
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

export function ChatClient() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [contextLoaded, setContextLoaded] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const supabase = createClient()

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px'
    }
  }, [input])

  // Fetch context summary for first message
  async function getContextSummary(): Promise<string> {
    if (contextLoaded) return ''
    setContextLoaded(true)

    const today = new Date().toISOString().split('T')[0]

    const [habitsRes, completionsRes, goalsRes, snapshotsRes] = await Promise.all([
      supabase.from('habits').select('title').eq('active', true),
      supabase.from('habit_completions').select('habit_id').eq('completed_date', today),
      supabase.from('goals').select('title, current_value, target_value, unit, deadline, category').eq('status', 'active').order('deadline').limit(10),
      supabase.from('progress_snapshots').select('category, score').order('week_start', { ascending: false }).limit(7),
    ])

    const habits = habitsRes.data ?? []
    const completions = completionsRes.data ?? []
    const goals = goalsRes.data ?? []
    const snapshots = snapshotsRes.data ?? []

    const goalsText = goals.map((g: { title: string; target_value?: number; current_value: number; deadline?: string }) => {
      const pct = g.target_value ? Math.round((g.current_value / g.target_value) * 100) : null
      return `${g.title}${pct !== null ? ` (${pct}%)` : ''}${g.deadline ? ` frist: ${g.deadline}` : ''}`
    }).join(', ')

    const scoresText = CATEGORIES.map(cat => {
      const s = snapshots.find((s: { category: string }) => s.category === cat.id)
      return s ? `${cat.label}: ${(s as { score: number }).score}` : null
    }).filter(Boolean).join(', ')

    return `\n\n[KONTEKST — dette er min nåværende status, bruk det for å gi bedre svar:
Vaner i dag: ${completions.length}/${habits.length} fullført
Aktive mål: ${goalsText || 'ingen'}
Ukesscorer: ${scoresText || 'ikke satt'}]`
  }

  async function sendMessage() {
    const text = input.trim()
    if (!text || loading) return

    const userMessage: Message = { role: 'user', content: text }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      // Add context to first message
      let fullMessage = text
      if (messages.length === 0) {
        const context = await getContextSummary()
        fullMessage = text + context
      }

      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: fullMessage }),
      })
      const data = await res.json()

      if (data.error) throw new Error(data.error)

      const assistantMessage: Message = { role: 'assistant', content: data.response }
      setMessages(prev => [...prev, assistantMessage])
    } catch {
      const errorMessage: Message = { role: 'assistant', content: 'Noe gikk galt. Prøv igjen.' }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const quickPrompts = [
    'Hva bør jeg prioritere i dag?',
    'Hvordan ligger jeg an på målene mine?',
    'Gi meg en reality check',
    'Hva er min største blindsone akkurat nå?',
  ]

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 140px)' }}>
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto pb-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: '#0c3230' }}>
              <span className="text-xl" style={{ color: '#b8f04a' }}>◎</span>
            </div>
            <p className="text-lg font-bold text-gray-900 mb-1">Din personlige coach</p>
            <p className="text-sm text-gray-500 max-w-sm mb-6">
              Still spørsmål, be om råd, eller diskuter strategi. Coachen kjenner visjonen din, målene dine og nåsituasjonen.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => { setInput(prompt); inputRef.current?.focus() }}
                  className="text-xs px-3 py-2 rounded-xl border border-gray-200 text-gray-600 hover:border-gray-400 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 ${
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
            <div className="rounded-2xl px-4 py-3 border border-gray-100" style={{ backgroundColor: '#f5f7f5' }}>
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
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-gray-100 pt-3 pb-2">
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
            onClick={sendMessage}
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
      </div>
    </div>
  )
}
