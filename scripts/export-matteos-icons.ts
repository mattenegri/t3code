import * as NodeFSP from "node:fs/promises";
import sharp from "sharp";
import { encodePngIco, WINDOWS_ICON_SIZES } from "./lib/icon-export.ts";

const assets = new URL("../assets/matteos/", import.meta.url);
const web = new URL("../apps/web/public/", import.meta.url);
const icon = await NodeFSP.readFile(new URL("t3m.svg", web), "utf8");
const wordmark = icon.match(/<g id="wordmark"[\s\S]*?<\/g>/)?.[0];
if (!wordmark) throw new Error("Missing T3m wordmark");

const raster = (svg: string, size: number) =>
  sharp(Buffer.from(svg), { density: 576 }).resize(size, size).png().toBuffer();
const adaptive = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <g transform="translate(64 64) scale(0.55) translate(-64 -64)">${wordmark}</g>
</svg>`;
const square = icon.replace(' rx="26"', "");
const widget = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="49" viewBox="4 40 120 49">
  ${wordmark}
</svg>\n`;
const widgetPath = new URL("../apps/mobile/assets/widget/T3Mark.svg", import.meta.url);
const background = square.replace(wordmark, "");
const splash = background.replace("</svg>", adaptive + "</svg>");
const macBody = await raster(icon, 824);
const mac = await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: "#00000000" },
})
  .composite([{ input: macBody }])
  .png()
  .toBuffer();

await NodeFSP.writeFile(widgetPath, widget);
await NodeFSP.writeFile(new URL("mac.png", assets), mac);
await NodeFSP.writeFile(
  new URL("icon.png", assets),
  await sharp(await raster(square, 1024))
    .removeAlpha()
    .png()
    .toBuffer(),
);
await NodeFSP.writeFile(new URL("desktop.png", assets), await raster(icon, 1024));
await NodeFSP.writeFile(new URL("adaptive.png", assets), await raster(adaptive, 432));
await NodeFSP.writeFile(
  new URL("notification.png", assets),
  await raster(adaptive.replace("#469bff", "#ffffff"), 96),
);
await NodeFSP.writeFile(new URL("splash.png", assets), await raster(splash, 1152));
await NodeFSP.writeFile(new URL("background.png", assets), await raster(background, 432));
const renditions = await Promise.all(
  WINDOWS_ICON_SIZES.map(async (size) => ({
    size,
    contents: await raster(icon, size),
  })),
);
await NodeFSP.writeFile(new URL("windows.ico", assets), encodePngIco(renditions));
await NodeFSP.writeFile(new URL("t3m-180.png", web), await raster(square, 180));
await NodeFSP.writeFile(new URL("t3m-512.png", web), await raster(square, 512));
