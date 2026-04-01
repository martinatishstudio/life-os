'use client'

import { useState, useCallback } from 'react'

interface AppTourProps {
  onComplete: () => void
}

interface TourStep {
  title: string
  body: string[]
  position: 'center' | 'bottom' | 'top' | 'top-left'
  icon?: string
}

const TOUR_STEPS: TourStep[] = [
  {
    title: 'Velkommen til Life OS \u{1F44B}',
    body: [
      'La meg vise deg rundt i appen din. Det tar under 2 minutter.',
    ],
    position: 'center',
    icon: '\u{1F44B}',
  },
  {
    title: 'I dag\u2011siden',
    body: [
      'Dette er hjemskjermen din. Alt du trenger for dagen samles her.',
      'Hver morgen genererer Claude en personlig brief basert p\u00e5 m\u00e5lene og vanene dine.',
    ],
    position: 'bottom',
  },
  {
    title: 'Morgenbrief',
    body: [
      'Morgenbriefen gir deg fokus. Den analyserer hvor du st\u00e5r og hva du b\u00f8r prioritere.',
      'Du kan oppdatere den n\u00e5r som helst med knappen \u00abOppdater\u00bb.',
    ],
    position: 'bottom',
  },
  {
    title: 'Vaner',
    body: [
      'Vanene dine er gruppert etter tid p\u00e5 dagen: Morgen, Dag og Kveld.',
      'Bare trykk p\u00e5 en vane for \u00e5 markere den som gjort. Streaken din teller automatisk.',
    ],
    position: 'bottom',
  },
  {
    title: 'Dagsm\u00e5l og ukem\u00e5l',
    body: [
      'Under vanene ser du dagens prioriteringer og ukens m\u00e5l.',
      'Dagsm\u00e5lene kan du hake av. Ukem\u00e5lene viser progress mot kvartalsm\u00e5lene.',
    ],
    position: 'bottom',
  },
  {
    title: 'Review\u2011systemet',
    body: [
      'Hver s\u00f8ndag dukker det opp en ukentlig review her p\u00e5 hjemskjermen.',
      'Claude oppsummerer uken, foresl\u00e5r nye scores, og hjelper deg planlegge neste uke.',
      'Hvis du glemmer den, vises den som forfalt med r\u00f8d tekst til du gjennomf\u00f8rer.',
    ],
    position: 'center',
  },
  {
    title: 'Kart\u2011siden',
    body: [
      'Kart\u2011siden er der hele m\u00e5lhierarkiet ditt lever.',
      'Du kan zoome mellom niv\u00e5er: fra dagens m\u00e5l helt opp til 10\u2011\u00e5rsvisjonen.',
      'Trykk p\u00e5 et m\u00e5l for \u00e5 se hele kjeden, redigere, eller bryte det ned med Claude.',
    ],
    position: 'top',
  },
  {
    title: 'Meg\u2011siden',
    body: [
      'Meg\u2011siden har alt om deg: coach\u2011profil, trender, \u00f8konomi og vaner.',
      'Hold coach\u2011profilen oppdatert, da gir Claude mye bedre r\u00e5d.',
      'Her finner du ogs\u00e5 trender over tid og \u00f8konomioversikten.',
    ],
    position: 'top',
  },
  {
    title: 'Coach Chat',
    body: [
      'Chat\u2011knappen nederst til h\u00f8yre er din direkte linje til Claude.',
      'Du kan stille sp\u00f8rsm\u00e5l, be om r\u00e5d, diskutere strategi, eller bare brainstorme.',
      'Alle samtaler lagres, s\u00e5 du kan fortsette der du slapp.',
    ],
    position: 'top-left',
  },
  {
    title: 'Quick Actions',
    body: [
      'Pluss\u2011knappen over chatten gir deg rask tilgang til \u00e5 logge ting.',
      'Logg trening, utgifter, oppdater m\u00e5l, legg til prioriteter eller notater.',
      'Alt lagres med ett trykk.',
    ],
    position: 'top-left',
  },
  {
    title: 'Daglig rutine',
    body: [
      'Slik bruker du appen daglig:',
      '\u2600\uFE0F Morgen: \u00c5pne appen, les briefen, sjekk morgenvanene',
      '\u{1F324}\uFE0F Dag: Hak av vaner og prioriteringer etter hvert',
      '\u{1F319} Kveld: Fullf\u00f8r kveldsvanene, logg trening/utgifter via +',
      '\u{1F4C5} S\u00f8ndag: Gjennomf\u00f8r ukentlig review',
    ],
    position: 'center',
  },
  {
    title: 'Du er klar! \u{1F680}',
    body: [
      'Appen er bygget for \u00e5 ta under 2 minutter per dag.',
      'Start med \u00e5 sjekke vanene dine og les morgenbriefen.',
    ],
    position: 'center',
  },
]

