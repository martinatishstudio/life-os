import { SettingsClient } from '@/components/settings/SettingsClient'

export const revalidate = 0

export default function SettingsPage() {
  return (
    <div className="px-4 py-6 md:px-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Konfigurasjon</p>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Innstillinger</h1>
      </div>
      <SettingsClient />
    </div>
  )
}
