-- Life OS Seed Data: Martin Jakobsen
-- Run after migrations to populate initial data

-- Note: Replace USER_ID with actual auth.users id after first signup

-- ============================================
-- VISION: 10-Year (2036)
-- ============================================

insert into vision (id, user_id, title, description, target_year) values (
  '00000000-0000-0000-0000-000000000001',
  'USER_ID',
  'Martin 2036',
  'Jeg driver et PE-selskap som kjøper, forbedrer og skalerer cash flow-selskaper. Porteføljen er verdt 1B+. Jeg er Norges største grunderprofil. Gift med to barn. Bor i Oslo med penthouse og hus på Ullern/Holmenkollen, hytte på Hemsedal/Hafjell, feriehus på Bali, penthouse i Dubai og Manhattan. Trener daglig, 10-12% kroppsfett. Reiser fritt med familien. Frihet, helse, økonomisk sikkerhet og meningsfullt arbeid.',
  2036
);

-- ============================================
-- VISION CATEGORIES
-- ============================================

insert into vision_categories (vision_id, category, description, target_state) values
('00000000-0000-0000-0000-000000000001', 'business',
 'PE-selskap som kjøper og optimaliserer selskaper. Ledergruppe som drifter. Fokus på strategi, oppkjøp og EBITDA-optimalisering.',
 'Portefølje verdt 1B+. Ish Studio enten solgt eller velfungerende porteføljeselskap. Salgsavdelinger, egne selskaper med drift, management for grunderprofil. Kontor i co-working hub med medgrunnlegere og ansatte.'),

('00000000-0000-0000-0000-000000000001', 'brand',
 'Norges største grunderprofil. Foredrag, sosiale medier med team, referansepunktet for å tørre å satse.',
 'Deler veien til å lykkes. Innblikk i grunderlivet. Hjelpe folk ut av rat race. Team håndterer SoMe, jeg skaper innholdet.'),

('00000000-0000-0000-0000-000000000001', 'finance',
 'Diversifisert formue: PE, eiendom, crypto, utbytter. 5M+ i årslønn pluss utbytter.',
 'Penthouse Oslo, hus Ullern/Holmenkollen, hytte Hemsedal/Hafjell, villa Bali, penthouse Dubai, penthouse Manhattan. Lamborghini Urus, Porsche GT3, Porsche Taycan S. Passiv inntekt dekker livsstil.'),

('00000000-0000-0000-0000-000000000001', 'family',
 'Gift med to barn. Kone som er støttespiller og deler verdier rundt helse og godt liv.',
 'Vakker og støttende kone. To barn som får det beste. Lillebror i nærheten. Mari i Oslo. Foreldre med mulighet til å være i Oslo mye. Trygg havn, rollemodell, alltid tilstede.'),

('00000000-0000-0000-0000-000000000001', 'physical',
 'Daglig trening, sterk kropp, ekstremsport.',
 '10-12% kroppsfett. Benker 100kg 3x8. Trener 5-7 dager i uken. 150g protein daglig. 7+ timer søvn. Hyrox. Fallskjerm, ski, kiting. Sjelden alkohol.'),

('00000000-0000-0000-0000-000000000001', 'mental',
 'Sterk selvtillit, gjennomføringsevne, rutiner og fokus.',
 'Stoler på egne tanker og evner. Gjennomfører det jeg sier. Faste rutiner morgen/kveld. Effektiv med klar plan. Selvsikker, stabil, kjærlig. Meditasjon. Håndterer stress ved å skynde seg sakte.'),

('00000000-0000-0000-0000-000000000001', 'lifestyle',
 'Frihet til å reise og oppleve verden med familien.',
 'Bor utenfor Norge hver vinter. Reiser fritt. Internett = kontor. 90% fri på ferier. Frikveld i uken med familien. Eiendomsprosjekter i Bali med Jay og Alex. Eventyr i verden.');

-- ============================================
-- GOALS: 2026 (Year 1 - Foundation)
-- ============================================

-- Business
insert into goals (id, user_id, category, title, description, target_value, current_value, unit, deadline, status) values
('10000000-0000-0000-0000-000000000001', 'USER_ID', 'business',
 '5 MNOK booket omsetning Ish Studio', 'Nå revenue-target for å bevise modellen og finansiere vekst.',
 5000000, 3100000, 'kr', '2026-06-30', 'active'),

('10000000-0000-0000-0000-000000000002', 'USER_ID', 'business',
 'Moe ombord med equity', 'Fullfør aksjonæravtale, vesting og kompensasjonspakke.',
 1, 0, 'count', '2026-05-31', 'active'),

('10000000-0000-0000-0000-000000000003', 'USER_ID', 'business',
 'Lever Specc-prosjekt', 'Fullført GTM-strategi og nettside for Speccs funding-runde.',
 1, 0, 'count', '2026-05-15', 'active'),

