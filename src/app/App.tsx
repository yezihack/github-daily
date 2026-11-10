import { useEffect, useState } from "react";
import type { BoardEntryResponse, BoardsResponse } from "../shared/types";

type LoadState = "loading" | "ready" | "error";

function formatMetric(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("en-US");
}

export function App() {
  const [state, setState] = useState<LoadState>("loading");
  const [date, setDate] = useState<string | null>(null);
  const [entries, setEntries] = useState<BoardEntryResponse[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/boards", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as BoardsResponse;
      })
      .then((body) => {
        setDate(body.date);
        setEntries(body.boards.daily);
        setState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setState("error");
      });

    return () => controller.abort();
  }, []);

  return (
    <main className="page">
      <header className="header">
        <div>
          <p className="eyebrow">TrendShift · 中文看板</p>
          <h1>日榜</h1>
        </div>
        <p className="edition">{date ? `${date} UTC` : "等待首个期次"}</p>
      </header>

      {state === "loading" && <p className="notice">正在读取榜单…</p>}

      {state === "error" && (
        <p className="notice error">数据加载失败，请稍后重试。</p>
      )}

      {state === "ready" && entries.length === 0 && (
        <section className="empty">
          <h2>还没有日榜数据</h2>
          <p>部署完成后，由运维手动触发一次采集，仓库列表就会出现在这里。</p>
        </section>
      )}

      {entries.length > 0 && (
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
                <span className="gain" title="gained">
                  ↑ {formatMetric(entry.gained)}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
