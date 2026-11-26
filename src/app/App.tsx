import { useEffect, useState, type ChangeEvent, type CSSProperties, type KeyboardEvent } from "react";
import { BOARD_ACCENTS, BOARD_LABELS, BOARD_ORDER } from "../shared/boards";
import {
  EMPTY_DESCRIPTION,
  formatMetric,
  formatRank,
  interpretationStatusHint,
} from "../shared/format";
import type { BoardEntryResponse, BoardsResponse } from "../shared/types";
import { DetailDrawer } from "./Drawer";
import { AdminPanel } from "./AdminPanel";

type LoadState = "loading" | "ready" | "error";

interface BookmarkedRepo {
  owner: string;
  name: string;
  bookmarkedAt: number;
}

function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<Map<string, BookmarkedRepo>>(() => {
    if (typeof window === "undefined") return new Map();
    try {
      const stored = localStorage.getItem("trendshift-bookmarks");
      const list: BookmarkedRepo[] = stored ? JSON.parse(stored) : [];
      return new Map(list.map((b) => [`${b.owner}/${b.name}`, b]));
    } catch {
      return new Map();
    }
  });

  const save = (bookmarks: Map<string, BookmarkedRepo>) => {
    if (typeof window === "undefined") return;
    try {
      const list = Array.from(bookmarks.values());
      // 检查接近500条时给出提示
      if (list.length >= 480 && list.length < 485) {
        console.warn(`收藏即将达到上限（${list.length}/500）`);
      }
      localStorage.setItem("trendshift-bookmarks", JSON.stringify(list));
    } catch {
      console.error("本地存储不可用，收藏仅保存在内存中");
    }
  };

  const toggle = (repoId: string) => {
    const [owner, name] = repoId.split("/");
    setBookmarks((prev) => {
      const next = new Map(prev);
      if (next.has(repoId)) {
        next.delete(repoId);
      } else if (next.size < 500) {
        next.set(repoId, { owner, name, bookmarkedAt: Date.now() });
      }
      save(next);
      return next;
    });
  };

  return { bookmarks, toggle };
}

