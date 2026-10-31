# Changelog

Changes to Anipair, newest first. Your records and the data saved on your device carry over from version to version.

## v0.27.0 — 2026-10-31

A new theme color, Night, uses the same night sky as the introduction page.

- Added Night to Theme color in the Display settings. It uses the introduction page’s sky darkening into late night, with gold accents and faint stars. A crescent moon appears in the top bar on PC, and on the Rate, Browse, and Settings screens on phones
- Night is always dark regardless of the Brightness setting, and the mascot’s sprout keeps its seasonal color

## v0.26.0 — 2026-10-31

The first screen before you log in is now an introduction page that shows what Anipair does and lets you try it right away.

- Before you log in, the first screen is now an introduction page. After a shelf of anime posters and a note on how Anipair works with Annict, you can try the rating card, Suggestions with reasons, and the Tier list without logging in
- Answers you give while trying it out are not sent to Annict or kept on your device, and they don’t carry over when you log in
- The introduction page is colored like a sky darkening from evening into late night

## v0.25.0 — 2026-10-31

Answering with keys is now something you turn on in Settings, and “Log in with Annict” no longer fails when you come back in another tab. Browse filters and the Golden era and shares in Trends have also been reworked.

- Answering with keys now works only after you turn on “Answer with keys” under “Keybindings (PC)” in Settings. When it is on, the keys are shown next to the buttons. Devices where you changed the keys before start with it on
- Fixed “Log in with Annict” failing its login check when you came back in another tab, for example from a link in an email
- In Browse, filtering by genre or studio without picking a period now searches every period, not only the anime on screen
- The Golden era in Trends now covers only the years you have ratings in, and shows a single year as “2007”. Format shares now add up to 100%
- When no synopsis can be found on Wikipedia, Anipair now says so
- The Match screen’s heading is now “Match”, the same as its tab
- The Terms and Privacy Policy buttons now have English names on the English screen, along with other small display fixes

## v0.24.0 — 2026-10-29

In Match, you can now pick genres, studios, and people you’d rather avoid and leave them out of your suggestions. Search boxes suggest titles as you type, and studios show their Japanese names on the Japanese screen.

- “What you avoid” has been added to Match’s “Suggestion filters”. Pick from 13 topics such as ecchi, harem, and isekai, or short and long anime, and matching anime are left out of your suggestions. Each topic shows roughly how many well-rated anime would be left out with it
- Genres and themes not among these topics can be searched for and added one by one
- Studios to avoid can be picked from chips for 40 well-known studios or by searching. Voice actors and staff can also be searched for, and anime they worked on are left out
- What you avoid is saved on this device and in your connected GitHub, and is included in backups
- The search boxes in Browse and Records now suggest anime titles as you type
- Studio filters in Browse and Records list 40 well-known studios first and fold the rest away. On the Japanese screen, studios are shown by their Japanese names in Trends and on anime cards too
- Match’s reasons now fit genres and themes on one line, “Matches your taste: …”. Anime from studios you watch often get “A studio you watch often” (this line rarely appeared before)
- The FAQ has been reworked. It explains in more detail how suggestions are chosen, and adds how to get different suggestions and how to open Anipair like an app. The FAQ in Settings now shows the explanation after each short answer too
- Fixed the Browse search box on PC losing focus as soon as you started typing

## v0.23.0 — 2026-10-28

Browse filters can now search every anime in a period. Anipair makes better use of large PC screens, and you can search by English or romanized titles and post a review for an episode on its own.

- You can now search for anime by their English or romanized titles
- When you pick a period in Browse filters and add genres or studios, Anipair searches every anime in that period, not just the ones already loaded
- Filters now show only anime that have all the genres and studios you picked. In Records, you can also choose the period by its first and last seasons
- You can now send an episode’s rating and review separately, so a review alone can be saved too
- On PC, Records and Browse use the full width of the screen, with search, season, and sort in a single bar. The bar tucks away as you scroll down and comes back when you scroll up
- Tap the “i” next to sort to see what each sort order does. Record order was removed from the sort options for Watched
- Links that take you to another site now end with ↗
- Explanations that are obvious from the screen were removed, and ones you only need to read once moved to How to use (?). For Want to watch, Not interested, Later, notes, and tier lists, a one-time message now appears at the top the first time you tap them, instead of text on the screen
- Once a MyAnimeList anime has been matched to its Annict entry, Anipair remembers the pair, so it doesn’t have to search by title again (when adding a studio’s anime to a tier list, or searching a period in Browse). Only the public anime IDs are stored
- On iPhone Safari, text at the top of the screen no longer looks blurry, and the top edge now matches the background color
- Fixed the How to use guide showing small text on large screens such as 4K. The season panel no longer closes when you scroll the list of years
- Reviewed the wording on the English screens
- “About this app” in Settings now mentions that anime ID pairs are stored too, and covers the processing for tier list share links

## v0.22.0 — 2026-10-27

Added “Development history” to News in Settings, so you can look back at how Anipair has changed.

- Development history shows a summary of the latest version, followed by past versions grouped into 10 chapters, newest first. Tap a chapter to read every change in it
- When a new version comes out, a mark appears on Settings at the bottom and on News. It goes away once you open Development history
- On the English screens, the changelog is shown in English too
- The public repository was renamed, so the links in the app and the terms now use the new name

## v0.21.0 — 2026-10-27

Tier lists are easier to make: drag covers, set one up step by step, and choose what the list is for. Anime details put your record at the top, and genres lead to popular anime.

