"use client"
import type React from "react"
import { useEffect, useMemo, useState } from "react"
import { Search, Settings, Sparkles } from "lucide-react"

// ========================
// 안전한 API Base 설정 (process 미사용)
// ========================
// - 샌드박스/브라우저 환경에서 process가 없어 ReferenceError가 발생하던 문제를 해결
// - 우선순위: window.__API_BASE__ (런타임 주입) > 빌드주입 env > 기본값
const DEFAULT_API_BASE = "http://localhost:8000"
const envBase = (globalThis as any)?.process?.env?.NEXT_PUBLIC_API_BASE as string | undefined
function getInitialApiBase(): string {
  if (typeof window !== "undefined" && (window as any).__API_BASE__) {
    return (window as any).__API_BASE__ as string
  }
  if (envBase && typeof envBase === "string" && envBase.trim().length > 0) {
    return envBase
  }
  // localStorage 저장값 우선 사용 (사용자가 이전에 저장했다면)
  if (typeof window !== "undefined") {
    const saved = window.localStorage.getItem("API_BASE")
    if (saved && saved.trim()) return saved
  }
  return DEFAULT_API_BASE
}

// ====== 타입 정의 ======
export type Item = {
  work_id: number
  work_title: string
  work_author: string
  work_synopsis: string
}

type ParseResponse = {
  items: Item[]
}

type RerankResult = {
  reason?: string
  work_id?: number[] // 리랭킹된 work_id 순서 리스트
  [k: string]: any // 유연성 확보
}

// /search 응답
type CombinedResponse = {
  parsed_items: Item[]
  rerank_result: RerankResult
}

// /search/rerank 응답
type RerankOnlyResponse = {
  result: RerankResult
}

// ====== 유틸 함수 (테스트 가능한 순수 함수) ======
export function mapRerankToItems(parsed: Item[], ids: number[]): Item[] {
  const map = new Map<number, Item>()
  for (const it of parsed) map.set(it.work_id, it)
  const out: Item[] = []
  for (const id of ids) {
    const found = map.get(id)
    if (found) out.push(found)
  }
  return out
}

export function reasonTextOf(result: RerankResult | null | undefined): string {
  return (result?.reason || "").trim()
}

