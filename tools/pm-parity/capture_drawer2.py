#!/usr/bin/env python3
"""Capture the FULL PM candidate order-book drawer (hard data).

Walks up from the 'Order Book' button to the drawer container (h>250),
dumps its complete subtree with computed styles + geometry, and separately
extracts structured order-book rows (price/shares/total + text color +
depth-bar background/width), the Asks/Bids/Last/Spread markers, the
TRADE YES toggle, column headers, and hover states on an ask + a bid row.
"""
import json, time, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("/home/user/pm-drawer")
(ROOT/"data").mkdir(parents=True, exist_ok=True)
(ROOT/"screens").mkdir(parents=True, exist_ok=True)
URL = "https://polymarket.com/event/presidential-election-winner-2028"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
PROPS = ["display","position","width","height","paddingTop","paddingRight","paddingBottom","paddingLeft",
 "marginTop","marginBottom","borderTopWidth","borderBottomWidth","borderTopColor","borderBottomColor",
 "borderTopLeftRadius","borderTopRightRadius","color","backgroundColor","backgroundImage","fontFamily",
 "fontSize","fontWeight","lineHeight","letterSpacing","textAlign","textTransform","opacity","boxShadow",
 "transition","transitionDuration","transitionTimingFunction","flexDirection","justifyContent",
 "alignItems","gap","gridTemplateColumns","zIndex","cursor"]

DUMP = r"""
(args) => {
  const [sel, props] = args;
  const root = document.querySelector(sel); if(!root) return null;
  const all=[root,...root.querySelectorAll('*')]; const idx=new Map(); all.forEach((e,i)=>idx.set(e,i));
  const sty=(e)=>{const c=getComputedStyle(e);const o={};for(const p of props)o[p]=c[p];return o;};
  const vis=(e)=>{const c=getComputedStyle(e);if(c.display==='none'||c.visibility==='hidden')return false;const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};
  const out=[];
  all.forEach((e,i)=>{ if(e.tagName==='SCRIPT'||e.tagName==='STYLE')return; if(i!==0&&!vis(e))return;
    const r=e.getBoundingClientRect(); const p=e.parentElement; const pi=(p&&idx.has(p))?idx.get(p):-1;
    out.push({i,pi,tag:e.tagName.toLowerCase(),cls:(e.getAttribute('class')||'').slice(0,160),
      role:e.getAttribute('role')||undefined,aria:e.getAttribute('aria-label')||undefined,
      txt:(e.childElementCount===0?(e.textContent||'').trim().slice(0,90):undefined),
      box:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},st:sty(e)});
  });
  return out;
}
"""

def dismiss(page):
    for name in ["Accept all","Accept","Got it","Agree","Close","OK","No thanks"]:
        try:
            b=page.get_by_role("button",name=name,exact=False)
            if b.count()>0: b.first.click(timeout=800); time.sleep(0.25)
        except Exception: pass
    for _ in range(3):
        try: page.keyboard.press("Escape"); time.sleep(0.1)
        except Exception: pass