- You can now drag covers in a tier list and drop them into any tier and position you like. On a phone, long-press a cover before moving it. Anime you rate later go into the tier for that rating
- The first time you open a tier list, it now walks you through setting it up one question at a time. You choose whether to start from a draft sorted by your Annict ratings or place everything yourself, how many tiers to use, and whether to sort the anime that have no rating
- With “+ New list”, you can now choose what the list is for (Want to watch, this season’s anime, a genre, or a studio), or search by anime title to build a list from the anime you pick. You can keep up to 5 lists. When you have two or more, you choose one from the list of lists when you open it
- The number of anime not placed yet is now shown above the list, and the screen for sorting anime one at a time now has “Undo”. Anime you don’t want in a list can be moved to “Left out of this list”
- In a tier list opened from a share link, you can now tap a cover to see the anime’s synopsis and links to other sites. The privacy policy now lists the services contacted for this (Wikipedia and Wikidata)
- The record section in the anime details is now shorter and sits near the top, and the episode records fold into a single line. Reviews, related anime, and similar anime are grouped at the bottom
- Tapping a genre in the anime details now lists popular anime in that genre. In the anime lists for a genre or a studio, tapping the active sort order again reverses it

## v0.20.0 — 2026-10-25

- Added tier lists to “Summary” in Records. When you open one, you right away get a draft list of the anime you watched, sorted by the ratings you gave on Annict. Tap a cover and use the tier buttons to move it, and sort the anime not placed yet one at a time. You can change the number of tiers (2 to 10), their names, and the title for each list, and keep up to 3 lists. Moving anime here doesn’t change your ratings on Annict
- Tier lists are saved on your device, and also to `tiers.json` if you use GitHub sync. They’re included in backups too
- You can now turn a tier list into a share link. Anyone with the link can view the list without logging in. Only the title, tier names, and the order of the anime are sent; your Annict name and ratings are not. You can renew or delete the link later, and deleting the list deletes the link too
- When you post a share link on X or elsewhere, it shows a card with the list’s title and tier colors (covers aren’t included)
- Added information about tier list share links to the terms of use and privacy policy
- In line with Annict’s API terms, when the connection reports that it’s busy, Anipair now waits for the specified time before sending again. The personal access token field now explains what the token can do and that you shouldn’t share it with anyone

## v0.19.2 — 2026-10-21

- In Match, sequels, prequels, and side stories of anime you rated “Good” or “Great” are now included as candidates and shown near the top. The top reason on the card reads “From the same series as ‘…’, which you liked”. Short specials of a few minutes aren’t moved up

## v0.19.1 — 2026-10-21

- Fixed the Records and Browse screens shifting slightly to the right on iPhone, which cut off the “Filter” button
- Fixed the line under the title in the anime details (air season, airing status, episode count) not wrapping on the English screens, which made the page scroll sideways
- On a computer, each row in This week now has a “+ Google Calendar” link. It opens the event screen in Google Calendar without saving a file (on a phone it’s still a calendar file)

## v0.19.0 — 2026-10-21

- For new users, the Rate screen now starts from last season (a season that has finished airing). It’s hard to rate the current season when it has just started, and you couldn’t move on to Match. The season stays the same for people who were already using Anipair
- Added a “Go to Rate” button to “No suggestions yet” in Match and to empty lists in Records
- Added “Skip” to the first page of the how-to guide, and added how to add Anipair to your home screen on the last page
- You can now save This week in Records as a calendar file (.ics). It opens in Google Calendar or the iPhone Calendar app
- Startup speed: the code loaded first is now about 20% smaller (the anime details, How to use, and the list of titles load when you open them)
- Searching the lists in Records no longer makes you wait while typing. Once a synopsis in the anime details has been loaded, it’s kept on your device and shown without waiting next time

## v0.18.3 — 2026-10-20

- On the English screens, anime titles now use the official English title (such as The Apothecary Diaries) when there is one, and the romanized title otherwise. English titles come from the Shikimori anime data that’s already loaded along with the covers
- On the English screens, voice actor and staff names now use their English names from Wikidata, and character names use Shikimori’s romanized names (Annict’s English fields were mostly empty). People who couldn’t be looked up stay in Japanese
- Added Wikidata (query.wikidata.org), used by the English screens, to the services listed in the privacy policy and the app description

## v0.18.2 — 2026-10-20

- On the English screens, the synopsis in the anime details now comes from English Wikipedia (Anipair follows the link from the Japanese article to the English one. If there’s no English article or no synopsis section, the Japanese synopsis is shown)
- On the English screens, broadcaster names are now shown in English (TV Tokyo, Nippon TV, and so on. Stations not on the list stay in Japanese)
- Episode titles stay in Japanese because there’s no English source for them, and copyright notices are shown as the rights holders write them
- Added English Wikipedia (en.wikipedia.org), used by the English screens, to the services listed in the privacy policy

## v0.18.1 — 2026-10-20

- On the English screens, anime titles are now shown as romanized titles (from the English fields on Annict and Shikimori. Anime without one stay in Japanese). In the anime details, the original Japanese title is shown under the title
- On the English screens, the names of voice actors, characters, staff, and studios now use their English spellings, staff roles are shown in English, and episode numbers use the “Ep. 1” form
- The search field in Browse on the English screens now says to search by Japanese title (Annict’s search only matches Japanese titles)
- Episode titles, broadcasters, copyright notices, and Wikipedia synopses stay in Japanese because there’s no English version of them

## v0.18.0 — 2026-10-20

- The app is now available in English too. It starts in your browser’s language (Japanese for a Japanese browser, English otherwise), and you can switch with “言語 / Language” in the Control center and under “Display” in Settings. On the first screen before you log in, switch with “EN／あ” at the top right
- Even on the English screens, anime titles, episode titles, Annict’s role names, and Wikipedia synopses stay in Japanese

