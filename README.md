# Reddit Lightbox Feed

A userscript for Reddit's current ("modern") web design. It gives the home feed a denser, full-width layout and opens posts in a lightbox, with the comments beside them, so you never leave the page.

Status: **v0.1, early.** It was written against Reddit's page structure as measured on 15/11/2026 and has not yet been tried on the live site. Expect a round or two of fixes.

## What v0.1 does

- Shows posts as a full-width card grid instead of one narrow column.
- Hides promoted posts and the right-hand sidebar on feed pages.
- Clicking a post's title, the empty part of its card, or its comments button opens a lightbox with the post and its comments.
- Subreddit and user names in the lightbox are normal links.
- `J` / `K` or the arrow keys move to the next or previous post. `Esc` closes.
- Clicking an image or video inside a card still uses Reddit's own media viewer.

Not in v0.1: voting from the lightbox, replying, the user hover card, and the notifications dropdown. Reddit's own header, profile menu and chat are left alone.

## Install and update (Violentmonkey or Tampermonkey)

1. Install the userscript manager in your browser.
2. Open this link and choose Install:
   <https://raw.githubusercontent.com/PhadeDev/reddit-lightbox-feed/main/reddit-lightbox-feed.user.js>
3. Open `https://www.reddit.com/`.

The script has `@updateURL` and `@downloadURL` set to the same link, so Violentmonkey checks it for new versions by itself. It only offers an update when the `@version` number in the file goes up. In Violentmonkey you can also use Settings, then Check for updates.

## Settings and troubleshooting

Click the userscript manager's icon while on Reddit to see the script's menu:

- **Layout: ON/OFF** switches the layout changes (reloads the page).
- **Lightbox: ON/OFF** switches the lightbox (reloads the page).
- **Copy diagnostics** copies a short report (page structure, counts, recent messages, no usernames or post text) to the clipboard so it can be pasted into a bug report.

If something goes wrong, switch both off to get Reddit back exactly as it was.

## Privacy

Nothing is sent anywhere except to Reddit itself. To show a post's comments the script requests that post's public JSON address on `www.reddit.com` from your own browser, using your normal Reddit login. It stores only its two on/off settings.

## Layout of this repository

- `reddit-lightbox-feed.user.js` is the script.
- `design/mockup.html` is the interactive design mock-up (made-up sample data) the script is modelled on.
- `docs/reddit-dom-notes.md` records what was learned about Reddit's page structure.

## Releasing a change

Edit the script, raise `@version`, merge to `main`. Violentmonkey picks it up on its next update check.
