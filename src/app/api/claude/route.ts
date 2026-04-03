import { NextRequest, NextResponse } from 'next/server'
import { callClaude, buildPrompt, clearCoachContextCache } from '@/lib/claude'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    let userMessage: string

    if (body.type && body.data) {
      // Type-based prompt building
      userMessage = buildPrompt(body.type, body.data)
    } else if (body.message) {
      // Legacy: direct message
      userMessage = body.message
    } else {
      return NextResponse.json({ error: 'Ugyldig forespørsel' }, { status: 400 })
    }

    if (body.clearCache) {
      clearCoachContextCache()
    }

    const result = await callClaude(userMessage)
    return NextResponse.json({ response: result.text, savedEntries: result.savedEntries })
  } catch (error) {
    console.error('Claude API error:', error)
    return NextResponse.json({ error: 'Noe gikk galt med Claude API' }, { status: 500 })
  }
}