def run():
    with sync_playwright() as p:
        br=p.chromium.launch(headless=True,args=["--no-sandbox","--disable-blink-features=AutomationControlled"])
        ctx=br.new_context(viewport={"width":1440,"height":1600},user_agent=UA,device_scale_factor=2,locale="en-US")
        page=ctx.new_page()
        page.goto(URL,wait_until="domcontentloaded",timeout=60000)
        try: page.wait_for_load_state("networkidle",timeout=15000)
        except Exception: pass
        time.sleep(3); dismiss(page); time.sleep(1); dismiss(page)

        page.evaluate("""(nm)=>{const el=[...document.querySelectorAll('*')].find(e=>e.childElementCount===0&&(e.textContent||'').trim()===nm);
          if(el){let t=el;for(let k=0;k<4&&t;k++){if(t.getBoundingClientRect().height>=36)break;t=t.parentElement;}(t||el).scrollIntoView({block:'center'});(t||el).click();}}""","JD Vance")
        time.sleep(2.2)

        # Walk up from the 'Order Book' button to the drawer container (h>=250, contains PRICE)
        sel=page.evaluate(r"""()=>{
          const ob=[...document.querySelectorAll('button')].find(b=>/^order book$/i.test((b.textContent||'').trim()));
          if(!ob)return null; let el=ob;
          for(let k=0;k<8&&el;k++){ const r=el.getBoundingClientRect(); const t=el.textContent||'';
            if(r.height>=250 && /price/i.test(t) && /(asks|bids)/i.test(t)){ el.setAttribute('data-pm-ob','1'); return '[data-pm-ob="1"]';}
            el=el.parentElement; }
          return null;
        }""")
        print("drawer container selector:", sel)
        if sel:
            nodes=page.evaluate(DUMP,[sel,PROPS]); json.dump(nodes,open(ROOT/"data"/"ob-full-dom.json","w"))
            print("ob-full nodes:", len(nodes))

        # Structured order-book rows: text color classifies ask(red)/bid(green)
        rows=page.evaluate(r"""()=>{
          const box=document.querySelector('[data-pm-ob="1"]')||document.body;
          const cells=[...box.querySelectorAll('*')].filter(e=>e.childElementCount===0);
          const rowsByY={};
          for(const e of cells){ const t=(e.textContent||'').trim(); if(!t)continue;
            const r=e.getBoundingClientRect(); if(r.width<1)continue;
            const y=Math.round(r.y); (rowsByY[y]=rowsByY[y]||[]).push({t,x:Math.round(r.x),color:getComputedStyle(e).color,fs:getComputedStyle(e).fontSize,fw:getComputedStyle(e).fontWeight});
          }
          return Object.keys(rowsByY).sort((a,b)=>a-b).map(y=>({y:+y,cells:rowsByY[y].sort((a,b)=>a.x-b.x)}));
        }""")
        json.dump(rows,open(ROOT/"data"/"ob-rows.json","w"))
        print("\n=== ORDER BOOK ROWS (y | cells) ===")
        for r in rows:
            line=" | ".join(f"{c['t']}[{c['color']}]" for c in r['cells'])
            print(f"y{r['y']:4}: {line}")

        # depth-bar elements: children with a non-transparent bg inside the table area
        bars=page.evaluate(r"""()=>{
          const box=document.querySelector('[data-pm-ob="1"]'); if(!box)return [];
          return [...box.querySelectorAll('*')].map(e=>{const c=getComputedStyle(e);const r=e.getBoundingClientRect();
            return {bg:c.backgroundColor,bgi:c.backgroundImage,w:Math.round(r.width),h:Math.round(r.height),x:Math.round(r.x),y:Math.round(r.y),pos:c.position};})
            .filter(o=>o.bg && o.bg!=='rgba(0, 0, 0, 0)' && o.h<40 && o.h>6 && o.w>20);
        }""")
        json.dump(bars,open(ROOT/"data"/"ob-depth-bars.json","w"))
        print("\n=== DEPTH BARS (colored) ===")
        for b in bars[:16]: print(b)

        # Asks/Bids/Last/Spread markers + Maker Rebate/Rewards/tick
        markers=page.evaluate(r"""()=>{
          const box=document.querySelector('[data-pm-ob="1"]')||document.body;
          const want=/^(asks|bids|last|spread|trade yes|trade no|maker rebate|rewards|price|shares|total|0\.1¢)/i;
          return [...box.querySelectorAll('*')].filter(e=>e.childElementCount===0 && want.test((e.textContent||'').trim())).map(e=>{
            const c=getComputedStyle(e);const r=e.getBoundingClientRect();
            return {t:(e.textContent||'').trim().slice(0,40),color:c.color,bg:c.backgroundColor,fs:c.fontSize,fw:c.fontWeight,
                    br:c.borderTopLeftRadius,px:c.paddingLeft,x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};
          });
        }""")
        json.dump(markers,open(ROOT/"data"/"ob-markers.json","w"))
        print("\n=== MARKERS ===")
        for m in markers: print(m)

        # hover an ask row then a bid row
        try:
            page.mouse.move(700, rows[2]['y']+5); time.sleep(0.6)
            page.screenshot(path=str(ROOT/"screens"/"05-hover-ask.png"))
        except Exception as e: print("hover err",e)

        # full-page tall screenshot of the drawer region
        page.screenshot(path=str(ROOT/"screens"/"06-ob-full.png"))
        ctx.close(); br.close(); print("\nDONE")

if __name__=="__main__": run()
