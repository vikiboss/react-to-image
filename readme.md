# React to Image

A Node.js server that use `puppeteer` to take a screenshot of a `React` component and return it.

## Usage

```bash
npm install
npm start
```

## API

### `POST /create`

Create a screenshot of a React component.

#### Request

```json
{
  "card": "test",
  "props": {
    "name": "hello",
    "list": ["test", "lol"]
  }
}
```

#### Response

An image file.

## License

MIT