function BoardCard({
  label,
  accent,
  entries,
  state,
  onSelect,
  bookmarks,
}: {
  label: string;
  accent: string;
  entries: BoardEntryResponse[];
  state: LoadState;
  onSelect: (entry: BoardEntryResponse, accent: string) => void;
  bookmarks: Map<string, BookmarkedRepo>;
}) {
  function onRowKey(event: KeyboardEvent<HTMLLIElement>, entry: BoardEntryResponse): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(entry, accent);
    }
  }

  return (
    <section
      className="card"
      style={{ "--accent": accent } as CSSProperties}
      aria-label={label}
    >
      <header className="card__head">
        <h2 className="card__title">{label}</h2>
        <span className="card__count">{entries.length} 条榜单条目</span>
      </header>

      <div className="card__scroll">
        {state !== "ready" ? (
          <p className="card__empty">
            {state === "loading" ? "正在读取榜单…" : "数据加载失败，请稍后重试。"}
          </p>
        ) : entries.length === 0 ? (
          <p className="card__empty">本期这个榜单没有可展示的榜单条目。</p>
        ) : (
          <ol className="board">
            {entries.map((entry) => {
              const isBookmarked = bookmarks.has(entry.repo);
              return (
                <li
                  className="row"
                  key={entry.repo}
                  role="button"
                  tabIndex={0}
                  aria-label={`查看 ${entry.repo} 详情`}
                  onClick={() => onSelect(entry, accent)}
                  onKeyDown={(event) => onRowKey(event, entry)}
                  data-bookmarked={isBookmarked}
                >
                  <span className="rank">{formatRank(entry.rank)}</span>

                  <div className="row__body">
                    <span className="repo">
                      {entry.repo}
                      {isBookmarked && <span className="badge badge--bookmark">♥</span>}
                      {entry.interpretation.status !== "done" && !isBookmarked && (
                        <span className="badge">{interpretationStatusHint(entry.interpretation.status)}</span>
                      )}
                    </span>
                    {entry.interpretation.status === "done" && entry.interpretation.summary ? (
                      <p className="summary">{entry.interpretation.summary}</p>
                    ) : (
                      <p className="desc">{entry.descEn ?? EMPTY_DESCRIPTION}</p>
                    )}
                    <div className="tags">
                      {entry.language && <span className="tag language">{entry.language}</span>}
                      {entry.tags.map((tag) => (
                        <span className="tag" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="metrics">
                      <span title="stars">★ {formatMetric(entry.stars)}</span>
                      <span title="forks">⑂ {formatMetric(entry.forks)}</span>
                      {entry.gained !== null && (
                        <span className="gain" title="gained">
                          ↑ {formatMetric(entry.gained)}
                        </span>
                      )}
                      {entry.featured !== null && (
                        <span className="featured" title="featured">
                          ✦ {formatMetric(entry.featured)}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

export function App() {
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<BoardsResponse | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ entry: BoardEntryResponse; accent: string } | null>(
    null,
  );
  const [viewBookmarksOnly, setViewBookmarksOnly] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [bookmarkedEntries, setBookmarkedEntries] = useState<BoardEntryResponse[]>([]);
  const { bookmarks, toggle } = useBookmarks();

  async function load(date?: string, signal?: AbortSignal): Promise<void> {
    const response = await fetch(date ? `/api/boards?date=${date}` : "/api/boards", {
      signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.json()) as BoardsResponse;
    setData(body);
    setSwitchError(null);
    setState("ready");
  }

  useEffect(() => {
    const controller = new AbortController();
    load(undefined, controller.signal).catch((error: unknown) => {
      if (error instanceof Error && error.name === "AbortError") return;
      setState("error");
    });
    return () => controller.abort();
  }, []);

  // 当viewBookmarksOnly或bookmarks改变时，加载收藏的仓库详情
  useEffect(() => {
    if (!viewBookmarksOnly || bookmarks.size === 0) {
      setBookmarkedEntries([]);
      return;
    }

    const repos = Array.from(bookmarks.values()).map((b) => ({
      owner: b.owner,
      name: b.name,
    }));

    fetch("/api/repos/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(repos),
    })
      .then((r) => r.json())
      .then((details) => {
        // 构造虚拟的BoardEntryResponse对象（用于显示收藏列表）
        const entries = details.map((detail: any, idx: number) => ({
          rank: idx + 1,
          repo: `${detail.owner}/${detail.name}`,
          htmlUrl: detail.htmlUrl,
          homepage: detail.homepage,
          descEn: detail.descEn,
          interpretation: { summary: null, solves: null, audience: null, status: "none" as const },
          stars: null,
          forks: null,
          gained: null,
          featured: null,
          language: detail.language,
          tags: detail.tags,
        }));
        setBookmarkedEntries(entries);
      })
      .catch((e) => console.error("加载收藏详情失败", e));
  }, [viewBookmarksOnly, bookmarks]);

  function selectEdition(event: ChangeEvent<HTMLSelectElement>): void {
    load(event.target.value).catch(() => setSwitchError("切换期次失败，请重试。"));
  }

  const labels = data?.labels ?? BOARD_LABELS;
  const accents = data?.accents ?? BOARD_ACCENTS;
  const total = data
    ? BOARD_ORDER.reduce((sum, slug) => sum + data.boards[slug].length, 0)
    : 0;
  const selectedDate =
    data?.date && data.dates.includes(data.date) ? data.date : data?.dates[0];

  return (
    <main className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__name">TrendShift</span>
          <span className="topbar__sub">中文看板</span>
        </div>
        <div className="topbar__slots">
          <div className="topbar__slot">
            <label className="topbar__label" htmlFor="edition-date">
              期次（UTC）
            </label>
            {!viewBookmarksOnly && data && data.dates.length > 0 ? (
              <select
                id="edition-date"
                className="topbar__select"
                value={selectedDate}
                onChange={selectEdition}
              >
                {data.dates.map((availableDate) => (
                  <option key={availableDate} value={availableDate}>
                    {availableDate} UTC
                  </option>
                ))}
              </select>
            ) : viewBookmarksOnly ? (
              <span className="topbar__value">只看收藏</span>
            ) : (
              <span className="topbar__value topbar__value--pending">等待首个期次</span>
            )}
          </div>
          <div className="topbar__slot">
            <label className="topbar__label" htmlFor="bookmarks-toggle">
              <input
                id="bookmarks-toggle"
                type="checkbox"
                checked={viewBookmarksOnly}
                onChange={(e) => setViewBookmarksOnly(e.target.checked)}
                className="topbar__checkbox"
              />
              只看收藏 {bookmarks.size > 0 && `(${bookmarks.size})`}
            </label>
          </div>
          <div className="topbar__slot">
            <button
              type="button"
              className="topbar__admin"
              onClick={() => setShowAdmin((visible) => !visible)}
              aria-expanded={showAdmin}
            >
              运维
            </button>
          </div>
          <div className="topbar__slot">
            <span className="topbar__label">数据状态</span>
            <span className="topbar__value topbar__value--pending">待接入</span>
          </div>
        </div>
      </header>

      {state === "loading" && <p className="wall__notice">正在读取榜单…</p>}
      {state === "error" && (
        <p className="wall__notice wall__notice--error">数据加载失败，请稍后重试。</p>
      )}
      {switchError && <p className="wall__notice wall__notice--error">{switchError}</p>}
      {state === "ready" && !viewBookmarksOnly && total === 0 && (
        <p className="wall__notice">
          还没有期次数据，部署完成后由运维手动触发一次采集。
        </p>
      )}
      {viewBookmarksOnly && bookmarks.size === 0 && (
        <p className="wall__notice">还没有收藏任何仓库。</p>
      )}

      {viewBookmarksOnly ? (
        <div className="wall wall--bookmarks">
          <section
            className="card"
            style={{ "--accent": "#64d1f2" } as CSSProperties}
            aria-label="我的收藏"
          >
            <header className="card__head">
              <h2 className="card__title">我的收藏</h2>
              <span className="card__count">{bookmarkedEntries.length} 个仓库</span>
            </header>
            <div className="card__scroll">
              {bookmarkedEntries.length === 0 ? (
                <p className="card__empty">正在加载收藏…</p>
              ) : (
                <ol className="board">
                  {bookmarkedEntries.map((entry) => (
                    <li
                      className="row row--bookmarked"
                      key={entry.repo}
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setSelected({
                          entry,
                          accent: BOARD_ACCENTS["daily"] || "#64d1f2",
                        })
                      }
                    >
                      <span className="rank">♥</span>
                      <div className="row__body">
                        <span className="repo">{entry.repo}</span>
                        <p className="desc">{entry.descEn ?? EMPTY_DESCRIPTION}</p>
                        <div className="tags">
                          {entry.language && (
                            <span className="tag language">{entry.language}</span>
                          )}
                          {entry.tags.map((tag) => (
                            <span className="tag" key={tag}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </div>
      ) : (
        <div className="wall">
          {BOARD_ORDER.map((slug) => (
            <BoardCard
              key={slug}
              label={labels[slug]}
              accent={accents[slug]}
              entries={data?.boards[slug] ?? []}
              state={state}
              onSelect={(entry, accent) => setSelected({ entry, accent })}
              bookmarks={bookmarks}
            />
          ))}
        </div>
      )}

      {showAdmin && (
        <AdminPanel
          onClose={() => setShowAdmin(false)}
          onDataChanged={() => {
            void load();
          }}
        />
      )}

      {selected && (
        <DetailDrawer
          entry={selected.entry}
          editionDate={viewBookmarksOnly ? "历史期次" : (selectedDate ?? "")}
          accent={selected.accent}
          onClose={() => setSelected(null)}
          isBookmarked={bookmarks.has(selected.entry.repo)}
          onToggleBookmark={() => toggle(selected.entry.repo)}
        />
      )}
    </main>
  );
}
