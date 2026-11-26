import { useCallback, useEffect, useState } from "react";
import type {
  AdminStatusResponse,
  InterpretationRun,
  InterpretationRunsResponse,
} from "../shared/types";

interface AdminPanelProps {
  onClose: () => void;
  onDataChanged: () => void;
}

type Action = "ingest" | "process" | "retry" | "refresh";

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function AdminPanel({ onClose, onDataChanged }: AdminPanelProps) {
  const [token, setToken] = useState("");
  const [pending, setPending] = useState<number | null>(null);
  const [runs, setRuns] = useState<InterpretationRun[]>([]);
  const [busy, setBusy] = useState<Action | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const request = useCallback(
    async (path: string, method = "GET"): Promise<unknown> => {
      if (!token.trim()) throw new Error("请先输入 ADMIN_TOKEN");
      const response = await fetch(path, {
        method,
        headers: { Authorization: `Bearer ${token.trim()}` },
      });
      if (response.status === 401) throw new Error("ADMIN_TOKEN 无效");
      const body = (await response.json()) as unknown;
      if (!response.ok) {
        const error = body as { error?: string };
        throw new Error(error.error ?? `HTTP ${response.status}`);
      }
      return body;
    },
    [token],
  );

  const refresh = useCallback(async () => {
    if (!token.trim()) {
      setMessage("请先输入 ADMIN_TOKEN，再刷新状态。");
      return;
    }
    setBusy("refresh");
    setMessage(null);
    try {
      const [statusBody, runsBody] = await Promise.all([
        request("/api/admin/status") as Promise<AdminStatusResponse>,
        request("/api/admin/interpretation-runs") as Promise<InterpretationRunsResponse>,
      ]);
      setPending(statusBody.pending);
      setRuns(runsBody.runs);
      setMessage("状态已刷新。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "刷新失败");
    } finally {
      setBusy(null);
    }
  }, [request, token]);

  useEffect(() => {
    if (token.trim()) void refresh();
    // 仅在令牌变化时自动拉取一次，手动刷新由按钮触发。
  }, [token]);

  async function invoke(action: Exclude<Action, "refresh">): Promise<void> {
    setBusy(action);
    setMessage(null);
    try {
      const path =
        action === "ingest"
          ? "/api/admin/ingest"
          : action === "process"
            ? "/api/admin/interpretations/process"
            : "/api/admin/interpretations/retry";
      const body = (await request(path, "POST")) as {
        done?: number;
        failed?: number;
        pending?: number;
        count?: number;
        date?: string;
      };
      if (action === "ingest") {
        setMessage(`采集完成：${body.date ?? "-"}，${body.count ?? 0} 条。`);
        onDataChanged();
      } else {
        setMessage(
          `解读队列：完成 ${body.done ?? 0}，失败 ${body.failed ?? 0}，待处理 ${body.pending ?? 0}。`,
        );
      }
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(null);
    }
  }

  return (
    <aside className="admin-panel" aria-label="运维面板">
      <div className="admin-panel__head">
        <h2>运维 · AI 解读</h2>
        <button type="button" className="admin-panel__close" onClick={onClose} aria-label="关闭运维面板">
          ×
        </button>
      </div>

      <label className="admin-panel__field">
        ADMIN_TOKEN
        <input
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="输入管理令牌"
          autoComplete="off"
        />
      </label>
      <p className="admin-panel__hint">令牌只保存在当前页面内存，不会写入 localStorage。</p>

      <div className="admin-panel__actions">
        <button type="button" disabled={busy !== null} onClick={() => void invoke("ingest")}>
          立即采集
        </button>
        <button type="button" disabled={busy !== null} onClick={() => void invoke("process")}>
          跑一批解读
        </button>
        <button type="button" disabled={busy !== null} onClick={() => void invoke("retry")}>
          重跑失败解读
        </button>
        <button type="button" disabled={busy !== null} onClick={() => void refresh()}>
          刷新状态
        </button>
      </div>

      <p className="admin-panel__schedule">
        时钟：每日 UTC 00:10 采集；每 10 分钟解读 6 个仓库；限流后自动退避 15 分钟。
      </p>
      <p className="admin-panel__status">待解读：{pending ?? "—"} 条</p>
      {message && <p className="admin-panel__message">{message}</p>}

      <div className="admin-panel__logs">
        <h3>最近运行记录</h3>
        {runs.length === 0 ? (
          <p className="admin-panel__hint">暂无记录，输入令牌后点击「刷新状态」。</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>时间（本地）</th>
                <th>来源</th>
                <th>扫描</th>
                <th>完成</th>
                <th>失败</th>
                <th>限流</th>
                <th>耗时</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>{formatTime(run.started_at)}</td>
                  <td>{run.trigger}</td>
                  <td>{run.scanned}</td>
                  <td>{run.done}</td>
                  <td>{run.failed}</td>
                  <td>{run.rate_limited}</td>
                  <td>{run.duration_ms}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </aside>
  );
}
