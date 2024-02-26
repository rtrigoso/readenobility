/* eslint-env node, mocha */

import { assertEquals } from "https://deno.land/std@0.217.0/assert/mod.ts";
import JSDOMParser from "../JSDOMParser.js";
const BASETESTCASE =
  '<html><body><p>Some text and <a class="someclass" href="#">a link</a></p>' +
  '<div id="foo">With a <script>With &lt; fancy " characters in it because' +
  '</script> that is fun.<span>And another node to make it harder</span></div><form><input type="text"/><input type="number"/>Here\'s a form</form></body></html>';

const baseDoc = new JSDOMParser().parse(BASETESTCASE, "http://fakehost/");

Deno.test("Test JSDOM functionality", function () {
  function nodeExpect(actual, expected) {
    try {
      assertEquals(actual, expected);
    } catch (ex) {
      throw ex.message;
    }
  }
  Deno.test("should work for basic operations using the parent child hierarchy and innerHTML", function () {
    assertEquals(baseDoc.childNodes.length, 1);
    assertEquals(baseDoc.getElementsByTagName("*").length, 10);
    const foo = baseDoc.getElementById("foo");
    assertEquals(foo.parentNode.localName, "body");
    nodeExpect(baseDoc.body, foo.parentNode);
    nodeExpect(baseDoc.body.parentNode, baseDoc.documentElement);
    assertEquals(baseDoc.body.childNodes.length, 3);

    const generatedHTML = baseDoc.getElementsByTagName("p")[0].innerHTML;
    assertEquals(
      generatedHTML,
      'Some text and <a class="someclass" href="#">a link</a>',
    );
    const scriptNode = baseDoc.getElementsByTagName("script")[0];
    generatedHTML = scriptNode.innerHTML;
    assertEquals(generatedHTML, 'With &lt; fancy " characters in it because');
    assertEquals(
      scriptNode.textContent,
      'With < fancy " characters in it because',
    );
  });

  Deno.test("should have basic URI information", function () {
    assertEquals(baseDoc.documentURI, "http://fakehost/");
    assertEquals(baseDoc.baseURI, "http://fakehost/");
  });

  Deno.test("should deal with script tags", function () {
    // Check our script parsing worked:
    const scripts = baseDoc.getElementsByTagName("script");
    assertEquals(scripts.length, 1);
    assertEquals(
      scripts[0].textContent,
      'With < fancy " characters in it because',
    );
  });

  Deno.test("should have working sibling/first+lastChild properties", function () {
    const foo = baseDoc.getElementById("foo");

    nodeExpect(foo.previousSibling.nextSibling, foo);
    nodeExpect(foo.nextSibling.previousSibling, foo);
    nodeExpect(foo.nextSibling, foo.nextElementSibling);
    nodeExpect(foo.previousSibling, foo.previousElementSibling);

    const beforeFoo = foo.previousSibling;
    const afterFoo = foo.nextSibling;

    nodeExpect(baseDoc.body.lastChild, afterFoo);
    nodeExpect(baseDoc.body.firstChild, beforeFoo);
  });

  Deno.test("should have working removeChild and appendChild functionality", function () {
    const foo = baseDoc.getElementById("foo");
    const beforeFoo = foo.previousSibling;
    const afterFoo = foo.nextSibling;

    const removedFoo = foo.parentNode.removeChild(foo);
    nodeExpect(foo, removedFoo);
    nodeExpect(foo.parentNode, null);
    nodeExpect(foo.previousSibling, null);
    nodeExpect(foo.nextSibling, null);
    nodeExpect(foo.previousElementSibling, null);
    nodeExpect(foo.nextElementSibling, null);

    assertEquals(beforeFoo.localName, "p");
    nodeExpect(beforeFoo.nextSibling, afterFoo);
    nodeExpect(afterFoo.previousSibling, beforeFoo);
    nodeExpect(beforeFoo.nextElementSibling, afterFoo);
    nodeExpect(afterFoo.previousElementSibling, beforeFoo);

    assertEquals(baseDoc.body.childNodes.length, 2);

    baseDoc.body.appendChild(foo);

    assertEquals(baseDoc.body.childNodes.length, 3);
    nodeExpect(afterFoo.nextSibling, foo);
    nodeExpect(foo.previousSibling, afterFoo);
    nodeExpect(afterFoo.nextElementSibling, foo);
    nodeExpect(foo.previousElementSibling, afterFoo);

    // This should reorder back to sanity:
    baseDoc.body.appendChild(afterFoo);
    nodeExpect(foo.previousSibling, beforeFoo);
    nodeExpect(foo.nextSibling, afterFoo);
    nodeExpect(foo.previousElementSibling, beforeFoo);
    nodeExpect(foo.nextElementSibling, afterFoo);

    nodeExpect(foo.previousSibling.nextSibling, foo);
    nodeExpect(foo.nextSibling.previousSibling, foo);
    nodeExpect(foo.nextSibling, foo.nextElementSibling);
    nodeExpect(foo.previousSibling, foo.previousElementSibling);
  });

  Deno.test("should handle attributes", function () {
    const link = baseDoc.getElementsByTagName("a")[0];
    assertEquals(link.getAttribute("href"), "#");
    assertEquals(link.getAttribute("class"), link.className);
    const foo = baseDoc.getElementById("foo");
    assertEquals(foo.id, foo.getAttribute("id"));
  });

  Deno.test("should have a working replaceChild", function () {
    const parent = baseDoc.getElementsByTagName("div")[0];
    const p = baseDoc.createElement("p");
    p.setAttribute("id", "my-replaced-kid");
    const childCount = parent.childNodes.length;
    const childElCount = parent.children.length;
    for (let i = 0; i < parent.childNodes.length; i++) {
      const replacedNode = parent.childNodes[i];
      const replacedAnElement =
        replacedNode.nodeType === replacedNode.ELEMENT_NODE;
      const oldNext = replacedNode.nextSibling;
      const oldNextEl = replacedNode.nextElementSibling;
      const oldPrev = replacedNode.previousSibling;
      const oldPrevEl = replacedNode.previousElementSibling;

      parent.replaceChild(p, replacedNode);

      // Check siblings and parents on both nodes were set:
      nodeExpect(p.nextSibling, oldNext);
      nodeExpect(p.previousSibling, oldPrev);
      nodeExpect(p.parentNode, parent);

      nodeExpect(replacedNode.parentNode, null);
      nodeExpect(replacedNode.nextSibling, null);
      nodeExpect(replacedNode.previousSibling, null);
      // if the old node was an element, element siblings should now be null
      if (replacedAnElement) {
        nodeExpect(replacedNode.nextElementSibling, null);
        nodeExpect(replacedNode.previousElementSibling, null);
      }

      // Check the siblings were updated
      if (oldNext) {
        nodeExpect(oldNext.previousSibling, p);
      }
      if (oldPrev) {
        nodeExpect(oldPrev.nextSibling, p);
      }

      // check the array was updated
      nodeExpect(parent.childNodes[i], p);

      // Now check element properties/lists:
      const kidElementIndex = parent.children.indexOf(p);
      // should be in the list:
      assertEquals(kidElementIndex, -1);

      if (kidElementIndex > 0) {
        nodeExpect(
          parent.children[kidElementIndex - 1],
          p.previousElementSibling,
        );
        nodeExpect(p.previousElementSibling.nextElementSibling, p);
      } else {
        nodeExpect(p.previousElementSibling, null);
      }
      if (kidElementIndex < parent.children.length - 1) {
        nodeExpect(parent.children[kidElementIndex + 1], p.nextElementSibling);
        nodeExpect(p.nextElementSibling.previousElementSibling, p);
      } else {
        nodeExpect(p.nextElementSibling, null);
      }

      if (replacedAnElement) {
        nodeExpect(oldNextEl, p.nextElementSibling);
        nodeExpect(oldPrevEl, p.previousElementSibling);
      }

      assertEquals(parent.childNodes.length, childCount);
      assertEquals(
        parent.children.length,
        replacedAnElement ? childElCount : childElCount + 1,
      );

      parent.replaceChild(replacedNode, p);

      nodeExpect(oldNext, replacedNode.nextSibling);
      nodeExpect(oldNextEl, replacedNode.nextElementSibling);
      nodeExpect(oldPrev, replacedNode.previousSibling);
      nodeExpect(oldPrevEl, replacedNode.previousElementSibling);
      if (replacedNode.nextSibling) {
        nodeExpect(replacedNode.nextSibling.previousSibling, replacedNode);
      }
      if (replacedNode.previousSibling) {
        nodeExpect(replacedNode.previousSibling.nextSibling, replacedNode);
      }
      if (replacedAnElement) {
        if (replacedNode.previousElementSibling) {
          nodeExpect(
            replacedNode.previousElementSibling.nextElementSibling,
            replacedNode,
          );
        }
        if (replacedNode.nextElementSibling) {
          nodeExpect(
            replacedNode.nextElementSibling.previousElementSibling,
            replacedNode,
          );
        }
      }
    }
  });
});

