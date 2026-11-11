# METR – Discover the Decision · مِتر – اكتشف القرار

*From Data to Smarter Real Estate Decisions.*

This is a five-minute live experience for faculty members, run before the Metr system presentation. It works in Arabic and English. Participants join on their phones by scanning a QR code. Everyone completes four short activities together, sees a leaderboard, and then moves to Metr.

This project is **completely separate** from the main Metr system. It has its own code and its own Supabase database, and it does not touch any Metr files, tables or logins.

---

## 1. Project structure

```
metr-discover/
├── index.html                 App shell (fonts, meta tags)
├── package.json               Dependencies and scripts
├── vite.config.js             Build config (strips the demo answer keys from live builds)
├── netlify.toml               Netlify build, SPA redirects and security headers
├── .env.example               The three environment variables
├── public/favicon.svg
├── supabase/
│   ├── migrations/20261111000000_metr_discover.sql   Schema, security rules, server functions
│   └── tests/                 Server-logic test (runs on plain PostgreSQL)
├── src/
│   ├── main.jsx, App.jsx      Entry point and routes
│   ├── styles.css             Metr visual system (olive, beige, gold, off-white, navy)
│   ├── i18n/                  Arabic + English text, RTL/LTR switching
│   ├── backend/               Supabase backend, demo backend, error codes
│   ├── hooks/useRoom.js       Realtime sync, polling fallback, server clock, auto-close
│   ├── lib/                   QR generator, router, storage, formatting, config
│   ├── components/            Shared UI (rulers, options, role cards, leaderboard, finale)
│   ├── activities/            The four activities
│   └── pages/                 Landing, Host console, Participant, Presentation screen
├── docs/screenshots/          Screens captured during testing
└── tests/
    ├── e2e_demo.py            Full browser test: host + screen + 10 participants
    └── timing_demo.py         Worst-case duration run (every timer runs to the end)
```

## 2. The three screens

| Screen | Address | Used by |
|---|---|---|
| Host console | `/host` creates a session, then `/host/CODE` | The presenter (laptop) |
| Participant | `/join/CODE` (from the QR code) or `/join` | Faculty members (phones) |
| Presentation | `/screen/CODE` (button on the host console) | The projector |

**Joining (participants):** scan the QR code or enter the code, then type a display name, choose Arabic or English, and pick a role (Employee / Manager / Owner). They wait in the lobby until the host starts. No account or password is needed. Participants can change their role until the experience starts.

**Host controls:** create a session, share the QR code, link and code, and open the projector screen. From there the host starts each activity, can end it early, starts the next one, shows the results and shows Metr. The host can restart at any time; this keeps the participants and clears the answers. The host also sees who has joined, who is online right now, and how many Employees, Managers and Owners there are.

## 3. The activities and timing

| # | Activity | Timer | Points |
|---|---|---|---|
| 1 | Can You Spot the Problem? / هل تستطيع اكتشاف المشكلة؟ | 45 s | 100 for B |
| 2 | What Would You Do? / ماذا ستفعل؟ | 60 s | 100 for B |
| 3 | What If You Changed the Price? / ماذا لو غيّرت السعر؟ (price and discount sliders) | 90 s | 100 for submitting a scenario |
| 4 | Safe or Risky? / آمن أم يشكل خطراً؟ | 60 s | 50 for each correct classification |
| – | Final results (leaderboard, gold trophy, achievements) | appears automatically 8 s after activity 4 | max 400 |
| – | Metr transition and the "Explore Metr" button | ~45 s | – |

- **Closing:** each activity closes automatically when its server-side timer ends, or as soon as everyone has answered. This keeps the whole session close to five minutes.
- **Achievements:**
  - Data Explorer (مستكشف البيانات): got activity 1 right.
  - Smart Decision Maker (صانع القرار الذكي): got activity 2 right and completed the What-If.
  - AI Guardian (حارس الذكاء الاصطناعي): classified both AI cases correctly.
- **Ties** on the leaderboard go to whoever answered faster in total.

## 4. Database (Supabase)

Seven public tables:

