#!/usr/bin/env python3
"""Capture PM's DESKTOP inline candidate drawer (Order Book / Graph / Resolution).

Ground truth for CLOB phase-3 UI. Opens the 2028 presidential winner event,
dismisses every popup for clean shots, clicks a candidate row (JD Vance),
and records EXACTLY what happens: the inline drawer that expands under the row,
its tabs, the order-book depth table (Asks/Bids/Last/Spread), computed styles,
pixel geometry, and hover states.

Outputs under /home/user/pm-drawer/{screens,data}.
"""
import json, time, pathlib, re
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("/home/user/pm-drawer")
(ROOT/"screens").mkdir(parents=True, exist_ok=True)
(ROOT/"data").mkdir(parents=True, exist_ok=True)
URL = "https://polymarket.com/event/presidential-election-winner-2028"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

PROPS = [
 "display","position","top","right","bottom","left","boxSizing","width","height",
 "marginTop","marginRight","marginBottom","marginLeft",
 "paddingTop","paddingRight","paddingBottom","paddingLeft",
 "borderTopWidth","borderBottomWidth","borderTopColor","borderBottomColor","borderStyle",
 "borderTopLeftRadius","borderTopRightRadius","borderBottomRightRadius","borderBottomLeftRadius",
 "color","backgroundColor","backgroundImage","fontFamily","fontSize","fontWeight",
 "lineHeight","letterSpacing","textAlign","textTransform","opacity","boxShadow",
 "transition","transitionDuration","transitionTimingFunction","transform",
 "flexDirection","justifyContent","alignItems","gap","gridTemplateColumns","zIndex",
 "overflow","overflowY","whiteSpace","cursor",
]

DUMP = r"""
(args) => {
  const [rootSel, props] = args;
  const root = typeof rootSel === 'string' ? document.querySelector(rootSel) : rootSel;
  if (!root) return null;
  const all = [root, ...root.querySelectorAll('*')];
  const idx = new Map(); all.forEach((el,i)=>idx.set(el,i));
  const styleOf = (el)=>{const cs=getComputedStyle(el);const o={};for(const p of props)o[p]=cs[p];return o;};
  const vis = (el)=>{const cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden')return false;
                     const r=el.getBoundingClientRect();return r.width>0&&r.height>0;};
  const out=[];
  all.forEach((el,i)=>{
    if(el.tagName==='SCRIPT'||el.tagName==='STYLE')return;
    if(i!==0 && !vis(el))return;
    const r=el.getBoundingClientRect();
    const p=el.parentElement;const pi=(p&&idx.has(p))?idx.get(p):-1;
    out.push({i,pi,tag:el.tagName.toLowerCase(),
      cls:(el.getAttribute('class')||'').slice(0,200),
      testid:el.getAttribute('data-testid')||undefined,
      role:el.getAttribute('role')||undefined,
      aria:el.getAttribute('aria-label')||undefined,
      href:el.tagName==='A'?(el.getAttribute('href')||undefined):undefined,
      svg:el.tagName.toLowerCase()==='svg'?(el.innerHTML||'').slice(0,300):undefined,
      txt:(el.childElementCount===0?(el.textContent||'').trim().slice(0,120):undefined),
      box:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},
      st:styleOf(el)});
  });
  return out;
}
"""

def dismiss(page):
    for name in ["Accept all","Accept","Got it","I understand","Agree","Close","OK","Continue","No thanks"]:
        try:
            b = page.get_by_role("button", name=name, exact=False)
            if b.count()>0:
                b.first.click(timeout=800); time.sleep(0.3)
        except Exception: pass
    # kill any leftover fixed overlays/toasts by pressing Escape a few times
    for _ in range(3):
        try: page.keyboard.press("Escape"); time.sleep(0.15)
        except Exception: pass

