"""Author scenario-specific contracts; retain the original catalog for saved sessions."""
import ast
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "backend/app/data"
legacy = DATA / "legacy_challenges.json"
if not legacy.exists():
    legacy.write_bytes((DATA / "challenges.json").read_bytes())
old = json.loads(legacy.read_text(encoding="utf-8"))
families = list(dict.fromkeys(row["family"] for row in old))
rows = []


def helper(source):
    class Rename(ast.NodeTransformer):
        def visit_FunctionDef(self, node):
            if node.name == "solve":
                node.name = "_compute"
            return self.generic_visit(node)

        def visit_Name(self, node):
            if node.id == "solve":
                node.id = "_compute"
            return node

    tree = ast.parse(source)
    tree.body = [node for node in tree.body if not isinstance(node, ast.Expr)]
    return ast.unparse(Rename().visit(tree)) + "\n\n"


def scenarios(base, interview):
    rows.extend([base, interview])
    h = helper(base["reference"])
    cases = [ast.literal_eval(case) for case in base["cases_repr"]]
    batch_cases = [repr([[case, cases[(i + 1) % 7]]]) for i, case in enumerate(cases)]
    correct = h + "def solve(requests):\n    return [_compute(*args) for args in requests]\n"
    variants = [
        (2, "Data-pipeline regression", "The pipeline must return a Python list with one result per request, preserving order and result types. Each request is a list of arguments for _compute. The algorithm helper works; repair the serialization boundary.",
         "def solve(requests):\n    import json\n    results = [_compute(*args) for args in requests]\n    return json.dumps(results)\n",
         ["Compare the type returned by solve with the contract.", "JSON text and a Python list are different values.", "Return the result collection itself; leave serialization to the API boundary."]),
        (4, "Quality-assurance bug report", "The QA harness submits a batch of argument lists. Return one result for every request, in input order. The helper is correct, but only part of the batch is being processed.",
         "def solve(requests):\n    results = []\n    for args in requests:\n        results.append(_compute(*args))\n        return results\n    return results\n",
         ["Trace a batch containing two requests.", "Which statement exits the loop as well as the function?", "Return the accumulated results after the loop finishes."]),
        (5, "Performance regression", "A batching optimization processes argument lists in chunks. Return exactly one helper result for each request in order. The current chunk boundary overlaps and emits duplicate results.",
         "def solve(requests):\n    results = []\n    for start in range(0, len(requests), 2):\n        for args in requests[start:start + 3]:\n            results.append(_compute(*args))\n    return results\n",
         ["Trace a batch longer than the chunk size.", "Compare the range step with the slice width.", "Use matching non-overlapping chunk boundaries, or process each request once."]),
    ]
    for number, label, description, faulty, hints in variants:
        variant = dict(base)
        variant.update(id=base["id"][:-1] + str(number), name=f"{base['family']} · {label}",
                       description=description, code=h + faulty, reference=correct, hints=hints,
                       cases_repr=batch_cases if number != 5 else [repr([[case, cases[(i+1)%7], cases[(i+2)%7], cases[(i+3)%7]]]) for i, case in enumerate(cases)])
        rows.append(variant)


# Strengthen inherited fixtures whose original cases never exercised the faulty branch.
for row in old:
    if row["id"].startswith("INT-06-"):
        row["cases_repr"] = [repr(c) for c in [ [[1,2,4,8],10], [[1,2,4,8],3], [[1,3,7],20], [[],0], [[5],10], [[-5,-2,0,4,9],7], [[1,3,5],8] ]]
    if row["id"].startswith("INT-10-"):
        row["cases_repr"] = [repr(c) for c in [ [[6,7,1,2,3,4,5],5], [[5,1,2,3,4],4], [[3,1],1], [[1],1], [[1],2], [[9,11,1,3,5,7],3], [[4,5,6,1,2,3],9] ]]
    if row["id"].startswith("INT-30-"):
        row["reference"] = "def solve(items, item):\n    original = items[:]\n    updated = items[:]\n    updated.append(item)\n    return original, updated\n"
        if "-1-" in row["id"]:
            row["code"] = "def solve(items, item):\n    original = items\n    updated = items\n    updated.append(item)\n    return original, updated\n"
        else:
            row["code"] = "def solve(items, item):\n    original = items[: ]\n    updated = items[: ]\n    original.append(item)\n    return original, updated\n"
        row["hints"] = ["The original must stay unchanged while the copy gains one item.", "Trace which list each name refers to, and which list receives append.", "Create independent lists and append only to the updated list."]

