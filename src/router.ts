import fs from "node:fs";
import React from "react";
import Router from "@koa/router";
import { renderReactComponentToImage } from "./services/render-react";
import { fromDirname } from "./utils";

export const router = new Router();

const compPath = fromDirname(import.meta, "./components");

const compNames = fs
	.readdirSync(compPath, { withFileTypes: true })
	.filter((dirent) => dirent.isDirectory())
	.map((dirent) => dirent.name);

router.post("/create", async (ctx) => {
	const { component, props = {} } = ctx.request.body;

	if (!component || !compNames.includes(component)) {
		ctx.status = 404;
		ctx.body = component
			? `Component \`${component}\` is not found`
			: "`component` is required";
		return;
	}

	const module = await import(`./components/${component}/index.tsx`);
	const Component = module?.default || module;
	const node = React.createElement(Component, props);
	const imageBuffer = await renderReactComponentToImage(node);

	ctx.type = "image/png";
	ctx.body = imageBuffer.buffer;
});