## v0.17.12 — 2026-10-19

- FAQ answers now all follow the same pattern: a short answer (in bold) followed by an explanation
- Added “Annict has both ‘On hold’ and ‘Stopped watching’. Why can’t Anipair tell them apart?” to the FAQ
- Added “See all articles on Zenn” to the Anipair dev log under “News” in Settings

## v0.17.11 — 2026-10-19

- Anipair has moved to https://anipair.com/. Opening the old address (anipair.vercel.app) takes you to the new one
- At the new address, the settings saved in your browser and records such as “Haven’t seen” and “Not interested” are kept separately. If you use GitHub sync, connecting again at the new address brings them back. Your Annict records are unchanged
- The address shown on share images is now the new one

## v0.17.10 — 2026-10-13

- Updated the explanations in How to use, Settings, and the README to match how the app works now (Want to watch marks, notes, and Where I watch added to what’s shared via GitHub; explanations of “Where I watch” in Settings and of This week; Upstash, used by the Shikimori relay; Google Fonts in the list of services contacted)
- Added “Why don’t some anime show a next air date?” to the FAQ

## v0.17.9 — 2026-10-13

- Fixed episodes that had already aired on another service you chose being shown as new on a service that streams them later. The same episode could appear twice in This week. “Next airing” on anime cards also now shows the earliest airing of an episode that hasn’t aired yet
- When an episode airs at the same time on several stations or services, the streaming service is now listed first
- Added the next airing for Watching anime and the This week screen to the README

## v0.17.8 — 2026-10-13

- Added This week to Watching in Records. If you’ve chosen where you watch, it lists airings for the next 7 days by day and in order of time. The same episode is shown only once, even on different services
- When you choose a broadcast TV region, nationwide stations such as NHK are now included too. For ABEMA, schedules from channels with different names are now picked up as well
- When the broadcast schedule can’t be loaded, the Records screen now says so too, and you can reload it with “Try again”
- When no airings are found, the message now reads “No airings found in the next 4 weeks”
- If you keep the screen open past an airing time, the next airing now moves on to the next episode
- Changes to Where I watch made in Settings now sync to GitHub right away too
- The notice showing which account you logged in with now stays until you close it
- The token explanation in “About this app” is now split into where the token is stored and the fact that it isn’t kept on Anipair’s servers
- Added time limits to the requests for logging in and for sending feedback

## v0.17.7 — 2026-10-13

- Anipair now shows the next air date of anime you’re watching. Choose where you watch (streaming services, broadcast TV region, BS, CS) at the top of Watching in Records, and cards for airing anime show the earliest airing. The broadcast schedule is the information registered on Annict
- The next airing for each service you chose is now listed under “View on other sites” in the anime details
- You can also choose where you watch under “Display” in Settings. If you use GitHub sync, it’s shared between your computer and phone
- Anime details (cast, staff, series) are now kept on your device, so less needs to load when you open them again
- Added Where I watch and the stored broadcast schedules to the privacy policy and the README. Also fixed old button names that were still there

## v0.17.6 — 2026-10-13

- Simplified the login screen. The app description and the terms are available under “About this app”
- The login screen after you log out now has steps for connecting a different Annict account and an “Open Annict” button
- After you log in, Anipair shows once which account you logged in with
- Renamed “Log out and also delete the records on this device” to “Log out and delete Anipair’s data” and moved it into “Details” under “Annict connection”. It asks for confirmation when you tap it
- Added how to switch to a different Annict account to the FAQ

## v0.17.5 — 2026-10-13

- Made Settings easier to read. “Display” lists each setting on one line, every screen has shorter explanations, and the finer points are folded into “Details”. The steps for GitHub sync appear when you tap “Connect”
- Added “News” to Settings. It lists the official X account (@anipairAPP) and the Anipair dev log (articles on Zenn). Contact now has a “Send via X DM” button
- Made your first Match faster. The “similar anime” in the stored anime data are now received all at once
- Fixed “Retry” in one tab sometimes overwriting a rating or other change made in another tab with the earlier value
- Fixed a case where switching accounts while your device was low on storage could lose the previous person’s records on the device. When storage is low, Anipair now tells you instead of switching
- Strengthened the protection of server-side processing (so invalid requests don’t cause internal errors, the size of incoming requests is checked while reading them, and the number of requests is still limited when the cache store can’t be reached)
- Analytics are no longer sent when the address can’t be read

## v0.17.4 — 2026-10-12

- Extended how long anime data (Shikimori) for finished anime is kept, from 30 days to 90 days

## v0.17.3 — 2026-10-12

- Anime data (Shikimori) is now kept longer for each anime. Even when many people use Anipair at once, requests to Shikimori don’t pile up, and covers and suggestions appear faster
- Server-side processing now runs in Tokyo
- Added to the privacy policy that Anipair uses Upstash to store anime data and to count requests (and that no user information is stored there)

## v0.17.2 — 2026-10-12

