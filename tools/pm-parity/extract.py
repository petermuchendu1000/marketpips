#!/usr/bin/env python3
"""Polymarket market-detail extraction harness.
Captures: clean screenshots (overlays dismissed), full DOM tree with geometry +
curated computed styles per visible element, :root CSS custom properties, and
per-element hover-state deltas for a set of interactive targets.

Usage:
  python3 extract.py <url> <label> <device>   device in {desktop,mobile}
Outputs (under /home/user/pm-parity):
  screens/<label>-<device>-full.png
  screens/<label>-<device>-view.png
  data/<label>-<device>-dom.json      (tree: tag/class/text/bbox/styles)
  data/<label>-<device>-vars.json     (:root custom props)
"""
import sys, json, time, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("/home/user/pm-parity")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")

# curated computed-style properties worth capturing for parity
PROPS = [
    "display","position","boxSizing","width","height","marginTop","marginRight",
    "marginBottom","marginLeft","paddingTop","paddingRight","paddingBottom",
    "paddingLeft","borderTopWidth","borderRightWidth","borderBottomWidth",
    "borderLeftWidth","borderTopColor","borderStyle","borderTopLeftRadius",
    "borderTopRightRadius","borderBottomRightRadius","borderBottomLeftRadius",
    "color","backgroundColor","backgroundImage","fontFamily","fontSize",
    "fontWeight","fontStyle","lineHeight","letterSpacing","textAlign",
    "textTransform","textDecorationLine","opacity","boxShadow","transition",
    "transform","flexDirection","justifyContent","alignItems","gap","flexWrap",
    "gridTemplateColumns","zIndex","overflow","whiteSpace","cursor","objectFit",
]

DISMISS_JS = r"""
() => {
  const kill = [];
  // remove obvious overlays / modals / cookie banners / toasts
  const sel = [
    '[role=dialog]','[aria-modal=true]','[data-testid*=modal i]',
    '[class*=modal i]','[class*=Modal]','[class*=overlay i]','[class*=Overlay]',
    '[class*=backdrop i]','[class*=cookie i]','[class*=Cookie]',
    '[class*=toast i]','[class*=banner i]','[id*=onetrust i]','[class*=drawer i]'
  ];
  document.querySelectorAll(sel.join(',')).forEach(el => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    // only remove things that visually overlay (fixed/absolute large or high z)
    const z = parseInt(cs.zIndex)||0;
    if (cs.position==='fixed' || z>=40 || (r.width>window.innerWidth*0.6 && cs.position==='absolute')) {
      kill.push(el);
    }
  });
  kill.forEach(el=>el.remove());
  // unlock body scroll
  document.body.style.overflow='auto';
  document.documentElement.style.overflow='auto';
  return kill.length;
}
"""

WALK_JS = r"""
(props) => {
  // FLAT capture: every element, per-element visibility (no subtree pruning),
  // parent index recorded so tree can be reconstructed in Python.
  const all = Array.from(document.querySelectorAll('body *'));
  const idx = new Map();
  all.forEach((el,i)=>idx.set(el,i));
  function styleOf(el){
    const cs = getComputedStyle(el);
    const o = {};
    for (const p of props) o[p] = cs[p];
    return o;
  }
  function visible(el){
    const cs = getComputedStyle(el);
    if (cs.display==='none' || cs.visibility==='hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width>0 && r.height>0 && r.bottom>0 && r.right>0;
  }
  const out = [];
  all.forEach((el,i)=>{
    if (!visible(el)) return;
    if ((el.tagName==='SCRIPT')||(el.tagName==='STYLE')) return;
    const r = el.getBoundingClientRect();
    let p = el.parentElement;
    const pi = (p && idx.has(p)) ? idx.get(p) : -1;
    out.push({
      i, pi,
      tag: el.tagName.toLowerCase(),
      cls: (el.getAttribute('class')||'').slice(0,200),
      testid: el.getAttribute('data-testid')||undefined,
      role: el.getAttribute('role')||undefined,
      aria: el.getAttribute('aria-label')||undefined,
      href: el.tagName==='A'? (el.getAttribute('href')||undefined): undefined,
      txt: (el.childElementCount===0 ? (el.textContent||'').trim().slice(0,120) : undefined),
      box: {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},
      st: styleOf(el)
    });
  });
  return out;
}
"""

VARS_JS = r"""
() => {
  const out = {};
  const roots = [document.documentElement, document.body];
  // also sample the top few wrappers where design tokens are often scoped
  const main = document.querySelector('main');
  if (main){ roots.push(main); if(main.parentElement) roots.push(main.parentElement); }
  for (const el of roots){
    if(!el) continue;
    const cs = getComputedStyle(el);
    for (let i=0;i<cs.length;i++){
      const p = cs[i];
      if (p.startsWith('--') && !(p in out)) out[p]=cs.getPropertyValue(p).trim();
    }
  }
  return out;
}
"""

def dismiss(page):
    try: page.keyboard.press("Escape")
    except Exception: pass
    time.sleep(0.3)
    # try common close buttons
    for name in ["Close","close","Dismiss","Accept","Accept all","Got it","×","No thanks"]:
        try:
            btn = page.get_by_role("button", name=name, exact=False)
            if btn.count()>0:
                btn.first.click(timeout=800)
                time.sleep(0.2)
        except Exception: pass
    try:
        n = page.evaluate(DISMISS_JS)
        print(f"   removed {n} overlay nodes")
    except Exception as e:
        print("   dismiss js err", e)
    time.sleep(0.3)

def run(url, label, device):
    ROOT.joinpath("screens").mkdir(parents=True, exist_ok=True)
    ROOT.joinpath("data").mkdir(parents=True, exist_ok=True)
    vp = {"width":1440,"height":1024} if device=="desktop" else {"width":390,"height":844}
    is_mobile = device!="desktop"
    with sync_playwright() as p:
        br = p.chromium.launch(headless=True, args=["--no-sandbox","--disable-blink-features=AutomationControlled"])
        ctx = br.new_context(viewport=vp, user_agent=UA, device_scale_factor=2,
                             is_mobile=is_mobile, has_touch=is_mobile, locale="en-US")
        page = ctx.new_page()
        print(f"[{label}/{device}] goto {url}")
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        try: page.wait_for_load_state("networkidle", timeout=20000)
        except Exception: print("   (networkidle timeout, continuing)")
        time.sleep(2.0)
        dismiss(page)
        # scroll to trigger lazy content then back to top
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        time.sleep(1.2)
        page.evaluate("window.scrollTo(0,0)")
        time.sleep(0.6)
        dismiss(page)
        base = f"{label}-{device}"
        page.screenshot(path=str(ROOT/"screens"/f"{base}-view.png"))
        page.screenshot(path=str(ROOT/"screens"/f"{base}-full.png"), full_page=True)
        print("   screenshots saved")
        nodes = page.evaluate(WALK_JS, PROPS)
        json.dump(nodes, open(ROOT/"data"/f"{base}-dom.json","w"))
        varz = page.evaluate(VARS_JS)
        json.dump(varz, open(ROOT/"data"/f"{base}-vars.json","w"))
        print(f"   dom nodes: {len(nodes)}   css vars: {len(varz)}")
        ctx.close(); br.close()

if __name__=="__main__":
    url, label, device = sys.argv[1], sys.argv[2], sys.argv[3]
    run(url, label, device)