export function AppTour({ onComplete }: AppTourProps) {
  const [step, setStep] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)

  const currentStep = TOUR_STEPS[step]
  const isFirst = step === 0
  const isLast = step === TOUR_STEPS.length - 1
  const totalSteps = TOUR_STEPS.length

  const goTo = useCallback((nextStep: number) => {
    setIsTransitioning(true)
    setTimeout(() => {
      setStep(nextStep)
      setIsTransitioning(false)
    }, 200)
  }, [])

  const handleNext = useCallback(() => {
    if (isLast) {
      onComplete()
    } else {
      goTo(step + 1)
    }
  }, [isLast, onComplete, goTo, step])

  const handleBack = useCallback(() => {
    if (!isFirst) {
      goTo(step - 1)
    }
  }, [isFirst, goTo, step])

  const handleSkip = useCallback(() => {
    onComplete()
  }, [onComplete])

  // Position classes for the card
  const positionClasses: Record<TourStep['position'], string> = {
    center: 'items-center justify-center',
    bottom: 'items-end justify-center pb-8',
    top: 'items-start justify-center pt-24',
    'top-left': 'items-start justify-start pt-24 pl-4',
  }

  // Arrow indicator for nav-pointing steps
  const showNavArrow = currentStep.position === 'top'
  const showBottomRightArrow = currentStep.position === 'top-left'

  return (
    <div className="fixed inset-0 z-[60] flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" />

      {/* Content container */}
      <div
        className={`relative z-[61] flex w-full px-4 ${positionClasses[currentStep.position]}`}
        style={{
          opacity: isTransitioning ? 0 : 1,
          transition: 'opacity 200ms ease-in-out',
        }}
      >
        <div className="w-full max-w-sm">
          {/* Card */}
          <div className="rounded-2xl bg-white p-6 shadow-2xl">
            {/* Step indicator + progress dots */}
            {!isFirst && (
              <div className="mb-4 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {step + 1} av {totalSteps}
                </span>
                <div className="flex gap-1">
                  {TOUR_STEPS.map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        i === step
                          ? 'w-4 bg-[#0c3230]'
                          : i < step
                            ? 'w-1.5 bg-[#3dbfb5]'
                            : 'w-1.5 bg-gray-200'
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Title */}
            <h2 className="mb-3 text-lg font-bold text-[#0c3230]">
              {currentStep.title}
            </h2>

            {/* Body paragraphs */}
            <div className="mb-6 space-y-2">
              {currentStep.body.map((paragraph, i) => (
                <p key={i} className="text-sm leading-relaxed text-gray-600">
                  {paragraph}
                </p>
              ))}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <div className="flex gap-3">
                {!isFirst && !isLast && (
                  <button
                    onClick={handleBack}
                    className="text-sm text-gray-400 transition-colors hover:text-gray-600"
                  >
                    Tilbake
                  </button>
                )}
                {!isLast && (
                  <button
                    onClick={handleSkip}
                    className="text-sm text-gray-400 transition-colors hover:text-gray-600"
                  >
                    Hopp over
                  </button>
                )}
              </div>
              <button
                onClick={handleNext}
                className="rounded-xl bg-[#0c3230] px-5 py-2.5 text-sm font-semibold text-[#b8f04a] transition-opacity hover:opacity-90"
              >
                {isFirst
                  ? 'Start omvisning'
                  : isLast
                    ? 'Fullfør omvisning'
                    : 'Neste'}
              </button>
            </div>
          </div>

          {/* Arrow pointing down to nav bar */}
          {showNavArrow && (
            <div className="mt-3 flex justify-center">
              <div className="flex flex-col items-center">
                <div className="h-8 w-0.5 bg-white/60" />
                <div className="h-0 w-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-white/60" />
              </div>
            </div>
          )}

          {/* Arrow pointing to bottom-right (coach chat / FAB) */}
          {showBottomRightArrow && (
            <div className="mt-3 flex justify-end pr-4">
              <div className="flex flex-col items-center">
                <div className="h-12 w-0.5 bg-white/60" />
                <div className="h-0 w-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-white/60" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
