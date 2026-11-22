"""Load test for the self-hosted Piston: throughput and latency per language at several concurrency levels.

Usage: python piston/bench.py [http://127.0.0.1:2000]
Use 127.0.0.1, not localhost: on Windows, localhost tries IPv6 first and every call gets ~2 s slower
(Java/the BE is not affected).
"""
import json
import statistics
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:2000").rstrip("/")
STDIN, EXPECTED = "4\n4 3 2 1", "6"  # count inversions

PROGRAMS = {
    "java": ("Main.java", """import java.util.*;
public class Main { public static void main(String[] a) { Scanner s = new Scanner(System.in); int n = s.nextInt();
int[] x = new int[n]; for (int i = 0; i < n; i++) x[i] = s.nextInt(); int c = 0;
for (int i = 0; i < n; i++) for (int j = i + 1; j < n; j++) if (x[i] > x[j]) c++; System.out.println(c); } }"""),
    "python": ("main.py", "n=int(input());a=list(map(int,input().split()))\n"
                          "print(sum(1 for i in range(n) for j in range(i+1,n) if a[i]>a[j]))"),
    "c++": ("main.cpp", """#include <iostream>
int main(){int n;std::cin>>n;int x[100];for(int i=0;i<n;i++)std::cin>>x[i];int c=0;
for(int i=0;i<n;i++)for(int j=i+1;j<n;j++)if(x[i]>x[j])c++;std::cout<<c<<"\\n";}"""),
}


def run_once(language, name, source):
    body = json.dumps({"language": language, "version": "*", "files": [{"name": name, "content": source}],
                       "stdin": STDIN, "run_timeout": 5000}).encode()
    started = time.time()
    request = urllib.request.Request(f"{BASE}/api/v2/execute", body, {"Content-Type": "application/json"})
    result = json.load(urllib.request.urlopen(request, timeout=120))
    return time.time() - started, (result.get("run") or {}).get("stdout", "").strip() == EXPECTED


for language, (name, source) in PROGRAMS.items():
    for concurrency in (1, 4, 8, 16):
        total = 32
        started = time.time()
        with ThreadPoolExecutor(concurrency) as pool:
            results = list(pool.map(lambda _: run_once(language, name, source), range(total)))
        wall = time.time() - started
        latencies = sorted(r[0] for r in results)
        correct = sum(r[1] for r in results)
        print(f"{language:6} conc={concurrency:2}  {total / wall:5.1f} runs/s  "
              f"p50={statistics.median(latencies) * 1000:5.0f}ms  p95={latencies[int(total * .95) - 1] * 1000:5.0f}ms  "
              f"correct={correct}/{total}")
