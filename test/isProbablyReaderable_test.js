/* eslint-env node, mocha */

import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";
import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.217.0/assert/mod.ts";
import { getTestPages } from "./utils.js";
import { isProbablyReaderable } from "../index.js";

const testPages = getTestPages();

Deno.test("isProbablyReaderable - test pages", function () {
  testPages.forEach(function (testPage) {
    const uri = "http://fakehost/test/page.html";
    Deno.test(testPage.dir, function () {
      const doc = new DOMParser().parseFrag(testPage.source, uri);
      const expected = testPage.expectedMetadata.readerable;
      Deno.test(
        "The result should " + (expected ? "" : "not ") + "be readerable",
        function () {
          assertEquals(isProbablyReaderable(doc), expected);
        },
      );
    });
  });
});

Deno.test("isProbablyReaderable", function () {
  const makeDoc = (source) =>
    new DOMParser().parseFromString(source, "text/html");
  const verySmallDoc = makeDoc('<html><p id="main">hello there</p></html>'); // content length: 11
  const smallDoc = makeDoc(
    `<html><p id="main">${"hello there ".repeat(11)}</p></html>`,
  ); // content length: 132
  const largeDoc = makeDoc(
    `<html><p id="main">${"hello there ".repeat(12)}</p></html>`,
  ); // content length: 144
  const veryLargeDoc = makeDoc(
    `<html><p id="main">${"hello there ".repeat(50)}</p></html>`,
  ); // content length: 600

  Deno.test("should only declare large documents as readerable when default options", function () {
    assertNotEquals(isProbablyReaderable(verySmallDoc), "very small doc"); // score: 0
    assertNotEquals(isProbablyReaderable(smallDoc), "small doc"); // score: 0
    assertNotEquals(isProbablyReaderable(largeDoc), "large doc"); // score: ~1.7
    assertEquals(isProbablyReaderable(veryLargeDoc), "very large doc"); // score: ~21.4
  });

  Deno.test("should declare small and large documents as readerable when lower minContentLength", function () {
    const options = { minContentLength: 120, minScore: 0 };
    assertNotEquals(
      isProbablyReaderable(verySmallDoc, options),
      "very small doc",
    );
    assertEquals(isProbablyReaderable(smallDoc, options), "small doc");
    assertEquals(isProbablyReaderable(largeDoc, options), "large doc");
    assertEquals(isProbablyReaderable(veryLargeDoc, options), "very large doc");
  });

  Deno.test("should only declare largest document as readerable when higher minContentLength", function () {
    const options = { minContentLength: 200, minScore: 0 };
    assertNotEquals(
      isProbablyReaderable(verySmallDoc, options),
      "very small doc",
    );
    assertNotEquals(isProbablyReaderable(smallDoc, options), "small doc");
    assertNotEquals(isProbablyReaderable(largeDoc, options), "large doc");
    assertEquals(isProbablyReaderable(veryLargeDoc, options), "very large doc");
  });

  Deno.test("should declare small and large documents as readerable when lower minScore", function () {
    const options = { minContentLength: 0, minScore: 4 };
    assertNotEquals(
      isProbablyReaderable(verySmallDoc, options),
      "very small doc",
    ); // score: ~3.3
    assertEquals(isProbablyReaderable(smallDoc, options), "small doc"); // score: ~11.4
    assertEquals(isProbablyReaderable(largeDoc, options), "large doc"); // score: ~11.9
    assertEquals(isProbablyReaderable(veryLargeDoc, options), "very large doc"); // score: ~24.4
  });

  Deno.test("should declare large documents as readerable when higher minScore", function () {
    const options = { minContentLength: 0, minScore: 11.5 };
    assertNotEquals(
      isProbablyReaderable(verySmallDoc, options),
      "very small doc",
    ); // score: ~3.3
    assertNotEquals(isProbablyReaderable(smallDoc, options), "small doc"); // score: ~11.4
    assertEquals(isProbablyReaderable(largeDoc, options), "large doc"); // score: ~11.9
    assertEquals(isProbablyReaderable(veryLargeDoc, options), "very large doc"); // score: ~24.4
  });

  Deno.test("should use node visibility checker provided as option - not visible", function () {
    const called = false;
    const options = {
      visibilityChecker() {
        called = true;
        return false;
      },
    };
    assertNotEquals(isProbablyReaderable(veryLargeDoc, options));
    assertEquals(called);
  });

  Deno.test("should use node visibility checker provided as option - visible", function () {
    const called = false;
    const options = {
      visibilityChecker() {
        called = true;
        return true;
      },
    };
    assertEquals(isProbablyReaderable(veryLargeDoc, options));
    assertEquals(called);
  });

  Deno.test("should use node visibility checker provided as parameter - not visible", function () {
    const called = false;
    const visibilityChecker = () => {
      called = true;
      return false;
    };
    assertNotEquals(isProbablyReaderable(veryLargeDoc, visibilityChecker));
    assertEquals(called);
  });

  Deno.test("should use node visibility checker provided as parameter - visible", function () {
    const called = false;
    const visibilityChecker = () => {
      called = true;
      return true;
    };
    assertEquals(isProbablyReaderable(veryLargeDoc, visibilityChecker));
    assertEquals(called);
  });
});