for family in families:
    base = next(r for r in old if r["family"] == family and r["id"].endswith("-1-1"))
    interview = next(r for r in old if r["family"] == family and r["id"].endswith("-2-3"))
    scenarios(base, interview)


def add(number, title, topic, description, reference, wrong, cases, hints, second_wrong=None):
    base = dict(id=f"INT-{number:02}-1-1", name=f"{title} · Production incident", family=title,
                topic=topic, difficulty="Medium", description=description,
                reference=reference, code=wrong, cases_repr=[repr(c) for c in cases], hints=hints)
    interview = dict(base, id=f"INT-{number:02}-2-3", name=f"{title} · Interview whiteboard",
                     code=second_wrong or wrong.replace("def solve(", "def solve( "))
    # New families use three integration scenarios plus a single algorithm scenario,
    # unless a distinct second algorithm bug has been authored.
    scenarios(base, interview)
    if second_wrong is None:
        rows.remove(interview)


ref = 'def solve(n, edges):\n    indegree = [0] * n\n    graph = [[] for _ in range(n)]\n    for a, b in edges:\n        graph[a].append(b)\n        indegree[b] += 1\n    queue = [i for i in range(n) if indegree[i] == 0]\n    for node in queue:\n        for child in graph[node]:\n            indegree[child] -= 1\n            if indegree[child] == 0:\n                queue.append(child)\n    return len(queue) == n\n'
add(33, "Dependency cycle detection", "Graphs & Scheduling", "Return whether all n tasks can finish. An edge [a,b] requires a before b. Include disconnected tasks.", ref, ref.replace('indegree[b] += 1','indegree[a] += 1'), [[3,[[0,1],[1,2]]],[2,[[0,1],[1,0]]],[0,[]],[4,[[0,1]]],[1,[[0,0]]],[5,[[0,2],[1,2],[2,3]]],[3,[]]], ["Track incoming prerequisites, not outgoing edges.","Compare which vertex gains indegree and which loses it.","The destination of each edge has one additional prerequisite."])
ref = 'def solve(n, edges, start):\n    import heapq\n    graph = [[] for _ in range(n)]\n    for a,b,w in edges:\n        graph[a].append((b,w))\n    dist = [float("inf")] * n\n    dist[start] = 0\n    queue = [(0,start)]\n    while queue:\n        cost,node = heapq.heappop(queue)\n        if cost != dist[node]:\n            continue\n        for child,weight in graph[node]:\n            candidate = cost + weight\n            if candidate < dist[child]:\n                dist[child] = candidate\n                heapq.heappush(queue,(candidate,child))\n    return [None if x == float("inf") else x for x in dist]\n'
add(34,"Weighted shortest paths","Graphs & Routing","Return the shortest directed nonnegative-weight distance from start to every vertex; unreachable vertices are None.",ref,ref.replace('candidate = cost + weight','candidate = weight'),[[3,[[0,1,2],[1,2,4],[0,2,9]],0],[2,[],0],[1,[],0],[3,[[0,1,0],[1,2,1]],0],[4,[[0,1,5],[0,2,1],[2,1,1],[1,3,2]],0],[3,[[2,0,3],[0,1,8]],2],[2,[[0,1,7]],1]],["An edge weight is only one segment of a route.","Inspect the relaxation candidate.","Add the current best distance to the new edge weight."])
ref='def solve(text):\n    import csv, io\n    return list(csv.reader(io.StringIO(text)))\n'
add(35,"Quoted CSV fields","Parsing & Data Formats","Parse CSV rows, respecting quoted commas, escaped quotes, and embedded newlines. Return a list of rows of strings.",ref,'def solve(text):\n    return [line.split(",") for line in text.splitlines()]\n',[[s] for s in ['a,b\n1,2','"hello, world",x','"say ""hi""",ok','a,b\n"two\nlines",3','','a,,c','"",end']],["A comma inside quotes is data, not a separator.","Splitting lines also breaks quoted multiline fields.","Use the csv parser with a text stream."])
ref='def solve(values):\n    from decimal import Decimal, ROUND_HALF_UP\n    total = sum((Decimal(value) for value in values), Decimal("0"))\n    return str(total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))\n'
add(36,"Exact currency totals","Decimal Arithmetic","Sum decimal strings exactly and round only the final total to two places using HALF_UP. Return a string with two decimals.",ref,'def solve(values):\n    return str(round(sum(float(value) for value in values), 2))\n',[[v] for v in [['0.1','0.2'],['2.675'],[],['1.005','1.005'],['-1.005'],['9999999999.99','0.01'],['0.004','0.004']]],["Binary floats cannot exactly represent many decimal fractions.","Round once after accumulation, with an explicit rounding rule.","Use Decimal strings, quantize 0.01 and ROUND_HALF_UP."])
ref='def solve(items, page, size):\n    start = (page - 1) * size\n    return items[start:start + size]\n'
add(37,"One-based API pagination","API Contracts","Return page of items. Pages start at 1 and size is positive. A page beyond the final item returns an empty list.",ref,ref.replace('(page - 1) * size','page * size'),[[[1,2,3,4,5],1,2],[[1,2,3,4,5],3,2],[[],1,4],[[9],1,1],[[1,2],9,2],[list(range(20)),2,5],[[1,2,3],2,2]],["Translate a one-based page into a zero-based offset.","The first page starts at index zero.","Compute (page - 1) * size."])
ref='def solve(value):\n    from datetime import datetime, timezone\n    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))\n    return parsed.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")\n'
add(38,"Normalize timestamps to UTC","Dates & Time Zones","Normalize an ISO timestamp with an explicit timezone offset to UTC, formatted YYYY-MM-DDTHH:MM:SSZ.",ref,ref.replace('parsed.astimezone(timezone.utc)','parsed.replace(tzinfo=timezone.utc)'),[[s] for s in ['2024-01-01T00:30:00+05:30','2024-12-31T23:30:00-02:00','2024-06-01T12:00:00Z','2024-02-29T00:15:00+01:00','2024-01-01T10:00:00-07:00','2024-07-10T04:00:00+00:00','2024-09-01T08:00:00+09:00']],["Changing timezone metadata does not convert an instant.","Offset conversion can cross a day or year boundary.","Use astimezone(timezone.utc), not replace(tzinfo=...)."])
ref='def solve(records):\n    seen = set()\n    result = []\n    for record in records:\n        if record["id"] not in seen:\n            seen.add(record["id"])\n            result.append(record)\n    return result\n'
add(39,"Idempotent event ingestion","Events & Idempotency","Deduplicate event dictionaries by id, preserving the first event and input order.",ref,'def solve(records):\n    return list({record["id"]: record for record in records}.values())\n',[[r] for r in [[{'id':'a','v':1},{'id':'a','v':2}],[],[{'id':'x','v':0}],[{'id':1,'v':1},{'id':2,'v':2},{'id':1,'v':3}],[{'id':'a'},{'id':'b'}],[{'id':0,'v':False},{'id':0,'v':True}],[{'id':'b','v':4},{'id':'a','v':2},{'id':'b','v':5}]]],["A duplicate should not overwrite the first event.","Dictionary assignment keeps the last value for a key.","Track seen IDs and append only the first occurrence."])
ref='def solve(attempt, base, cap):\n    return min(cap, base * 2 ** attempt)\n'
add(40,"Capped retry backoff","Queues & Reliability","Return a retry delay: base * 2**attempt capped at cap. Attempt starts at zero; all arguments are nonnegative integers.",ref,ref.replace('min(cap','max(cap'),[[0,1,30],[1,2,30],[5,2,10],[0,0,10],[10,1,64],[3,4,100],[2,7,0]],["A cap is an upper bound, not a minimum.","Check the first attempt and an attempt beyond the cap.","Choose the smaller of the exponential delay and cap."])
ref='def solve(words, prefix):\n    return sorted(word for word in words if word.startswith(prefix))\n'
add(41,"Prefix search suggestions","Search & Text Indexing","Return lexicographically sorted words beginning with prefix. Matching is case-sensitive, and duplicates are preserved.",ref,ref.replace('word.startswith(prefix)','prefix in word'),[[['apple','pineapple','apply'],'app'],[['cat','catch','bobcat'],'cat'],[[],'x'],[['z','a'],''],[['Alpha','alpha'],'Al'],[['a','a','ba'],'a'],[['red','blue'],'g']],["Containment is broader than prefix matching.","A match in the middle of a word must be excluded.","Check startswith, then sort matching words."])
ref='def solve(value):\n    return isinstance(value, dict) and type(value.get("age")) is int and value["age"] >= 0\n'
add(42,"Strict JSON integer validation","Validation & Types","Accept only a dictionary containing a nonnegative integer age. Reject booleans, floats, missing keys, and other input types.",ref,ref.replace('type(value.get("age")) is int','isinstance(value.get("age"), int)'),[[v] for v in [{'age':0},{'age':True},{'age':False},{'age':2.0},{'age':-1},{},[]]],["In Python, bool is a subclass of int.","An isinstance check admits True and False.","Use an exact integer type check before comparing its value."])
ref='def solve(values):\n    import bisect\n    tails = []\n    for value in values:\n        index = bisect.bisect_left(tails, value)\n        if index == len(tails):\n            tails.append(value)\n        else:\n            tails[index] = value\n    return len(tails)\n'
add(43,"Strictly increasing subsequence","Dynamic Programming & Search","Return the length of the longest strictly increasing subsequence. Equal values cannot extend the subsequence.",ref,ref.replace('bisect.bisect_left','bisect.bisect_right'),[[v] for v in [[2,2,2],[10,9,2,5,3,7,101,18],[],[1],[3,2,1],[1,2,2,3],[-2,-1,0,-1,1]]],["Strictly increasing excludes equal adjacent selections.","The binary search position controls how duplicates behave.","Replace the first tail greater than or equal to the current value."])
ref='def solve(intervals):\n    if not intervals:\n        return []\n    ordered = sorted(intervals)\n    result = [list(ordered[0])]\n    for start,end in ordered[1:]:\n        if start <= result[-1][1]:\n            result[-1][1] = max(result[-1][1], end)\n        else:\n            result.append([start,end])\n    return result\n'
add(44,"Unicode-normalized identifiers","Unicode & Identity","Return whether two strings are equal after NFC Unicode normalization. Matching remains case-sensitive.",'def solve(a, b):\n    import unicodedata\n    return unicodedata.normalize("NFC", a) == unicodedata.normalize("NFC", b)\n','def solve(a, b):\n    return a == b\n',[["\u00e9","e\u0301"],["\u00c5","A\u030a"],["abc","abc"],["A","a"],["",""],["\u00f6","o\u0308"],["abc","abd"]],["The same character can have multiple code-point representations.","Normalize both sides using the same canonical form.","Compare unicodedata.normalize('NFC', value) for each input."])

(DATA / "challenges.json").write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
public = [{k:v for k,v in row.items() if k not in {"reference","hints","cases_repr"}} for row in rows]
(ROOT / "frontend/src/data/catalog.json").write_text(json.dumps(public, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"{len(set(r['family'] for r in rows))} concepts, {len(rows)} distinct scenarios, {len(set(r['topic'] for r in rows))} tracks")
