# Reddit Lightbox Feed

A userscript for Reddit's current ("modern") web design. It replaces the narrow single-column feed with a full-width grid of cards in a cleaner style, collapses the left menu into an icon rail, and opens posts in a lightbox, with the comments beside them, so you never leave the page.

Status: **v0.14.1, early.** Written against Reddit's page structure as measured on 16/11/2026 and tested against a stand-in page, but not yet tried on the live site. Expect a round or two of fixes. `design/mockup.html` is the look it is aiming for.

## What it does

- **Own cards.** The script reads each post's details from the feed Reddit has already put on the page (title, flair, score, comment count, age, thumbnail), and draws its own bordered cards with thumbnail, title, flair, a short text preview, vote buttons and comment count. Reddit's own cards stay in the page, hidden, so scrolling still loads more posts.
- **Clutter removed.** Promoted posts, the "Suggested communities" strip, community highlights, the right-hand sidebar and the card/compact view switch are hidden on feed pages.
- **Icon rail.** (Only shown where Reddit has its own left menu, so not on the chat page.) The left menu becomes a 64px rail of icons (Home, Popular, News, Explore, then your communities, favourites first). The menu button expands it to show names. The choice is remembered.
- **Lightbox.** Clicking a card opens the post with its threaded comments. `J` / `K` or the arrow keys move between posts, `Esc` closes, and ctrl-click opens a post in a new tab as usual. Subreddit and user names are normal links.
- **Opening is quicker.** Hovering a card briefly pre-loads its comments.
- **Voting.** Votes on cards are sent to Reddit with your signed-in session, shown at once, and undone with a message if Reddit refuses. If Reddit rejects the session token, the script fetches a fresh one and tries once more.
- **NSFW.** Posts marked 18+ get no thumbnail or text preview on the card, and their media is hidden behind a click in the lightbox. Communities marked 18+ get a plain letter in the rail instead of their icon.
- **Sort bar.** Best, Hot, New, Top and Rising tabs at the top centre of the feed (no Best inside communities). They are plain links to Reddit's own sort pages.
- **Image zoom.** Clicking an image in the lightbox opens it full screen; click again for full size with scrolling. Esc closes the image first, then the post.
- **User hover card.** Hover (or tab to) a username on a card or in the lightbox for their join date, how long they have been on Reddit, post and comment karma and bio, with **Follow** (subscribes to their profile; undone with a message if Reddit refuses), **Start chat** (does what Reddit's own chat link does: asks Reddit's chat panel to open the conversation at /user/NAME, so the docked panel opens on that person (if the panel has not been started yet the script calls it a second time once it is running, because a panel that is still starting shows your pending chat invite instead); if the panel is not on the page or refuses, the chat page opens in a new tab). Always offered: the public data cannot tell whether someone accepts chats, so the script no longer claims it) and **View profile**. For 18+ profiles the picture and bio are hidden.
- **Save, Hide and the "..." menu on every card.** Hide keeps the card in its place as a greyed placeholder with Undo, so nothing moves. The menu has Save, Hide, Follow post, Copy link, Open on Reddit and Report (opens the post on Reddit). These use Reddit's own `/api/` endpoints with your signed-in session; if Reddit refuses, the change is undone and the reason is shown.
- **Comments in the lightbox.** Upvote, downvote, save and reply on any comment, plus an Add a comment box for the post. Replies are posted as you through Reddit.
- **Community details.** On a community page, **About and rules** opens a side panel with the description, members, created date, community bookmarks, the rules (click to expand) and the full sidebar text. **Flairs** lists the community's flairs, and flair chips on cards are links that filter the feed with Reddit's own `?f=flair_name:"..."` address. An active filter shows as a chip you can click to clear.
- **Saved posts in gold.** A saved post gets a gold bookmark and a gold outline. Posts you saved earlier are picked up from your saved list (`/user/NAME/saved.json`, up to 300).
- **Vote colours.** An upvoted post gets a green arrow and a green outline; a downvoted one gets a red arrow and a red outline (saved posts keep a gold ring outside). Earlier votes are read from your own upvoted and downvoted lists (up to 200 each).
- **Actions inside the lightbox post.** Upvote, downvote, Save, Copy link and Hide sit in a bar pinned to the top of the post while its text scrolls, and stay in step with the card behind. Hide moves on to the next post. The separate comment-count pill is gone (the comments column shows it).
- **Coloured comment threads.** Each reply level has its own colour on the thread line (blue, red, green, gold, purple, orange, then repeating).
- **Community bar.** On a community page the bar now holds Create post (with a plus), About and rules, Flairs, Join / Joined and a "..." menu (add to favourites, add to a custom feed, copy link, open on Reddit). Reddit's own Create post, Join and "..." in the header are hidden because these replace them. Muting a community is not available here yet.
- **Reading-order guide.** A faint line with a few arrows at its left sits between rows of cards, so it is clear where each new row starts.
- **Home button opens Hot.** The Home icon in the left rail goes to /hot/ (your subscribed communities, sorted Hot). Switch it back to Reddit's own home from the Violentmonkey menu ("Home button opens").
- **One sort control.** Reddit's own sort dropdowns are hidden on feed pages. The sort bar highlights your current sort even when the address has none, and choosing Top shows a second bar: Now, Today, This Week, This Month, This Year, All Time.
- **Posting a comment.** After you post, a green line says "Comment posted", the new comment appears at once (highlighted for a moment) and the comment count goes up. If Reddit refuses, the reason shows both under the box and in the status line, and your text stays. If Reddit does not send a copy back, your own words are shown with a note to refresh.
- **Notifications dropdown.** The bell in the bar (and Reddit's own bell in the header) opens a dropdown of your classic inbox: replies, mentions and messages with unread dots. Clicking one marks it read on Reddit and opens the post in the lightbox; "Mark all read" is there too (it marks the unread items by name, because Reddit rate-limits its read-all call; if Reddit says slow down it waits and tries once more, and if it still fails the dots come back and the reason is shown). The text is larger than the rest of the script. It does not cover Reddit's newer alerts (trending, new post in a community); the footer links to Reddit's full page. Switch it off from the Violentmonkey menu if you prefer Reddit's own.
- **Create post inside the page.** The Create post button opens a form for text and link posts (community, title, text or link, flair if the community has them, NSFW and spoiler). Errors from Reddit are shown and your text is kept; a post is never sent twice automatically. Images and polls still need Reddit's own form (link at the bottom of the dialog).
- **Mute and "show fewer" (this script only).** The card "..." menu and the community "..." menu can hide a community from your feed here. It is not sent to Reddit and does not change what Reddit shows elsewhere. A "Muted (N)" button in the bar lists them for unmuting. Reddit's own "Show fewer posts like this" and Mute are not available to scripts as far as I know.
- **Award.** The card menu has "Give an award", which opens the post on Reddit. The script never spends your coins.
- **Lexend font.** All the script's own screens and the rest of the page use Lexend. The first time, the script downloads Lexend (an open font) from Google Fonts: one request to fonts.googleapis.com for the font list and one to fonts.gstatic.com for the Latin file (about 40 KB). It is then kept in the script's own storage and added to the page, so later page loads need no network. A copy of Lexend installed on your PC is also tried, and if neither works the normal fonts are used (the Violentmonkey diagnostics show "font="). Parts of Reddit drawn inside its own components may keep Reddit's font. Switch it off from the Violentmonkey menu ("Font Lexend").
- **Quick start.** Which posts you saved or voted on is remembered between visits, so cards show their gold or green/red state on the first paint, then it is refreshed from Reddit in the background. Reddit's own post-detail requests (which it refuses) are no longer tried.
- **Look.** Stronger buttons (purple with a gold Create post link and a gold active sort tab), and on community pages the banner fades into the page (a mask on Reddit's own banner image).
- **Create post** is a link to Reddit's submit page for that community, not an inline form.
- **Suggested communities.** Hidden by default; a small "Suggested communities" button above the cards shows or hides the strip.
- **Safe fallback.** If the cards cannot be drawn, the script goes back to showing Reddit's own cards in a plain grid and says why in the diagnostics.

Not yet: image and poll posts, Reddit's own Mute and "Show fewer posts like this", and the newer alert types in the dropdown. Reddit's header, profile menu and chat are left alone.

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

Nothing is sent anywhere except to Reddit itself, apart from the one-off Lexend font download from Google Fonts described above. The script requests public data addresses on `www.reddit.com` from your own browser, using your normal Reddit login: optional extra post details (`/by_id/`, `/api/info`; Reddit currently refuses these, and cards do not need them), a post's comments (`<post>.json`), your community list (`/subreddits/mine/subscriber.json`), the account age and karma of a user you hover (`/user/NAME/about.json`), and for a community page its `about.json`, `about/rules.json`, `api/widgets` and `api/link_flair_v2.json`. It stores only its on/off settings and whether the rail is expanded.

## Layout of this repository

- `reddit-lightbox-feed.user.js` is the script.
- `design/mockup.html` is the interactive design mock-up (made-up sample data).
- `docs/reddit-dom-notes.md` records what was learned about Reddit's page structure.

## Releasing a change

Edit the script, raise `@version`, merge to `main`. Violentmonkey picks it up on its next update check.
