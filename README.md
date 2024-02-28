# Readenobility.js

An implementation of the standalone version of the readability library used for
[Firefox Reader View](https://support.mozilla.org/kb/firefox-reader-view-clutter-free-web-pages)
for Deno. Implemented with Deno/TypeScript.

## Installation

@TODO

## Basic usage

To parse a document, you must create a new `Readability` object from a DOM
document object, and then call the [`parse()`](#parse) method. Here's an
example:

```javascript
var article = new Readability(document).parse();
```

## Deno usage

Readenobility relies on external libraries like
[deno-dom](https://github.com/b-fuze/deno-dom). Here's an example using
`deno-dom` to obtain a DOM document object:

```js
import "https://deno.land/x/readenobility@$MODULE_VERSION/mod.ts";
import { DOMParser } from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";
const doc = new DOMParser().parseFromString(
  `
  <h1>Hello World!</h1>
  <p>Hello from <a href="https://deno.land/">Deno!</a></p>
`,
  "text/html",
)!;
let reader = new Readability(document);
let article = reader.parse();
```

Remember to pass the page's URI as the `url` option in the `deno-dom`
`parseFrag` (as shown in the example above), so that Readability can convert
relative URLs for images, hyperlinks, etc. to their absolute counterparts.

## API Reference

### `new Readability(document, options)`

The `options` object accepts a number of properties, all optional:

- `debug` (boolean, default `false`): whether to enable logging.
- `maxElemsToParse` (number, default `0` i.e. no limit): the maximum number of
  elements to parse.
- `nbTopCandidates` (number, default `5`): the number of top candidates to
  consider when analysing how tight the competition is among candidates.
- `charThreshold` (number, default `500`): the number of characters an article
  must have in order to return a result.
- `classesToPreserve` (array): a set of classes to preserve on HTML elements
  when the `keepClasses` options is set to `false`.
- `keepClasses` (boolean, default `false`): whether to preserve all classes on
  HTML elements. When set to `false` only classes specified in the
  `classesToPreserve` array are kept.
- `disableJSONLD` (boolean, default `false`): when extracting page metadata,
  Readability gives precedence to Schema.org fields specified in the JSON-LD
  format. Set this option to `true` to skip JSON-LD parsing.
- `serializer` (function, default `el => el.innerHTML`) controls how the
  `content` property returned by the `parse()` method is produced from the root
  DOM element. It may be useful to specify the `serializer` as the identity
  function (`el => el`) to obtain a DOM element instead of a string for
  `content` if you plan to process it further.
- `allowedVideoRegex` (RegExp, default `undefined` ): a regular expression that
  matches video URLs that should be allowed to be included in the article
  content. If `undefined`, the
  [default regex](https://github.com/mozilla/readability/blob/8e8ec27cd2013940bc6f3cc609de10e35a1d9d86/Readability.js#L133)
  is applied.

### `parse()`

Returns an object containing the following properties:

- `title`: article title;
- `content`: HTML string of processed article content;
- `textContent`: text content of the article, with all the HTML tags removed;
- `length`: length of an article, in characters;
- `excerpt`: article description, or short excerpt from the content;
- `byline`: author metadata;
- `dir`: content direction;
- `siteName`: name of the site;
- `lang`: content language;
- `publishedTime`: published time;

The `parse()` method works by modifying the DOM. This removes some elements in
the web page, which may be undesirable. You can avoid this by passing the clone
of the `document` object to the `Readability` constructor:

```js
var documentClone = document.cloneNode(true);
var article = new Readability(documentClone).parse();
```

### `isProbablyReaderable(document, options)`

A quick-and-dirty way of figuring out if it's plausible that the contents of a
given document are suitable for processing with Readability. It is likely to
produce both false positives and false negatives. The reason it exists is to
avoid bogging down a time-sensitive process (like loading and showing the user a
webpage) with the complex logic in the core of Readability. Improvements to its
logic (while not deteriorating its performance) are very welcome.

The `options` object accepts a number of properties, all optional:

- `minContentLength` (number, default `140`): the minimum node content length
  used to decide if the document is readerable;
- `minScore` (number, default `20`): the minimum cumulated 'score' used to
  determine if the document is readerable;
- `visibilityChecker` (function, default `isNodeVisible`): the function used to
  determine if a node is visible;

The function returns a boolean corresponding to whether or not we suspect
`Readability.parse()` will succeed at returning an article object. Here's an
example:

```js
/*
    Only instantiate Readability  if we suspect
    the `parse()` method will produce a meaningful result.
*/
if (isProbablyReaderable(document)) {
  let article = new Readability(document).parse();
}
```
