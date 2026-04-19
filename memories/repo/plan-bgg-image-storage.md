# Plan: Self-hosted BGG board game images

**Status:** Ready to implement. Backend first, then frontend.
**Date:** 2026-04-20

## Key discovery

BGG API now requires a token. Current code (`BoardGameEndpoints.GetDetail`) calls
`https://boardgamegeek.com/xmlapi2/thing?id={bggId}&stats=1` without auth — this needs updating before any of the below works.

## Backend (House)

1. **New service `BoardGameImageStorage.cs`**
   - Blob container: `boardgame-images`, public access
   - Uses SkiaSharp like existing `EventImageStorage`/`AuctionImageStorage`
   - `UploadAsync(int bggId, byte[] imageData, CancellationToken)` → `(string imageUrl, string thumbnailUrl)`
   - Full-size: max 1200px, JPEG 85%, stored at `{bggId}/image.jpg`
   - Thumbnail: max 200px, JPEG 80%, stored at `{bggId}/thumb.jpg`
   - Overwrite by bggId (no cleanup needed)

2. **Register in `Program.cs`**
   - `builder.Services.AddSingleton<BoardGameImageStorage>()`

3. **Update `BoardGameEndpoints.GetDetail()`**
   - After BGG XML fetch, download the `<image>` URL bytes
   - Call `BoardGameImageStorage.UploadAsync`, store returned blob URLs in `game.ThumbnailUrl` / `game.ImageUrl`
   - Graceful fallback if image download fails (keep existing URLs)

4. **Add BGG API authentication**
   - Figure out current BGG auth mechanism (API key header? query param? OAuth?)
   - Wire token into the `GetDetail` HTTP call
   - Store token in app configuration (user secrets / env var)

5. **Add `ImageUrl` to search endpoint**
   - Add `"ImageUrl"` column to the trigram search SQL SELECT
   - Add `public string? ImageUrl { get; set; }` to `BoardGameSearchResult`

## Frontend (Poirot)

1. **`BggSearchInput.vue`**
   - Store `imageUrl` in game entry object alongside `thumbnailUrl` (from search results)
   - Card image uses `game.thumbnailUrl || game.imageUrl` (prefer our thumbnail)

2. **Lightbox for full-size image**
   - Click card thumbnail → fixed overlay with dark backdrop
   - Shows `game.imageUrl || game.thumbnailUrl` centered at full size
   - Close on click-outside or × button
   - Minimal — no library, just a simple Vue component or inline template

## Notes

- **No migration needed** — `ThumbnailUrl` and `ImageUrl` columns already exist on `BoardGame`
- After this, stored values change from external BGG URLs to our own blob URLs
- 7-day TTL re-fetch in `GetDetail` will re-download and re-upload (handles BGG image updates)
- Games not yet detail-fetched may still have BGG URLs or nulls — fallback chain handles this
