'use client';
import React from 'react';

export function Donut({ data, size = 148, thickness = 18, children }: { data: { label: string; value: number; color: string }[]; size?: number; thickness?: number; children?: React.ReactNode }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={thickness} />
        {total > 0 && data.filter((d) => d.value > 0).map((d) => {
          const len = (d.value / total) * c, gap = Math.min(3, len * 0.15);
          const el = <circle key={d.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color} strokeWidth={thickness} strokeLinecap="round"
            strokeDasharray={`${Math.max(0, len - gap)} ${c}`} strokeDashoffset={-acc} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray .8s cubic-bezier(.2,.8,.2,1)' }} />;
          acc += len; return el;
        })}
      </svg>
      <div className="donut-in">{children}</div>
    </div>
  );
}

export function Bars({ data, highlight, height = 110, color = '#ffb36b', format }: { data: { label: string; value: number; key?: string }[]; highlight?: string; height?: number; color?: string; format?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="bars" style={{ height: height + 34 }}>
      {data.map((d, i) => (
        <div key={d.key ?? i} className="bar-col" title={format ? `${d.label}: ${format(d.value)}` : d.label}>
          <div className="bar-val tiny">{d.value > 0 && format ? format(d.value) : ''}</div>
          <div className="bar-track" style={{ height }}>
            <i style={{ height: `${Math.max(d.value > 0 ? 6 : 2, (d.value / max) * 100)}%`, background: d.key && d.key === highlight ? 'var(--grad)' : color, opacity: d.value > 0 ? 1 : 0.25 }} />
          </div>
          <div className={`tiny ${d.key && d.key === highlight ? '' : 'muted'}`}>{d.label}</div>
        </div>
      ))}
    </div>
  );
}

export function Diverge({ rows, format }: { rows: { name: string; value: number }[]; format: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <div className="stack-sm">
      {rows.map((r) => {
        const w = (Math.abs(r.value) / max) * 50;
        const pos = r.value > 0.5, neg = r.value < -0.5;
        return (
          <div key={r.name} className="dv-row">
            <span className="dv-name ellipsis">{r.name}</span>
            <div className="dv-track">
              <span className="dv-mid" />
              {(pos || neg) && <i className={pos ? 'pos' : 'neg'} style={pos ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }} />}
            </div>
            <span className={`dv-val num tiny ${pos ? 'good' : neg ? 'bad' : 'muted'}`}>{pos || neg ? (pos ? '+' : '−') + format(Math.abs(r.value)) : 'settled'}</span>
          </div>
        );
      })}
    </div>
  );
}
