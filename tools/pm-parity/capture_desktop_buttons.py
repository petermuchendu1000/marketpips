#!/usr/bin/env python3
"""Focused desktop capture: Yes/No ticket buttons (default + No-selected) and
Market dropdown + related-rail item styling — extracted by text match."""
import json, time, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path("/home/user/pm-probe"); (ROOT/"screens").mkdir(parents=True,exist_ok=True); (ROOT/"data").mkdir(parents=True,exist_ok=True)
URL = "https://polymarket.com/event/presidential-election-winner-2028"
PROPS = ["display","width","height","paddingTop","paddingRight","paddingBottom","paddingLeft",
 "borderTopWidth","borderTopColor","borderStyle","borderTopLeftRadius","color","backgroundColor",
 "fontFamily","fontSize","fontWeight","lineHeight","letterSpacing","textAlign","boxShadow",
 "transition","transitionDuration","transitionTimingFunction","gap","justifyContent","alignItems"]

EXTRACT = r"""
(props) => {
  const styleOf=(el)=>{const cs=getComputedStyle(el);const o={};for(const p of props)o[p]=cs[p];return o;};
  const boxOf=(el)=>{const r=el.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};};
  const out={buttons:[], dropdown:null, related:[]};
  // Yes/No ticket buttons: button whose text starts with Yes/No followed by a number+¢
  const btns=[...document.querySelectorAll('button,[role=button]')];
  for(const b of btns){
    const t=(b.textContent||'').trim();
    if(/^(Yes|No)[\s\S]*¢/.test(t) && t.length<16 && boxOf(b).w>90){
      out.buttons.push({txt:t, box:boxOf(b), st:styleOf(b)});
    }
  }
  // Market/Sell dropdown trigger
  const dd=btns.find(b=>/^\s*Market\s*$/.test((b.textContent||'').trim()));
  if(dd) out.dropdown={txt:'Market', box:boxOf(dd), st:styleOf(dd)};
  // Related rail: anchors to other /event/ pages that sit in the right half (x>900)
  const as=[...document.querySelectorAll('a[href*="/event/"]')];
  for(const a of as){ const bx=boxOf(a); if(bx.x>900 && bx.w>150 && bx.h>28){
    // gather child text pieces
    const kids=[...a.querySelectorAll('*')].filter(e=>e.childElementCount===0 && (e.textContent||'').trim());
    out.related.push({href:a.getAttribute('href'), box:bx, st:styleOf(a),
      texts:kids.slice(0,6).map(e=>({t:(e.textContent||'').trim().slice(0,60), fs:getComputedStyle(e).fontSize, fw:getComputedStyle(e).fontWeight, col:getComputedStyle(e).color, box:boxOf(e)}))});
  }}
  return out;
}
"""

def dismiss(page):
    for name in ["Accept all","Accept","Got it","Agree","Close"]:
        try:
            b=page.get_by_role("button",name=name,exact=False)
            if b.count()>0: b.first.click(timeout=600); time.sleep(0.2)
        except Exception: pass
    try: page.keyboard.press("Escape")
    except Exception: pass

def run():
    with sync_playwright() as p:
        br=p.chromium.launch(headless=True,args=["--no-sandbox","--disable-blink-features=AutomationControlled"])
        ctx=br.new_context(viewport={"width":1440,"height":1024},device_scale_factor=2,locale="en-US")
        page=ctx.new_page()
        page.goto(URL,wait_until="domcontentloaded",timeout=60000)
        try: page.wait_for_load_state("networkidle",timeout=15000)
        except Exception: pass
        time.sleep(3); dismiss(page); time.sleep(1)
        data=page.evaluate(EXTRACT, PROPS)
        json.dump(data, open(ROOT/"data"/"d-buttons.json","w"))
        print("buttons:",len(data["buttons"]),"dropdown:",bool(data["dropdown"]),"related:",len(data["related"]))
        # screenshot the right rail (crop)
        page.screenshot(path=str(ROOT/"screens"/"d10-rail.png"), clip={"x":1040,"y":120,"width":400,"height":900})
        # click No then re-extract buttons for selected-No state
        try:
            page.locator("button:has-text('No')").first.click(timeout=3000); time.sleep(0.7)
            d2=page.evaluate(EXTRACT, PROPS); json.dump(d2, open(ROOT/"data"/"d-buttons-no.json","w"))
            page.screenshot(path=str(ROOT/"screens"/"d11-no-selected.png"), clip={"x":1040,"y":120,"width":400,"height":420})
            print("no-state buttons:",[b['txt'] for b in d2['buttons']])
        except Exception as e: print("No click err",e)
        ctx.close(); br.close(); print("DONE")
if __name__=="__main__": run()
