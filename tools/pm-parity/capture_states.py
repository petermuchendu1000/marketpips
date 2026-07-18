#!/usr/bin/env python3
"""Stage 3: capture the TYPED payout state and the LIMIT-order layout of the
PM mobile Buy sheet as HARD DATA (computed styles + geometry + screenshots).

Outputs under /home/user/pm-probe/{screens,data}:
  06-typed-yes.png            amount typed -> "To win" payout + avg-price line
  07-limit-layout.png         Limit order type -> limit price + shares inputs
  typed-dom.json / limit-dom.json  flat DOM dumps (geometry + computed styles)
"""
import json, time, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("/home/user/pm-probe")
ROOT.joinpath("screens").mkdir(parents=True, exist_ok=True)
ROOT.joinpath("data").mkdir(parents=True, exist_ok=True)
UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
      "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1")
URL = "https://polymarket.com/event/world-cup-winner"

PROPS = ["display","position","top","right","bottom","left","width","height",
 "marginTop","marginBottom","paddingTop","paddingRight","paddingBottom","paddingLeft",
 "borderTopWidth","borderTopColor","borderStyle","borderTopLeftRadius",
 "color","backgroundColor","backgroundImage","boxShadow",
 "fontFamily","fontSize","fontWeight","lineHeight","letterSpacing","textAlign",
 "transition","transitionDuration","transitionTimingFunction","transform",
 "flexDirection","justifyContent","alignItems","gap","zIndex","opacity","whiteSpace"]

DUMP = r"""
(args) => {
  const [rootSel, props] = args;
  const root = document.querySelector(rootSel);
  if (!root) return null;
  const all = [root, ...root.querySelectorAll('*')];
  const idx = new Map(); all.forEach((el,i)=>idx.set(el,i));
  const styleOf=(el)=>{const cs=getComputedStyle(el);const o={};for(const p of props)o[p]=cs[p];return o;};
  const vis=(el)=>{const cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden')return false;
                   const r=el.getBoundingClientRect();return r.width>0&&r.height>0;};
  const out=[];
  all.forEach((el,i)=>{
    if(el.tagName==='SCRIPT'||el.tagName==='STYLE')return;
    if(i!==0&&!vis(el))return;
    const r=el.getBoundingClientRect();const p=el.parentElement;const pi=(p&&idx.has(p))?idx.get(p):-1;
    out.push({i,pi,tag:el.tagName.toLowerCase(),cls:(el.getAttribute('class')||'').slice(0,200),
      aria:el.getAttribute('aria-label')||undefined,role:el.getAttribute('role')||undefined,
      ph:el.getAttribute('placeholder')||undefined,val:el.value||undefined,
      txt:(el.childElementCount===0?(el.textContent||'').trim().slice(0,120):undefined),
      box:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},
      st:styleOf(el)});
  });
  return out;
}
"""

def dismiss(page):
    for name in ["Accept all","Accept","Got it","I understand","Agree","Close","OK"]:
        try:
            b=page.get_by_role("button",name=name,exact=False)
            if b.count()>0: b.first.click(timeout=700); time.sleep(0.2)
        except Exception: pass
    try: page.keyboard.press("Escape")
    except Exception: pass

def tag_sheet(page):
    return page.evaluate(r"""() => {
      const btns=[...document.querySelectorAll('button,[role=button]')];
      let trade=btns.find(b=>/^\s*trade\s*$/i.test(b.textContent||''));
      if(!trade)return null;
      let el=trade;
      for(let k=0;k<12&&el;k++){const cs=getComputedStyle(el);
        if((cs.position==='fixed'||cs.position==='absolute')&&/buy/i.test(el.textContent||'')){
          el.setAttribute('data-pm-sheet','1');return '[data-pm-sheet="1"]';}
        el=el.parentElement;}
      return null;
    }""")

def run():
    with sync_playwright() as p:
        br=p.chromium.launch(headless=True,args=["--no-sandbox","--disable-blink-features=AutomationControlled"])
        ctx=br.new_context(viewport={"width":390,"height":844},user_agent=UA,
                           device_scale_factor=3,is_mobile=True,has_touch=True,locale="en-US")
        page=ctx.new_page()
        page.goto(URL,wait_until="domcontentloaded",timeout=60000)
        try: page.wait_for_load_state("networkidle",timeout=15000)
        except Exception: pass
        time.sleep(3); dismiss(page); time.sleep(1)
        # open sheet via first Yes
        page.locator("button:has-text('Yes')").first.click(timeout=5000); time.sleep(2)
        sel=tag_sheet(page)
        print("sheet:",sel)
        if not sel:
            print("NO SHEET"); ctx.close(); br.close(); return
        # ---- TYPED STATE: type an amount into the decimal input ----
        inp=page.locator(f"{sel} input[inputmode='decimal'], {sel} input").first
        try:
            inp.click(timeout=3000); time.sleep(0.3)
            inp.type("217", delay=90); time.sleep(1.2)
        except Exception as e:
            print("type err",e)
        page.screenshot(path=str(ROOT/"screens"/"06-typed-yes.png"))
        nodes=page.evaluate(DUMP,[sel,PROPS])
        if nodes: json.dump(nodes,open(ROOT/"data"/"typed-dom.json","w")); print("typed nodes:",len(nodes))
        # capture just the payout text region as plain text
        print("SHEET TEXT (typed):")
        print(page.locator(sel).inner_text()[:400])
        # ---- LIMIT LAYOUT: open settings -> Limit ----
        try:
            page.locator(f"{sel} button[aria-label='Order type settings']").click(timeout=3000); time.sleep(0.8)
            page.get_by_text("Limit",exact=True).first.click(timeout=3000); time.sleep(1.2)
            page.screenshot(path=str(ROOT/"screens"/"07-limit-layout.png"))
            sel2=tag_sheet(page) or sel
            nodes2=page.evaluate(DUMP,[sel2,PROPS])
            if nodes2: json.dump(nodes2,open(ROOT/"data"/"limit-dom.json","w")); print("limit nodes:",len(nodes2))
            print("SHEET TEXT (limit):")
            print(page.locator(sel2).inner_text()[:500])
        except Exception as e:
            print("limit err",e)
        ctx.close(); br.close(); print("DONE")

if __name__=="__main__":
    run()