def run():
    with sync_playwright() as p:
        br = p.chromium.launch(headless=True, args=["--no-sandbox","--disable-blink-features=AutomationControlled"])
        ctx = br.new_context(viewport={"width":1440,"height":900}, user_agent=UA, device_scale_factor=2, locale="en-US")
        page = ctx.new_page()
        print("goto", URL)
        page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        try: page.wait_for_load_state("networkidle", timeout=15000)
        except Exception: print("(networkidle timeout)")
        time.sleep(3)
        dismiss(page); time.sleep(1); dismiss(page)
        print("URL:", page.url, "| title:", page.title())
        page.screenshot(path=str(ROOT/"screens"/"01-event-clean.png"), full_page=False)

        # Enumerate candidate rows / names present
        cands = page.evaluate(r"""() => {
          const names = ['JD Vance','Gavin Newsom','Josh Shapiro','Pete Buttigieg','Alexandria',
            'Marco Rubio','Donald Trump','Vivek','Ron DeSantis','Gretchen Whitmer','Kamala'];
          const out=[];
          for(const nm of names){
            const el=[...document.querySelectorAll('*')].find(e=>e.childElementCount===0 &&
                     (e.textContent||'').trim()===nm);
            if(el){const r=el.getBoundingClientRect();out.push({name:nm,x:Math.round(r.x),y:Math.round(r.y)});}
          }
          return out;
        }""")
        print("candidates found:", cands)
        json.dump(cands, open(ROOT/"data"/"candidates.json","w"))

        # Pick JD Vance if present, else first candidate
        target = next((c for c in cands if c["name"]=="JD Vance"), cands[0] if cands else None)
        if not target:
            print("!! no candidate rows found"); print(page.evaluate("()=>document.body.innerText.slice(0,800)"))
            ctx.close(); br.close(); return
        print("TARGET:", target["name"])

        before = page.evaluate("() => ({h: document.body.scrollHeight, n: document.querySelectorAll('*').length})")
        # click the candidate NAME text node's row
        page.evaluate("""(nm) => {
          const el=[...document.querySelectorAll('*')].find(e=>e.childElementCount===0 && (e.textContent||'').trim()===nm);
          if(el){ let t=el; for(let k=0;k<4 && t;k++){ if(t.getBoundingClientRect().height>=36){break;} t=t.parentElement;} (t||el).scrollIntoView({block:'center'}); (t||el).click(); }
        }""", target["name"])
        time.sleep(2.2)
        after = page.evaluate("() => ({h: document.body.scrollHeight, n: document.querySelectorAll('*').length})")
        print("DOM delta -> before:", before, "after:", after,
              "| nodes added:", after["n"]-before["n"], "| height delta:", after["h"]-before["h"])
        page.screenshot(path=str(ROOT/"screens"/"02-after-candidate-click.png"), full_page=False)

        # Locate the drawer: nearest container that now shows Order Book / Asks / Bids / Spread
        drawer_sel = page.evaluate(r"""() => {
          const kw=/order book|asks|bids|spread|last|resolution/i;
          const hits=[...document.querySelectorAll('div,section')].filter(e=>{
            const t=e.textContent||''; return kw.test(t) && t.length<4000; });
          if(!hits.length) return null;
          // smallest container that contains 'Asks' AND 'Bids' (the depth table wrapper) or 'Order Book'
          let best=null,bestArea=1e15;
          for(const e of hits){
            const t=e.textContent||'';
            if(/(asks[\s\S]*bids)|(bids[\s\S]*asks)|order book/i.test(t)){
              const r=e.getBoundingClientRect();const a=r.width*r.height;
              if(a>0 && a<bestArea){bestArea=a;best=e;}
            }
          }
          if(best){best.setAttribute('data-pm-drawer','1');return '[data-pm-drawer="1"]';}
          return null;
        }""")
        print("drawer selector:", drawer_sel)

        if drawer_sel:
            page.screenshot(path=str(ROOT/"screens"/"03-drawer.png"), full_page=False)
            nodes = page.evaluate(DUMP, [drawer_sel, PROPS])
            if nodes: json.dump(nodes, open(ROOT/"data"/"drawer-dom.json","w")); print("drawer nodes:", len(nodes))
            # capture visible tab labels inside the drawer
            tabs = page.evaluate(r"""(sel)=>{
              const d=document.querySelector(sel); if(!d)return [];
              return [...d.querySelectorAll('button,[role=tab],a')].map(b=>(b.textContent||'').trim())
                     .filter(t=>t && t.length<24);
            }""", drawer_sel)
            print("drawer tabs/buttons:", tabs)
            json.dump(tabs, open(ROOT/"data"/"drawer-tabs.json","w"))
            # order-book rows text (price / shares / total)
            rows = page.evaluate(r"""(sel)=>{
              const d=document.querySelector(sel); if(!d)return null;
              return d.innerText.slice(0,2500);
            }""", drawer_sel)
            open(ROOT/"data"/"drawer-innertext.txt","w").write(rows or "")
            # click through tabs: Graph, Resolution, back to Order Book
            for tab in ["Graph","Resolution","Order Book"]:
                try:
                    loc = page.locator(f'{drawer_sel} :text-is("{tab}")').first
                    if loc.count()>0:
                        loc.click(timeout=2500); time.sleep(1.2)
                        page.screenshot(path=str(ROOT/"screens"/f"04-tab-{tab.replace(' ','-').lower()}.png"))
                        nd = page.evaluate(DUMP, [drawer_sel, PROPS])
                        if nd: json.dump(nd, open(ROOT/"data"/f"drawer-{tab.replace(' ','-').lower()}-dom.json","w"))
                        print(f"captured tab {tab}")
                except Exception as e: print("tab err", tab, e)
        else:
            print("!! drawer not found; body sample:")
            print(page.evaluate("()=>document.body.innerText.slice(0,1200)"))

        # css vars
        varz = page.evaluate(r"""() => {const out={};const cs=getComputedStyle(document.documentElement);
          for(let i=0;i<cs.length;i++){const p=cs[i];if(p.startsWith('--'))out[p]=cs.getPropertyValue(p).trim();}return out;}""")
        json.dump(varz, open(ROOT/"data"/"vars.json","w")); print("css vars:", len(varz))
        ctx.close(); br.close(); print("DONE")

if __name__=="__main__":
    run()