- `activities`: the four activities, their durations and points.
- `questions`: question ids and their option ids. These contain no answers.
- `rooms`: the session code, the current phase (`lobby`, `activity`, `reveal`, `results`, `finale`), the current activity, and the server start and end times.
- `participants`: display name, role (`employee`, `manager`, `owner` only), and language.
- `answers`: one row per participant per question. A unique constraint means a duplicate cannot be stored.
- `scores`: points, whether the answer was correct, and response time. These are calculated on the server.
- `room_events`: a stream of "something changed" signals that drives Supabase Realtime.

A `private` schema, which is not exposed through the API, holds:

- the correct answers (`answer_keys`),
- the explanations and verdicts (`reveal_texts`), which are only sent once an activity closes,
- the host and participant tokens, stored as SHA-256 hashes.

**Security rules:**

- Row Level Security is on for every table.
- The browser cannot read or write `rooms`, `participants`, `answers` or `scores` directly.
- Every action goes through a `SECURITY DEFINER` function. These functions:
  - validate the input,
  - enforce the phase and the timer,
  - reject duplicate answers,
  - calculate scores,
  - return correct answers only after the activity closes.
- Only the public anon/publishable key is used in the browser; the service-role key is never needed.
- No personal data is collected beyond a display name. Participants use temporary session tokens, not accounts.

## 5. Environment variables

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL, e.g. `https://abcd1234.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | The **anon** (or **publishable**) key. Never the service-role / secret key. |
| `VITE_METR_MAIN_URL` | The address of the main Metr system, opened by "Explore Metr" |

If either Supabase variable is missing, the app runs in **demo mode**. Demo mode syncs only between tabs of one browser, so it is useful for rehearsing the screens but cannot connect separate phones. A banner says so on every screen.

## 6. Setup and deployment

### Step A: Create the database (about 5 minutes)

1. Go to [supabase.com](https://supabase.com) and create a **new project**. Do not use the main Metr project.
2. Open **SQL Editor → New query**.
3. Paste the whole file `supabase/migrations/20261111000000_metr_discover.sql` and click **Run**. It is safe to run again.
4. Open **Project Settings → API** and copy the **Project URL** and the **anon / publishable key**.
5. Check that realtime is on for `room_events`. Go to **Database → Publications → supabase_realtime** and make sure `room_events` is ticked. The SQL normally does this for you.

### Step B: Deploy on Netlify

1. Put this folder in a GitHub repository, then in Netlify choose **Add new site → Import an existing project**. Alternatively, run `npm install && npm run build` locally and drag the `dist` folder into Netlify. In that case, set the variables in `.env.local` before building.
2. The build settings are read from `netlify.toml`: command `npm run build`, publish folder `dist`, Node 22.
3. In **Site configuration → Environment variables**, add the three variables from section 5.
4. Click **Deploy**. Then open `https://YOUR-SITE.netlify.app/host` to create a session.

### Run locally

```bash
npm install
cp .env.example .env.local     # fill in the values
npm run dev                    # http://localhost:5173
```

### On the day

1. On the laptop, open `/host` and choose **Create a new session**.
2. Click **Open presentation screen** and drag that window to the projector.
3. Faculty scan the QR code. Watch the participant count and role breakdown on the host console.
4. Start activity 1 and follow the main button on the host console through to **Show Metr**.

If the laptop browser closes, reopen `/host/CODE` on the same laptop and it resumes. To continue on another device, use **Copy host recovery link**.

## 7. Testing results

The tests were run in the development environment before handover.

**Server logic** (`supabase/tests/rpc_test.sql`, run on PostgreSQL 16 with Supabase-style roles): 39 of 39 checks passed. They cover:

- the browser cannot read tables, answer keys, reveal texts or tokens directly;
- 10 participants join with all three roles and both languages;
- duplicate names, a fourth role and empty names are rejected;
- a role can change in the lobby but is locked after the start;
- only the host token can control the room;
- invalid answers and duplicate answers are rejected;
- answers, explanations and results stay hidden until the activity closes;
- an activity closes when its timer expires and when everyone has answered;
- the What-If price is calculated on the server (800,000 − 10% = 720,000);
- the scores, ranking, average, participation rate and badges are correct;
- the finale, the restart (participants kept, scores cleared), and running the migration twice all work.

