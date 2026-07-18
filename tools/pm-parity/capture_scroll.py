#!/usr/bin/env python3
"""Scoped order-book scroll capture, anchored on the unique 'Spread' label.

Finds the order-book PANEL (smallest ancestor of the Spread label that holds
>=6 price cells), counts asks/bids, and walks its ancestor chain reading scroll
geometry (overflow-y, max-height, clientH vs scrollH). Desktop + mobile.
"""
import json, time, pathlib, traceback
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("/home/user/pm-live/scroll")
(ROOT / "screens").mkdir(parents=True, exist_ok=True)
(ROOT / "data").mkdir(parents=True, exist_ok=True)
URL = "https://polymarket.com/event/presidential-election-winner-2028"
UA_D = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
UA_M = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
        "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")

FIND = r"""
() => {
  const isPrice = t => /^\d{1,2}(\.\d)?%$/.test(t) || /^\(\d{1,2}(\.\d)?¢\)$/.test(t);
  const priceCells = () => [...document.querySelectorAll('*')].filter(e =>
      e.childElementCount === 0 && isPrice((e.textContent||'').trim()));
  // Anchor: the Spread label (unique to the order book).
  const spread = [...document.querySelectorAll('*')].find(e =>
      e.childElementCount===0 && /^spread/i.test((e.textContent||'').trim()));
  if (!spread) return { error: 'no spread label (order book not open?)' };

  // Panel = smallest ancestor of spread that contains >= 6 price cells.
  const all = priceCells();
  let panel = spread.parentElement;
  const countIn = el => all.filter(c => el.contains(c)).length;
  while (panel && panel !== document.body && countIn(panel) < 6) panel = panel.parentElement;
  if (!panel) return { error: 'panel not found' };

  const cells = all.filter(c => panel.contains(c));
  const sy = spread.getBoundingClientRect().top;
  // price % cells only (dedupe the ¢ cells): count above/below the spread divider
  const pctCells = cells.filter(c => /%$/.test((c.textContent||'').trim()));
  const asks = pctCells.filter(c => c.getBoundingClientRect().top < sy).length;
  const bids = pctCells.filter(c => c.getBoundingClientRect().top > sy).length;

  // row pitch from two adjacent bid rows
  const bidRows = pctCells.filter(c => c.getBoundingClientRect().top > sy)
      .map(c => c.getBoundingClientRect().top).sort((a,b)=>a-b);
  const pitch = bidRows.length>1 ? Math.round(bidRows[1]-bidRows[0]) : null;

  // ancestor chain from panel up: scroll geometry
  const chain = [];
  let el = panel;
  for (let d=0; el && el!==document.body && d<12; d++, el=el.parentElement) {
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    const scrollable = el.scrollHeight - el.clientHeight > 4 &&
                       ['auto','scroll','overlay'].includes(cs.overflowY);
    chain.push({ d, tag: el.tagName.toLowerCase(), cls:(el.getAttribute('class')||'').slice(0,80),
      clientH: el.clientHeight, scrollH: el.scrollHeight, rectH: Math.round(r.height),
      overflowY: cs.overflowY, maxHeight: cs.maxHeight, height: cs.height,
      position: cs.position, scrollable });
    if (scrollable) el.setAttribute('data-scrollbox','1');
  }
  const sc = chain.find(c => c.scrollable) || null;

  // sticky? check the header (Price) and the Last/Spread divider
  const headerEl = [...panel.querySelectorAll('*')].find(e =>
      e.childElementCount===0 && /^price$/i.test((e.textContent||'').trim()));
  const stickyOf = el => { if(!el) return null; let t=el;
    for(let k=0;k<6&&t&&panel.contains(t);k++){ const cs=getComputedStyle(t);
      if(cs.position==='sticky'||cs.position==='fixed') return {pos:cs.position, top:cs.top};
      t=t.parentElement; } return {pos:'static'}; };

  return { ok:true, asks, bids, totalPct: pctCells.length, pitch,
    panelTag: panel.tagName.toLowerCase(), panelCls:(panel.getAttribute('class')||'').slice(0,80),
    panelClientH: panel.clientHeight, panelScrollH: panel.scrollHeight,
    headerSticky: stickyOf(headerEl), spreadSticky: stickyOf(spread),
    scrollbox: sc, chain };
}
"""