- After recording several episodes in a row, you can now undo them one at a time, newest first. Before, you could only undo the last episode you recorded (both in the anime details and in the Watching list in Records)
- In the anime details, choosing an episode you recorded on this screen again lets you undo that episode’s record
- In the anime details, choosing an episode that’s already recorded now shows your previous rating (found from your recent records) along with “Record again” and “Edit on Annict” instead of the rating buttons. On Annict, rating an episode that’s already recorded adds a new record and keeps the old one, so this prevents tapping it by mistake when you meant to change the rating. When you rewatch, use “Record again” to add a second record. To change or delete the rating on an earlier record, open the episode’s page on Annict with “Edit on Annict”. This is also explained in the how-to guide and the FAQ
- Made the explanation of the services contacted in “About this app” in Settings easier to understand
- When you reload the page, you now return to the screen you last had open (Rate, Match, Records, Browse, or Settings). When you open the app fresh, it starts on Rate as before
- On a computer, tapping the logo at the top left now reloads the page
- Renamed “Write ratings by category and a review” in the anime details to “Detailed rating and review”
- Corrected how the “Collections” guide in the anime details explains adding to a collection on Annict (you add it from the panel opened with the menu button under the anime image)

## v0.17.1 — 2026-10-12

- Fixed a case where an episode record that failed to send, was resent with “Retry”, and was then undone could stay on Annict
- GitHub sync no longer accepts a public repository. With a public repository, anyone could read the ratings and reviews in your backup. Please specify a private repository as the setup steps describe
- Added to the privacy policy and “About this app” in Settings that covers and other images are loaded by your browser directly from their sources (Shikimori, each anime’s official site, and Annict), and added Google Fonts

## v0.17.0 — 2026-10-12

- Added analytics (Vercel Web Analytics) to learn which screens are used and how much. Only the name of the screen you opened, the referring site, your country or region, and your device and browser type are sent. No cookies are used, and your Annict account, records, tokens, and anything you type are not sent
- Added information about analytics to the privacy policy, the FAQ, and “About this app” in Settings
- Fixed resending a review that failed to send sometimes reverting an overall rating you changed afterward to the earlier value. A resend now writes only the review text and the category ratings, and keeps the current overall rating. The same goes for Match answers and statuses or ratings changed on other screens
- Tightened the check on the type of feedback

## v0.16.2 — 2026-10-12

- Removed the half-width spaces around English words in the Japanese screen text, README, terms of use, and privacy policy (such as “Annictでログイン”). The wording and features haven’t changed
- Fixed the issue template for bug reports sometimes not displaying correctly

## v0.16.1 — 2026-10-12

- New icon: Pair peeking out from behind Ani’s shoulder on a yellow background. The icon on your home screen and the browser tab icon change (the logo inside the app stays the same)
  - On some devices, the home screen icon may stay the old one until you add it again

## v0.16.0 — 2026-10-11

Added an FAQ and a way to send questions, bug reports, and requests. Also shortened the wait for people with many records using Anipair for the first time.

- Added “Contact” to Settings. It has the FAQ and a form for sending questions, bug reports, and requests (you can also open it from “Read the full guide” in the help)
  - You can send feedback without a GitHub account. Only the developer reads what you send, and it isn’t made public
  - If you use GitHub, you can also send feedback through this repository’s Issues (those are public)
- Updated the privacy policy and terms of use. They describe what Anipair receives through feedback (type, message, an optional reply address, and an optional device type) and where it’s stored (a private GitHub repository owned by the operator)
- When people with many records use Match for the first time, Anipair now looks up their highest-rated anime first and makes suggestions from those. The rest are looked up in the background and used the next time suggestions are made (with 1,400 records, the time to the first candidate went from about 17 minutes to about 1 minute)
- Even for people with many anime, covers in Records and Browse now appear one by one as they’re fetched (with 1,500 anime, from about 29 seconds to about 5 seconds the first time)
- Revised the wording of the Annict connection status and of the notices shown when the connection is unstable

## v0.15.1 — 2026-10-11

- Fixed the yellow dot on “Summary” in Records not making clear which item in Summary it referred to. The Summary list now shows “Not opened yet” on “Achievements” if you haven’t opened it (on phones, the dot for Achievements wasn’t shown)

## v0.15.0 — 2026-10-10

The anime details now show “Reviews from others”, and episode reviews now reach Annict as they should.

- Added “Reviews from others” to the anime details. It shows the Annict satisfaction score, the number of reviews, and the 3 reviews with the most likes. For anime you haven’t watched yet, the review text is shown only when you tap “Read reviews”, to avoid spoilers. The reviewer’s name and a link to read all reviews on Annict are included
- Fixed episode reviews sometimes not being sent to Annict after you wrote them
  - If you choose another episode with ‹ › or from the list while the review field is open, the field switches to that episode’s review
  - You can now add a review to an episode you recorded earlier, attached to that record (send it with “Save”)
  - For an episode with an unsent review in progress, the button now reads “Open review draft”. Reviews you wrote earlier that failed to send are also kept as drafts on the same device, so you can open and send them
- When you’ve recorded every episode of an anime you’re watching, the anime details now start with a prompt to mark it Watched, and the episode records move below the anime rating. For anime still airing, the prompt doesn’t appear even if you’ve recorded up to the latest registered episode
- Notes you wrote on Annict for an anime are now shown in the anime details as “Note on Annict” (edit them on the anime’s page on Annict)
- Collections for grouping anime are an Annict feature, so the anime details and Settings now point you to collections on Annict

## v0.14.0 — 2026-10-10

The anime details now show “Similar anime”.

- “About this anime” in the anime details now shows up to 12 similar anime on a shelf of covers (from Shikimori. It scrolls sideways on a phone and is laid out in a grid on a computer). They carry Watched and Want to watch marks, and tapping one opens its details. Anime that have just started airing may not have similar anime information yet
- On vertical monitors and tablets held upright, Rate and Match are now arranged vertically with larger covers. Covers are also a little larger on phones and wide computer screens
- The home screen icon and browser tab icon now show the same two faces as the logo. If you’ve already added the icon to your home screen, it may show the old picture until your device fetches it again
- If something goes wrong on one screen, you can now keep using the other screens from the bottom bar. If a screen can’t open right after the app is updated, Anipair suggests reloading
- Updated the backup explanation to match what’s actually saved (records for each anime, plus Not interested, Later, Haven’t seen, and Want to watch notes). Episode records aren’t included in backups (they stay on Annict)
- A backup made right after you switch accounts or backup destinations can no longer be mixed up with the result for the previous one

