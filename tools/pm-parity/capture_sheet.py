#!/usr/bin/env python3
"""Stage 2: open the PM mobile 'Buy' bottom sheet and extract HARD DATA.

Captures, for the World Cup Winner multi-outcome event:
  - screenshots: market page, Buy sheet (Yes), (No), Market/Limit dropdown
  - DOM subtree of the sheet: tag/class/text/geometry + curated computed styles
  - :root + sheet-scoped CSS custom properties
  - active/hover state deltas for interactive targets (toggle, chips, Trade, icon)
Outputs under /home/user/pm-probe/{screens,data}
"""
import sys, json, time, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("/home/user/pm-probe")
ROOT.joinpath("screens").mkdir(parents=True, exist_ok=True)
ROOT.joinpath("data").mkdir(parents=True, exist_ok=True)
UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
      "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1")
URL = "https://polymarket.com/event/world-cup-winner"

PROPS = [
 "display","position","top","right","bottom","left","boxSizing","width","height",
 "minWidth","maxWidth","minHeight","maxHeight",
 "marginTop","marginRight","marginBottom","marginLeft",
 "paddingTop","paddingRight","paddingBottom","paddingLeft",
 "borderTopWidth","borderRightWidth","borderBottomWidth","borderLeftWidth",
 "borderTopColor","borderStyle","borderTopLeftRadius","borderTopRightRadius",
 "borderBottomRightRadius","borderBottomLeftRadius",
 "color","backgroundColor","backgroundImage","backdropFilter",
 "fontFamily","fontSize","fontWeight","fontStyle","lineHeight","letterSpacing",
 "textAlign","textTransform","textDecorationLine",
 "opacity","boxShadow","transition","transitionProperty","transitionDuration",
 "transitionTimingFunction","transform","filter",
 "flexDirection","justifyContent","alignItems","gap","flexWrap","flexGrow","flexShrink","flexBasis",
 "gridTemplateColumns","gridAutoFlow","zIndex","overflow","overflowX","overflowY",
 "whiteSpace","cursor","objectFit","pointerEvents","userSelect",
]

# JS: dump a subtree given a root element, flat with parent index
DUMP_SUBTREE = r"""
(args) => {
  const [rootSel, props] = args;
  const root = document.querySelector(rootSel);
  if (!root) return null;
  const all = [root, ...root.querySelectorAll('*')];
  const idx = new Map(); all.forEach((el,i)=>idx.set(el,i));
  const styleOf = (el)=>{ const cs=getComputedStyle(el); const o={}; for(const p of props)o[p]=cs[p]; return o; };
  const vis = (el)=>{ const cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden')return false;
                      const r=el.getBoundingClientRect(); return r.width>0&&r.height>0; };
  const out=[];
  all.forEach((el,i)=>{
    if(el.tagName==='SCRIPT'||el.tagName==='STYLE')return;
    if(i!==0 && !vis(el))return;
    const r=el.getBoundingClientRect();
    const p=el.parentElement; const pi=(p&&idx.has(p))?idx.get(p):-1;
    out.push({ i, pi, tag:el.tagName.toLowerCase(),
      cls:(el.getAttribute('class')||'').slice(0,240),
      testid:el.getAttribute('data-testid')||undefined,
      role:el.getAttribute('role')||undefined,
      aria:el.getAttribute('aria-label')||undefined,
      type:el.getAttribute('type')||undefined,
      href:el.tagName==='A'?(el.getAttribute('href')||undefined):undefined,
      svg: el.tagName.toLowerCase()==='svg'? (el.innerHTML||'').slice(0,400):undefined,
      txt:(el.childElementCount===0?(el.textContent||'').trim().slice(0,140):undefined),
      box:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},
      st: styleOf(el) });
  });
  return out;
}
"""

VARS_JS = r"""
() => { const out={}; const roots=[document.documentElement, document.body];
  for(const el of roots){ if(!el)continue; const cs=getComputedStyle(el);
    for(let i=0;i<cs.length;i++){const p=cs[i]; if(p.startsWith('--')&&!(p in out))out[p]=cs.getPropertyValue(p).trim();}}
  return out; }
"""

def dismiss(page):
    for name in ["Accept all","Accept","Got it","I understand","Agree","Close","OK"]:
        try:
            b = page.get_by_role("button", name=name, exact=False)
            if b.count()>0: b.first.click(timeout=700); time.sleep(0.2)
        except Exception: pass
    try: page.keyboard.press("Escape")
    except Exception: pass