// ====== UI 구성요소 ======
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold mb-4 text-foreground/80">{title}</h2>
      <div className="grid gap-4">{children}</div>
    </section>
  )
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl bg-card border border-border p-5 ${className}`}>{children}</div>
}

function BookCard({ item, badge }: { item: Item; badge?: string }) {
  return (
    <Card className="hover:border-primary/50 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="space-y-1 flex-1">
          <div className="text-xs text-muted-foreground font-mono">ID: {item.work_id}</div>
          <h3 className="text-base font-semibold leading-snug text-foreground">{item.work_title}</h3>
          <div className="text-sm text-muted-foreground">{item.work_author}</div>
        </div>
        {badge && (
          <span className="text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-2.5 py-1 font-medium">
            {badge}
          </span>
        )}
      </div>
      <p className="text-sm leading-relaxed text-foreground/70 whitespace-pre-wrap line-clamp-3">
        {item.work_synopsis}
      </p>
    </Card>
  )
}

// ====== 메인 컴포넌트 ======
export default function RerankTestbed() {
  const [apiBase, setApiBase] = useState<string>(getInitialApiBase())
  const [query, setQuery] = useState("")
  const [parsed, setParsed] = useState<Item[]>([])
  const [rerank, setRerank] = useState<RerankResult | null>(null)
  const [loading, setLoading] = useState<"parse" | "rerank" | "combined" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("API_BASE", apiBase)
    }
  }, [apiBase])

  // ====== API 호출 함수들 ======
  async function callParse() {
    setLoading("parse")
    setError(null)
    setRerank(null)
    try {
      const res = await fetch(`${apiBase}/search/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      })
      if (!res.ok) throw new Error(`/search/parse 실패: ${res.status}`)
      const data: ParseResponse = await res.json()
      setParsed(data.items || [])
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setLoading(null)
    }
  }

  async function callRerankOnly() {
    setLoading("rerank")
    setError(null)
    try {
      if (parsed.length === 0) throw new Error("먼저 '기존 검색 결과'를 가져오세요 (Parse)")
      const res = await fetch(`${apiBase}/search/rerank`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, items: parsed }),
      })
      if (!res.ok) throw new Error(`/search/rerank 실패: ${res.status}`)
      const data: RerankOnlyResponse = await res.json()
      setRerank(data.result || {})
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setLoading(null)
    }
  }

  async function callCombined() {
    setLoading("combined")
    setError(null)
    try {
      const res = await fetch(`${apiBase}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      })
      if (!res.ok) throw new Error(`/search 실패: ${res.status}`)
      const data: CombinedResponse = await res.json()
      setParsed(data.parsed_items || [])
      setRerank(data.rerank_result || {})
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setLoading(null)
    }
  }

  // ====== 파생 데이터 ======
  const reasonText = useMemo(() => reasonTextOf(rerank), [rerank])
  const rerankedItems = useMemo(() => mapRerankToItems(parsed, rerank?.work_id || []), [parsed, rerank])

  // ====== 간단 테스트 러너 ======
  type TestResult = { name: string; passed: boolean; message: string }
  function runTests(): TestResult[] {
    const results: TestResult[] = []

    // TC1: 기본 매핑 순서 보장
    const parsed1: Item[] = [
      { work_id: 1, work_title: "A", work_author: "AA", work_synopsis: "sa" },
      { work_id: 2, work_title: "B", work_author: "BB", work_synopsis: "sb" },
    ]
    const ids1 = [2, 1]
    const out1 = mapRerankToItems(parsed1, ids1)
    const pass1 = out1.map((x) => x.work_id).join(",") === "2,1"
    results.push({ name: "TC1: 매핑 순서 유지", passed: pass1, message: `out=${out1.map((x) => x.work_id).join(",")}` })

    // TC2: 존재하지 않는 ID가 섞여도 무시
    const ids2 = [3, 2, 999, 1]
    const out2 = mapRerankToItems(parsed1, ids2)
    const pass2 = out2.map((x) => x.work_id).join(",") === "2,1"
    results.push({
      name: "TC2: 유효하지 않은 ID 무시",
      passed: pass2,
      message: `out=${out2.map((x) => x.work_id).join(",")}`,
    })

    // TC3: reason 텍스트 처리
    const r3: RerankResult = { reason: "  이유 테스트  " }
    const pass3 = reasonTextOf(r3) === "이유 테스트"
    results.push({ name: "TC3: reason trim", passed: pass3, message: `reason='${reasonTextOf(r3)}'` })

    // TC4: reason 없음 처리
    const r4: RerankResult = {}
    const pass4 = reasonTextOf(r4) === ""
    results.push({ name: "TC4: reason 없음", passed: pass4, message: `reason='${reasonTextOf(r4)}'` })

    return results
  }

  const [tests, setTests] = useState<TestResult[] | null>(null)

  // ====== 렌더 ======
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Search Rerank Testbed
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Test and compare search results with AI-powered reranking
              </p>
            </div>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              title="Settings"
            >
              <Settings className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {showSettings && (
          <Card className="mb-6">
            <h3 className="font-semibold mb-3 text-sm text-foreground/80">API Configuration</h3>
            <div className="flex items-center gap-3">
              <input
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
                placeholder="http://localhost:8000"
                className="flex-1 bg-background border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">API endpoint saved to localStorage</p>
          </Card>
        )}

        <div className="mb-12">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-foreground mb-2">Search & Rerank</h2>
              <p className="text-sm text-muted-foreground">
                Enter your query to test the search and reranking pipeline
              </p>
            </div>

            <div className="relative mb-6">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="예: 가족에 관한 좋은 추리소설"
                className="w-full bg-card border-2 border-border rounded-2xl pl-12 pr-4 py-4 text-base focus:outline-none focus:border-primary transition-colors text-foreground placeholder:text-muted-foreground"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && query && loading === null) {
                    callCombined()
                  }
                }}
              />
            </div>

            <div className="flex flex-wrap gap-3 justify-center">
              <button
                onClick={callParse}
                disabled={loading !== null || !query}
                className="px-5 py-2.5 rounded-lg bg-secondary hover:bg-secondary/80 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm font-medium text-foreground border border-border"
              >
                Parse Only
              </button>
              <button
                onClick={callRerankOnly}
                disabled={loading !== null || parsed.length === 0}
                className="px-5 py-2.5 rounded-lg bg-secondary hover:bg-secondary/80 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm font-medium text-foreground border border-border"
              >
                Rerank Only
              </button>
              <button
                onClick={callCombined}
                disabled={loading !== null || !query}
                className="px-6 py-2.5 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm font-medium text-primary-foreground flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Parse + Rerank
              </button>
            </div>

            {loading && (
              <div className="mt-4 text-center">
                <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  Processing {loading}...
                </div>
              </div>
            )}
            {error && (
              <div className="mt-4 text-center">
                <div className="inline-block bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-2 rounded-lg">
                  Error: {error}
                </div>
              </div>
            )}
          </div>
        </div>

        {(parsed.length > 0 || rerankedItems.length > 0) && (
          <div className="space-y-8">
            {/* Reranked Results - Top Section */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">Reranked Results</h2>
                <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                  {rerankedItems.length} items
                </span>
              </div>

              {/* Reasoning */}
              {reasonText && (
                <Card className="mb-4 bg-primary/5 border-primary/20">
                  <h3 className="text-xs font-semibold mb-2 text-primary uppercase tracking-wide">AI Reasoning</h3>
                  <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{reasonText}</p>
                </Card>
              )}

              {rerankedItems.length === 0 ? (
                <Card className="text-sm text-muted-foreground text-center py-8">
                  No reranked results yet. Run reranking to see optimized results.
                </Card>
              ) : (
                <div className="grid gap-3">
                  {rerankedItems.map((it, idx) => (
                    <BookCard key={`${it.work_id}-rerank-${idx}`} item={it} badge={`Rank ${idx + 1}`} />
                  ))}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="bg-background px-4 text-xs text-muted-foreground uppercase tracking-wide">
                  Original Results
                </span>
              </div>
            </div>

            {/* Original Results - Bottom Section */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-semibold text-foreground">Original Results</h2>
                <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full">
                  {parsed.length} items
                </span>
              </div>
              {parsed.length === 0 ? (
                <Card className="text-sm text-muted-foreground text-center py-8">
                  No results yet. Run a search to see results.
                </Card>
              ) : (
                <div className="grid gap-3">
                  {parsed.map((it, idx) => (
                    <BookCard key={`${it.work_id}-${idx}`} item={it} badge={`#${idx + 1}`} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tests === null && (
          <div className="mt-12 max-w-2xl mx-auto">
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm text-foreground">Run Tests</h3>
                  <p className="text-xs text-muted-foreground mt-1">Verify mapping and reasoning logic</p>
                </div>
                <button
                  onClick={() => setTests(runTests())}
                  className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-sm font-medium text-foreground border border-border transition-colors"
                >
                  Run Tests
                </button>
              </div>
            </Card>
          </div>
        )}

        {tests && (
          <div className="mt-12 max-w-2xl mx-auto">
            <Card>
              <h3 className="font-semibold text-sm text-foreground mb-4">Test Results</h3>
              <ul className="space-y-2">
                {tests.map((t, i) => (
                  <li
                    key={i}
                    className={`text-sm flex items-start gap-2 ${t.passed ? "text-green-400" : "text-destructive"}`}
                  >
                    <span className="font-bold">{t.passed ? "✓" : "✗"}</span>
                    <div>
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{t.message}</div>
                    </div>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setTests(null)}
                className="mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear tests
              </button>
            </Card>
          </div>
        )}
      </main>

      <footer className="border-t border-border mt-16 py-6">
        <div className="max-w-7xl mx-auto px-6 text-center text-xs text-muted-foreground">API: {apiBase}</div>
      </footer>
    </div>
  )
}