Deno.test("Test HTML escaping", function () {
  const baseStr =
    "<p>Hello, everyone &amp; all their friends, &lt;this&gt; is a &quot; test with &apos; quotes.</p>";
  const doc = new JSDOMParser().parse(baseStr);
  const p = doc.getElementsByTagName("p")[0];
  const txtNode = p.firstChild;
  Deno.test("should handle encoding HTML correctly", function () {
    // This /should/ just be cached straight from reading it:
    assertEquals("<p>" + p.innerHTML + "</p>", baseStr);
    assertEquals("<p>" + txtNode.innerHTML + "</p>", baseStr);
  });

  Deno.test("should have decoded correctly", function () {
    assertEquals(
      p.textContent,
      "Hello, everyone & all their friends, <this> is a \" test with ' quotes.",
    );
    assertEquals(
      txtNode.textContent,
      "Hello, everyone & all their friends, <this> is a \" test with ' quotes.",
    );
  });

  Deno.test("should handle updates via textContent correctly", function () {
    // Because the initial tests might be based on cached innerHTML values,
    // let's manipulate via textContent in order to test that it alters
    // the innerHTML correctly.
    txtNode.textContent = txtNode.textContent + " ";
    txtNode.textContent = txtNode.textContent.trim();
    const expectedHTML = baseStr.replace("&quot;", '"').replace("&apos;", "'");
    assertEquals("<p>" + txtNode.innerHTML + "</p>", expectedHTML);
    assertEquals("<p>" + p.innerHTML + "</p>", expectedHTML);
  });

  Deno.test("should handle decimal and hex escape sequences", function () {
    const parsedDoc = new JSDOMParser().parse("<p>&#32;&#x20;</p>");
    assertEquals(parsedDoc.getElementsByTagName("p")[0].textContent, "  ");
  });
});

