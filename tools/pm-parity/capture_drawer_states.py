#!/usr/bin/env python3
"""Capture remaining PM candidate-drawer states: Trade-No book flip, row hover,
Graph time-ranges. Complements capture_drawer.py / capture_drawer2.py."""
import json, time, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path("/home/user/pm-drawer"); (ROOT/"screens").mkdir(parents=True,exist_ok=True); (ROOT/"data").mkdir(parents=True,exist_ok=True)
URL="https://polymarket.com/event/presidential-election-winner-2028"
UA=("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

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
        ctx=br.new_context(viewport={"width":1440,"height":1400},user_agent=UA,device_scale_factor=2,locale="en-US")
        page=ctx.new_page()
        page.goto(URL,wait_until="domcontentloaded",timeout=60000)
        try: page.wait_for_load_state("networkidle",timeout=15000)
        except Exception: pass
        time.sleep(3); dismiss(page); time.sleep(1); dismiss(page)
        page.evaluate("""(nm)=>{const el=[...document.querySelectorAll('*')].find(e=>e.childElementCount===0&&(e.textContent||'').trim()===nm);
          if(el){let t=el;for(let k=0;k<4&&t;k++){if(t.getBoundingClientRect().height>=36)break;t=t.parentElement;}(t||el).scrollIntoView({block:'center'});(t||el).click();}}""","JD Vance")
        time.sleep(2)

        before=page.evaluate(r"""()=>{const e=[...document.querySelectorAll('*')].find(x=>x.childElementCount===0&&/^trade yes$/i.test((x.textContent||'').trim()));return e?e.textContent.trim():null;}""")
        # click the toggle icon that sits just to the RIGHT of the 'Trade Yes' label
        tgt=page.evaluate(r"""()=>{const lbl=[...document.querySelectorAll('*')].find(x=>x.childElementCount===0&&/^trade yes$/i.test((x.textContent||'').trim()));
          if(!lbl)return null;const lr=lbl.getBoundingClientRect();
          // find an svg/button whose x is within ~40px right of the label, same row
          const cand=[...document.querySelectorAll('svg,button,[role=button]')].map(e=>({e,r:e.getBoundingClientRect()}))
            .filter(o=>Math.abs(o.r.y-lr.y)<20 && o.r.x>=lr.right-4 && o.r.x<lr.right+50 && o.r.width>0);
          if(!cand.length)return null;const r=cand[0].r;return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};}""")
        print("toggle icon target:",tgt)
        if tgt: page.mouse.click(tgt["x"],tgt["y"])
        time.sleep(1.2)
        after=page.evaluate(r"""()=>{const e=[...document.querySelectorAll('*')].find(x=>x.childElementCount===0&&/^trade (yes|no)$/i.test((x.textContent||'').trim()));return e?e.textContent.trim():null;}""")
        flip=page.evaluate(r"""()=>{const cells=[...document.querySelectorAll('*')].filter(e=>e.childElementCount===0&&/^\d{1,2}(\.\d)?%$/.test((e.textContent||'').trim()));
          return cells.slice(0,12).map(e=>({t:e.textContent.trim(),color:getComputedStyle(e).color,y:Math.round(e.getBoundingClientRect().y)})).sort((a,b)=>a.y-b.y);}""")
        print("TRADE toggle -> before:",before," after:",after)
        print("prices after flip:"); [print("  ",c) for c in flip]
        json.dump({"before":before,"after":after,"prices":flip},open(ROOT/"data"/"trade-no-flip.json","w"))
        page.screenshot(path=str(ROOT/"screens"/"07-trade-no-book.png"))

        # flip back, hover an ask row
        page.evaluate(r"""()=>{const lbl=[...document.querySelectorAll('*')].find(x=>x.childElementCount===0&&/^trade (yes|no)$/i.test((x.textContent||'').trim()));
          if(lbl){let p=lbl.parentElement;(p.closest('button')||p).click();}}""")
        time.sleep(1)
        hov=page.evaluate(r"""()=>{const c=[...document.querySelectorAll('*')].find(e=>e.childElementCount===0&&/%$/.test((e.textContent||'').trim())&&getComputedStyle(e).color==='rgb(226, 57, 57)');
          if(!c)return null;const r=c.getBoundingClientRect();return {x:Math.round(r.x+300),y:Math.round(r.y+8)};}""")
        if hov:
            page.mouse.move(hov["x"],hov["y"]); time.sleep(0.8)
            rowbg=page.evaluate(r"""(pt)=>{const el=document.elementFromPoint(pt.x,pt.y);let t=el;for(let k=0;k<6&&t;k++){const r=t.getBoundingClientRect();if(r.height>=30&&r.height<=44){return {bg:getComputedStyle(t).backgroundColor,cursor:getComputedStyle(t).cursor,h:Math.round(r.height)};}t=t.parentElement;}return null;}""",hov)
            print("hovered ask row:",rowbg); json.dump(rowbg,open(ROOT/"data"/"hover-ask-row.json","w"))
            page.screenshot(path=str(ROOT/"screens"/"08-hover-ask-row.png"))

        # Graph tab ranges
        try:
            page.locator('button:has-text("Graph")').first.click(timeout=2500); time.sleep(1.2)
            ranges=page.evaluate(r"""()=>{const bs=[...document.querySelectorAll('button')].map(b=>(b.textContent||'').trim()).filter(t=>/^(1h|6h|1d|1w|1m|all)$/i.test(t));return [...new Set(bs)];}""")
            print("graph ranges:",ranges); json.dump(ranges,open(ROOT/"data"/"graph-ranges.json","w"))
            page.screenshot(path=str(ROOT/"screens"/"09-graph-tab.png"))
        except Exception as e: print("graph err",e)
        ctx.close(); br.close(); print("DONE")

if __name__=="__main__": run()