## v0.13.0 — 2026-10-10

Meet the mascots, “Ani & Pair”.

- They’re a duo named by splitting the app’s name in two. Ani is in charge of watching anime (with a TV antenna), and Pair is in charge of finding your next favorite (the sprout on Pair’s head changes with the season you’re viewing: cherry blossoms, leaves, autumn leaves, or snow)
- The icon and logo now show their two faces (browser tab, home screen, startup screen, and share images)
- While loading, Ani’s antenna wiggles, and the two also show up in empty lists, when something goes wrong, when you finish answering a season, before suggestions, and when you earn a title
- On the Records, Browse, and Settings screens, when you stop using the app for a moment, the two peek up from the bottom of the screen or take a slow walk. They’re happy when you touch them. They don’t appear if Effects is set to off or Motion is set to reduced
- “How to use Anipair” is now a 7-page guide led by Ani and Pair. Pictures of each screen show where to tap. You can view it anytime from “About” in Settings
- Added “About Ani & Pair” to “About” in Settings (their origins, habits, and favorite things)
- In Rate and Match, answer buttons that can’t be pressed are no longer shown while there are no anime

## v0.12.0 — 2026-10-09

Rebuilt the look and controls. Your records and settings carry over as they are.

### Look
- The background now takes the color of the season you’re viewing (Spring, Summer, Fall, Winter). The color changes when you switch seasons. It darkens a little with the time of day, and you can choose the brightness (light, dark, darker)
- Rate and Match now flow vertically: the current anime’s cover is large in the center, with the anime you just answered above it and the next one below. The covers slide along as you answer
- Records and Browse now show covers on shelves, and Watching anime are shown as cards (next episode, remaining episodes, and estimated time). You can record that episode right away with the card’s 4-level rating
- The anime details open as a single full-screen sheet. The close button is at the top right, and you can also swipe down or right to close it
- The app’s typeface is now Zen Maru Gothic
- Cover frames now match the aspect ratio of a poster so the sides aren’t cut off

### Controls
- Switch screens with the bar at the bottom on a phone or at the top on a computer. You can also swipe left and right on a phone, or use ← → on a computer
- Added the “Control center” at the top right of each screen. It shows notifications (such as records that couldn’t be saved) and lets you change the theme color, brightness, motion, button display, and effects on the spot
- Added “One-handed mode” (which side to place frequently used buttons on) and “Motion” (auto, on, reduced) to Settings
- Tap the middle of “‹ Fall 2026 ›” to open a panel for choosing the year and season. You can also jump to last season, this season, or next season. Records can be filtered by season too
- In long lists, tap the button in the bottom corner, or tap the current screen’s tab in the bar again, to go back to the top
- The default keys on a computer now fit the left hand alone (1–4 to rate, Q for Don’t remember, W for Want to watch, E for Watching, R for Dropped, S for Details, D for Later, F for Haven’t seen / Not interested, Z for Undo). Key assignments you changed yourself stay as they are

### Records and sorting
- Sorting Records by your own rating is now called “Favorites first”
- Top rated in Browse now pulls the scores of anime rated by few people toward the average when sorting (so anime rated highly by only a handful of people don’t rise to the top)
- The anime details now show when you set the status and when you added a rating or review
- The list of anime a voice actor appeared in now shows the name of the role they played
- Mark Want to watch anime as “Watch first” with the ☆ at the top right of the cover, and write notes from the anime details
- A notification now appears at the top right when you earn a title

### Other
- Fixed the screen staying zoomed in after tapping a search field in Safari on iPhone
- Fixed the year and season options being unreadable in the dark theme
- The terms of use and privacy policy now open inside the app. Added the source of synopses (Wikipedia)
- Reviewed screen reader support and contrast

## v0.11.4 — 2026-10-07

- Added “Search on streaming services” to the anime details. It opens a search by anime title on Netflix, U-NEXT, Prime Video, ABEMA, d Anime Store, or Niconico. Anipair doesn’t check whether the anime is actually available, so it may not be found

## v0.11.3 — 2026-10-07

Fixes for Match.

- Greatly reduced the number of anime that showed “Couldn’t find it on Annict” when you tapped “Want to watch” or similar in Match. Anipair can now find the anime on Annict even when the title is written differently (reading in parentheses, ☆ vs. ★, Ⅱ vs. II, with or without “劇場版” (The Movie), and so on). The same applies to related anime in Browse
- If it still can’t be found, Anipair now shows a link to the forum where you can ask for anime missing from Annict to be added, in addition to searching on Annict

## v0.11.2 — 2026-10-07

Fixes to keep things reliable. No new features.

- Saved copies of records that failed to send are no longer lost when your device’s storage is full. When space runs low, data that can be rebuilt (such as where cover images are) is discarded first
- The stored list of cover image locations is now limited to the 4,000 most recent
- Pressing Tab on the keyboard no longer moves focus from a screen opened on top, such as the anime details, to the screen behind it. When you close it, focus returns to where you were before opening it

## v0.11.1 — 2026-10-06

Fixed bugs found in a full review and a focused security review.

