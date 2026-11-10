import { useEffect, useState, type CSSProperties } from "react";
import { BOARD_ACCENTS, BOARD_LABELS, BOARD_ORDER } from "../shared/boards";
import type { BoardEntryResponse, BoardsResponse } from "../shared/types";

type LoadState = "loading" | "ready" | "error";

function formatMetric(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("en-US");
}

function BoardCard({
  label,
  accent,
  entries,
  state,
}: {
  label: string;
  accent: string;
  entries: BoardEntryResponse[];
  state: LoadState;
}) {
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
            {entries.map((entry) => (
              <li className="row" key={entry.repo}>
                <span className="rank">{String(entry.rank).padStart(2, "0")}</span>

                <div className="row__body">
                  <a
                    className="repo"
                    href={entry.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {entry.repo}
                  </a>
                  <p className="desc">{entry.descEn ?? "暂无英文简介"}</p>
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
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

export function App() {
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<BoardsResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/boards", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as BoardsResponse;
      })
      .then((body) => {
        setData(body);
        setState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setState("error");
      });

    return () => controller.abort();
  }, []);

  const labels = data?.labels ?? BOARD_LABELS;
  const accents = data?.accents ?? BOARD_ACCENTS;
  const total = data
    ? BOARD_ORDER.reduce((sum, slug) => sum + data.boards[slug].length, 0)
    : 0;

  return (
    <main className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__name">TrendShift</span>
          <span className="topbar__sub">中文看板</span>
        </div>
        <div className="topbar__slots">
          <div className="topbar__slot">
            <span className="topbar__label">期次</span>
            <span className="topbar__value">
              {data?.date ? `${data.date} UTC` : "等待首个期次"}
            </span>
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
      {state === "ready" && total === 0 && (
        <p className="wall__notice">
          还没有期次数据，部署完成后由运维手动触发一次采集。
        </p>
      )}

      <div className="wall">
        {BOARD_ORDER.map((slug) => (
          <BoardCard
            key={slug}
            label={labels[slug]}
            accent={accents[slug]}
            entries={data?.boards[slug] ?? []}
            state={state}
          />
        ))}
      </div>
    </main>
  );
}
