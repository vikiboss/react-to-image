# React to Image

[WIP] A Node.js server leveraging [Puppeteer](https://pptr.dev/) for capturing and returning screenshots of [React](https://react.dev/) components, with seamless [UnoCSS](https://unocss.dev/) integration.

![screenshot](./docs/demo.png)

The Component is looks like this:

```tsx
import React from "react";

interface TestComponentProps {
	name: string;
	list: string[];
}

export function TestComponent(props: TestComponentProps) {
	return (
		<div>
			<h1 className="text-3xl text-amber-6">{props.name}</h1>
			<ul>
				{props.list.map((item, index) => (
					<li key={item}>
						Item {index + 1}: {item}
					</li>
				))}
			</ul>
		</div>
	);
}
```

## Usage

```bash
pnpm install && pnpm build && pnpm start
# or use `esno` to run TS directly
pnpm install && pnpm dev
```

## API

### `POST https://localhost:8080/create`

Create a screenshot of a React component.

#### Request

```jsonc
{
  // The name of the component, in PascalCase
  "component": "TestComponent", 

  // The props to pass to the component
  "props": {
    "name": "hello",
    "list": ["test", "lol"]
  }
}
```

You can add more components by adding more `React Pure Components` in `src/components`.

> TODO: Add more endpoints.

#### Response

An image file.

## License

MIT
