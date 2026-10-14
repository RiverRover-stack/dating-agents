# 3-minute video: script + shot list (target 2:50)

Order required by the brief: (a) profile pages first → (b) agents actually dating → (c) final rankings, plus a quick paste-to-rankings demo.
Record the screen at 1080p; voice-over only. Pre-open `/demo` and a finished custom run in tabs so nothing loads on camera.

| Time | Shot (screen) | Voice-over |
|---|---|---|
| 0:00-0:12 | Home page hero, then the "How it works" cards | "Dating, delegated. Every person is an AI agent that reads their public LinkedIn and Instagram - nothing else - then dates other agents on their behalf." |
| 0:12-0:50 | **(a) Profiles.** `/demo` → Profiles tab (25 cards). Open one profile: scroll Portrait → Needs → Hobbies → Interests → Values → Evidence chips (linkedin / instagram) | "Profile pages come first. The analyst agent reads both sources and writes needs, hobbies, interests, values and personality - and every key claim is tagged with which source it came from." |
| 0:50-1:05 | Open a profile with a yellow "Data flag" banner (or a custom run with a blocked source) | "If a source is blocked or private, we show a partial profile, flag it, and never invent facts. No logins, no CAPTCHA bypass, public data only." |
| 1:05-1:50 | **(b) Dating.** Dating tab → pick a pair → read the transcript aloud for 2-3 turns → scroll to the two verdict cards (score, spark ✦, friction ⚠). Point at "300 pairs" count | "Now the agents date. This is a real LLM-generated conversation, grounded in both profiles: each agent advocates for its person, asks real questions, and surfaces a friction point. Each side then scores the other, with a spark and a risk. For 25 people that's 300 dates, run concurrently and cached." |
| 1:50-2:20 | **(c) Rankings.** Rankings tab → choose a person → top 3 with reasons → click a name to jump to their profile | "Finally, the matchmaker agent ranks all 24 others for each person using profiles and date results - with a one-line reason that cites something concrete." |
| 2:20-2:50 | **Live demo.** Home → paste 2 real LinkedIn + Instagram links → Start → progress cards (Read → Analyze → Date → Rank) → profiles appear first → dates stream live → rankings | "And it works live. Paste your own two links, hit start, and watch the pipeline: profiles first, dates streaming token by token, then your personal ranking. Built with Next.js, Mistral, and Apify. Everything shown is AI-generated simulation." |
| 2:50-2:55 | End card: live URL + GitHub URL | - |

Shot-list notes
- Keep the cursor slow; zoom browser to 110% for legibility.
- For the live segment pre-warm one person you already ran so scraping latency doesn't dominate; speed up (2x) the waiting portion in editing and say so in the caption.
- Total talking time ≈ 2:45; leave a 5-second buffer under the 3:00 cap.
