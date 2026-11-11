import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  EMPTY_DESCRIPTION,
  formatMetric,
  formatRank,
  interpretationStatusHint,
} from "../shared/format";
import type { BoardEntryResponse } from "../shared/types";

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="drawer__metric" title={label}>
      <span className="drawer__metric-label">{label}</span>
      <span className="drawer__metric-value">{children}</span>
    </span>
  );
}

export function DetailDrawer({
  entry,
  editionDate,
  accent,
  onClose,
}: {
  entry: BoardEntryResponse;
  editionDate: string;
  accent: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copyAddress(): Promise<void> {
    try {
      await navigator.clipboard.writeText(entry.htmlUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="drawer" role="dialog" aria-modal="true" aria-label={`${entry.repo} 详情`}>
      <div className="drawer__scrim" onClick={onClose} />
      <aside
        className="drawer__panel"
        style={{ "--accent": accent } as CSSProperties}
      >
        <header className="drawer__head">
          <div className="drawer__heading">
            <span className="drawer__repo">{entry.repo}</span>
            <span className="drawer__edition">
              期次 {editionDate} UTC
            </span>
          </div>
          <button
            type="button"
            className="drawer__close"
            onClick={onClose}
            aria-label="关闭详情"
          >
            ×
          </button>
        </header>

        <div className="drawer__body">
          <section className="drawer__section">
            <h3 className="drawer__label">英文原始简介</h3>
            <p className="drawer__desc">{entry.descEn ?? EMPTY_DESCRIPTION}</p>
          </section>

          <section className="drawer__section">
            <h3 className="drawer__label">当期榜单指标</h3>
            <div className="drawer__metrics">
              <Metric label="rank">#{formatRank(entry.rank)}</Metric>
              <Metric label="stars">★ {formatMetric(entry.stars)}</Metric>
              <Metric label="forks">⑂ {formatMetric(entry.forks)}</Metric>
              {entry.gained !== null && (
                <Metric label="gained">↑ {formatMetric(entry.gained)}</Metric>
              )}
              {entry.featured !== null && (
                <Metric label="featured">✦ {formatMetric(entry.featured)}</Metric>
              )}
              {entry.language && <Metric label="language">{entry.language}</Metric>}
            </div>
            {entry.tags.length > 0 && (
              <div className="tags drawer__tags">
                {entry.tags.map((tag) => (
                  <span className="tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </section>

          <p className="drawer__boundary">
            指标跟随当期榜单条目，解读跟随仓库。
          </p>

          <section className="drawer__section drawer__links">
            <a
              className="drawer__link"
              href={entry.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub 仓库
            </a>
            {entry.homepage && (
              <a
                className="drawer__link"
                href={entry.homepage}
                target="_blank"
                rel="noopener noreferrer"
              >
                项目主页
              </a>
            )}
            <button
              type="button"
              className="drawer__copy"
              onClick={copyAddress}
              aria-live="polite"
            >
              {copied ? "已复制地址" : "复制仓库地址"}
            </button>
          </section>

          <section className="drawer__section">
            <h3 className="drawer__label">
              AI 解读
              <span className="drawer__ai-note">由 AI 生成，仅供参考</span>
            </h3>
            {entry.interpretation.status === "done" ? (
              <div className="drawer__interpretation">
                <div className="drawer__seg">
                  <span className="drawer__seg-label">简介</span>
                  <p className="drawer__seg-text">{entry.interpretation.summary}</p>
                </div>
                <div className="drawer__seg">
                  <span className="drawer__seg-label">解决问题</span>
                  <p className="drawer__seg-text">{entry.interpretation.solves}</p>
                </div>
                <div className="drawer__seg">
                  <span className="drawer__seg-label">适用人群</span>
                  <p className="drawer__seg-text">{entry.interpretation.audience}</p>
                </div>
              </div>
            ) : (
              <p className="drawer__pending">
                {entry.interpretation.status === "none"
                  ? "待生成"
                  : `${interpretationStatusHint(entry.interpretation.status)}${
                      entry.interpretation.status === "failed" ? "，稍后重试。" : "…"
                    }`}
              </p>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
