# Reddit Lightbox Feed

A userscript for Reddit's current ("modern") web design. It replaces the narrow single-column feed with a full-width grid of cards in a cleaner style, collapses the left menu into an icon rail, and opens posts in a lightbox, with the comments beside them, so you never leave the page.

Status: **v0.2.0, early.** Written against Reddit's page structure as measured on 16/11/2026 and tested against a stand-in page, but not yet tried on the live site. Expect a round or two of fixes. `design/mockup.html` is the look it is aiming for.

## What it does

- **Own cards.** The script reads which posts Reddit has put in the feed, fetches each post's details from Reddit's public data (`/by_id/`), and draws its own bordered cards with thumbnail, title, flair, a short text preview, vote buttons and comment count. Reddit's own cards stay in the page, hidden, so scrolling still loads more posts.
- **Clutter removed.** Promoted posts, the "Suggested communities" strip, community highlights, the right-hand sidebar and the card/compact view switch are hidden on feed pages.
- **Icon rail.** The left menu becomes a 64px rail of icons (Home, Popular, News, Explore, then your communities, favourites first). The menu button expands it to show names. The choice is remembered.
- **Lightbox.** Clicking a card opens the post with its threaded comments. `J` / `K` or the arrow keys move between posts, `Esc` closes, and ctrl-click opens a post in a new tab as usual. Subreddit and user names are normal links.
- **Voting.** The vote buttons press Reddit's own hidden buttons for that post. If they cannot be found the script says so instead of pretending.
- **NSFW.** Posts marked 18+ get no thumbnail or text preview on the card, and their media is hidden behind a click in the lightbox. Communities marked 18+ get a plain letter in the rail instead of their icon.
- **Safe fallback.** If Reddit's data cannot be fetched, the script goes back to showing Reddit's own cards in a plain grid and says why in the diagnostics.

Not yet: the user hover card, the notifications dropdown, trimming the community banner, and replying. Reddit's header, profile menu and chat are left alone.

## Install and update (Violentmonkey or Tampermonkey)

1. Install the userscript manager in your browser.
2. Open this link and choose Install:
   <https://raw.githubusercontent.com/PhadeDev/reddit-lightbox-feed/main/reddit-lightbox-feed.user.js>
3. Open `https://www.reddit.com/` and refresh.

The script has `@updateURL` and `@downloadURL` set to the same link, so Violentmonkey checks it for new versions by itself. It only offers an update when the `@version` number in the file goes up. In Violentmonkey you can also use Settings, then Check for updates.

## Settings and troubleshooting

Click the userscript manager's icon while on Reddit to see the script's menu:

- **Layout**, **Lightbox**, **Own cards**, **Left icon rail**: each switches one part on or off (reloads the page). Switch them all off to get Reddit back exactly as it was.
- **Copy structure report**: copies a longer, redacted description of how the current Reddit page is built (used to design the next version).
- **Copy diagnostics**: copies a short report (page structure, counts, what the script is doing, recent messages, no usernames or post text) to paste into a bug report.

## Privacy

Nothing is sent anywhere except to Reddit itself. The script requests public data addresses on `www.reddit.com` from your own browser, using your normal Reddit login: post details (`/by_id/`), a post's comments (`<post>.json`), and your community list (`/subreddits/mine/subscriber.json`). It stores only its on/off settings and whether the rail is expanded.

## Layout of this repository

- `reddit-lightbox-feed.user.js` is the script.
- `design/mockup.html` is the interactive design mock-up (made-up sample data).
- `docs/reddit-dom-notes.md` records what was learned about Reddit's page structure.

## Releasing a change

Edit the script, raise `@version`, merge to `main`. Violentmonkey picks it up on its next update check.
