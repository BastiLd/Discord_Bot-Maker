import type { CSSProperties } from 'react';

import { Handle, Position, type NodeProps } from '@xyflow/react';

import type { BuilderNode } from '../types';

export function BuilderNodeCard({ data, selected }: NodeProps<BuilderNode>) {
  const style = {
    '--node-accent': data.accent,
  } as CSSProperties;

  return (
    <div className={`builder-node-card${selected ? ' is-selected' : ''}`} style={style}>
      <Handle className="builder-node-card__handle" type="target" position={Position.Left} />
      <div className="builder-node-card__chip-row">
        <span className="builder-node-card__chip">{data.kind}</span>
        {data.imported ? <span className="builder-node-card__chip builder-node-card__chip--soft">import</span> : null}
      </div>
      <h3>{data.title}</h3>
      <p>{data.summary}</p>
      {data.sourceFile ? <small>{data.sourceFile}</small> : null}
      <Handle className="builder-node-card__handle" type="source" position={Position.Right} />
    </div>
  );
}