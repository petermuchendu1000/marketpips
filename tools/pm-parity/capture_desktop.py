#!/usr/bin/env python3
"""Desktop PM ticket parity capture: Yes/No buttons (default + No-selected),
Market dropdown, and the related-markets rail under the ticket. HARD DATA."""
import json, time, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("/home/user/pm-probe"); (ROOT/"screens").mkdir(parents=True,exist_ok=True); (ROOT/"data").mkdir(parents=True,exist_ok=True)
URL = "https://polymarket.com/event/presidential-election-winner-2028"
PROPS = ["display","position","width","height","paddingTop","paddingRight","paddingBottom","paddingLeft",
 "marginTop","marginBottom","borderTopWidth","borderTopColor","borderStyle","borderTopLeftRadius",
 "color","backgroundColor","backgroundImage","boxShadow","fontFamily","fontSize","fontWeight","lineHeight",
 "letterSpacing","textAlign","transition","transitionDuration","transitionTimingFunction","gap","justifyContent","alignItems"]

DUMP = r"""
(args) => {
  const [rootSel, props] = args;
  const root = document.querySelector(rootSel); if(!root) return null;
  const all=[root,...root.querySelectorAll('*')]; const idx=new Map(); all.forEach((el,i)=>idx.set(el,i));
  const styleOf=(el)=>{const cs=getComputedStyle(el);const o={};for(const p of props)o[p]=cs[p];return o;};
  const vis=(el)=>{const cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden')return false;const r=el.getBoundingClientRect();return r.width>0&&r.height>0;};
  const out=[]; all.forEach((el,i)=>{ if(el.tagName==='SCRIPT'||el.tagName==='STYLE')return; if(i!==0&&!vis(el))return;
    const r=el.getBoundingClientRect(); const p=el.parentElement; const pi=(p&&idx.has(p))?idx.get(p):-1;
    out.push({i,pi,tag:el.tagName.toLowerCase(),cls:(el.getAttribute('class')||'').slice(0,160),
      aria:el.getAttribute('aria-label')||undefined,
      txt:(el.childElementCount===0?(el.textContent||'').trim().slice(0,90):undefined),
      box:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},st:styleOf(el)});
  }); return out; }
"""

def dismiss(page):
    for name in ["Accept all","Accept","Got it","I understand","Agree","Close","OK"]:
        try:
            b=page.get_by_role("button",name=name,exact=False)
            if b.count()>0: b.first.click(timeout=700); time.sleep(0.2)
        except Exception: pass
    try: page.keyboard.press("Escape")
    except Exception: pass

def tag_ticket(page):
    # ticket = positioned container holding a 'Trade' button and the 'Buy'/'Sell' tabs
    return page.evaluate(r"""() => {
      const btns=[...document.querySelectorAll('button,[role=button]')];
      let trade=btns.find(b=>/^\s*trade\s*$/i.test(b.textContent||''));
      if(!trade) return null;
      let el=trade;
      for(let k=0;k<15&&el;k++){ if(/\bBuy\b/.test(el.textContent||'')&&/\bSell\b/.test(el.textContent||'')&&el.getBoundingClientRect().width<520){ el.setAttribute('data-pm-ticket','1'); return '[data-pm-ticket="1"]'; } el=el.parentElement; }
      return null;
    }""")

def run():
    with sync_playwright() as p:
        br=p.chromium.launch(headless=True,args=["--no-sandbox","--disable-blink-features=AutomationControlled"])
        ctx=br.new_context(viewport={"width":1440,"height":1024},device_scale_factor=2,locale="en-US")
        page=ctx.new_page()
        page.goto(URL,wait_until="domcontentloaded",timeout=60000)
        try: page.wait_for_load_state("networkidle",timeout=15000)
        except Exception: pass
        time.sleep(3); dismiss(page); time.sleep(1)
        print("URL:",page.url,"| title:",page.title())
        page.screenshot(path=str(ROOT/"screens"/"d01-page.png"))
        sel=tag_ticket(page); print("ticket:",sel)
        if sel:
            page.locator(sel).screenshot(path=str(ROOT/"screens"/"d02-ticket-default.png"))
            nodes=page.evaluate(DUMP,[sel,PROPS]); json.dump(nodes,open(ROOT/"data"/"d-ticket-default.json","w")); print("ticket nodes:",len(nodes))
            # click No to capture selected-No state
            try:
                page.locator(f"{sel} button:has-text('No')").first.click(timeout=3000); time.sleep(0.8)
                page.locator(sel).screenshot(path=str(ROOT/"screens"/"d03-ticket-no.png"))
                nodes2=page.evaluate(DUMP,[sel,PROPS]); json.dump(nodes2,open(ROOT/"data"/"d-ticket-no.json","w")); print("no-state nodes:",len(nodes2))
            except Exception as e: print("No click err",e)
        # Related-markets rail: capture the sidebar column and text under the ticket
        page.screenshot(path=str(ROOT/"screens"/"d04-full.png"), full_page=False)
        # Dump the whole right column area: find element containing 'Republican Presidential' etc via a broad sidebar tag
        rel = page.evaluate(r"""() => {
          // the related list sits after the ticket in the right rail; grab links to other /event/ pages near the ticket
          const as=[...document.querySelectorAll('a[href*="/event/"]')];
          return as.slice(0,40).map(a=>({href:a.getAttribute('href'),txt:(a.textContent||'').trim().slice(0,120),
            box:(()=>{const r=a.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};})()}));
        }""")
        json.dump(rel,open(ROOT/"data"/"d-related-links.json","w"))
        print("related links:",len(rel))
        ctx.close(); br.close(); print("DONE")

if __name__=="__main__": run()
