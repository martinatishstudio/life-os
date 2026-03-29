'use client'

import { useState, useCallback } from 'react'

// Simple markdown renderer: bold, lists, paragraphs
function renderMarkdown(text: string) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let listItems: string[] = []
  let key = 0

  function flushList() {
    if (listItems.length > 0) {
      elements.push(
        <ul key={key++} className="list-disc list-outside pl-4 space-y-1 my-2">
          {listItems.map((item, i) => (
            <li key={i} className="text-sm leading-relaxed">{renderInline(item)}</li>
          ))}
        </ul>
      )
      listItems = []
    }
  }

  function renderInline(text: string): React.ReactNode {
    // Handle **bold** and *italic*
    const parts: React.ReactNode[] = []
    let remaining = text
    let inlineKey = 0

    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
      if (boldMatch && boldMatch.index !== undefined) {
        if (boldMatch.index > 0) {
          parts.push(<span key={inlineKey++}>{remaining.slice(0, boldMatch.index)}</span>)
        }
        parts.push(<strong key={inlineKey++} className="font-semibold">{boldMatch[1]}</strong>)
        remaining = remaining.slice(boldMatch.index + boldMatch[0].length)
      } else {
        parts.push(<span key={inlineKey++}>{remaining}</span>)
        break
      }
    }
    return <>{parts}</>
  }

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || /^\d+\.\s/.test(trimmed)) {
      const content = trimmed.replace(/^[-•]\s+/, '').replace(/^\d+\.\s+/, '')
      listItems.push(content)
    } else {
      flushList()
      if (trimmed === '') {
        elements.push(<div key={key++} className="h-2" />)
      } else if (trimmed.startsWith('###')) {
        elements.push(<p key={key++} className="text-sm font-bold mt-3 mb-1">{renderInline(trimmed.replace(/^#+\s*/, ''))}</p>)
      } else if (trimmed.startsWith('##')) {
        elements.push(<p key={key++} className="text-sm font-bold mt-3 mb-1">{renderInline(trimmed.replace(/^#+\s*/, ''))}</p>)
      } else if (trimmed.startsWith('#')) {
        elements.push(<p key={key++} className="text-base font-bold mt-3 mb-1">{renderInline(trimmed.replace(/^#+\s*/, ''))}</p>)
      } else {
        elements.push(<p key={key++} className="text-sm leading-relaxed">{renderInline(trimmed)}</p>)
      }
    }
  }
  flushList()

  return elements
}

// Loading pulse animation
function LoadingPulse() {
  return (
    <div className="flex items-center gap-2 py-3">
      <div className="flex gap-1">
        <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#3dbfb5', animationDelay: '0ms' }} />
        <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#3dbfb5', animationDelay: '150ms' }} />
        <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#3dbfb5', animationDelay: '300ms' }} />
      </div>
      <span className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>Claude tenker...</span>
    </div>
  )
}

function LoadingPulseLight() {
  return (
    <div className="flex items-center gap-2 py-3">
      <div className="flex gap-1">
        <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#3dbfb5', animationDelay: '0ms' }} />
        <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#3dbfb5', animationDelay: '150ms' }} />
        <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#3dbfb5', animationDelay: '300ms' }} />
      </div>
      <span className="text-sm text-gray-500">Claude tenker...</span>
    </div>
  )
}

// Claude response in dark theme (for dark teal cards)
export function ClaudeResponseDark({
  response,
  loading,
  error,
}: {
  response: string | null
  loading: boolean
  error: string | null
}) {
  if (loading) return <LoadingPulse />
  if (error) return <p className="text-sm text-red-400 py-2">{error}</p>
  if (!response) return null

  return (
    <div className="mt-3 pt-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
      <div style={{ color: 'rgba(255,255,255,0.85)' }}>
        {renderMarkdown(response)}
      </div>
    </div>
  )
}

// Claude response in light theme (for white cards)
export function ClaudeResponseLight({
  response,
  loading,
  error,
}: {
  response: string | null
  loading: boolean
  error: string | null
}) {
  if (loading) return <LoadingPulseLight />
  if (error) return <p className="text-sm text-red-500 py-2">{error}</p>
  if (!response) return null

  return (
    <div className="mt-3 rounded-xl p-4" style={{ backgroundColor: '#f0f4f0' }}>
      <div className="text-gray-800">
        {renderMarkdown(response)}
      </div>
    </div>
  )
}

// Hook for calling Claude API
export function useClaudeAPI() {
  const [response, setResponse] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const call = useCallback(async (type: string, data: Record<string, unknown>) => {
    setLoading(true)
    setError(null)
    setResponse(null)
    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, data }),
      })
      if (!res.ok) throw new Error('API-feil')
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setResponse(json.response)
      return json.response as string
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Noe gikk galt'
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setResponse(null)
    setError(null)
    setLoading(false)
  }, [])

  return { response, loading, error, call, reset }
}
