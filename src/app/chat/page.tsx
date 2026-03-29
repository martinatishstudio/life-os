import { ChatClient } from '@/components/chat/ChatClient'

export const revalidate = 0

export default function ChatPage() {
  return (
    <div className="px-4 py-6 md:px-8 max-w-2xl mx-auto">
      <div className="mb-4">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">AI Coach</p>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Chat</h1>
      </div>
      <ChatClient />
    </div>
  )
}
