<img src="assets/supports-26.3.png" alt="Supports Minecraft 26.3" width="152"> <img src="assets/100-ai-slop.png" alt="100% AI-Slop" width="152"> <img src="assets/please-redo.png" alt="Please redo" width="152">
# Mapartcraft

**Mapartcraft** is a standalone web app for Minecraft **map art**: it builds **schematic-style NBT** and **map.dat** data from an image, in the browser. It is based on **[a fork of](https://github.com/azkich/mapart)** the well-known project **[MapartCraft](https://github.com/rebane2001/mapartcraft)** by rebane2001 (GPL-3.0 upstream). This repository keeps that lineage and credits the original; see [rebane2001/mapartcraft](https://github.com/rebane2001/mapartcraft) for the classic upstream README, issue tracker, and full history. 

This version attempts to reimagine the concept of Mapartcraft UI and adds new features, listed in the [what changed](#what-changed) section.

**[https://mhamsterr.github.io/mapart/](https://mhamsterr.github.io/mapart/)**

---

## Requirements

- **Node.js** and **npm** (Create React App).
- Optional: **Python 3** for scripts under `tools/` (same idea as upstream).
- Optional: **ImageMagick** if you use tooling that regenerates `src/images/textures.png` (see upstream `tools/` docs).

---

## Building and running locally

```bash
npm install
npm start          # development server
npm run build      # production build in `build/`
```

On Linux you can still use `build.sh` if you deploy behind Apache; it may copy `buildSources/apache/.htaccess` into `build/` when `apache2` is available.

For **local development**, `.env.development` sets `PUBLIC_URL=` so you open **`http://localhost:3000/`** at the site root. **Production** uses **`homepage`** in `package.json` (currently **`https://mhamsterr.github.io/mapart/`**) so JS/CSS and Open Graph URLs match GitHub Pages for repo **`azkich/mapart`**. The UI is a **single page** (mapart tool only).


---

## What changed:
In plain terms, this fork is still the same kind of tool (upload image → pick blocks and options → preview → download), but several areas were reworked:

### This fork:

1. **Tool zones**  
   Tool zones are a way to adjust colours and dithering in parts of mapart. Now you can apply colour corrections to multiple parts of a mapart simultaneously. This can be useful if, for example, one part of a mapart looks good initially, while colours on the other parts look smudged or "glitched" or even faded. Just draw a zone and configure it. Staircasing can't be set per zone yet.

2. **UI changes**  
   UI has been redesigned. Now, since the focus has been moved to a Map Preview part, the main work area is the left half of the screen, while all the tools ("Settings", "Zones", "Block Selection", "Materials") have been moved to the right and made collapsible. 

If you don't want all of this, consider using the [parent repo](https://github.com/azkich/mapart).


### azkich/mapart:

1. **Language**  
   The interface is oriented toward **English**.

2. **New better colour methods**  
   Names in the “better colour” / distance dropdown were **renamed and clarified** (for example default vs Euclidean “better colour off”, and starred labels for some advanced metrics) so the list is easier to scan.

3. **Export palette improvement**  
   Example: the **export palette** tooltip explains that you **choose a file format** (paint.net, GIMP, Photoshop, etc.) before download, not only Paint.NET.

4. **Performance in the map preview worker**  
   Refactoring and optimization of per-pixel calculations for the CPU have been performed. Redundant operations have been removed, data locality has been improved, and the number of branches has been reduced.

5. **Color scheme**  
   With just a few clicks, users can now select their favorite colour blocks from the palette and effortlessly generate a stunning image infused with the exact shades and tones of their chosen blocks.

6. **Transparency**  
   Now you can create stunning transparent maparts with ease. Simply select your image and fine-tune the transparency threshold to achieve the perfect balance.

If you need behaviour or credits from the **original** MapartCraft, always refer to **[rebane2001/mapartcraft](https://github.com/rebane2001/mapartcraft)**.

---

## Credits / thanks

- **[rebane2001/mapartcraft](https://github.com/rebane2001/mapartcraft)** — original MapartCraft design, features, and community.
- Minecraft for block-related assets as in upstream.
- **KenPixel Mini Square** font (Kenney), **pako**, **jszip**, **OpenMoji** flags, and other acknowledgements as in the upstream project.
- Upstream and fork **contributors**; see the GitHub graphs on the original repo for the full list.
- HerobrainGamer for modern version blocks (1.21.X, 26.2, 26.3).

Upstream project page: [https://github.com/rebane2001/mapartcraft](https://github.com/rebane2001/mapartcraft).
