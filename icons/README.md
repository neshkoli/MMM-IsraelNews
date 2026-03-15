# Bundled News Source Icons

These icons are used by MMM-IsraelNews for reliable display of news source logos. They are loaded from disk (no network) so they never disappear.

## Supported Sources

| Domain | Icon File |
|--------|-----------|
| ynet.co.il | ynet.png |
| inn.co.il | inn.png |
| srugim.co.il | srugim.png |
| walla.co.il, rss.walla.co.il | walla.png |
| maariv.co.il | maariv.png |

## Adding a New Source

1. Add a PNG file (32x32 recommended) to this folder
2. Add the mapping in `icon-utils.js` in `BUNDLED_ICON_MAP`:
   ```javascript
   'newsite.co.il': 'newsite.png',
   ```

## Icon Format

- PNG format, 32x32 pixels recommended
- Transparent background works best
- Icons are displayed at 32x32 in the news ticker
