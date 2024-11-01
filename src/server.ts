import fs from "node:fs";
import Koa from "koa";
import React from "react";
import Router from "@koa/router";
import bodyParser from "@koa/bodyparser";
import { renderReactComponentToImage } from "./render-react";

const router = new Router();
const app = new Koa();

app.use(bodyParser());

const cards = fs
	.readdirSync("./src/cards", { withFileTypes: true })
	.filter((dirent) => dirent.isDirectory())
	.map((dirent) => dirent.name);

router.post("/create", async (ctx) => {
	const { card, props = {} } = ctx.request.body;

	if (!card || !cards.includes(card)) {
		ctx.status = 404;
		ctx.body = "Card not found";
		return;
	}

	const Component = await import(`./cards/${card}/index.tsx`);
	const node = React.createElement(Component?.default || Component, props);
	const imageBuffer = await renderReactComponentToImage(node);
	ctx.type = "image/png";
	ctx.body = imageBuffer.buffer;
});

app.use(router.routes()).use(router.allowedMethods());

const PORT = 8080;

app.listen(PORT, () => {
	console.log(`Server is running on http://localhost:${PORT}`);
});
