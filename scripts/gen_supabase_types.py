#!/usr/bin/env python3
"""Generate a Supabase-style TS `Database` type from a live Postgres schema.
No Docker required. Covers: enums, tables (Row/Insert/Update), views,
FK relationships, and functions (Args/Returns)."""
import psycopg2, sys, re

DSN = sys.argv[1]
SCHEMA = "public"
conn = psycopg2.connect(DSN, connect_timeout=20)
cur = conn.cursor()

def q(sql, args=()):
    cur.execute(sql, args); return cur.fetchall()

# ---- enums ----
enums = {}
for name, label in q("""
  select t.typname, e.enumlabel
  from pg_type t join pg_enum e on e.enumtypid=t.oid
  join pg_namespace n on n.oid=t.typnamespace
  where n.nspname=%s order by t.typname, e.enumsortorder""", (SCHEMA,)):
    enums.setdefault(name, []).append(label)

def ts_scalar(udt, is_enum):
    if is_enum:
        return f'Database["public"]["Enums"]["{udt}"]'
    m = {
        "int2":"number","int4":"number","int8":"number","numeric":"number",
        "float4":"number","float8":"number","money":"number",
        "bool":"boolean",
        "json":"Json","jsonb":"Json",
        "uuid":"string","text":"string","varchar":"string","bpchar":"string",
        "name":"string","citext":"string",
        "timestamptz":"string","timestamp":"string","date":"string",
        "time":"string","timetz":"string","interval":"string",
    }
    return m.get(udt, "string")

def col_type(udt, is_array, is_enum):
    base = ts_scalar(udt.lstrip("_"), is_enum)
    return base + ("[]" if is_array else "")

# ---- columns for tables & views ----
def get_columns(relkind_tables=True):
    rows = q("""
      select c.relname, a.attname, a.attnum,
             t.typname as udt, a.attnotnull,
             (t.typtype='e') as is_enum,
             (t.typcategory='A') as is_array,
             pg_get_expr(ad.adbin, ad.adrelid) as default_expr,
             a.attidentity, a.attgenerated, c.relkind
      from pg_attribute a
      join pg_class c on c.oid=a.attrelid
      join pg_namespace n on n.oid=c.relnamespace
      join pg_type t on t.oid=a.atttypid
      left join pg_attrdef ad on ad.adrelid=c.oid and ad.adnum=a.attnum
      where n.nspname=%s and a.attnum>0 and not a.attisdropped
        and c.relkind = any(%s)
      order by c.relname, a.attnum
    """, (SCHEMA, ['r','p'] if relkind_tables else ['v','m']))
    tables = {}
    for (rel, col, num, udt, notnull, is_enum, is_array, default_expr,
         identity, generated, relkind) in rows:
        # resolve array element enum-ness
        elem_enum = is_enum
        if is_array:
            elem = q("""select t.typname, t.typtype='e' from pg_type arr
                        join pg_type t on t.oid=arr.typelem
                        where arr.typname=%s limit 1""", (udt,))
            if elem:
                udt_name, elem_enum = elem[0]
                udt = "_"+udt_name
        tt = col_type(udt, is_array, elem_enum)
        has_default = default_expr is not None or identity in ('a','d') or generated == 's'
        tables.setdefault(rel, []).append({
            "col": col, "ts": tt, "notnull": notnull,
            "has_default": has_default, "generated": generated == 's',
        })
    return tables

tbl_cols = get_columns(True)
view_cols = get_columns(False)

# ---- foreign keys for relationships ----
fks = q("""
  select con.conname, c.relname as tbl,
         array_agg(att.attname order by k.ord) as cols,
         fc.relname as ftbl,
         array_agg(fatt.attname order by k.ord) as fcols
  from pg_constraint con
  join pg_class c on c.oid=con.conrelid
  join pg_namespace n on n.oid=c.relnamespace
  join pg_class fc on fc.oid=con.confrelid
  join lateral unnest(con.conkey) with ordinality k(attnum, ord) on true
  join pg_attribute att on att.attrelid=con.conrelid and att.attnum=k.attnum
  join lateral unnest(con.confkey) with ordinality fk(attnum, ord) on fk.ord=k.ord
  join pg_attribute fatt on fatt.attrelid=con.confrelid and fatt.attnum=fk.attnum
  where con.contype='f' and n.nspname=%s
  group by con.conname, c.relname, fc.relname
""", (SCHEMA,))
rel_by_table = {}
for conname, tbl, cols, ftbl, fcols in fks:
    rel_by_table.setdefault(tbl, []).append({
        "name": conname, "cols": list(cols),
        "ref_table": ftbl, "ref_cols": list(fcols),
    })

# ---- functions ----
funcs = q("""
  select p.proname,
         pg_get_function_arguments(p.oid) as args,
         pg_get_function_result(p.oid) as result,
         p.provariadic, p.prokind
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname=%s and p.prokind in ('f') 
    and p.proname in ('place_bet','resolve_market','cancel_market',
        'lmsr_price','lmsr_cost_to_buy','is_admin','admin_review_kyc',
        'refresh_leaderboard','handle_new_user','update_profile_stats')
  order by p.proname
""", (SCHEMA,))

