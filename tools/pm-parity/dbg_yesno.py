import json, time, pathlib
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path("/home/user/pm-probe"); (ROOT/"data").mkdir(parents=True,exist_ok=True)
URL="https://polymarket.com/event/presidential-election-winner-2028"
PROPS=["display","width","height","paddingTop","paddingRight","paddingBottom","paddingLeft","borderTopWidth","borderTopColor","borderTopLeftRadius","color","backgroundColor","fontFamily","fontSize","fontWeight","lineHeight","letterSpacing","textAlign","boxShadow","transition","gap","justifyContent","alignItems"]
JS=r"""
(props)=>{
  const styleOf=(el)=>{const cs=getComputedStyle(el);const o={};for(const p of props)o[p]=cs[p];return o;};
  const boxOf=(el)=>{const r=el.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};};
  const res=[];
  const all=[...document.querySelectorAll('*')];
  for(const el of all){
    const t=(el.textContent||'').trim();
    const bx=boxOf(el);
    if(/¢/.test(t) && /^(Yes|No)/.test(t) && t.length<24 && bx.w>80 && bx.h>24 && bx.h<90){
      res.push({tag:el.tagName.toLowerCase(), role:el.getAttribute('role')||'', cls:(el.getAttribute('class')||'').slice(0,120), txt:t, box:bx, st:styleOf(el)});
    }
  }
  return res;
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
with sync_playwright() as pw:
    br=pw.chromium.launch(headless=True,args=["--no-sandbox"])
    ctx=br.new_context(viewport={"width":1440,"height":1024},device_scale_factor=2,locale="en-US")
    pg=ctx.new_page(); pg.goto(URL,wait_until="domcontentloaded",timeout=60000)
    try: pg.wait_for_load_state("networkidle",timeout=15000)
    except Exception: pass
    time.sleep(6); dismiss(pg); time.sleep(2)
    r=pg.evaluate(JS,PROPS)
    # keep the innermost (smallest) match for Yes and for No
    json.dump(r,open(ROOT/"data"/"d-yesno-debug.json","w"))
    print("matches:",len(r))
    for m in r[:12]:
        print(m['tag'], m['role'], m['box'], repr(m['txt']), '| bg',m['st']['backgroundColor'],'col',m['st']['color'],'r',m['st']['borderTopLeftRadius'],'fs',m['st']['fontSize'],'/',m['st']['fontWeight'])
    ctx.close(); br.close()
