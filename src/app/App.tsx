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

type LoadState = "loading" | "ready" | "error";

function BoardCard({
  label,
  accent,
  entries,
  state,
  onSelect,
}: {
  label: string;
  accent: string;
  entries: BoardEntryResponse[];
  state: LoadState;
  onSelect: (entry: BoardEntryResponse, accent: string) => void;
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
            {entries.map((entry) => (
              <li
                className="row"
                key={entry.repo}
                role="button"
                tabIndex={0}
                aria-label={`查看 ${entry.repo} 详情`}
                onClick={() => onSelect(entry, accent)}
                onKeyDown={(event) => onRowKey(event, entry)}
              >
                <span className="rank">{formatRank(entry.rank)}</span>

                <div className="row__body">
                  <span className="repo">
                    {entry.repo}
                    {entry.interpretation.status !== "done" && (
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
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ entry: BoardEntryResponse; accent: string } | null>(
    null,
  );

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
            {data && data.dates.length > 0 ? (
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
            ) : (
              <span className="topbar__value topbar__value--pending">等待首个期次</span>
            )}
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
            onSelect={(entry, accent) => setSelected({ entry, accent })}
          />
        ))}
      </div>

      {selected && (
        <DetailDrawer
          entry={selected.entry}
          editionDate={selectedDate ?? ""}
          accent={selected.accent}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}
