import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://uvtdxljleupzmjzcurlq.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2dGR4bGpsZXVwem1qemN1cmxxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDY5NjYzNCwiZXhwIjoyMDkwMjcyNjM0fQ.6NcIT2UbVNxxPMAhoT5HVx-99oJhaIsIdTSCZEWPt_g'
const USER_ID = '89b04d8f-09a6-4fe7-9efe-5d0843d63519'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function run() {
  // Vision
  const { error: vErr } = await supabase.from('vision').upsert({
    id: '00000000-0000-0000-0000-000000000001',
    user_id: USER_ID,
    title: 'Martin 2036',
    description: 'Jeg driver et PE-selskap som kjøper, forbedrer og skalerer cash flow-selskaper. Porteføljen er verdt 1B+. Jeg er Norges største grunderprofil. Gift med to barn. Bor i Oslo med penthouse og hus på Ullern/Holmenkollen, hytte på Hemsedal/Hafjell, feriehus på Bali, penthouse i Dubai og Manhattan. Trener daglig, 10-12% kroppsfett. Reiser fritt med familien. Frihet, helse, økonomisk sikkerhet og meningsfullt arbeid.',
    target_year: 2036
  })
  if (vErr) { console.error('vision:', vErr.message); process.exit(1) }
  console.log('✓ vision')

  // Vision categories
  const { error: vcErr } = await supabase.from('vision_categories').upsert([
    { vision_id: '00000000-0000-0000-0000-000000000001', category: 'business', description: 'PE-selskap som kjøper og optimaliserer selskaper. Ledergruppe som drifter. Fokus på strategi, oppkjøp og EBITDA-optimalisering.', target_state: 'Portefølje verdt 1B+. Ish Studio enten solgt eller velfungerende porteføljeselskap. Salgsavdelinger, egne selskaper med drift, management for grunderprofil. Kontor i co-working hub med medgrunnlegere og ansatte.' },
    { vision_id: '00000000-0000-0000-0000-000000000001', category: 'brand', description: 'Norges største grunderprofil. Foredrag, sosiale medier med team, referansepunktet for å tørre å satse.', target_state: 'Deler veien til å lykkes. Innblikk i grunderlivet. Hjelpe folk ut av rat race. Team håndterer SoMe, jeg skaper innholdet.' },
    { vision_id: '00000000-0000-0000-0000-000000000001', category: 'finance', description: 'Diversifisert formue: PE, eiendom, crypto, utbytter. 5M+ i årslønn pluss utbytter.', target_state: 'Penthouse Oslo, hus Ullern/Holmenkollen, hytte Hemsedal/Hafjell, villa Bali, penthouse Dubai, penthouse Manhattan. Lamborghini Urus, Porsche GT3, Porsche Taycan S. Passiv inntekt dekker livsstil.' },
    { vision_id: '00000000-0000-0000-0000-000000000001', category: 'family', description: 'Gift med to barn. Kone som er støttespiller og deler verdier rundt helse og godt liv.', target_state: 'Vakker og støttende kone. To barn som får det beste. Lillebror i nærheten. Mari i Oslo. Foreldre med mulighet til å være i Oslo mye. Trygg havn, rollemodell, alltid tilstede.' },
    { vision_id: '00000000-0000-0000-0000-000000000001', category: 'physical', description: 'Daglig trening, sterk kropp, ekstremsport.', target_state: '10-12% kroppsfett. Benker 100kg 3x8. Trener 5-7 dager i uken. 150g protein daglig. 7+ timer søvn. Hyrox. Fallskjerm, ski, kiting. Sjelden alkohol.' },
    { vision_id: '00000000-0000-0000-0000-000000000001', category: 'mental', description: 'Sterk selvtillit, gjennomføringsevne, rutiner og fokus.', target_state: 'Stoler på egne tanker og evner. Gjennomfører det jeg sier. Faste rutiner morgen/kveld. Effektiv med klar plan. Selvsikker, stabil, kjærlig. Meditasjon. Håndterer stress ved å skynde seg sakte.' },
    { vision_id: '00000000-0000-0000-0000-000000000001', category: 'lifestyle', description: 'Frihet til å reise og oppleve verden med familien.', target_state: 'Bor utenfor Norge hver vinter. Reiser fritt. Internett = kontor. 90% fri på ferier. Frikveld i uken med familien. Eiendomsprosjekter i Bali med Jay og Alex. Eventyr i verden.' },
  ])
  if (vcErr) { console.error('vision_categories:', vcErr.message); process.exit(1) }
  console.log('✓ vision_categories')

  // Goals
  const { error: gErr } = await supabase.from('goals').upsert([
    { id: '10000000-0000-0000-0000-000000000001', user_id: USER_ID, category: 'business', title: '5 MNOK booket omsetning Ish Studio', description: 'Nå revenue-target for å bevise modellen og finansiere vekst.', target_value: 5000000, current_value: 3100000, unit: 'kr', deadline: '2026-06-30', status: 'active' },
    { id: '10000000-0000-0000-0000-000000000002', user_id: USER_ID, category: 'business', title: 'Moe ombord med equity', description: 'Fullfør aksjonæravtale, vesting og kompensasjonspakke.', target_value: 1, current_value: 0, unit: 'count', deadline: '2026-05-31', status: 'active' },
    { id: '10000000-0000-0000-0000-000000000003', user_id: USER_ID, category: 'business', title: 'Lever Specc-prosjekt', description: 'Fullført GTM-strategi og nettside for Speccs funding-runde.', target_value: 1, current_value: 0, unit: 'count', deadline: '2026-05-15', status: 'active' },
    { id: '10000000-0000-0000-0000-000000000004', user_id: USER_ID, category: 'business', title: 'Etabler NordicActive Ventures', description: 'Sett opp holdingstruktur og første investeringsstrategi.', target_value: 1, current_value: 0, unit: 'count', deadline: '2026-12-31', status: 'active' },
    { id: '20000000-0000-0000-0000-000000000001', user_id: USER_ID, category: 'physical', title: 'Gjennomfør første Hyrox', description: 'Fullfør Hyrox-løp.', target_value: 1, current_value: 0, unit: 'count', deadline: '2026-12-31', status: 'active' },
    { id: '20000000-0000-0000-0000-000000000002', user_id: USER_ID, category: 'physical', title: 'Benk 100kg 3x8', description: 'Bygg styrke systematisk.', target_value: 100, current_value: 0, unit: 'kg', deadline: '2026-12-31', status: 'active' },
    { id: '20000000-0000-0000-0000-000000000003', user_id: USER_ID, category: 'physical', title: 'Nå 12% kroppsfett', description: 'Kutt til stabil lav fettprosent.', target_value: 12, current_value: 0, unit: '%', deadline: '2026-12-31', status: 'active' },
    { id: '30000000-0000-0000-0000-000000000001', user_id: USER_ID, category: 'finance', title: 'Spar 500K i MLJ Invest', description: 'Bygg opp investeringskapital i holdingselskapet.', target_value: 500000, current_value: 140000, unit: 'kr', deadline: '2026-12-31', status: 'active' },
    { id: '30000000-0000-0000-0000-000000000002', user_id: USER_ID, category: 'finance', title: 'Strukturer eiendomsinvestering Bali', description: 'Første villa-prosjekt med Jay og Alex.', target_value: 1, current_value: 0, unit: 'count', deadline: '2026-12-31', status: 'active' },
    { id: '40000000-0000-0000-0000-000000000001', user_id: USER_ID, category: 'family', title: '2 reiser med kjæresten i 2026', description: 'Prioriter kvalitetstid og opplevelser.', target_value: 2, current_value: 1, unit: 'count', deadline: '2026-12-31', status: 'active' },
    { id: '40000000-0000-0000-0000-000000000002', user_id: USER_ID, category: 'family', title: 'Ring familie 3x i uken', description: 'Hold kontakten med mamma, pappa og Mari.', target_value: 3, current_value: 0, unit: 'count', deadline: null, status: 'active' },
    { id: '50000000-0000-0000-0000-000000000001', user_id: USER_ID, category: 'brand', title: 'Hold 4 foredrag i 2026', description: 'Bygg profil som grunder og AI/outbound-ekspert.', target_value: 4, current_value: 1, unit: 'count', deadline: '2026-12-31', status: 'active' },
    { id: '50000000-0000-0000-0000-000000000002', user_id: USER_ID, category: 'brand', title: 'Publiser ukentlig på LinkedIn', description: 'Konsistent synlighet. Team støtter, jeg skaper.', target_value: 52, current_value: 0, unit: 'count', deadline: '2026-12-31', status: 'active' },
    { id: '60000000-0000-0000-0000-000000000001', user_id: USER_ID, category: 'mental', title: 'Etabler fast morgen- og kveldsrutine', description: 'Ikke vik fra rutinene. 90 dager streak.', target_value: 90, current_value: 0, unit: 'dager', deadline: '2026-06-30', status: 'active' },
    { id: '60000000-0000-0000-0000-000000000002', user_id: USER_ID, category: 'mental', title: 'Les 12 bøker i 2026', description: 'En bok i måneden. Personlig utvikling, business, biografi.', target_value: 12, current_value: 0, unit: 'count', deadline: '2026-12-31', status: 'active' },
    { id: '90000000-0000-0000-0000-000000000001', user_id: USER_ID, category: 'business', title: '10-årsplan milepæler', description: 'Overordnede milepæler mot 2036-visjonen.', status: 'active' },
  ])
  if (gErr) { console.error('goals:', gErr.message); process.exit(1) }
  console.log('✓ goals')

  // Milestones
  const { error: mErr } = await supabase.from('milestones').upsert([
    { goal_id: '10000000-0000-0000-0000-000000000001', title: 'Q2: 5M booket', description: 'Nå revenue-target.', target_date: '2026-06-30', sort_order: 1 },
    { goal_id: '10000000-0000-0000-0000-000000000001', title: 'Q4: 8M+ pipeline', description: 'Bygg pipeline for 2027.', target_date: '2026-12-31', sort_order: 2 },
    { goal_id: '90000000-0000-0000-0000-000000000001', title: '2026: Fundament', description: 'Ish Studio 5M+. Moe ombord. Første Hyrox. MLJ Invest strukturert. NordicActive Ventures etablert. Første foredrag-serie.', target_date: '2026-12-31', sort_order: 1 },
    { goal_id: '90000000-0000-0000-0000-000000000001', title: '2027: Vekst', description: 'Ish Studio 10M+. 3-4 ansatte. Første eiendomsinvestering Bali. Crypto-portefølje aktiv. Ukentlig LinkedIn-innhold med team.', target_date: '2027-12-31', sort_order: 2 },
    { goal_id: '90000000-0000-0000-0000-000000000001', title: '2028: Skalering', description: 'Ish Studio 15M+ eller solgt. Første oppkjøp gjennom NordicActive. Boligkjøp Oslo. Hyrox Pro gjennomført. Etablert foredragsprofil.', target_date: '2028-12-31', sort_order: 3 },
    { goal_id: '90000000-0000-0000-0000-000000000001', title: '2029: Posisjon', description: 'PE-portefølje med 3+ selskaper. EBITDA-optimalisering i gang. Hytte kjøpt. Familie startet. Norges mest synlige unge grunder.', target_date: '2029-12-31', sort_order: 4 },
    { goal_id: '90000000-0000-0000-0000-000000000001', title: '2030: Momentum', description: '5-årsplan realisert: selskapsverdi 200M+. 5M+ i lønn. Stabil familiesituasjon. Bali-villaer bygget. Vinter utenfor Norge.', target_date: '2030-12-31', sort_order: 5 },
    { goal_id: '90000000-0000-0000-0000-000000000001', title: '2031: Ekspansjon', description: 'PE-selskapet kjøper aggressivt. Portefølje 400M+. Dubai penthouse. Internasjonal profil starter. Ekstremsport-bucket list.', target_date: '2031-12-31', sort_order: 6 },
    { goal_id: '90000000-0000-0000-0000-000000000001', title: '2032: Dominans', description: 'Portefølje 600M+. To barn. Hus på Ullern/Holmenkollen. Cash flow fra alle selskaper. Foredrag internasjonalt.', target_date: '2032-12-31', sort_order: 7 },
    { goal_id: '90000000-0000-0000-0000-000000000001', title: '2033: Konsolidering', description: 'Ledergrupper drifter alt. Manhattan penthouse. Formue gir full frihet. Fokus på familie og livskvalitet.', target_date: '2033-12-31', sort_order: 8 },
    { goal_id: '90000000-0000-0000-0000-000000000001', title: '2034: Frihet', description: 'Reiser fritt med familien. Jobber fordi du vil, ikke fordi du må. Mentorrolle for yngre grundere.', target_date: '2034-12-31', sort_order: 9 },
    { goal_id: '90000000-0000-0000-0000-000000000001', title: '2036: Visjonen', description: 'Alt på plass. 1B+ portefølje. Norges største grunderprofil. Gift, to barn, alle eiendommene, bilene, friheten. Sterk kropp og sjel.', target_date: '2036-12-31', sort_order: 10 },
  ])
  if (mErr) { console.error('milestones:', mErr.message); process.exit(1) }
  console.log('✓ milestones')

  // Habits
  const { error: hErr } = await supabase.from('habits').upsert([
    { user_id: USER_ID, category: 'mental', title: 'Opp før 07:00', frequency: 'daily', target_count: 1, time_of_day: 'morning', active: true },
    { user_id: USER_ID, category: 'physical', title: 'Kald dusj', frequency: 'daily', target_count: 1, time_of_day: 'morning', active: true },
    { user_id: USER_ID, category: 'mental', title: '10 min journaling/meditasjon', frequency: 'daily', target_count: 1, time_of_day: 'morning', active: true },
    { user_id: USER_ID, category: 'physical', title: 'Trening (styrke/cardio/Hyrox)', frequency: 'daily', target_count: 1, time_of_day: 'anytime', active: true },
    { user_id: USER_ID, category: 'physical', title: 'Zone 2 trening', frequency: 'weekly', target_count: 3, time_of_day: 'anytime', active: true },
    { user_id: USER_ID, category: 'physical', title: '150g protein', frequency: 'daily', target_count: 1, time_of_day: 'anytime', active: true },
    { user_id: USER_ID, category: 'business', title: 'Deep work blokk (2+ timer)', frequency: 'weekdays', target_count: 1, time_of_day: 'anytime', active: true },
    { user_id: USER_ID, category: 'business', title: 'Sjekk Pipedrive pipeline', frequency: 'weekdays', target_count: 1, time_of_day: 'anytime', active: true },
    { user_id: USER_ID, category: 'family', title: 'Ring familie', frequency: 'weekly', target_count: 3, time_of_day: 'anytime', active: true },
    { user_id: USER_ID, category: 'mental', title: 'Plan neste dag (5 min)', frequency: 'daily', target_count: 1, time_of_day: 'evening', active: true },
    { user_id: USER_ID, category: 'mental', title: 'Skjerm av 22:00', frequency: 'daily', target_count: 1, time_of_day: 'evening', active: true },
    { user_id: USER_ID, category: 'physical', title: 'Minimum 7 timer søvn', frequency: 'daily', target_count: 1, time_of_day: 'evening', active: true },
  ])
  if (hErr) { console.error('habits:', hErr.message); process.exit(1) }
  console.log('✓ habits')

  // Finance targets
  const { error: ftErr } = await supabase.from('finance_targets').upsert([
    { user_id: USER_ID, category: 'bolig', monthly_budget: 15000, target_type: 'expense_limit' },
    { user_id: USER_ID, category: 'mat', monthly_budget: 6000, target_type: 'expense_limit' },
    { user_id: USER_ID, category: 'transport', monthly_budget: 3000, target_type: 'expense_limit' },
    { user_id: USER_ID, category: 'trening', monthly_budget: 2000, target_type: 'expense_limit' },
    { user_id: USER_ID, category: 'spise_ute', monthly_budget: 3000, target_type: 'expense_limit' },
    { user_id: USER_ID, category: 'shopping', monthly_budget: 2000, target_type: 'expense_limit' },
    { user_id: USER_ID, category: 'abonnementer', monthly_budget: 2500, target_type: 'expense_limit' },
    { user_id: USER_ID, category: 'sparing_mlj', yearly_target: 500000, target_type: 'savings' },
    { user_id: USER_ID, category: 'investering_crypto', yearly_target: 100000, target_type: 'investment' },
    { user_id: USER_ID, category: 'investering_eiendom', yearly_target: 200000, target_type: 'investment' },
  ])
  if (ftErr) { console.error('finance_targets:', ftErr.message); process.exit(1) }
  console.log('✓ finance_targets')

  // Seed initial progress snapshots (this week)
  const today = new Date()
  const dayOfWeek = today.getDay()
  const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
  const weekStart = new Date(today.setDate(diff))
  weekStart.setHours(0, 0, 0, 0)
  const weekStartStr = weekStart.toISOString().split('T')[0]

  const { error: psErr } = await supabase.from('progress_snapshots').upsert([
    { user_id: USER_ID, category: 'business', score: 65, week_start: weekStartStr },
    { user_id: USER_ID, category: 'physical', score: 50, week_start: weekStartStr },
    { user_id: USER_ID, category: 'mental', score: 55, week_start: weekStartStr },
    { user_id: USER_ID, category: 'finance', score: 70, week_start: weekStartStr },
    { user_id: USER_ID, category: 'family', score: 60, week_start: weekStartStr },
    { user_id: USER_ID, category: 'lifestyle', score: 45, week_start: weekStartStr },
    { user_id: USER_ID, category: 'brand', score: 40, week_start: weekStartStr },
  ], { onConflict: 'user_id,category,week_start' })
  if (psErr) { console.error('progress_snapshots:', psErr.message); process.exit(1) }
  console.log('✓ progress_snapshots')

  // Coach context: delete existing row first to avoid unique constraint issues, then insert
  await supabase.from('coach_context').delete().eq('user_id', USER_ID)
  const { error: ccErr } = await supabase.from('coach_context').insert({
    user_id: USER_ID,
    context_text: `Du er Martin Jakobsen sitt personlige accountability-system og coach.

HVEM MARTIN ER:
Martin er 20-årene, co-founder av Ish Studio, et Oslo-basert Webflow-byrå som er Norges eneste Webflow Premium Partner. Han jobber tett med co-founder William Le Normand og designer/delivery lead Moe. Martin er den primære salgsressursen.

Han har også holdingselskapet MLJ Invest AS, og bygger opp NordicActive Ventures som PE-selskap for fremtidige oppkjøp og investeringer.

NÅSITUASJON (2026):
- Ish Studio jakter 5 MNOK i booket omsetning innen Q2 2026
- Aktiv klient-engagement med Specc AS (GTM-strategi + nettside, funding-runde mai 2026)
- Strukturerer equity og kompensasjonspakke for Moe
- Bygger prospekteringssystem med Apollo, Pipedrive og Clay
- Samarbeider med The Growth DNA på outbound
- Har en kjæreste, yngre søster Mari, og er tett på familien

TRENINGS- OG HELSEFOKUS:
- Zone 2 trening, Hyrox-forberedelse, padel
- Mål: 10-12% kroppsfett, benk 100kg 3x8, 150g protein daglig
- 7+ timer søvn, sjelden alkohol

10-ÅRSVISJON (2036):
Martin driver et PE-selskap som kjøper, forbedrer og skalerer cash flow-selskaper. Porteføljen er verdt 1B+. Han er Norges største grunderprofil. Gift med to barn. Eiendom i Oslo, Hemsedal/Hafjell, Bali, Dubai og Manhattan. Full økonomisk frihet med passiv inntekt som dekker livsstilen.

PRIORITETSREKKEFØLGE (viktigst først):
1. Sterke relasjoner og livskvalitet
2. Bygget noe stort med egne selskaper
3. Fysisk toppform og helse
4. Økonomisk frihet

DIN ROLLE:
- Du er en direkte, ærlig coach. Ikke en cheerleader.
- Koble alltid daglige handlinger til langsiktige mål og visjonen
- Utfordre Martin når han unngår det vanskelige
- Fokuser på: hva er det viktigste å gjøre NÅ?
- Vær spesifikk, ikke generisk. Du kjenner tallene, deadlinene og målene.
- Hvis noe haster (deadline nærmer seg, mål ligger bak), si det rett ut

KOMMUNIKASJON:
- Norsk (bokmål), direkte og konsist
- Aldri bruk bindestreker som tegnsetting
- Hold svarene korte og actionable, maks 300 ord
- Ikke gjenta kontekst Martin allerede vet`
  })
  if (ccErr) {
    if (ccErr.message.includes('relation') && ccErr.message.includes('does not exist')) {
      console.warn('⚠ coach_context: tabellen finnes ikke ennå.')
      console.warn('  Kjør SQL-en i supabase/migrations/20260101000001_coach_context.sql via Supabase Dashboard > SQL Editor')
    } else {
      console.error('coach_context:', ccErr.message); process.exit(1)
    }
  } else {
    console.log('✓ coach_context')
  }

  // Context modules
  const modules = [
    { user_id: USER_ID, slug: 'identity', title: 'Identitet og verdier', description: 'Hvem du er i kjernen, hva du står for, og hvordan du vil fremstå', icon: '🧭', sort_order: 1, update_frequency: 'yearly' },
    { user_id: USER_ID, slug: 'life_situation', title: 'Livssituasjon', description: 'Hvor du bor, sivilstatus, familiesituasjon og daglig liv', icon: '🏠', sort_order: 2, update_frequency: 'quarterly' },
    { user_id: USER_ID, slug: 'work', title: 'Arbeid og business', description: 'Hva du jobber med, aktive prosjekter, roller og team', icon: '💼', sort_order: 3, update_frequency: 'monthly' },
    { user_id: USER_ID, slug: 'finance_context', title: 'Økonomi', description: 'Inntekt, sparing, investeringer og formue', icon: '💰', sort_order: 4, update_frequency: 'monthly' },
    { user_id: USER_ID, slug: 'physical', title: 'Fysisk form', description: 'Trening, kosthold, søvn og kropp', icon: '💪', sort_order: 5, update_frequency: 'monthly' },
    { user_id: USER_ID, slug: 'mental', title: 'Mental helse og mindset', description: 'Energi, stress, rutiner og personlig utvikling', icon: '🧠', sort_order: 6, update_frequency: 'monthly' },
    { user_id: USER_ID, slug: 'relationships', title: 'Relasjoner', description: 'Partner, familie, venner og profesjonelt nettverk', icon: '❤️', sort_order: 7, update_frequency: 'quarterly' },
    { user_id: USER_ID, slug: 'lifestyle_context', title: 'Fritid og opplevelser', description: 'Hobbyer, reiser, bucket list og det som gir deg glede', icon: '🌍', sort_order: 8, update_frequency: 'quarterly' },
  ]

  const { error: cmErr } = await supabase.from('context_modules').upsert(modules, { onConflict: 'user_id,slug' })
  if (cmErr) {
    if (cmErr.message.includes('relation') && cmErr.message.includes('does not exist')) {
      console.warn('⚠ context_modules: tabellen finnes ikke ennå.')
      console.warn('  Kjør SQL-en i supabase/migrations/20260329000000_context_modules.sql via Supabase Dashboard > SQL Editor')
    } else {
      console.error('context_modules:', cmErr.message); process.exit(1)
    }
  } else {
    console.log('✓ context_modules')

    // Fetch module IDs
    const { data: savedModules } = await supabase
      .from('context_modules')
      .select('id, slug')
      .eq('user_id', USER_ID)

    const moduleMap = Object.fromEntries(savedModules.map(m => [m.slug, m.id]))

    const fields = [
      // identity
      { module_id: moduleMap['identity'], slug: 'core_values', label: 'Kjerneverdier', field_type: 'textarea', options: null, sort_order: 1 },
      { module_id: moduleMap['identity'], slug: 'identity_statement', label: 'Identitetserklæring', field_type: 'textarea', options: null, sort_order: 2 },
      { module_id: moduleMap['identity'], slug: 'how_others_see_you', label: 'Hvordan andre ser deg', field_type: 'textarea', options: null, sort_order: 3 },
      { module_id: moduleMap['identity'], slug: 'non_negotiables', label: 'Ikke-forhandlingsbare ting', field_type: 'textarea', options: null, sort_order: 4 },

      // life_situation
      { module_id: moduleMap['life_situation'], slug: 'location', label: 'Bosted', field_type: 'text', options: null, sort_order: 1 },
      { module_id: moduleMap['life_situation'], slug: 'living_situation', label: 'Bosituasjon', field_type: 'select', options: JSON.stringify(['Leier leilighet', 'Eier leilighet', 'Eier hus', 'Bor hjemme', 'Annet']), sort_order: 2 },
      { module_id: moduleMap['life_situation'], slug: 'relationship_status', label: 'Sivilstatus', field_type: 'select', options: JSON.stringify(['Singel', 'I et forhold', 'Samboer', 'Forlovet', 'Gift']), sort_order: 3 },
      { module_id: moduleMap['life_situation'], slug: 'family_details', label: 'Familiedetaljer', field_type: 'textarea', options: null, sort_order: 4 },
      { module_id: moduleMap['life_situation'], slug: 'typical_day', label: 'Typisk dag', field_type: 'textarea', options: null, sort_order: 5 },

      // work
      { module_id: moduleMap['work'], slug: 'current_role', label: 'Nåværende rolle', field_type: 'textarea', options: null, sort_order: 1 },
      { module_id: moduleMap['work'], slug: 'active_projects', label: 'Aktive prosjekter', field_type: 'textarea', options: null, sort_order: 2 },
      { module_id: moduleMap['work'], slug: 'team', label: 'Team', field_type: 'textarea', options: null, sort_order: 3 },
      { module_id: moduleMap['work'], slug: 'biggest_challenge', label: 'Største utfordring', field_type: 'textarea', options: null, sort_order: 4 },
      { module_id: moduleMap['work'], slug: 'pipeline_status', label: 'Pipeline-status', field_type: 'textarea', options: null, sort_order: 5 },

      // finance_context
      { module_id: moduleMap['finance_context'], slug: 'monthly_income', label: 'Månedlig inntekt', field_type: 'number', options: null, sort_order: 1 },
      { module_id: moduleMap['finance_context'], slug: 'monthly_expenses', label: 'Månedlige utgifter', field_type: 'number', options: null, sort_order: 2 },
      { module_id: moduleMap['finance_context'], slug: 'savings_rate', label: 'Sparerate', field_type: 'number', options: null, sort_order: 3 },
      { module_id: moduleMap['finance_context'], slug: 'investments', label: 'Investeringer', field_type: 'textarea', options: null, sort_order: 4 },
      { module_id: moduleMap['finance_context'], slug: 'financial_situation', label: 'Økonomisk situasjon', field_type: 'textarea', options: null, sort_order: 5 },
      { module_id: moduleMap['finance_context'], slug: 'biggest_expense_issue', label: 'Største utgiftsproblem', field_type: 'textarea', options: null, sort_order: 6 },

      // physical
      { module_id: moduleMap['physical'], slug: 'training_program', label: 'Treningsprogram', field_type: 'textarea', options: null, sort_order: 1 },
      { module_id: moduleMap['physical'], slug: 'training_frequency', label: 'Treningsfrekvens', field_type: 'number', options: null, sort_order: 2 },
      { module_id: moduleMap['physical'], slug: 'body_weight', label: 'Kroppsvekt', field_type: 'number', options: null, sort_order: 3 },
      { module_id: moduleMap['physical'], slug: 'body_fat', label: 'Fettprosent', field_type: 'number', options: null, sort_order: 4 },
      { module_id: moduleMap['physical'], slug: 'diet', label: 'Kosthold', field_type: 'textarea', options: null, sort_order: 5 },
      { module_id: moduleMap['physical'], slug: 'sleep_quality', label: 'Søvnkvalitet', field_type: 'select', options: JSON.stringify(['Dårlig', 'Middels', 'Bra', 'Veldig bra']), sort_order: 6 },
      { module_id: moduleMap['physical'], slug: 'injuries_limitations', label: 'Skader og begrensninger', field_type: 'textarea', options: null, sort_order: 7 },

      // mental
      { module_id: moduleMap['mental'], slug: 'energy_level', label: 'Energinivå', field_type: 'select', options: JSON.stringify(['Lavt', 'Middels', 'Høyt', 'Veldig høyt']), sort_order: 1 },
      { module_id: moduleMap['mental'], slug: 'stress_level', label: 'Stressnivå', field_type: 'select', options: JSON.stringify(['Lavt', 'Moderat', 'Høyt', 'Overveldet']), sort_order: 2 },
      { module_id: moduleMap['mental'], slug: 'morning_routine', label: 'Morgenrutine', field_type: 'textarea', options: null, sort_order: 3 },
      { module_id: moduleMap['mental'], slug: 'evening_routine', label: 'Kveldsrutine', field_type: 'textarea', options: null, sort_order: 4 },
      { module_id: moduleMap['mental'], slug: 'personal_development', label: 'Personlig utvikling', field_type: 'textarea', options: null, sort_order: 5 },
      { module_id: moduleMap['mental'], slug: 'biggest_mental_challenge', label: 'Største mentale utfordring', field_type: 'textarea', options: null, sort_order: 6 },

      // relationships
      { module_id: moduleMap['relationships'], slug: 'partner', label: 'Partner', field_type: 'textarea', options: null, sort_order: 1 },
      { module_id: moduleMap['relationships'], slug: 'family', label: 'Familie', field_type: 'textarea', options: null, sort_order: 2 },
      { module_id: moduleMap['relationships'], slug: 'close_friends', label: 'Nære venner', field_type: 'textarea', options: null, sort_order: 3 },
      { module_id: moduleMap['relationships'], slug: 'professional_network', label: 'Profesjonelt nettverk', field_type: 'textarea', options: null, sort_order: 4 },
      { module_id: moduleMap['relationships'], slug: 'relationship_focus', label: 'Relasjonsfokus', field_type: 'textarea', options: null, sort_order: 5 },

      // lifestyle_context
      { module_id: moduleMap['lifestyle_context'], slug: 'hobbies', label: 'Hobbyer', field_type: 'textarea', options: null, sort_order: 1 },
      { module_id: moduleMap['lifestyle_context'], slug: 'recent_travels', label: 'Nylige reiser', field_type: 'textarea', options: null, sort_order: 2 },
      { module_id: moduleMap['lifestyle_context'], slug: 'planned_travels', label: 'Planlagte reiser', field_type: 'textarea', options: null, sort_order: 3 },
      { module_id: moduleMap['lifestyle_context'], slug: 'bucket_list', label: 'Bucket list', field_type: 'textarea', options: null, sort_order: 4 },
      { module_id: moduleMap['lifestyle_context'], slug: 'what_brings_joy', label: 'Det som gir glede', field_type: 'textarea', options: null, sort_order: 5 },
    ]

    const { error: cfErr } = await supabase.from('context_module_fields').upsert(fields, { onConflict: 'module_id,slug' })
    if (cfErr) { console.error('context_module_fields:', cfErr.message); process.exit(1) }
    console.log('✓ context_module_fields')
  }

  console.log('\n✅ Seed ferdig!')
}

run().catch(console.error)