('10000000-0000-0000-0000-000000000004', 'USER_ID', 'business',
 'Etabler NordicActive Ventures', 'Sett opp holdingstruktur og første investeringsstrategi.',
 1, 0, 'count', '2026-12-31', 'active');

-- Physical
insert into goals (id, user_id, category, title, description, target_value, current_value, unit, deadline, status) values
('20000000-0000-0000-0000-000000000001', 'USER_ID', 'physical',
 'Gjennomfør første Hyrox', 'Fullfør Hyrox-løp.',
 1, 0, 'count', '2026-12-31', 'active'),

('20000000-0000-0000-0000-000000000002', 'USER_ID', 'physical',
 'Benk 100kg 3x8', 'Bygg styrke systematisk.',
 100, 0, 'kg', '2026-12-31', 'active'),

('20000000-0000-0000-0000-000000000003', 'USER_ID', 'physical',
 'Nå 12% kroppsfett', 'Kutt til stabil lav fettprosent.',
 12, 0, '%', '2026-12-31', 'active');

-- Finance
insert into goals (id, user_id, category, title, description, target_value, current_value, unit, deadline, status) values
('30000000-0000-0000-0000-000000000001', 'USER_ID', 'finance',
 'Spar 500K i MLJ Invest', 'Bygg opp investeringskapital i holdingselskapet.',
 500000, 140000, 'kr', '2026-12-31', 'active'),

('30000000-0000-0000-0000-000000000002', 'USER_ID', 'finance',
 'Strukturer eiendomsinvestering Bali', 'Første villa-prosjekt med Jay og Alex.',
 1, 0, 'count', '2026-12-31', 'active');

-- Family / Private
insert into goals (id, user_id, category, title, description, target_value, current_value, unit, deadline, status) values
('40000000-0000-0000-0000-000000000001', 'USER_ID', 'family',
 '2 reiser med kjæresten i 2026', 'Prioriter kvalitetstid og opplevelser.',
 2, 1, 'count', '2026-12-31', 'active'),

('40000000-0000-0000-0000-000000000002', 'USER_ID', 'family',
 'Ring familie 3x i uken', 'Hold kontakten med mamma, pappa og Mari.',
 3, 0, 'count', null, 'active');

-- Brand
insert into goals (id, user_id, category, title, description, target_value, current_value, unit, deadline, status) values
('50000000-0000-0000-0000-000000000001', 'USER_ID', 'brand',
 'Hold 4 foredrag i 2026', 'Bygg profil som grunder og AI/outbound-ekspert.',
 4, 1, 'count', '2026-12-31', 'active'),

('50000000-0000-0000-0000-000000000002', 'USER_ID', 'brand',
 'Publiser ukentlig på LinkedIn', 'Konsistent synlighet. Team støtter, jeg skaper.',
 52, 0, 'count', '2026-12-31', 'active');

-- Mental
insert into goals (id, user_id, category, title, description, target_value, current_value, unit, deadline, status) values
('60000000-0000-0000-0000-000000000001', 'USER_ID', 'mental',
 'Etabler fast morgen- og kveldsrutine', 'Ikke vik fra rutinene. 90 dager streak.',
 90, 0, 'dager', '2026-06-30', 'active'),

('60000000-0000-0000-0000-000000000002', 'USER_ID', 'mental',
 'Les 12 bøker i 2026', 'En bok i måneden. Personlig utvikling, business, biografi.',
 12, 0, 'count', '2026-12-31', 'active');

-- ============================================
-- HABITS
-- ============================================

insert into habits (user_id, category, title, frequency, target_count, time_of_day, active) values
-- Morning
('USER_ID', 'mental', 'Opp før 07:00', 'daily', 1, 'morning', true),
('USER_ID', 'physical', 'Kald dusj', 'daily', 1, 'morning', true),
('USER_ID', 'mental', '10 min journaling/meditasjon', 'daily', 1, 'morning', true),

-- During day
('USER_ID', 'physical', 'Trening (styrke/cardio/Hyrox)', 'daily', 1, 'anytime', true),
('USER_ID', 'physical', 'Zone 2 trening', 'weekly', 3, 'anytime', true),
('USER_ID', 'physical', '150g protein', 'daily', 1, 'anytime', true),
('USER_ID', 'business', 'Deep work blokk (2+ timer)', 'weekdays', 1, 'anytime', true),
('USER_ID', 'business', 'Sjekk Pipedrive pipeline', 'weekdays', 1, 'anytime', true),
('USER_ID', 'family', 'Ring familie', 'weekly', 3, 'anytime', true),

