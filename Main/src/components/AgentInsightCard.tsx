import React, { useCallback, useState } from 'react';
import type {
  ClarificationRequest,
  QueryExpandResult,
  RerankResult,
  SlangUnderstandResult,
} from '../lib/shared-types/index.js'

type AgentInsightCardProps =
  | { kind: 'understanding'; data: SlangUnderstandResult }
  | { kind: 'expansion'; data: QueryExpandResult }
  | { kind: 'rerank'; data: RerankResult }
  | {
      kind: 'clarification';
      data: ClarificationRequest;
      onAnswer: (option: string) => void;
    };

const TOKENS = {
  bg: '#FFFFFF',
  bgSoft: '#FFF5F7',
  border: '#E5E9EF',
  text: '#18191C',
  muted: '#61666D',
  subtle: '#9499A0',
  primary: '#FB7299',
  primaryDark: '#F25D8E',
  radius: 12,
  radiusPill: 999,
  spaceXs: 4,
  spaceSm: 8,
  spaceMd: 12,
  spaceLg: 16,
} as const;

const styles = {
  card: {
    background: TOKENS.bg,
    border: `1px solid ${TOKENS.border}`,
    borderRadius: TOKENS.radius,
    boxShadow: '0 2px 8px rgba(251, 114, 153, 0.08)',
    overflow: 'hidden',
  },
  header: {
    alignItems: 'center',
    background: TOKENS.bgSoft,
    border: 'none',
    color: TOKENS.text,
    cursor: 'pointer',
    display: 'flex',
    fontFamily: 'inherit',
    fontSize: 14,
    fontWeight: 600,
    justifyContent: 'space-between',
    margin: 0,
    padding: `${TOKENS.spaceMd}px ${TOKENS.spaceLg}px`,
    width: '100%',
  },
  body: {
    color: TOKENS.muted,
    display: 'flex',
    flexDirection: 'column',
    fontSize: 13,
    gap: TOKENS.spaceMd,
    lineHeight: 1.6,
    padding: `${TOKENS.spaceMd}px ${TOKENS.spaceLg}px ${TOKENS.spaceLg}px`,
  },
  row: { display: 'flex', flexDirection: 'column', gap: TOKENS.spaceXs },
  label: { color: TOKENS.subtle, fontSize: 12, fontWeight: 500 },
  value: { color: TOKENS.text, margin: 0 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: TOKENS.spaceSm },
  chip: {
    background: TOKENS.bgSoft,
    border: '1px solid rgba(251, 114, 153, 0.25)',
    borderRadius: TOKENS.radiusPill,
    color: TOKENS.primaryDark,
    fontSize: 12,
    fontWeight: 500,
    padding: `${TOKENS.spaceXs}px ${TOKENS.spaceMd}px`,
  },
  option: {
    background: `linear-gradient(135deg, ${TOKENS.primary} 0%, ${TOKENS.primaryDark} 100%)`,
    border: 'none',
    borderRadius: TOKENS.radiusPill,
    color: TOKENS.bg,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 600,
    padding: `${TOKENS.spaceSm}px ${TOKENS.spaceMd}px`,
  },
} satisfies Record<string, React.CSSProperties>;

const titles: Record<AgentInsightCardProps['kind'], string> = {
  understanding: 'AI 理解',
  expansion: '搜索词扩展',
  rerank: '智能排序',
  clarification: '请帮我确认',
};

export function AgentInsightCard(props: AgentInsightCardProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);
  const toggle = useCallback(() => setIsExpanded((current) => !current), []);

  return (
    <section
      className={`bili-agent-insight-card bili-agent-insight-card--${props.kind}`}
      data-testid={`agent-insight-${props.kind}`}
      data-bili-agent-card="true"
      style={styles.card}
    >
      <button type="button" className="bili-agent-insight-card__header" aria-expanded={isExpanded} onClick={toggle} style={styles.header}>
        <span>{titles[props.kind]}</span>
        <span aria-hidden="true">{isExpanded ? '收起' : '展开'}</span>
      </button>
      {isExpanded && <div className="bili-agent-insight-card__body" style={styles.body}>{renderBody(props)}</div>}
    </section>
  );
}

function renderBody(props: AgentInsightCardProps): React.ReactNode {
  switch (props.kind) {
    case 'understanding':
      return <Rows rows={[
        ['原始描述', props.data.original],
        ['理解后', props.data.normalized],
        ['解释', props.data.explanation],
      ]} />;
    case 'expansion':
      return <>
        <ChipGroup label="关键词" items={props.data.keywords} />
        <ChipGroup label="标签" items={props.data.tags} />
        <ChipGroup label="分区" items={props.data.categories} />
        <Rows rows={[["依据", props.data.rationale]]} />
      </>;
    case 'rerank':
      return <Rows rows={[
        ['策略', props.data.strategy === 'llm' ? 'LLM 智能排序' : 'Fallback 规则排序'],
        ['裁剪数量', `${props.data.trimmed}`],
        ['保留结果', `${props.data.items.length}`],
      ]} />;
    case 'clarification':
      return <>
        <Rows rows={[
          ['问题', props.data.question],
          ['原因', props.data.reason],
        ]} />
        <div style={styles.chips}>
          {(props.data.options ?? []).map((option) => (
            <button key={option} type="button" style={styles.option} onClick={() => props.onAnswer(option)}>{option}</button>
          ))}
        </div>
      </>;
  }
}

function Rows({ rows }: { rows: [string, string][] }): React.ReactElement {
  return <>{rows.map(([label, value]) => <InfoRow key={label} label={label} value={value} />)}</>;
}

function InfoRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return <div style={styles.row}><span style={styles.label}>{label}</span><p style={styles.value}>{value}</p></div>;
}

function ChipGroup({ label, items }: { label: string; items: string[] }): React.ReactElement {
  return (
    <div style={styles.row}>
      <span style={styles.label}>{label}</span>
      <div style={styles.chips}>{items.map((item) => <span key={item} style={styles.chip}>{item}</span>)}</div>
    </div>
  );
}
