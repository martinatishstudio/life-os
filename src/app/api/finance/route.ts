import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 })

    const body = await request.json()
    const entries = body.entries as { date: string; amount: number; category: string; description?: string }[]

    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: 'Ingen transaksjoner' }, { status: 400 })
    }

    const rows = entries.map((e) => ({
      user_id: user.id,
      date: e.date,
      amount: e.amount,
      category: e.category,
      description: e.description,
      source: 'csv_import',
    }))

    const { error } = await supabase.from('finance_entries').insert(rows)
    if (error) throw error

    return NextResponse.json({ imported: rows.length })
  } catch (error) {
    console.error('Finance import error:', error)
    return NextResponse.json({ error: 'Import feilet' }, { status: 500 })
  }
}