-- Evening
('USER_ID', 'mental', 'Plan neste dag (5 min)', 'daily', 1, 'evening', true),
('USER_ID', 'mental', 'Skjerm av 22:00', 'daily', 1, 'evening', true),
('USER_ID', 'physical', 'Minimum 7 timer søvn', 'daily', 1, 'evening', true);

-- ============================================
-- MILESTONES: 10-year timeline
-- ============================================

-- 2026: Foundation
insert into milestones (goal_id, title, description, target_date, sort_order) values
('10000000-0000-0000-0000-000000000001', 'Q2: 5M booket', 'Nå revenue-target.', '2026-06-30', 1),
('10000000-0000-0000-0000-000000000001', 'Q4: 8M+ pipeline', 'Bygg pipeline for 2027.', '2026-12-31', 2);

-- These are vision-level milestones (not tied to specific 2026 goals)
-- They serve as the timeline in the Vision view

-- We use a special "vision milestone" goal as parent
insert into goals (id, user_id, category, title, description, status) values
('90000000-0000-0000-0000-000000000001', 'USER_ID', 'business', '10-årsplan milepæler', 'Overordnede milepæler mot 2036-visjonen.', 'active');

insert into milestones (goal_id, title, description, target_date, sort_order) values
('90000000-0000-0000-0000-000000000001', '2026: Fundament', 'Ish Studio 5M+. Moe ombord. Første Hyrox. MLJ Invest strukturert. NordicActive Ventures etablert. Første foredrag-serie.', '2026-12-31', 1),
('90000000-0000-0000-0000-000000000001', '2027: Vekst', 'Ish Studio 10M+. 3-4 ansatte. Første eiendomsinvestering Bali. Crypto-portefølje aktiv. Ukentlig LinkedIn-innhold med team.', '2027-12-31', 2),
('90000000-0000-0000-0000-000000000001', '2028: Skalering', 'Ish Studio 15M+ eller solgt. Første oppkjøp gjennom NordicActive. Boligkjøp Oslo. Hyrox Pro gjennomført. Etablert foredragsprofil.', '2028-12-31', 3),
('90000000-0000-0000-0000-000000000001', '2029: Posisjon', 'PE-portefølje med 3+ selskaper. EBITDA-optimalisering i gang. Hytte kjøpt. Familie startet. Norges mest synlige unge grunder.', '2029-12-31', 4),
('90000000-0000-0000-0000-000000000001', '2030: Momentun', '5-årsplan realisert: selskapsverdi 200M+. 5M+ i lønn. Stabil familiesituasjon. Bali-villaer bygget. Vinter utenfor Norge.', '2030-12-31', 5),
('90000000-0000-0000-0000-000000000001', '2031: Ekspansjon', 'PE-selskapet kjøper aggressivt. Portefølje 400M+. Dubai penthouse. Internasjonal profil starter. Ekstremsport-bucket list.', '2031-12-31', 6),
('90000000-0000-0000-0000-000000000001', '2032: Dominans', 'Portefølje 600M+. To barn. Hus på Ullern/Holmenkollen. Cash flow fra alle selskaper. Foredrag internasjonalt.', '2032-12-31', 7),
('90000000-0000-0000-0000-000000000001', '2033: Konsolidering', 'Ledergrupper drifter alt. Manhattan penthouse. Formue gir full frihet. Fokus på familie og livskvalitet.', '2033-12-31', 8),
('90000000-0000-0000-0000-000000000001', '2034: Frihet', 'Reiser fritt med familien. Jobber fordi du vil, ikke fordi du må. Mentorrolle for yngre grundere.', '2034-12-31', 9),
('90000000-0000-0000-0000-000000000001', '2036: Visjonen', 'Alt på plass. 1B+ portefølje. Norges største grunderprofil. Gift, to barn, alle eiendommene, bilene, friheten. Sterk kropp og sjel.', '2036-12-31', 10);

-- ============================================
-- FINANCE TARGETS
-- ============================================

insert into finance_targets (user_id, category, monthly_budget, target_type) values
('USER_ID', 'bolig', 15000, 'expense_limit'),
('USER_ID', 'mat', 6000, 'expense_limit'),
('USER_ID', 'transport', 3000, 'expense_limit'),
('USER_ID', 'trening', 2000, 'expense_limit'),
('USER_ID', 'spise_ute', 3000, 'expense_limit'),
('USER_ID', 'shopping', 2000, 'expense_limit'),
('USER_ID', 'abonnementer', 2500, 'expense_limit');

insert into finance_targets (user_id, category, yearly_target, target_type) values
('USER_ID', 'sparing_mlj', 500000, 'savings'),
('USER_ID', 'investering_crypto', 100000, 'investment'),
('USER_ID', 'investering_eiendom', 200000, 'investment');