### Security and records on the device
- When sharing a device with someone else, the previous person’s records (Pass, Haven’t seen, titles, Want to watch notes, and so on) and GitHub sync could carry over to the next person who logged in. Records on the device are now kept separately for each Annict account; when you log out, the previous person’s data is set aside and not shown to the next person. Logging in again with the same account brings it back
- Logging out now also removes your GitHub token from the device. To connect again, enter your token again
- Added “Log out and also delete the records on this device” to Settings
- When you log in or log out, Anipair now finishes sending any records waiting to be sent before switching, then reloads the page. When you switch in another tab, the other tabs reload too
- If there are earlier records whose owner can’t be confirmed, Anipair now asks the person who logged in whether they’re theirs before restoring them
- Rewrote the privacy policy to match this

### Bugs that saved records differently than intended
- Resending a record that failed to send with “Retry” overwrote answers you had changed or undone afterward with the old answer
- When changing a review, two reviews could occasionally be left
- Recording something while the page was still loading could make the recorded anime appear again the next time you opened it
- Tapping “Undo” in episode records went back to Episode 1

### Screen bugs
- The preview image wasn’t shown in “Share as image” for Trends and Year in review
- In Browse, tapping the selected sort order again left it stuck loading
- Changing conditions partway through “Show more” in Browse could mix in anime from the previous conditions. The current list is also no longer cleared when loading fails
- Top rated now sorts by Annict’s satisfaction score even when Shikimori can’t be reached
- Anime details opened from related anime or a person’s other anime didn’t show the status of your own record
- Anime you answered “Watching” while looking back on the Rate screen were immediately asked “Did you finish watching?”. Like “Still watching”, they’re no longer asked about until that season ends
- In Match, requesting new suggestions right after answering could show the same anime again
- Displaying a title in Achievements brought back the NEW mark on titles you had already seen
- Titles you’ve earned are no longer taken away when the lineup of a season’s popular anime changes
- Titles for the number of anime watched weren’t unlocked until you reopened the app
- Moved “About this app” in Settings to the top
- Made the first load faster for accounts with many records

## v0.11.0 — 2026-10-06

### Records and ratings
- The Records page now opens on the Watching list (or Watched if you’re not watching anything). Recording what you’re watching this season is the most common task
- Episode records are now added from “Episode records” in the details that open when you tap an anime (Watched and Watching anime in Records and Browse). A list of episodes appears below the record section; tap one to select that episode
- You can now write a review for each episode. Tap “Write a review” in the record section to open the text field. If you write first and then tap a rating, both are recorded together; if you tap it after rating, the review is added to that record. If you don’t write anything, you can record just by tapping a rating as before
- In the anime details, you can now rate four categories, Animation, Characters, Story, and Music, in addition to the overall rating, and write a review (“Write ratings by category and a review”). Drafts are kept on this device
- You can now give Want to watch anime a “Watch first” mark and a short note. Marked anime are listed first
- Watching anime on the Rate screen are no longer shown while their season is airing; after the season ends, Anipair asks “Did you finish watching?”. Anime you answer “Still watching” for aren’t asked about again during that season. The card shows “Next: Ep. 11 (of 12)”
- The screen shown after you’ve answered all of a season’s popular anime now has “Review anime marked ‘Haven’t seen’”. You can record anime you watched later from the Rate screen. In Browse, anime marked Haven’t seen also get a mark, and you can find them with filters
- Renamed the undo button on the Rate screen to “Undo” (in Japanese, from “取り消す” to “ひとつ戻る”)

### Achievements, Trends, and sharing
- Titles earned by the number of anime watched are now listed in a way that shows your progress (7 levels, from 10 to 1,000 anime)
- Renamed titles so they make sense once you know the reference (yearly titles use that year’s zodiac animal, era titles use anime that symbolize that era, and so on). Titles you’ve earned and the title you’re displaying stay the same
- Added a yearly Year in review (number watched, count per month, your best anime, and your most-watched genres and voice actors)
- You can now share Trends, titles, and Year in review as images (the images are made on this device)

### Days when the connection is slow or unstable
- From the second time on, the app shows what it loaded last time right away and swaps in fresh data from Annict in the background. When the connection is taking a while, it says so briefly
- While loading, the app shows an animated logo and the elapsed seconds (this keeps going even with reduced motion). In the anime details, “Loading” stays visible while the synopsis, staff, and other details haven’t arrived yet
- Records that weren’t finished sending before you closed the app are now announced as “Records that couldn’t be sent last time” the next time you open it, and you can resend them. When sending, Anipair compares them with what’s on Annict now and writes only what’s missing
- When the response from Annict is cut off and it’s unclear whether something was saved, Anipair now checks Annict before resending, so ratings and episode records aren’t duplicated
- Settings now shows the status of the connection to Annict
- One slow request no longer holds up loading on other screens. Anipair also no longer reloads the details of the same anime or the anime of the same season repeatedly, which reduces requests to Annict

### Other
- Made the first screen appear faster and the code loaded first smaller
- Fixed the list position shifting when the saving indicator appeared

## v0.10.0 — 2026-10-05