Deno.test("Script parsing", function () {
  Deno.test("should strip ?-based comments within script tags", function () {
    const html = '<script><?Silly test <img src="test"></script>';
    const doc = new JSDOMParser().parse(html);
    assertEquals(doc.firstChild.tagName, "SCRIPT");
    assertEquals(doc.firstChild.textContent, "");
    assertEquals(doc.firstChild.children.length, 0);
    assertEquals(doc.firstChild.childNodes.length, 0);
  });

  Deno.test("should strip !-based comments within script tags", function () {
    const html =
      '<script><!--Silly test > <script src="foo.js"></script>--></script>';
    const doc = new JSDOMParser().parse(html);
    assertEquals(doc.firstChild.tagName, "SCRIPT");
    assertEquals(doc.firstChild.textContent, "");
    assertEquals(doc.firstChild.children.length, 0);
    assertEquals(doc.firstChild.childNodes.length, 0);
  });

  Deno.test("should strip any other nodes within script tags", function () {
    const html =
      "<script>&lt;div>Hello, I'm not really in a &lt;/div></script>";
    const doc = new JSDOMParser().parse(html);
    assertEquals(doc.firstChild.tagName, "SCRIPT");
    assertEquals(
      doc.firstChild.textContent,
      "<div>Hello, I'm not really in a </div>",
    );
    assertEquals(doc.firstChild.children.length, 0);
    assertEquals(doc.firstChild.childNodes.length, 1);
  });

  Deno.test("should strip any other invalid script nodes within script tags", function () {
    const html = '<script>&lt;script src="foo.js">&lt;/script></script>';
    const doc = new JSDOMParser().parse(html);
    assertEquals(doc.firstChild.tagName, "SCRIPT");
    assertEquals(doc.firstChild.textContent, '<script src="foo.js"></script>');
    assertEquals(doc.firstChild.children.length, 0);
    assertEquals(doc.firstChild.childNodes.length, 1);
  });

  Deno.test("should not be confused by partial closing tags", function () {
    const html = "<script>const x = '&lt;script>Hi&lt;' + '/script>';</script>";
    const doc = new JSDOMParser().parse(html);
    assertEquals(doc.firstChild.tagName, "SCRIPT");
    assertEquals(
      doc.firstChild.textContent,
      "const x = '<script>Hi<' + '/script>';",
    );
    assertEquals(doc.firstChild.children.length, 0);
    assertEquals(doc.firstChild.childNodes.length, 1);
  });
});

