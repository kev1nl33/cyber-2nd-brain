#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tokens = readFileSync(new URL("../src/tokens.css", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const variables = new Map([...tokens.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

function color(value) {
  const variable = /^var\((--[\w-]+)\)$/.exec(value);
  if (variable) {
    assert.ok(variables.has(variable[1]), `未知颜色 ${value}`);
    return color(variables.get(variable[1]));
  }
  if (/^#[\da-f]{6}$/i.test(value)) {
    return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)).concat(1);
  }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(value);
  assert.ok(rgba, `不支持的颜色 ${value}`);
  const parts = rgba[1].split(",").map(Number);
  assert.ok(parts.every(Number.isFinite));
  return parts.length === 3 ? [...parts, 1] : parts;
}

function luminance(rgb) {
  const linear = rgb.slice(0, 3).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return linear.reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
}

const background = color(variables.get("--void"));
function contrast(value) {
  const foreground = color(value);
  const rgb = foreground.slice(0, 3).map((c, i) => c * foreground[3] + background[i] * (1 - foreground[3]));
  const a = luminance(rgb);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// 检查每条标题颜色声明，包含类型、外围、选中和媒体规则中的覆盖。
const rules = [...styles.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)];
const titleRules = rules.filter((m) => /\.(?:node-title|popover-title|popover-stack-title)\b/.test(m[1]));

test("中文标题的所有颜色声明对 void 至少 4.5:1", () => {
  assert.ok(titleRules.length >= 10, "必须实际找到标题规则");
  let checked = 0;
  for (const [, selector, body] of titleRules) {
    for (const match of body.matchAll(/(?:^|;)\s*color\s*:\s*([^;]+);/g)) {
      const ratio = contrast(match[1].trim());
      assert.ok(ratio >= 4.5, `${selector.trim()}: ${ratio.toFixed(2)}:1`);
      checked++;
    }
  }
  assert.ok(checked >= 8, "必须覆盖标题颜色");
  assert.ok(contrast("var(--text-dim)") >= 4.5);
  assert.ok(contrast("var(--text-faint)") < 4.5, "校验器应识别低对比度颜色");
});

test("标题字号声明不小于 12px，步骤与图例使用指定档位", () => {
  for (const [, selector, body] of titleRules) {
    for (const match of body.matchAll(/font-size\s*:\s*([^;]+);/g)) {
      const value = match[1].trim().replace(/^var\((--[\w-]+)\)$/, (_, key) => variables.get(key));
      assert.ok(/^\d+(\.\d+)?px$/.test(value) && parseFloat(value) >= 12, `${selector.trim()}: ${value}`);
    }
  }
  assert.equal(variables.get("--fs-label-min"), "12px");
  assert.equal(variables.get("--fs-step"), "13px");
  assert.equal(variables.get("--fs-legend"), "11px");
  assert.match(styles, /\.node\[data-type="step"\] \.node-title\s*\{\s*font-size: var\(--fs-step\)/);
  assert.doesNotMatch(styles, /8\.5px/);
  assert.match(styles, /\.node-label\s*\{[^}]*opacity: 1;/);
});