- Added filters to Records. You can filter by rating, air year (from–to), season, format, genre, and studio. Popular was added to the sort options, and tapping the same button again switches between ascending and descending
- You can now record Watched and Watching anime episode by episode with a 4-level rating. Tap “Record by episode” on a row in Records to open the record section for just that anime. After you rate, it switches to the next episode in the same place, so you can keep recording
- In the anime details, tapping the name of a voice actor, staff member, or studio now shows a list of anime that person or company worked on (newest or most popular first. Data from Shikimori). Credits in the details are now ordered studio → staff → voice actors
- Rebuilt Trends in Records. It shows charts of your rating distribution and whether you rate generously or strictly, your genre preferences (radar chart), air years and your golden age, formats and seasons, how you compare with everyone else, whether you go for mainstream hits or hidden gems, the voice actors, directors, and studios you watch most, and your recording pace
- Added “Voice actor match” to Trends. Instead of how often they appear, voice actors are ranked by how much higher (or lower) you rated their anime than the general score, revealing voice actors you might secretly favor. Anime in the same series count as one
- Added filters to Browse. Choose an air year range (from–to) and seasons to see all anime from that period instead of a single season (this also works with title search). You can also filter by your own records, format, genre, and studio
- Renamed “Taste order” in Browse to “Suggested”, matching Want to watch in Records. When you’re viewing a period, you can also choose newest first

## v0.9.0 — 2026-10-05

- Added a “?” at the top right of each screen. Tapping it dims the screen slightly, highlights the buttons being explained one at a time, and guides you with speech bubbles with arrows. Advance with “Next” or by tapping the screen, and read the written guide from “Read the full guide”
- Browse now shows a line under the sort options explaining what the current order is (Popular is the number of people who recorded it on Annict, Top rated is by reputation, and so on)
- On a phone, when you open a sheet such as the anime details, “Tap to close” now appears subtly from the second time on too (the first time, it still appears prominently as before)

## v0.8.0 — 2026-10-04

- The anime details now show a synopsis. Only the opening paragraph of the anime’s article on Japanese Wikipedia is shown, to avoid spoilers, along with the source and license (CC BY-SA 4.0). It doesn’t appear for anime whose article has no synopsis
- Tapping “Read more” on a synopsis now expands the rest in place instead of going to Wikipedia (it may contain spoilers)
- Tapping the title of a related anime now opens that anime’s details inside the app instead of going to the Annict site. You can set a status and rating on a related anime you open, from whichever screen you opened it. Anime you set are removed from those that will come up in Rate and Match
- Changed “Connect with GitHub” in the Match guide, the privacy policy, and the terms of use to “GitHub sync” for consistency

## v0.7.4 — 2026-10-04

- Covers once again use the images from each anime’s official site returned by Annict’s API (as covers for anime with no poster on Shikimori). The copyright notice in the anime details is back too. This is because we confirmed in Annict’s developer help that these images are described as part of the API’s information

## v0.7.3 — 2026-10-04

- Stopped using Annict’s anime images. Covers now come only from Shikimori posters (a few anime without a poster are shown without a cover). The image copyright notice in the anime details was removed too

## v0.7.2 — 2026-10-04

- Fixed the published program files containing information about the build environment (such as commit details). No secret values such as tokens were included

## v0.7.1 — 2026-10-04

- Anipair now reads only information available through Annict’s public API. As a result, the synopsis and streaming services in the anime details (which were read from Annict’s anime pages) and the Annict Supporter title (which was determined from profile pages) were removed
- Updated the explanations in the privacy policy and terms of use to match

## v0.7.0 — 2026-10-04

- The Rate screen now shows your progress through the season (how many of that season’s popular anime you’ve answered). Anime you’ve already recorded on Annict are filled in from the start
- A short effect now plays every 10 answers, and a “completed” effect plays when you’ve answered all of a season’s popular anime. You can keep answering the next anime while the effect plays
- Added “Achievements” to the Records tab. It has titles earned by completing seasons and covering years and eras, hidden titles earned from your activity on Annict, and a “Season crest” showing the share you’ve answered for each season. You can display an earned title on your profile
- Titles have rarities, and the color and decoration change with rarity. The first time you open Achievements, it shows all at once the titles earned from your records so far
- Titles are based on the number of answers (including “Haven’t seen”), not the number of ratings
- Added “Effects” to Settings, where you can choose the strength of effects: normal, subtle, or off
- Added to the privacy policy the title information kept on your device and the loading of Annict profile pages

## v0.6.0 — 2026-10-04

- Rearranged the Rate screen buttons so the ones you press most are larger and lower down (near your thumb). At the very bottom are “Want to watch” and “Haven’t seen” (wide), above them the rating row (Don’t remember, Bad, Okay, Good, Great), and at the top “Watching”, “Dropped”, “Undo”, and “Details”
- On a phone, tapping inside a sheet such as the anime details (anywhere other than buttons or links) now closes it. The “Close” at the top right was removed, and “Tap to close” is shown only the first time you open one
- The i (Details) at the bottom right of covers is now shown only on a computer (wide screens). On a phone, open details with “Details” at the bottom
- Fixed the anime details sheet stuttering as it appeared. The cover and title appear right away, and the rest appears together once the fonts are ready

## v0.5.1 — 2026-10-03

- Fixed “Watching” on the Rate screen being unavailable for anime outside the current and previous seasons. You can now mark anime from any season as Watching

## v0.5.0 — 2026-10-03

- Removed the switch between “Look back” and “Watching” on the Rate screen and combined them into a single flow. Anime you’ve already marked Watching come first, followed by anime from the chosen season that you haven’t recorded yet
- The button layout and what each button does are now the same for every anime. The rating row is “Don’t remember, Bad, Okay, Good, Great”, and below it “Haven’t seen, Watching, Dropped, Want to watch”. For anime you’re watching, “Watching” moves on to the next one, and buttons that don’t make sense can’t be pressed
- “Watched it but don’t remember” and “Finished watching” were combined into “Don’t remember” in the rating row (marks it Watched without a rating). “Seen it” in Match uses the same layout
- “Undo” goes back in the order you answered, across both Watching anime and the season’s anime

## v0.4.1 — 2026-10-03

