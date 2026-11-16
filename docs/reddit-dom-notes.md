# Reddit DOM notes

Measured on 15/11/2026 from a logged-in desktop session (viewport 2550 x 1302), "modern" web design. These are observations, not a contract. Reddit changes its markup without notice, so re-check anything that stops working.

## Feed

- Each post is a `shreddit-post` element (a web component with a shadow DOM). The feed is `shreddit-feed`, holding `article` elements.
- Useful attributes on `shreddit-post`: `permalink` (no trailing slash or slug), `content-href`, `comment-count`, `created-timestamp`, `domain`, `id` (`t3_...`), `post-title`, `post-type` (seen: `text`, `image`, `gallery`, `video`, `link`, `crosspost`), `score`, `upvote-ratio`, `subreddit-prefixed-name`, `subreddit-name`, `author`, `icon`, `view-type` (`cardView`), `feedindex`.
- Light-DOM children are slotted: `a[slot=full-post-link]` (an overlay link covering the card), `a[slot=title]`, `shreddit-post-flair[slot=post-flair]`, `div[slot=post-media-container]`, `div[slot=ssr-post-content-header]`, `span[slot=credit-bar]`.
- Promoted posts are `shreddit-ad-post` elements (5 seen). There is also `shreddit-sidebar-ad`.
- Width chain, post to top: `article` 732, `shreddit-feed` 732, `main#main-content` 732, `div.main-container` 1072, `div#subgrid-container` 1120, `div.grid-container` 2550, `shreddit-app` 2550.

## Header

Right-hand controls: `#advertise-button`, `#header-action-item-chat-button`, `#create-post` (an `a`), `#notifications-inbox-...` (an `a` to `/notifications`), `#expand-user-drawer-button...`. The account menu is a drawer. All left as Reddit's own.

## User hover card

- A `faceplate-hovercard` containing a `div.p-md` (about 352 x 430).
- Start Chat is `a[data-testid=private-chat-button]` with `href` `https://chat.reddit.com/user/NAME` and `target=_blank`.
- Follow is `button.follow-button[data-testid=follow-button]`, Reddit's own handler. Following from a script would need a write to the account and has not been tested.
- Public profile data: `/user/NAME/about.json` has `name`, `created_utc`, `link_karma`, `comment_karma`, `total_karma`, `icon_img`, `snoovatar_img`, `is_friend`, `accept_chats`, `accept_followers`.

## Chat

- Not an iframe. It is `reddit-chat-host` with `rs-app`, `rs-rooms-nav`, `rs-room` and others, inside a shadow DOM.
- The panel is a fixed-position container (about 634 x 507, `z-index: 1`) at the bottom right of `shreddit-app`.
- Because it is in a shadow DOM, page CSS cannot reach inside it. Do not restyle its host or set global CSS variables it may inherit.

## Notifications

- `/message/inbox.json?limit=N` returns JSON. Items seen: `t1` with `type` `comment_reply`, and fields including `author`, `subreddit_name_prefixed`, `link_title`, `body`, `body_html`, `context`, `new`, `created_utc`, `was_comment`. It does not obviously cover "trending" or "new post in community" alerts.
- `/api/me.json` includes `inbox_count` (old-style unread count, 58 at the time) and `has_mail`. This is not necessarily the number on the bell.
- `/svc/shreddit/notifications-inbox-content/20/route` returns a whole 327 KB page with only two `rpl-inbox-row` elements (`data-testid` `title`, `body`, `sent-at`), so it is not a clean list.
- `/svc/shreddit/header-action-item-inbox` also returns a whole page with no badge number.

## Comments for the lightbox

`<permalink>.json?limit=300&raw_json=1` returns `[postListing, commentListing]`. Comment `t1` items carry `author`, `body_html`, `score`, `created_utc`, `is_submitter`, `distinguished`, `stickied`, `replies`. `more` items are shown as a link to the post on Reddit in v0.1.

## Open questions

- Where the sidebar lives on feed pages (the script tries `#right-sidebar-container`).
- Which element carries the bell's unread badge.
- Whether the comments button inside a card is an `a` or a `button` (the script accepts either, matching on its label).
