'use client'

import { useState, useEffect } from 'react'
import { AppTour } from './AppTour'

const TOUR_STORAGE_KEY = 'life-os-tour-completed'

export function TourWrapper() {
  const [showTour, setShowTour] = useState(false)

  useEffect(() => {
    const completed = localStorage.getItem(TOUR_STORAGE_KEY)
    if (!completed) {
      // Small delay so the page loads first
      const timer = setTimeout(() => setShowTour(true), 1000)
      return () => clearTimeout(timer)
    }
  }, [])

  if (!showTour) return null

  return (
    <AppTour
      onComplete={() => {
        localStorage.setItem(TOUR_STORAGE_KEY, 'true')
        setShowTour(false)
      }}
    />
  )
}

/**
 * To restart the tour from the /me page (Innstillinger section),
 * clear localStorage and reload:
 *
 *   localStorage.removeItem('life-os-tour-completed')
 *   window.location.reload()
 *
 * Or dispatch a custom event that TourWrapper listens for if you
 * want to avoid a full page reload.
 */