Deno.test("Tag local name case handling", function () {
  Deno.test("should lowercase tag names", function () {
    const html = "<DIV><svG><clippath/></svG></DIV>";
    const doc = new JSDOMParser().parse(html);
    assertEquals(doc.firstChild.tagName, "DIV");
    assertEquals(doc.firstChild.localName, "div");
    assertEquals(doc.firstChild.firstChild.tagName, "SVG");
    assertEquals(doc.firstChild.firstChild.localName, "svg");
    assertEquals(doc.firstChild.firstChild.firstChild.tagName, "CLIPPATH");
    assertEquals(doc.firstChild.firstChild.firstChild.localName, "clippath");
  });
});

Deno.test("Recovery from self-closing tags that have close tags", function () {
  Deno.test("should handle delayed closing of a tag", function () {
    const html = "<div><input><p>I'm in an input</p></input></div>";
    const doc = new JSDOMParser().parse(html);
    assertEquals(doc.firstChild.localName, "div");
    assertEquals(doc.firstChild.childNodes.length, 1);
    assertEquals(doc.firstChild.firstChild.localName, "input");
    assertEquals(doc.firstChild.firstChild.childNodes.length, 1);
    assertEquals(doc.firstChild.firstChild.firstChild.localName, "p");
  });
});

Deno.test("baseURI parsing", function () {
  Deno.test("should handle constious types of relative and absolute base URIs", function () {
    function checkBase(base, expectedResult) {
      const html = "<html><head><base href='" + base +
        "'></base></head><body/></html>";
      const doc = new JSDOMParser().parse(html, "http://fakehost/some/dir/");
      assertEquals(doc.baseURI, expectedResult);
    }

    checkBase("relative/path", "http://fakehost/some/dir/relative/path");
    checkBase("/path", "http://fakehost/path");
    checkBase("http://absolute/", "http://absolute/");
    checkBase("//absolute/path", "http://absolute/path");
  });
});

Deno.test("namespace workarounds", function () {
  Deno.test("should handle random namespace information in the serialized DOM", function () {
    const html =
      "<a0:html><a0:body><a0:DIV><a0:svG><a0:clippath/></a0:svG></a0:DIV></a0:body></a0:html>";
    const doc = new JSDOMParser().parse(html);
    const div = doc.getElementsByTagName("div")[0];
    assertEquals(div.tagName, "DIV");
    assertEquals(div.localName, "div");
    assertEquals(div.firstChild.tagName, "SVG");
    assertEquals(div.firstChild.localName, "svg");
    assertEquals(div.firstChild.firstChild.tagName, "CLIPPATH");
    assertEquals(div.firstChild.firstChild.localName, "clippath");
    assertEquals(doc.documentElement, doc.firstChild);
    assertEquals(doc.body, doc.documentElement.firstChild);
  });
});
