import { useEffect, useState } from "react";
import { BOARD_ORDER } from "../shared/boards";
import type { BoardEntryResponse, BoardsResponse } from "../shared/types";

type LoadState = "loading" | "ready" | "error";

function formatMetric(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("en-US");
}

function BoardSection({
  label,
  entries,
}: {
  label: string;
  entries: BoardEntryResponse[];
}) {
  return (
    <section className="board-section">
      <h2 className="board-title">
        {label}
        <span className="board-count">{entries.length} 条榜单条目</span>
      </h2>

      {entries.length === 0 ? (
        <p className="board-empty">本期这个榜单没有可展示的榜单条目。</p>
      ) : (
        <ol className="board">
          {entries.map((entry) => (
            <li className="row" key={entry.repo}>
              <span className="rank">{String(entry.rank).padStart(2, "0")}</span>

              <div className="body">
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
            </li>
          ))}
        </ol>
      )}
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

  const total = data
    ? BOARD_ORDER.reduce((sum, slug) => sum + data.boards[slug].length, 0)
    : 0;

  return (
    <main className="page">
      <header className="header">
        <div>
          <p className="eyebrow">TrendShift · 中文看板</p>
          <h1>今日榜单</h1>
        </div>
        <p className="edition">{data?.date ? `${data.date} UTC` : "等待首个期次"}</p>
      </header>

      {state === "loading" && <p className="notice">正在读取榜单…</p>}

      {state === "error" && (
        <p className="notice error">数据加载失败，请稍后重试。</p>
      )}

      {state === "ready" && total === 0 && (
        <section className="empty">
          <h2>还没有期次数据</h2>
          <p>部署完成后，由运维手动触发一次采集，六个榜单的榜单条目就会出现在这里。</p>
        </section>
      )}

      {state === "ready" && data && total > 0 &&
        BOARD_ORDER.map((slug) => (
          <BoardSection
            key={slug}
            label={data.labels[slug]}
            entries={data.boards[slug]}
          />
        ))}
    </main>
  );
}