**Truly simultaneous answers:** 20 parallel database connections (10 participants each submitting twice at the same moment). Result: exactly 10 answers were stored, every duplicate was rejected, and the room closed exactly once.

**Full browser run** (`tests/e2e_demo.py`, Chrome, demo mode): host, projector screen and **10 simulated participants**. 44 of 44 checks passed (earlier versions of the suite passed 3 runs in a row), with no console errors. The run covered every item in the testing list:

- concurrent joining in both languages, with RTL and LTR layouts;
- the same question reaching every phone;
- simultaneous answers, with a double-tap ignored;
- the 45 s timer closing activity 1 (measured at about 45.5 s);
- answers revealed only after closing;
- language switching that keeps the selection and the submitted state;
- What-If values updating instantly in both languages;
- AI Risk reveals;
- automatic results, correct final scores, the leaderboard and the trophy;
- the Explore Metr link;
- a participant reloading mid-activity and a host reloading, both resuming;
- the connection-lost message;
- restart;
- layouts at phone (390 px), iPad (820 px), desktop and projector sizes.

**Duration:**
- With quick answers, the run took about 1.5 minutes from "Start activity 1" to the Metr screen.
- Worst case (`tests/timing_demo.py`): one participant never answers, so every timer runs to the end. The host also pauses 10 s on each reveal, shows the results for 20 s and the Metr screen for 45 s. Measured: activity timers 45.5 / 60.5 / 90.6 / 60.9 s, results after 7.8 s, **total 6:05, within the 7-minute limit**.
- When everyone answers, activities close early, so a typical session is around 4–5 minutes.

**Not yet tested:** the live Supabase connection across real phones, and the Netlify deployment. These need your Supabase project and Netlify site. Do a 2–3 phone rehearsal after deploying.

## 8. Known limitations

- **Demo mode** works only between tabs of one browser. Real multiplayer needs the Supabase variables.
- The dependency versions in `package.json` were not installed here, because installing packages was blocked in the build environment. The app was built and tested with esbuild using the same source code. `npm run build` on Netlify (Vite 7) is the standard path, but its first run has not been observed.
- **Any visitor can create a session.** A light server-side limit of 30 new sessions per minute applies. Old sessions can be removed with `select private.cleanup_old_rooms();`, which deletes sessions older than 3 days.
- **"Online now"** uses Supabase Presence. Joined participants who close their browser still count toward "everyone has answered". The timer then closes the activity normally.
- **Fonts** load from Google Fonts (IBM Plex Sans Arabic). If there is no internet, the system font is used.

---

## ملخص بالعربية

**مِتر – اكتشف القرار** تجربة تفاعلية مدتها نحو خمس دقائق، باللغتين العربية والإنجليزية، تسبق عرض نظام مِتر.

- **المشارك:** يمسح رمز QR، ثم يكتب اسمه، ويختار لغته ودوره (موظف / مدير / مالك)، ويشارك في أربعة أنشطة.
- **المضيف:** يتحكم في بدء كل نشاط وإنهائه والانتقال بينها.
- **شاشة العرض:** تعرض الأسئلة والإجابات المباشرة والنتائج.

المشروع مستقل تماماً عن نظام مِتر وله قاعدة بيانات خاصة.

**التشغيل:**
1. أنشئ مشروعاً جديداً في Supabase.
2. شغّل ملف SQL الموجود في `supabase/migrations` من «SQL Editor».
3. انشر المشروع على Netlify.
4. أضف المتغيرات الثلاثة: `VITE_SUPABASE_URL` و`VITE_SUPABASE_ANON_KEY` و`VITE_METR_MAIN_URL`.
5. افتح `/host` لإنشاء جلسة.

قبل يوم العرض، جرّب الجلسة مع هاتفين أو ثلاثة بعد النشر.