- Changed “Newest first” in Records to sort by air date rather than the date you recorded it. Each row shows both the air season and the date you recorded it
- Anime you stopped watching partway are now handled by a single “Dropped” button throughout the app. You can also set it from the Rate screen (Look back and Watching) and from Match (it’s saved on Annict as “Stopped watching”. Anime set to “On hold” on the Annict site are also shown as “Dropped”)
- Renamed the “On hold / Stopped” category in Records to “Dropped”

## v0.4.0 — 2026-10-03

- Added “Related anime” to the anime details. It lists the series registered on Annict in order of air date, with each entry’s place in the series (such as “Season 2” or “Movie”) and your own record. For anime with no series registered, Shikimori’s related anime (prequels, sequels, and so on) are shown instead
- On large computer screens (such as 4K), the whole app now scales up to fit the screen. Covers are kept at a size where the images don’t get too blurry
- On a computer, the Rate screen and Match now show hints under the title, such as air season, format, studio, and genre

## v0.3.2 — 2026-10-03

- Revised the explanations in Settings into short, natural Japanese. Wording such as “つなぐ” and “接続” was unified as “連携” (sync), and “Delete token” for Annict became “Log out”
- Fixed extra spaces in the middle of sentences
- Updated the GitHub sync explanation in the README to use the same words as the app

## v0.3.1 — 2026-10-03

- Settings are now ordered “Annict connection (required) → GitHub sync (optional) → Backup → About this app → Keybindings (PC)”. You can reach “About this app” with less scrolling
- Renamed “Account” to “Annict connection (required)” and “Key controls” to “Keybindings”

## v0.3.0 — 2026-10-03

### Faster and more reliable

- Loading your own reviews is faster from the second time on. Only what’s new since last time is loaded, and a copy is kept on your device.
  Reviews you deleted or edited on the Annict site are caught up by a full reload once every 7 days. Tap “Retry” in Records to reload everything right away
- When Anipair hits a rate limit on Annict or another service, it waits a little and resends automatically. GitHub’s rate limit is also now handled separately from a “token can’t be used” error
- A while after you open the Rate screen, Anipair collects similar-anime information for estimating your taste in the background, without getting in your way. This makes Match and Suggested order in Want to watch faster the first time you open them

### Easier to use

- When your Annict login expires, a “Log in again” bar appears at the top of the screen
- The phone’s “Back” now closes sheets such as the anime details
- Added “Taste order” to Browse. It sorts the season’s anime the same way as Suggested order in Want to watch, with reasons. There’s also a link to jump to next season
- For new users, “How to use Anipair” is shown once on the Rate screen. You can view it again anytime from “About this app” in Settings

### Behind the scenes

- Split the CSS that defines the look and the code for the Settings screen into files for each screen and section. The look and behavior haven’t changed

## v0.2.3 — 2026-10-03

- The 4-level rating buttons now have the same “dark background + outline” style as the other answer buttons. The level colors are used only for the outline, text, and a light background, and fill only at the moment you press
- Added icons and dividers to the bottom tabs. The selected tab is filled with the accent color and shown in bold
- Added small icons to the tabs in the top bar on a computer too

## v0.2.2 — 2026-10-03

- Added “Watching” to the “Seen it” section in Match (you can also press the E key). Undoing it returns it to unset
- Added to Settings and the README why Pass, Skip, and “Haven’t seen” are stored on GitHub (because Annict has no place for them)

## v0.2.1 — 2026-10-02

- Organized Settings into five cards: “Account”, “GitHub sync”, “Backup”, “Key controls”, and “About this app”. A short status is shown at the top of each card
- After you connect GitHub, the connection steps are hidden. The backup buttons are lined up side by side, and long explanations are folded
- On phones and other touch devices, the key controls section is folded, and on a computer a table of contents for the page is shown on the left
- Placed links to the terms of use and privacy policy in Settings, on the first screen, and in the README

## v0.2.0 — 2026-10-02

- Revised how anime data is fetched. Information available on Annict comes from Annict, and only information Annict doesn’t have (genres, similar anime, and some covers) comes from Shikimori. Added image copyright notices and a link to Shikimori to the details
- Rebuilt Match, Suggested order in Want to watch, and Trends with the new data
- Sorting by rating uses Annict’s satisfaction score (or Shikimori’s score when there isn’t one)
- Published the privacy policy and terms of use (in Japanese and English)

## v0.1.1 — 2026-10-02

- Added the Anipair icon, logo, and tagline “あなたの「好き」と、次の「好き」をつなぐ。” (Connecting what you love to what you’ll love next.)
- Main buttons, the current tab, and links now use a gradient accent from blue to purple to pink. The dark screens and meaningful colors such as rating colors stay the same

## v0.1.0 — 2026-10-02

The first public release.

- Rate: Look back through past seasons and mark anime as Watched, Want to watch, Haven’t seen, or one of four ratings with one tap. You can also tidy up the anime you’re watching
- Match: Anipair estimates your taste from your ratings and suggests anime you haven’t seen yet, one at a time. Choose Want to watch, Pass, or Skip
- Records: View and edit your Watched, Want to watch, Watching, and On hold / Stopped lists, plus your rating Trends
- Browse: Season lists and title search, plus anime details (synopsis, cast, staff, streaming services)
- Get started with “Log in with Annict”. All your records are saved to your own Annict account
- Connecting GitHub is optional. When connected, Pass, Skip, and “Haven’t seen” are shared between your devices, and all your records are backed up daily. Even without connecting, you can export them to a file
- A layout for wide computer screens, and keyboard controls (with customizable key assignments)
