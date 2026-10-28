# AI in the Fast Lane

Mobiele web-app voor het teamevent "AI in the Fast Lane" (CE en Power Platform).
React + Vite, gehost op GitHub Pages, gegevens in Supabase (EU-regio).

Site: https://daanlens.github.io/FastLaneAI/

## Hoe het werkt

- Elk toestel krijgt automatisch een anonieme Supabase-sessie, zonder e-mail of wachtwoord.
- Deelnemers schrijven zich in met **team, naam, e-mail (optioneel) en de eventcode**.
  Pas daarna kunnen ze lezen en schrijven (Row Level Security in de database).
- **Een team ziet alleen de eigen resultaten** (kansen, onze rol, acties en het Pitch-overzicht).
  De database dwingt dit af; het is niet alleen verborgen in de app.
- Na inschrijven kun je je naam en e-mail wijzigen, maar niet je team. Alleen een beheerder wisselt van team.
- Eigen acties verwijderen kan alleen vanaf het toestel waarop je ze hebt gemaakt.
- **Beheer:** open de site met `?beheer` erachter (https://daanlens.github.io/FastLaneAI/?beheer).
  Op Start staat dan "Beheer (facilitator)". Vul de beheercode in en kies **Beheerder worden**.
  Dat toestel ziet daarna op Pitch en Acties de resultaten van alle teams, ook zonder `?beheer`.
  "Alles wissen" werkt alleen met de beheercode.
- De eventcode en de beheercode staan alleen in de database, niet in deze (publieke) repo.

## Eenmalig instellen

### 1. Supabase

1. Maak een project op https://supabase.com, in een **EU-regio** (bijv. Frankfurt, `eu-central-1`).
2. **SQL Editor:** plak de inhoud van [supabase/schema.sql](supabase/schema.sql) en klik op Run.
3. Stel de codes in met een aparte query in de SQL Editor (kies je eigen codes):
   ```sql
   insert into private.instellingen (sleutel, waarde) values
     ('eventcode',  'FASTLANE-2026'),
     ('beheercode', '<minstens 16 willekeurige tekens>')
   on conflict (sleutel) do update set waarde = excluded.waarde;
   ```
4. **Authentication > Sign In / Providers:** zet **Allow anonymous sign-ins** aan.
5. **Authentication > Rate Limits:** zet "Anonymous sign-ins" op minstens 100 per uur.
   Op de event-wifi delen alle deelnemers één IP-adres.
6. **Project Settings > API:** noteer de Project URL en de **anon / publishable key**.
   De service_role / secret key heb je niet nodig. Zet hem nooit in de repo of de app.

### 2. GitHub

1. **Settings > Pages > Source:** GitHub Actions.
2. **Settings > Secrets and variables > Actions > Variables:** maak twee repository-variabelen:
   - `SUPABASE_URL`: de Project URL
   - `SUPABASE_ANON_KEY`: de anon / publishable key
3. Elke push naar `main` bouwt en publiceert de site (`.github/workflows/deploy.yml`).
   Opnieuw publiceren zonder wijziging: Actions > Publiceren naar GitHub Pages > Run workflow.

### 3. Lokaal ontwikkelen

```bash
npm install
cp .env.example .env.local   # vul URL en anon key in
npm run dev
```

Open http://localhost:5173/FastLaneAI/. `.env.local` staat in `.gitignore`.

### Verkeerd team gekozen

Zet het team om in Supabase > SQL Editor:

```sql
update public.deelnemers set team = 3 where naam = 'Voornaam';
```

## Database bijwerken

Na een wijziging in [supabase/schema.sql](supabase/schema.sql): plak het hele bestand opnieuw in de SQL Editor en klik op Run.
Bestaande gegevens blijven staan. Doe dit **voordat** de nieuwe versie van de app online komt.

## Testen voor het event

- Schrijf je in met de eventcode, vul een kans in, sorteer een taak en zet een actie op de muur.
- Controleer in Supabase > Table Editor of de rijen verschijnen.
- Probeer een verkeerde eventcode: je krijgt een melding en komt niet verder.
- Test op iOS en Android, ook via mobiel netwerk.
- Test met twee toestellen in verschillende teams dat je elkaars resultaten niet ziet.
- Word beheerder via `?beheer` en controleer dat je op Pitch alle teams kunt kiezen.
- Test "Alles wissen" via `?beheer` met de beheercode. Iedereen moet zich daarna opnieuw inschrijven.

## Na afloop: gegevens wissen

1. Zet de acties over naar backlog of CRM met "Toon tekstversie" op het tabblad Acties.
2. **In de app:** open de site met `?beheer` > Start > Beheer (facilitator) > beheercode > Alles wissen.
   Dit verwijdert alle kansen, toewijzingen, van-naar-blokken, acties en inschrijvingen.
3. **Anonieme sessies:** Supabase > Authentication > Users, filter op anonieme gebruikers en verwijder ze.
   Ze bevatten geen namen of e-mailadressen.
4. **Alles weg:** Supabase > Project Settings > General > Delete project. Daarmee zijn alle gegevens en klantnamen weg.
   Haal eventueel ook de site offline: GitHub > Settings > Pages > Unpublish site.

## Hoe de app met de gegevens omgaat

| Tabel | Een rij per | Opslaan |
| --- | --- | --- |
| deelnemers | toestel (anonieme sessie) | bij inschrijven of wijzigen |
| kansen | team en rij 1 t/m 12 (3 standaard, tot 12 met "+ Nog een klant") | kort na typen, upsert op team + rij |
| toewijzingen | team en taak 1 t/m 20 (15-20 zijn eigen taken) | per tik, upsert op team + taak |
| van_naar | team en doelgroep | kort na typen, upsert op team + doelgroep |
| acties | actie | bij "Zet op de actiemuur" |

- Wijzigingen worden per scherm na elkaar opgeslagen, zodat snel typen geen dubbele rijen of oude waarden oplevert.
- De actiemuur ververst elke 20 seconden (`src/config.js`).
- Vullen twee mensen van hetzelfde team tegelijk dezelfde kaart in, dan wint de laatste. Laat dus één persoon per team typen.
- De actiemuur heeft drie periodes: 30 dagen, 90 dagen en Volgend jaar.
- Alles wat je invult is zichtbaar voor je eigen team en voor beheerders. Gebruik voor klanten zo nodig een codenaam.