def dismiss(page):
    for name in ["Accept all","Accept","Got it","Close","Continue","No thanks"]:
        try:
            b = page.get_by_role("button", name=name, exact=False)
            if b.count() > 0: b.first.click(timeout=800); time.sleep(0.2)
        except Exception: pass
    for _ in range(3):
        try: page.keyboard.press("Escape"); time.sleep(0.1)
        except Exception: pass

def open_candidate(page):
    page.evaluate("""(nm) => {
      const el=[...document.querySelectorAll('*')].find(e=>e.childElementCount===0 && (e.textContent||'').trim()===nm);
      if(el){ let t=el; for(let k=0;k<4 && t;k++){ if(t.getBoundingClientRect().height>=36){break;} t=t.parentElement;}
        (t||el).scrollIntoView({block:'center'}); (t||el).click(); }
    }""", "JD Vance")

def reveal_book(page):
    for _ in range(3):
        info = page.evaluate(FIND)
        if info.get("ok"): return info
        try:
            ob = page.get_by_text("Order Book", exact=False)
            if ob.count() > 0:
                ob.first.scroll_into_view_if_needed(timeout=1500)
                ob.first.click(timeout=1500); time.sleep(1.2)
        except Exception: pass
        page.mouse.wheel(0, 600); time.sleep(0.8)
    return page.evaluate(FIND)

def run_viewport(p, label, viewport, ua, mobile):
    br = p.chromium.launch(headless=True, args=["--no-sandbox","--disable-blink-features=AutomationControlled"])
    ctx = br.new_context(viewport=viewport, user_agent=ua, device_scale_factor=2,
                         locale="en-US", is_mobile=mobile, has_touch=mobile)
    page = ctx.new_page()
    print(f"\n===== {label} {viewport} =====")
    page.goto(URL, wait_until="domcontentloaded", timeout=60000)
    try: page.wait_for_load_state("networkidle", timeout=15000)
    except Exception: pass
    time.sleep(3); dismiss(page); time.sleep(1); dismiss(page)
    url0 = page.url
    open_candidate(page); time.sleep(2.5)
    print("url before/after click:", url0, "->", page.url)
    info = reveal_book(page)
    json.dump(info, open(ROOT/"data"/f"{label}-scroll2.json","w"), indent=2)
    if not info.get("ok"):
        print("FIND failed:", info); page.screenshot(path=str(ROOT/"screens"/f"{label}-fail.png")); ctx.close(); br.close(); return
    print(f"asks={info['asks']} bids={info['bids']} totalPct={info['totalPct']} pitch={info['pitch']}")
    print(f"panel {info['panelTag']} clientH={info['panelClientH']} scrollH={info['panelScrollH']}")
    print(f"headerSticky={info['headerSticky']} spreadSticky={info['spreadSticky']}")
    print("SCROLLBOX:", json.dumps(info['scrollbox']) if info['scrollbox'] else "NONE — no inner scroll")
    print("chain (first 7):")
    for c in info["chain"][:7]:
        print(f"  d{c['d']} {c['tag']:4} clientH={c['clientH']:4} scrollH={c['scrollH']:4} ovY={c['overflowY']:7} "
              f"maxH={c['maxHeight']:8} pos={c['position']:8} scroll={c['scrollable']}")
    page.screenshot(path=str(ROOT/"screens"/f"{label}-book.png"))
    if info["scrollbox"]:
        moved = page.evaluate(r"""() => { const e=document.querySelector('[data-scrollbox="1"]'); if(!e)return null;
            const b=e.scrollTop; e.scrollTop=e.scrollHeight; const a=e.scrollTop;
            return {before:b, after:a, max:e.scrollHeight-e.clientHeight}; }""")
        print("SCROLL TEST:", moved)
    ctx.close(); br.close()

def run():
    with sync_playwright() as p:
        run_viewport(p, "desktop", {"width":1440,"height":900}, UA_D, False)
        run_viewport(p, "mobile",  {"width":390,"height":844},  UA_M, True)
    print("\nDONE")

if __name__ == "__main__":
    try: run()
    except Exception: traceback.print_exc()
