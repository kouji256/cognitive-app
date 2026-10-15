// SVG要素を作る小さな部品。内容は setAttribute / テキストノードだけで作る(innerHTMLは使わない)
const NS = 'http://www.w3.org/2000/svg';

export function s(tag, attrs, ...kids) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, String(v));
  kids.flat(Infinity).forEach((c) => { if (c != null) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
  return e;
}