def find_sheet_selector(page):
    # tag the sheet root: the fixed/absolute container holding the 'Trade' button + '$' amount
    return page.evaluate(r"""() => {
      // find a button whose text is exactly 'Trade' (case-insensitive)
      const btns=[...document.querySelectorAll('button, [role=button]')];
      let trade=btns.find(b=>/^\s*trade\s*$/i.test(b.textContent||''));
      if(!trade) return null;
      // walk up to a positioned container that also contains 'Buy' text
      let el=trade;
      for(let k=0;k<12 && el;k++){
        const cs=getComputedStyle(el);
        if((cs.position==='fixed'||cs.position==='absolute') && /buy/i.test(el.textContent||'')){
          el.setAttribute('data-pm-sheet','1'); return '[data-pm-sheet="1"]';
        }
        el=el.parentElement;
      }
      // fallback: nearest positioned ancestor
      el=trade;
      for(let k=0;k<12 && el;k++){ const cs=getComputedStyle(el);
        if(cs.position==='fixed'||cs.position==='absolute'){el.setAttribute('data-pm-sheet','1');return '[data-pm-sheet=\"1\"]';}
        el=el.parentElement; }
      return null;
    }""")

def run():
    with sync_playwright() as p:
        br = p.chromium.launch(headless=True, args=["--no-sandbox","--disable-blink-features=AutomationControlled"])
        ctx = br.new_context(viewport={"width":390,"height":844}, user_agent=UA,
                             device_scale_factor=3, is_mobile=True, has_touch=True, locale="en-US")
        page = ctx.new_page()
        print("goto", URL)
        page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        try: page.wait_for_load_state("networkidle", timeout=15000)
        except Exception: print("(networkidle timeout)")
        time.sleep(3)
        dismiss(page); time.sleep(1)
        print("URL now:", page.url, "| title:", page.title())
        page.screenshot(path=str(ROOT/"screens"/"01-market-page.png"))

        # Enumerate candidate 'Yes'/'No' buttons on the multi-outcome page
        info = page.evaluate(r"""() => {
          const bs=[...document.querySelectorAll('button, [role=button]')];
          return bs.map((b,i)=>({i, txt:(b.textContent||'').trim().slice(0,40),
            cls:(b.getAttribute('class')||'').slice(0,60)}))
            .filter(o=>/yes|no|buy|\u00a2/i.test(o.txt)).slice(0,40);
        }""")
        print("candidate buttons:")
        for o in info: print("  ", o['i'], repr(o['txt']))

        # Click the first 'Yes' button to arm Spain/Yes and open the sheet
        opened=False
        for sel in ["button:has-text('Yes')","[role=button]:has-text('Yes')"]:
            try:
                loc=page.locator(sel).first
                if loc.count()>0:
                    loc.scroll_into_view_if_needed(timeout=3000)
                    loc.click(timeout=4000); time.sleep(2)
                    opened=True; print("clicked via", sel); break
            except Exception as e:
                print("click err", sel, e)
        time.sleep(2)
        page.screenshot(path=str(ROOT/"screens"/"02-after-yes-click.png"))

        sheet_sel = find_sheet_selector(page)
        print("sheet selector:", sheet_sel)
        if sheet_sel:
            page.screenshot(path=str(ROOT/"screens"/"03-buy-sheet-yes.png"))
            nodes = page.evaluate(DUMP_SUBTREE, [sheet_sel, PROPS])
            if nodes:
                json.dump(nodes, open(ROOT/"data"/"sheet-yes-dom.json","w"))
                print("  sheet-yes nodes:", len(nodes))
            # switch to No
            try:
                page.locator(f"{sheet_sel} button:has-text('No'), {sheet_sel} [role=button]:has-text('No')").first.click(timeout=3000)
                time.sleep(1.2)
                page.screenshot(path=str(ROOT/"screens"/"04-buy-sheet-no.png"))
                nodes2 = page.evaluate(DUMP_SUBTREE, [sheet_sel, PROPS])
                if nodes2: json.dump(nodes2, open(ROOT/"data"/"sheet-no-dom.json","w")); print("  sheet-no nodes:", len(nodes2))
            except Exception as e: print("No toggle err", e)
            # open Market/Limit dropdown (the sliders icon top-right)
            try:
                page.locator(f"{sheet_sel} svg").last.click(timeout=3000)
                time.sleep(1)
                page.screenshot(path=str(ROOT/"screens"/"05-market-limit-dropdown.png"))
                nodes3 = page.evaluate(DUMP_SUBTREE, [sheet_sel, PROPS])
                if nodes3: json.dump(nodes3, open(ROOT/"data"/"sheet-dropdown-dom.json","w")); print("  dropdown nodes:", len(nodes3))
            except Exception as e: print("dropdown err", e)
        else:
            # dump whole body as fallback for offline analysis
            print("!! sheet not found; dumping body text sample")
            print(page.evaluate("() => document.body.innerText.slice(0,600)"))

        varz = page.evaluate(VARS_JS)
        json.dump(varz, open(ROOT/"data"/"vars.json","w"))
        print("css vars:", len(varz))
        ctx.close(); br.close()
        print("DONE")

if __name__=="__main__":
    run()
