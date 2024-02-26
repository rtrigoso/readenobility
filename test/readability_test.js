/* eslint-env node, mocha */

import {
  assertArrayIncludes,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.217.0/assert/mod.ts";
import {
  returnsNext,
  stub,
} from "https://deno.land/std@0.217.0/testing/mock.ts";
import Readability from "../Readability.js";
import { getTestPages, prettyPrint } from "./utils.js";
import JSDOMParser from "../JSDOMParser.js";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";

const testPages = getTestPages();

function reformatError(err) {
  const formattedError = new Error(err.message);
  formattedError.stack = err.stack;
  return formattedError;
}

function inOrderTraverse(fromNode) {
  if (fromNode.firstChild) {
    return fromNode.firstChild;
  }
  while (fromNode && !fromNode.nextSibling) {
    fromNode = fromNode.parentNode;
  }
  return fromNode ? fromNode.nextSibling : null;
}

function inOrderIgnoreEmptyTextNodes(fromNode) {
  do {
    fromNode = inOrderTraverse(fromNode);
  } while (fromNode && fromNode.nodeType == 3 && !fromNode.textContent.trim());
  return fromNode;
}

function traverseDOM(callback, expectedDOM, actualDOM) {
  const actualNode = actualDOM.documentElement || actualDOM.childNodes[0];
  const expectedNode = expectedDOM.documentElement || expectedDOM.childNodes[0];
  while (actualNode || expectedNode) {
    // We'll stop if we don't have both actualNode and expectedNode
    if (!callback(actualNode, expectedNode)) {
      break;
    }
    actualNode = inOrderIgnoreEmptyTextNodes(actualNode);
    expectedNode = inOrderIgnoreEmptyTextNodes(expectedNode);
  }
}

// Collapse subsequent whitespace like HTML:
function htmlTransform(str) {
  return str.replace(/\s+/g, " ");
}

function runTestsWithItems(
  label,
  domGenerationFn,
  source,
  expectedContent,
  expectedMetadata,
) {
  Deno.test(label, function () {
    this.timeout(30000);

    let result;

    before(function () {
      try {
        const doc = domGenerationFn(source);
        // Provide one class name to preserve, which we know appears in a few
        // of the test documents.
        const myReader = new Readability(doc, {
          classesToPreserve: ["caption"],
        });
        result = myReader.parse();
      } catch (err) {
        throw reformatError(err);
      }
    });

    Deno.test("should return a result object", function () {
      assertArrayIncludes(result, ["content", "title", "excerpt", "byline"]);
    });

    Deno.test("should extract expected content", function () {
      function nodeStr(n) {
        if (!n) {
          return "(no node)";
        }
        if (n.nodeType == 3) {
          return "#text(" + htmlTransform(n.textContent) + ")";
        }
        if (n.nodeType != 1) {
          return "some other node type: " + n.nodeType + " with data " + n.data;
        }
        const rv = n.localName;
        if (n.id) {
          rv += "#" + n.id;
        }
        if (n.className) {
          rv += ".(" + n.className + ")";
        }
        return rv;
      }

      function genPath(node) {
        if (node.id) {
          return "#" + node.id;
        }
        if (node.tagName == "BODY") {
          return "body";
        }
        const parent = node.parentNode;
        const parentPath = genPath(parent);
        const index = Array.prototype.indexOf.call(parent.childNodes, node) + 1;
        return parentPath + " > " + nodeStr(node) + ":nth-child(" + index + ")";
      }

      function findableNodeDesc(node) {
        return genPath(node) + "(in: ``" + node.parentNode.innerHTML + "``)";
      }

      function attributesForNode(node) {
        return Array.from(node.attributes).map(function (attr) {
          return attr.name + "=" + attr.value;
        }).join(",");
      }

      const actualDOM = domGenerationFn(prettyPrint(result.content));
      const expectedDOM = domGenerationFn(prettyPrint(expectedContent));
      traverseDOM(
        function (actualNode, expectedNode) {
          if (actualNode && expectedNode) {
            const actualDesc = nodeStr(actualNode);
            const expectedDesc = nodeStr(expectedNode);
            if (actualDesc != expectedDesc) {
              assertEquals(
                actualDesc,
                findableNodeDesc(actualNode),
                expectedDesc,
              );
              return false;
            }
            // Compare text for text nodes:
            if (actualNode.nodeType == 3) {
              const actualText = htmlTransform(actualNode.textContent);
              const expectedText = htmlTransform(expectedNode.textContent);
              assertEquals(
                actualText,
                findableNodeDesc(actualNode),
                expectedText,
              );
              if (actualText != expectedText) {
                return false;
              }
              // Compare attributes for element nodes:
            } else if (actualNode.nodeType == 1) {
              const actualNodeDesc = attributesForNode(actualNode);
              const expectedNodeDesc = attributesForNode(expectedNode);
              const desc = "node " + nodeStr(actualNode) + " attributes (" +
                actualNodeDesc + ") should match (" + expectedNodeDesc + ") ";
              assertEquals(
                actualNode.attributes.length,
                desc,
                expectedNode.attributes.length,
              );
              for (let i = 0; i < actualNode.attributes.length; i++) {
                const attr = actualNode.attributes[i].name;
                const actualValue = actualNode.getAttribute(attr);
                const expectedValue = expectedNode.getAttribute(attr);
                assertEquals(
                  expectedValue,
                  "node (" + findableNodeDesc(actualNode) + ") attribute " +
                    attr + " should match",
                  actualValue,
                );
              }
            }
          } else {
            assertEquals(
              nodeStr(actualNode),
              "Should have a node from both DOMs",
              nodeStr(expectedNode),
            );
            return false;
          }
          return true;
        },
        actualDOM,
        expectedDOM,
      );
    });

    Deno.test("should extract expected title", function () {
      assertEquals(result.title, expectedMetadata.title);
    });

    Deno.test("should extract expected byline", function () {
      assertEquals(result.byline, expectedMetadata.byline);
    });

    Deno.test("should extract expected excerpt", function () {
      assertEquals(result.excerpt, expectedMetadata.excerpt);
    });

    Deno.test("should extract expected site name", function () {
      assertEquals(result.siteName, expectedMetadata.siteName);
    });

    expectedMetadata.dir &&
      Deno.test("should extract expected direction", function () {
        assertEquals(result.dir, expectedMetadata.dir);
      });

    expectedMetadata.lang &&
      Deno.test("should extract expected language", function () {
        assertEquals(result.lang, expectedMetadata.lang);
      });

    expectedMetadata.publishedTime &&
      Deno.test("should extract expected published time", function () {
        assertEquals(result.publishedTime, expectedMetadata.publishedTime);
      });
  });
}

function removeCommentNodesRecursively(node) {
  for (let i = node.childNodes.length - 1; i >= 0; i--) {
    const child = node.childNodes[i];
    if (child.nodeType === child.COMMENT_NODE) {
      node.removeChild(child);
    } else if (child.nodeType === child.ELEMENT_NODE) {
      removeCommentNodesRecursively(child);
    }
  }
}

Deno.test("Readability API", function () {
  Deno.test("#constructor", function () {
    const doc = new JSDOMParser().parse("<html><div>yo</div></html>");
    Deno.test("should accept a debug option", function () {
      assertEquals(new Readability(doc)._debug, false);
      assertEquals(new Readability(doc, { debug: true })._debug, true);
    });

    Deno.test("should accept a nbTopCandidates option", function () {
      assertEquals(new Readability(doc)._nbTopCandidates, 5);
      assertEquals(
        new Readability(doc, { nbTopCandidates: 42 })._nbTopCandidates,
        42,
      );
    });

    Deno.test("should accept a maxElemsToParse option", function () {
      assertEquals(new Readability(doc)._maxElemsToParse, 0);
      assertEquals(
        new Readability(doc, { maxElemsToParse: 42 })._maxElemsToParse,
        42,
      );
    });

    Deno.test("should accept a keepClasses option", function () {
      assertEquals(new Readability(doc)._keepClasses, false);
      assertEquals(
        new Readability(doc, { keepClasses: true })._keepClasses,
        true,
      );
      assertEquals(
        new Readability(doc, { keepClasses: false })._keepClasses,
        false,
      );
    });

    Deno.test("should accept a allowedVideoRegex option or default it", function () {
      assertEquals(
        new Readability(doc)._allowedVideoRegex,
        Readability.prototype.REGEXPS.videos,
      );
      const allowedVideoRegex = /\/\/mydomain.com\/.*'/;
      assertEquals(
        new Readability(doc, { allowedVideoRegex })._allowedVideoRegex,
        allowedVideoRegex,
      );
    });
  });

  Deno.test("#parse", function () {
    const exampleSource = testPages[0].source;

    Deno.test("shouldn't parse oversized documents as per configuration", function () {
      const doc = new JSDOMParser().parse("<html><div>yo</div></html>");

      assertThrows(function () {
        new Readability(doc, { maxElemsToParse: 1 }).parse();
      }, "Aborting parsing document; 2 elements found");
    });

    Deno.test("should run _cleanClasses with default configuration", function () {
      const doc = new JSDOMParser().parse(exampleSource);
      const parser = new Readability(doc);

      cleanClassesStub = stub(parser, "_cleanClasses", returnsNext());

      parser.parse();

      assertEquals(parser.cleanClassesStub.called, true);
    });

    Deno.test("should run _cleanClasses when option keepClasses = false", function () {
      const doc = new JSDOMParser().parse(exampleSource);
      const parser = new Readability(doc, { keepClasses: false });

      cleanClassesStub = stub(parser, "_cleanClasses", returnsNext());

      parser.parse();

      assertEquals(cleanClassesStub, true);
    });

    Deno.test("shouldn't run _cleanClasses when option keepClasses = true", function () {
      const doc = new JSDOMParser().parse(exampleSource);
      const parser = new Readability(doc, { keepClasses: true });

      cleanClassesStub = stub(parser, "_cleanClasses", returnsNext());

      parser.parse();

      assertEquals(cleanClassesStub, false);
    });

    Deno.test("should use custom content serializer sent as option", function () {
      const dom = new DOMParser().parseFromString("My cat: <img src=''>");
      const expected_xhtml =
        '<div xmlns="http://www.w3.org/1999/xhtml" id="readability-page-1" class="page">My cat: <img src="" /></div>';
      const xml = new dom.window.XMLSerializer();
      const content = new Readability(dom.window.document, {
        serializer: function (el) {
          return xml.serializeToString(el.firstChild);
        },
      }).parse().content;
      assertEquals(content, expected_xhtml);
    });

    Deno.test("should use custom video regex sent as option", function () {
      const dom = new DOMParser().parseFromString(
        "<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc mollis leo lacus, vitae semper nisl ullamcorper ut.</p>" +
          '<iframe src="https://mycustomdomain.com/some-embeds"></iframe>',
      );
      const expected_xhtml = '<div id="readability-page-1" class="page">' +
        "<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc mollis leo lacus, vitae semper nisl ullamcorper ut.</p>" +
        '<iframe src="https://mycustomdomain.com/some-embeds"></iframe>' +
        "</div>";
      const content = new Readability(dom.window.document, {
        charThreshold: 20,
        allowedVideoRegex: /.*mycustomdomain.com.*/,
      }).parse().content;
      assertEquals(content, expected_xhtml);
    });
  });
});

Deno.test("Test pages", function () {
  testPages.forEach(function (testPage) {
    Deno.test(testPage.dir, function () {
      const uri = "http://fakehost/test/page.html";

      runTestsWithItems(
        "jsdom",
        function (source) {
          const doc = new DOMParser().parseFromString(source, "text/html");
          removeCommentNodesRecursively(doc);
          return doc;
        },
        testPage.source,
        testPage.expectedContent,
        testPage.expectedMetadata,
      );

      runTestsWithItems(
        "JSDOMParser",
        function (source) {
          const parser = new JSDOMParser();
          const doc = parser.parse(source, uri);
          if (parser.errorState) {
            console.error("Parsing this DOM caused errors:", parser.errorState);
            return null;
          }
          return doc;
        },
        testPage.source,
        testPage.expectedContent,
        testPage.expectedMetadata,
      );
    });
  });
});
