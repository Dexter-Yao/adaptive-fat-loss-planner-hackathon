// ABOUTME: Accessible field associations must survive source-owned shadcn wrappers and nested select markup.
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormField } from "../src/ui/form-field";
import { Input } from "../src/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "../src/components/ui/native-select";
import { Checkbox } from "../src/components/ui/checkbox";
const samples = [
  {
    name: "input",
    tag: "input",
    control: createElement(Input, { value: "84", onChange() {} }),
  },
  {
    name: "native select",
    tag: "select",
    control: createElement(
      NativeSelect,
      { value: "light", onChange() {} },
      createElement(NativeSelectOption, { value: "light" }, "Light work"),
    ),
  },
  {
    name: "checkbox",
    tag: "button",
    control: createElement(Checkbox, { checked: false, onCheckedChange() {} }),
  },
];
for (const s of samples)
  test(`${s.name}: the separate visible label targets the actual control`, () => {
    const html = renderToStaticMarkup(
      createElement(FormField, null, "Explicit label", s.control),
    );
    const label = html.match(/<label\b[^>]*\bfor="([^"]+)"/),
      control = html.match(new RegExp("<" + s.tag + '\\b[^>]*\\bid="([^"]+)"'));
    assert.ok(label, "a semantic label must have an explicit target");
    assert.ok(control, "the actual control must receive its ID");
    assert.equal(label[1], control[1]);
  });
