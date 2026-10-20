'use client';
import { useState, type FormEvent } from 'react';
import TimeSeries from '@/components/platform/time-series';
import { useApi } from '@/components/platform/use-api';
import { formatValue } from '@/components/platform/data-list';
type Reading = {
    id: string;
    sampled_at: string;
    reported_at: string | null;
    received_at: string;
    value: number | null;
    raw_value: string | number | null;
    unit: string;
    quality: string;
    canonical: boolean;
    conflicted: boolean;
    origin: string;
};
type History = {
    point: {
        name: string;
        unit: string;
        maxGapMs: number | null;
        timingSource: string | null;
    };
    items: Reading[];
    current: {
        value: number;
        sampled_at: string;
    } | null;
    dataState: string;
    communication: {
        state: string;
        lastSuccessAt: string | null;
    };
    gaps: {
        from: string;
        to: string;
    }[];
    maintenance: {
        id: string;
        occurred_at: string;
        record_type: string;
        payload: {
            description: string;
        };
    }[];
    manualChecks: {
        id: string;
        occurred_at: string;
        raw_value: string;
        unit: string;
        method: string;
        supersedes_id: string | null;
    }[];
    nextCursor: string | null;
};
function toLocalInput(d: Date) { const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
const QUICK_RANGES = [{ label: '最近24小时', hours: 24 }, { label: '最近3天', hours: 72 }, { label: '最近7天', hours: 168 }, { label: '全部（31天）', hours: 744 }] as const;
export default function PointHistory({ id }: {
    id: string;
}) {
    const [query, setQuery] = useState(''), { data, error } = useApi<History>('/api/v1/points/' + id + '/readings' + query);
    const [range, setRange] = useState<{ from: string; to: string; label: string }>(() => { const to = new Date(), from = new Date(to.getTime() - 86400_000); return { from: toLocalInput(from), to: toLocalInput(to), label: '最近24小时' }; });
    function apply(from: string, to: string, label: string) {
        setRange({ from, to, label });
        setQuery('?' + new URLSearchParams({ from: new Date(from).toISOString(), to: new Date(to).toISOString() }).toString());
    }
    function quick(hours: number, label: string) { const to = new Date(), from = new Date(to.getTime() - hours * 3600_000); apply(toLocalInput(from), toLocalInput(to), label); }
    function filter(e: FormEvent<HTMLFormElement>) { e.preventDefault(); apply(range.from, range.to, '自定义'); }
    const states: Record<string, string> = { fresh: '数据新鲜', stale: '测值已过期', missing: '当前对应关系下尚无有效测值', suspect: '数据待核', unconfigured: '时效尚未配置', unverified_mapping: '当前测点对应关系待核实', history_only: '仅可查看历史授权数据' };
    return <section className="workspace"><a href="/devices">返回设备与测点</a><h1>{data?.point.name ?? '测点历史'}</h1><div className="quick-range">{QUICK_RANGES.map(r => <button key={r.hours} type="button" className={range.label === r.label ? 'active' : ''} onClick={() => quick(r.hours, r.label)}>{r.label}</button>)}</div><form className="range-form" onSubmit={filter}><label>开始时间<input name="from" type="datetime-local" required value={range.from} onChange={e => setRange({ ...range, from: e.target.value, label: '自定义' })}/></label><label>结束时间<input name="to" type="datetime-local" required value={range.to} onChange={e => setRange({ ...range, to: e.target.value, label: '自定义' })}/></label><button>查询（最多31天）</button></form>{error && <p className="form-error" role="alert">{error}</p>}
    {data && <><div className="status-grid"><div><h2>测值状态</h2><strong>{states[data.dataState] ?? data.dataState}</strong><p>最后有效值：{data.current?.value ?? '未知'} {data.point.unit}</p><p>采样：{data.current ? new Date(data.current.sampled_at).toLocaleString() : '未知'}</p></div><div><h2>来源通信</h2><strong>{data.communication.state === 'last_contact_succeeded' ? '最近一次通信成功' : data.communication.state === 'unknown' ? '尚无通信依据' : '来源不可用'}</strong><p>最后成功：{data.communication.lastSuccessAt ? new Date(data.communication.lastSuccessAt).toLocaleString() : '未知'}</p><p className="hint">通信成功不等于测值仍然新鲜。</p></div></div><p className="hint">时效依据：{data.point.timingSource ?? '尚未登记'}。异常点与缺口不连成正常曲线；未配置间隔时只显示测值点。</p><TimeSeries title='监测历史曲线' maxGapMs={data.point.maxGapMs} unit={data.point.unit} points={data.items.map(r=>({id:r.id,time:Date.parse(r.sampled_at),value:r.canonical&&r.unit===data.point.unit?r.value:null,valid:r.canonical&&r.quality==='valid'&&!r.conflicted}))}/>
      {!!data.gaps.length && <p className="form-error">当前页检测到 {data.gaps.length} 段采样间隔缺口。</p>}
      {!!data.maintenance.length && <div><h2>该时段的维护标记</h2><ul>{data.maintenance.map(m => <li key={m.id}>{new Date(m.occurred_at).toLocaleString()} · {m.payload.description}</li>)}</ul></div>}
      {!!data.manualChecks.length && <div><h2>手持/人工复测（未合并到在线曲线）</h2><ul>{data.manualChecks.map(m => <li key={m.id}>{new Date(m.occurred_at).toLocaleString()} · {m.raw_value} {m.unit}；{m.method}{m.supersedes_id ? '；追加更正记录' : ''}</li>)}</ul></div>}
      <p className="hint">表格可横向滑动，查看完整时间、原值与质量。</p><div className="table-wrap"><table><thead><tr><th>采样时间</th><th>上报时间</th><th>接收时间</th><th>原值</th><th>标准值</th><th>质量</th></tr></thead><tbody>{data.items.map(r => <tr key={r.id}><td>{new Date(r.sampled_at).toLocaleString()}</td><td>{r.reported_at ? new Date(r.reported_at).toLocaleString() : '未知'}</td><td>{new Date(r.received_at).toLocaleString()}</td><td>{r.raw_value ?? '未知'}</td><td>{r.value ?? '无效/未知'} {r.unit}</td><td>{r.conflicted ? '冲突待核' : formatValue('quality', r.quality)}</td></tr>)}</tbody></table></div>
      {data.nextCursor && <button className="secondary" onClick={() => { const p = new URLSearchParams(query.replace(/^\?/, '')); p.set('cursor', data.nextCursor!); setQuery('?' + p.toString()); }}>查看下一页（当前曲线只表示本页数据）</button>}
    </>}
  </section>;
}
