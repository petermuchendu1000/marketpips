#!/usr/bin/env python3
"""Exhaustive desktop capture of the PM multi-outcome option board + states:
  - option row geometry/computed styles (single-line desktop layout)
  - price-change chip, %/chance, Buy Yes / Buy No inline buttons
  - click a candidate name -> resulting state (URL / drawer / arm)
  - click Buy Yes -> ticket arm
  - section boxing audit (which sections have border/bg vs borderless)
Outputs /home/user/pm-probe/{screens,data}."""
import json, time, pathlib
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path("/home/user/pm-probe"); (ROOT/"screens").mkdir(parents=True,exist_ok=True); (ROOT/"data").mkdir(parents=True,exist_ok=True)
URL="https://polymarket.com/event/presidential-election-winner-2028"
PROPS=["display","flexDirection","alignItems","justifyContent","gap","width","height","paddingTop","paddingRight","paddingBottom","paddingLeft","marginTop","marginBottom","borderTopWidth","borderBottomWidth","borderTopColor","borderStyle","borderTopLeftRadius","color","backgroundColor","fontFamily","fontSize","fontWeight","lineHeight","letterSpacing","textAlign","boxShadow"]

ROW_JS=r"""
(props)=>{
  const styleOf=(el)=>{const cs=getComputedStyle(el);const o={};for(const p of props)o[p]=cs[p];return o;};
  const boxOf=(el)=>{const r=el.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};};
  // find the option board: buttons "Buy Yes ...¢" in the LEFT/main column (x<900)
  const btns=[...document.querySelectorAll('button,[role=button]')].filter(b=>/^Buy Yes/.test((b.textContent||'').trim()) && boxOf(b).x<900);
  if(!btns.length) return {rows:[], note:'no Buy Yes buttons'};
  // the row is the ancestor that also contains a 'Buy No' and the candidate name
  const rowOf=(b)=>{let el=b; for(let k=0;k<8&&el;k++){ if(/Buy No/.test(el.textContent||'') && boxOf(el).w>500){return el;} el=el.parentElement;} return b.parentElement;};
  const rows=[];
  const seen=new Set();
  for(const b of btns.slice(0,3)){
    const row=rowOf(b); if(!row||seen.has(row))continue; seen.add(row);
    // collect leaf text nodes + the two buy buttons
    const leaves=[...row.querySelectorAll('*')].filter(e=>e.childElementCount===0 && (e.textContent||'').trim());
    const buys=[...row.querySelectorAll('button,[role=button]')].filter(x=>/^Buy (Yes|No)/.test((x.textContent||'').trim()));
    rows.push({ row:{box:boxOf(row), st:styleOf(row)},
      texts:leaves.slice(0,8).map(e=>({t:(e.textContent||'').trim().slice(0,40), box:boxOf(e), fs:getComputedStyle(e).fontSize, fw:getComputedStyle(e).fontWeight, col:getComputedStyle(e).color})),
      buys:buys.map(x=>({t:(x.textContent||'').trim(), box:boxOf(x), st:styleOf(x)})) });
  }
  return {rows};
}
"""

SECTION_JS=r"""
(props)=>{
  const styleOf=(el)=>{const cs=getComputedStyle(el);return {border:cs.borderTopWidth+' '+cs.borderTopColor, bg:cs.backgroundColor, radius:cs.borderTopLeftRadius, boxShadow:cs.boxShadow};};
  const boxOf=(el)=>{const r=el.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};};
  // Heuristic: find headings and report their nearest block container's border/bg
  const heads=[...document.querySelectorAll('h1,h2,h3')].filter(h=>(h.textContent||'').trim());
  return heads.slice(0,20).map(h=>{ let el=h.parentElement; let framed=null;
    for(let k=0;k<5&&el;k++){ const cs=getComputedStyle(el); if((parseFloat(cs.borderTopWidth)>0)|| cs.boxShadow!=='none'){ framed={tag:el.tagName.toLowerCase(), st:styleOf(el), box:boxOf(el)}; break;} el=el.parentElement; }
    return {heading:(h.textContent||'').trim().slice(0,40), box:boxOf(h), framed};
  });
}
"""

def dismiss(p):
    for n in ["Accept all","Accept","Agree","Close"]:
        try:
            b=p.get_by_role("button",name=n,exact=False)
            if b.count()>0: b.first.click(timeout=600); time.sleep(0.2)
        except Exception: pass
    try: p.keyboard.press("Escape")
    except Exception: pass

def run():
    with sync_playwright() as pw:
        br=pw.chromium.launch(headless=True,args=["--no-sandbox","--disable-blink-features=AutomationControlled"])
        ctx=br.new_context(viewport={"width":1440,"height":1024},device_scale_factor=2,locale="en-US")
        pg=ctx.new_page(); pg.goto(URL,wait_until="domcontentloaded",timeout=60000)
        try: pg.wait_for_load_state("networkidle",timeout=15000)
        except Exception: pass
        time.sleep(4); dismiss(pg); time.sleep(1)
        print("URL:",pg.url)
        # option board crop (left/main column rows)
        pg.screenshot(path=str(ROOT/"screens"/"b01-board.png"), clip={"x":290,"y":600,"width":650,"height":420})
        rows=pg.evaluate(ROW_JS, PROPS); json.dump(rows,open(ROOT/"data"/"b-rows.json","w"))
        print("rows:",len(rows.get("rows",[])), rows.get("note",""))
        secs=pg.evaluate(SECTION_JS, PROPS); json.dump(secs,open(ROOT/"data"/"b-sections.json","w"))
        framed=[s for s in secs if s.get("framed")]
        print("headings:",len(secs),"framed:",len(framed))
        for s in secs: print("  ",repr(s["heading"]),"FRAMED" if s.get("framed") else "borderless")
        # Click a candidate NAME (JD Vance) -> capture resulting state
        try:
            before=pg.url
            pg.get_by_text("JD Vance", exact=True).first.click(timeout=4000); time.sleep(2)
            print("after name click URL:",pg.url,"(changed)" if pg.url!=before else "(same)")
            pg.screenshot(path=str(ROOT/"screens"/"b02-after-name-click.png"))
        except Exception as e: print("name click err",e)
        # go back if navigated
        if pg.url!=URL:
            pg.goto(URL,wait_until="domcontentloaded",timeout=60000); time.sleep(3); dismiss(pg); time.sleep(1)
        # Click Buy Yes on first candidate -> ticket arm
        try:
            pg.locator("button:has-text('Buy Yes')").first.click(timeout=4000); time.sleep(1.5)
            pg.screenshot(path=str(ROOT/"screens"/"b03-after-buyyes.png"))
            print("clicked Buy Yes")
        except Exception as e: print("buyyes err",e)
        ctx.close(); br.close(); print("DONE")
if __name__=="__main__": run()
