/* eslint-env node */

import { join } from "node:path";
import { readdirSync, readFileSync } from "node:fs";
import * as beautify from "https://cdnjs.cloudflare.com/ajax/libs/js-beautify/1.15.1/beautify-html.js";

const __dirname = new URL(".", import.meta.url).pathname;

function readFile(filePath) {
  return readFileSync(filePath, { encoding: "utf-8" }).trim();
}

function readJSON(jsonPath) {
  return JSON.parse(readFile(jsonPath));
}

const testPageRoot = join(__dirname, "test-pages");

export const getTestPages = function () {
  return readdirSync(testPageRoot).map(function (dir) {
    return {
      dir: dir,
      source: readFile(join(testPageRoot, dir, "source.html")),
      expectedContent: readFile(join(testPageRoot, dir, "expected.html")),
      expectedMetadata: readJSON(
        join(testPageRoot, dir, "expected-metadata.json"),
      ),
    };
  });
};

export const prettyPrint = function (html) {
  return beautify.html_beautify(html);
};
