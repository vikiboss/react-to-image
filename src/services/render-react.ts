import * as puppeteer from "puppeteer";
import { renderToString } from "react-dom/server";

import type * as React from "react";
import { fromDirname } from "../utils";

interface RenderOptions {
	width?: number;
	height?: number;
	selector?: string;
	unocss?: object | boolean;
	deviceScaleFactor?: number;
}

export async function renderReactComponentToImage(
	Component: React.ReactNode,
	options: RenderOptions = {},
) {
	const {
		width,
		height = 800,
		selector = "#content",
		unocss = true,
		deviceScaleFactor,
	} = options;

	const start = performance.now();
	const reactStart = start;
	const html = renderToString(Component);
	const reactEnd = performance.now();
	const reactTime = round(reactEnd - reactStart);

	const wrapper = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
${
	unocss
		? `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@unocss/reset@0.63.4/tailwind.min.css">
  <script src="https://cdn.jsdelivr.net/npm/@unocss/runtime@0.63.4/uno.global.js"></script>`
		: ""
}
</head>
  <body>
    <div id="content" class="inline-flex">${html}</div>
  </body>
</html>
  `;

	const launchStart = reactEnd;

	if (!global.browser) {
		global.browser = await puppeteer.launch({
			headless: true,
			userDataDir: fromDirname(import.meta, "./.browser-cache"),
			args: [
				"--no-sandbox",
				"--disable-setuid-sandbox",
				"--disable-gpu",
				"--disable-dev-shm-usage",
				"--no-first-run",
				"--no-zygote",
				"--single-process",
			],
		});
	}

	const page = await global.browser.newPage();
	const launchEnd = performance.now();
	const launchTime = round(launchEnd - launchStart);

	const useAutoWidth = !width;
	const useAutoHeight = !height;
	const _height = height || 800;
	const _width = width || Math.ceil(height / 0.618);
	const el = selector || "#content";

	await page.setViewport({
		width: useAutoWidth ? 12_000 : _height,
		height: useAutoHeight ? 12_000 : _width,
		deviceScaleFactor: deviceScaleFactor || 2,
	});

	const renderStart = launchEnd;
	await page.setContent(wrapper);
	const renderEnd = performance.now();
	const renderTime = round(renderEnd - renderStart);

	const waitStart = renderEnd;
	await page.waitForSelector(el);
	const waitEnd = performance.now();
	const waitTime = round(waitEnd - waitStart);

	const screenshotStart = waitEnd;
	const wrapperHandler = await page.$(el);
	const uint8Array = await (wrapperHandler || page).screenshot({
		type: "png",
		encoding: "binary",
		optimizeForSpeed: true,
	});
	const screenshotEnd = performance.now();
	const screenshotTime = round(screenshotEnd - screenshotStart);

	const totalTime = round(screenshotEnd - start);

	return {
		buffer: Buffer.from(uint8Array),
		timings: {
			react: reactTime,
			launch: launchTime,
			render: renderTime,
			wait: waitTime,
			screenshot: screenshotTime,
			total: totalTime,
		},
	};
}

function round(num: number) {
	return Math.round(num * 100) / 100;
}
