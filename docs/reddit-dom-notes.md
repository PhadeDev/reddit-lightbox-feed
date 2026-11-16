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

## Community page, measured 16/11/2026 (userscript off, viewport 2550 wide, compact view)

- Page chain: `shreddit-app` > `div.grid-container` (grid, columns `272px 2278px`) holding `flex-left-nav-container#left-sidebar-container` and `div#subgrid-container` (flex, max 2278px, padding 0 24px) > `div` (grid, columns `1890px 316px`, likely `.main-container`) holding `main#main-content` and `div#right-sidebar-container` (316px).
- `shreddit-feed` is `display:flex`. Its children, in order: `article` (one post), `hr`, `shreddit-ad-post`, `in-feed-community-recommendations` (the "Suggested communities" strip, a direct child), `faceplate-loader`, `achievement-events`, `faceplate-partial#partial-more-posts-...` with `slot=load-after`, `loading=programmatic`, `src=/svc/shreddit/community-more-posts/new/?after&t&name&ad_posts_served&n` (infinite scroll).
- `community-highlight-carousel` is a direct child of `main#main-content`, above the feed.
- Sort and view controls are `shreddit-sort-dropdown` elements (sort values BEST, HOT, NEW, TOP, RISING; view values `cardView`, `compactView`). The view one sits inside `shreddit-layout-event-setter`.
- Compact `shreddit-post` (text): light DOM `a[slot=full-post-link]`, `div[slot=thumbnail]` (with `div[data-testid=post-thumbnail]`; a text post shows an svg icon, not an image), `div[slot=credit-bar]` (author link inside `faceplate-hovercard`, `faceplate-timeago[ts]`), title and body in further slots. The vote bar (`rpl-action-bar`) and `shreddit-vote-animations` are in the post's shadow DOM.
- Left nav: `flex-left-nav-container#left-sidebar-container` (relative, 272 wide) > `div#flex-left-nav-container` (fixed) > `div#flex-left-nav-contents` > `reddit-sidebar-nav#left-sidebar` > `nav[aria-label=Primary]` > `left-nav-top-section` (shadow DOM: `li#home-posts`, `#popular-posts`, `#news-posts`, `#explore-communities`), then games and multireddit sections, then 203 `left-nav-community-item` (each with a `shreddit-favorite-button`). Reddit's own collapse button is `button#flex-nav-collapse-button`.
- Header: `nav.h-header-large` (56px high) holds the logo, `reddit-search-large` (shadow DOM) and the right-hand group: `a#advertise-button`, `reddit-chat-header-button` (shadow DOM, contains `button#header-action-item-chat-button`), then create post, inbox and the account menu.
- Theme variables on `html.theme-dark`: `--color-neutral-background:#0E1113`, `--color-neutral-content:#B7CAD4`, `--color-neutral-background-strong:#181C1F`, `--color-primary:#648EFC` and others. Not used by the script, which carries its own palette.
- Not yet captured: how the community banner and title block above the feed are built, NSFW posts in the feed, card-view posts on the home page.

## Data the script uses

- `/by_id/t3_a,t3_b.json?raw_json=1` (up to 60 ids per request): everything needed for a card (title, selftext, flair, over_18, spoiler, is_gallery, gallery media_metadata, preview images, score, likes, num_comments, permalink).
- `/subreddits/mine/subscriber.json?limit=100` (paged with `after`): the community list for the rail. Untested live.

## Open questions

- Where the sidebar lives on feed pages (the script tries `#right-sidebar-container`).
- Which element carries the bell's unread badge.
- Whether the comments button inside a card is an `a` or a `button` (the script accepts either, matching on its label).

## Live findings, 16/11/2026 (v0.2.0 diagnostics)

- `/by_id/...json` answered **HTTP 403** from the page (logged in). Cards are therefore built from `shreddit-post` attributes (`post-title`, `score`, `comment-count`, `created-timestamp`, `permalink`, `subreddit-name`, `post-type`, `domain`) and light-DOM slots (thumbnail, flair, text body). `/api/info.json` is tried as an alternative and recorded in diagnostics.
- `/subreddits/mine/subscriber.json` worked: 203 communities loaded for the rail.
- With the rail on, the grid became `64px 2986px` and the feed spanned the full width, so the grid overrides work.
- Whether a post carries an NSFW attribute is unconfirmed; "Copy diagnostics" now lists the first post's attribute names.

## Community header, measured 16/11/2026

- First div in `#subgrid-container` (about 200px high) holds `div#subreddit-banner-img` (192px high, full width) and a `section` with the avatar and title (88px, starts about 36px above the banner bottom) plus `create-post-entry-point-wrapper` and `shreddit-subreddit-header-buttons`.
- The script fades the banner with a CSS mask on `#subreddit-banner-img` (community pages only).
- `/api/save` answered HTTP 500 once from the page; save-type actions now retry once after a short wait.