PG2TS = {
    "uuid":"string","text":"string","varchar":"string","character varying":"string",
    "boolean":"boolean","bool":"boolean",
    "numeric":"number","integer":"number","int":"number","bigint":"number",
    "smallint":"number","double precision":"number","real":"number",
    "timestamp with time zone":"string","timestamp without time zone":"string",
    "timestamptz":"string","date":"string","jsonb":"Json","json":"Json","void":"undefined",
}
def map_pg(t):
    t = t.strip()
    if t.endswith("[]"):
        return map_pg(t[:-2]) + "[]"
    t2 = re.sub(r"\(.*\)","",t).strip().lower()
    if t2 in enums: return f'Database["public"]["Enums"]["{t2}"]'
    return PG2TS.get(t2, "Json")

def parse_args(argstr):
    # split top-level commas
    out=[]; depth=0; cur_=""
    for ch in argstr:
        if ch in "(": depth+=1
        if ch in ")": depth-=1
        if ch=="," and depth==0:
            out.append(cur_); cur_=""
        else: cur_+=ch
    if cur_.strip(): out.append(cur_)
    args={}
    for a in out:
        a=a.strip()
        if not a: continue
        # strip mode keywords
        a=re.sub(r"^(IN|OUT|INOUT|VARIADIC)\s+","",a,flags=re.I)
        # remove DEFAULT ...
        has_default = bool(re.search(r"\bDEFAULT\b", a, re.I))
        a=re.split(r"\bDEFAULT\b", a, flags=re.I)[0].strip()
        parts=a.split(None,1)
        if len(parts)==2:
            nm,ty=parts
        else:
            nm,ty=parts[0],"text"
        args[nm]={"ts":map_pg(ty),"opt":has_default}
    return args

# ---------- emit ----------
def field_lines(cols, mode):
    lines=[]
    for c in cols:
        name=c["col"]; ts=c["ts"]
        if mode=="Row":
            opt=""
            t = ts if c["notnull"] else f"{ts} | null"
        elif mode=="Insert":
            optional = (not c["notnull"]) or c["has_default"]
            opt="?" if optional else ""
            t = ts if c["notnull"] else f"{ts} | null"
        else: # Update
            opt="?"
            t = ts if c["notnull"] else f"{ts} | null"
        lines.append(f'          {name}{opt}: {t}')
    return "\n".join(lines)

def rel_lines(tbl):
    rels = rel_by_table.get(tbl, [])
    if not rels:
        return "        Relationships: []"
    items=[]
    for r in rels:
        items.append(
            "          {\n"
            f'            foreignKeyName: "{r["name"]}"\n'
            "            columns: [" + ", ".join(f'"{c}"' for c in r["cols"]) + "]\n"
            "            isOneToOne: false\n"
            f'            referencedRelation: "{r["ref_table"]}"\n'
            "            referencedColumns: [" + ", ".join(f'"{c}"' for c in r["ref_cols"]) + "]\n"
            "          }"
        )
    return "        Relationships: [\n" + ",\n".join(items) + "\n        ]"

out=[]
out.append("// AUTO-GENERATED from live Supabase schema. Do not edit by hand.")
out.append("// Regenerate with: python3 scripts/gen_supabase_types.py <DB_URL>")
out.append("")
out.append("export type Json =")
out.append("  | string | number | boolean | null")
out.append("  | { [key: string]: Json | undefined }")
out.append("  | Json[]")
out.append("")
out.append("export type Database = {")
out.append("  public: {")
# Tables
out.append("    Tables: {")
for tbl in sorted(tbl_cols):
    cols=tbl_cols[tbl]
    out.append(f"      {tbl}: {{")
    out.append("        Row: {")
    out.append(field_lines(cols,"Row")); out.append("        }")
    out.append("        Insert: {")
    out.append(field_lines(cols,"Insert")); out.append("        }")
    out.append("        Update: {")
    out.append(field_lines(cols,"Update")); out.append("        }")
    out.append(rel_lines(tbl))
    out.append("      }")
out.append("    }")
# Views
out.append("    Views: {")
for v in sorted(view_cols):
    out.append(f"      {v}: {{")
    out.append("        Row: {")
    out.append(field_lines(view_cols[v],"Row")); out.append("        }")
    out.append("        Relationships: []")
    out.append("      }")
out.append("    }")
# Functions
out.append("    Functions: {")
for name,args,result,_,_ in funcs:
    a=parse_args(args or "")
    out.append(f"      {name}: {{")
    if a:
        out.append("        Args: {")
        for nm,info in a.items():
            argts = info["ts"] + (" | null" if info["opt"] else "")
            out.append(f'          {nm}{"?" if info["opt"] else ""}: {argts}')
        out.append("        }")
    else:
        out.append("        Args: Record<PropertyKey, never>")
    out.append(f"        Returns: {map_pg(result)}")
    out.append("      }")
out.append("    }")
# Enums
out.append("    Enums: {")
for en in sorted(enums):
    union=" | ".join(f'"{v}"' for v in enums[en])
    out.append(f"      {en}: {union}")
out.append("    }")
out.append("    CompositeTypes: {")
out.append("      [_ in never]: never")
out.append("    }")
out.append("  }")
out.append("}")
out.append("")
# convenience helpers
out.append("type PublicSchema = Database['public']")
out.append("export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row']")
out.append("export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert']")
out.append("export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update']")
out.append("export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T]")
out.append("")

print("\n".join(out))
cur.close(); conn.close()
