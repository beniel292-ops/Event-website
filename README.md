# Zero Bugs Club – Event Registration & Entry System

Registration website + door scanner app for Zero Bugs Club (VIT Chennai) events.
**Explore. Engineer. Evolve.**

## How it works

1. **Student registration website** (`/web`) — students enter their name, VIT email and registration number.
   The server checks the details, reserves a seat atomically, and **emails the QR entry pass to their VIT inbox**
   (emailing proves the student owns that inbox). "Already registered? Resend my pass" re-sends it.
2. **Volunteer scanner app** (`/scanner`, Android / Expo SDK 57) — volunteers **sign in with Google or email**, scan the QR at the door and approve entry.
   A pass can only be checked in once, even if two phones scan it at the same moment.
3. **Database** (`/supabase/schema.sql`) — Supabase Postgres with Row Level Security.
   The public website key can only read the seat status; everything else requires a signed-in staff account.

## Roles

| Who | Can do |
|---|---|
| Public website | See event date, venue, seats left; register; resend own pass (by email) |
| Volunteer (scanner) | Scan passes, approve entry, view live list and door log |
| Admin (scanner) | Everything above + delete entries, change seat capacity, open/close registration |

## Key features

- Server-side validation of VIT email (`name.surname2025@vitstudent.ac.in`) and reg no (`25BCE1234`), enforced again by database constraints.
- Duplicate prevention (case-insensitive email and reg no).
- Seat cap enforced inside the database with a row lock — cannot be exceeded by simultaneous signups.
- Live seat counter, clear "Seats Full" / "Registration Closed" / "Event Ended" states.
- Optional Cloudflare Turnstile bot check.
- Event title, date and venue come from the `event_config` table — update them there for the next event, no code change needed.
- Append-only door scan log (approved, duplicate, invalid, deleted).

See **CONTRIBUTING.md** for setup, deployment and how to add volunteers.
