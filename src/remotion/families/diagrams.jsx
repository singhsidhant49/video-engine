import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { useTheme, textStyles } from '../engine/theme.js';
import { Ground } from '../engine/imagery.jsx';
import { progress, ease } from '../engine/motion.js';
import { captionBand, Kicker } from './editorial.jsx';
import { createDiagramSpec } from '../../diagrams/diagramSpec.js';
import { createFormatLayoutContext, solveDiagramLayout } from '../../diagrams/layoutEngine.js';
import { DIAGRAM_GRAMMARS, NODE_IMPORTANCE } from '../../diagrams/diagramGrammar.js';

/**
 * Editorial Diagram Component — Milestone 13.
 * 
 * Executes semantic diagram grammars (FLOW, CYCLE, COMPARISON, RELATIONSHIP,
 * PIPELINE, HIERARCHY, NETWORK, STACK, FUNNEL, SYSTEM_ARCHITECTURE)
 * with format-aware layout, frame-0 validity, mobile readability, and connected animation.
 */
export function DiagramShot({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);

  // Normalize into canonical DiagramSpec
  const spec = createDiagramSpec(clip.overlay || {}, {
    format: theme.isVertical ? 'shorts' : 'landscape',
    narration: clip.narration,
  });

  const layoutCtx = createFormatLayoutContext({
    width: theme.width,
    height: theme.height,
    format: theme.isVertical ? 'shorts' : 'landscape',
    captionBand: captionBand(theme),
  });

  const layout = solveDiagramLayout(spec, layoutCtx);
  const { nodes, connectors, grammar } = layout;

  // Frame-0 readiness: structural container and subdued elements visible immediately
  const introP = progress(frame, spec.frameAt, 16, ease.out);
  const activeStepIdx = Math.min(
    nodes.length - 1,
    Math.floor(progress(frame, spec.frameAt + 8, Math.max(24, nodes.length * 14)) * nodes.length)
  );

  return (
    <AbsoluteFill>
      <Ground
        texture={clip.texture}
        durationInFrames={clip.durationInFrames}
        mode={clip.overlay?.backgroundMode || 'neutralDark'}
      />

      {/* Main Staging Canvas with Caption Safe Padding */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: theme.width,
          height: theme.height,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        {/* Editorial Eyebrow / Kicker */}
        {spec.title && (
          <div
            style={{
              position: 'absolute',
              left: layoutCtx.safe.left,
              top: layoutCtx.safe.top,
              right: layoutCtx.safe.right,
              zIndex: 10,
            }}
          >
            <Kicker text={spec.title} at={0} />
          </div>
        )}

        {/* 1. Precise SVG Connectors & Dynamic Flow Paths */}
        <svg
          width={theme.width}
          height={theme.height}
          style={{ position: 'absolute', left: 0, top: 0, zIndex: 2, overflow: 'visible' }}
        >
          <defs>
            <marker
              id="editorial-arrow"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill={theme.palette.accent} />
            </marker>
            <marker
              id="editorial-dot"
              viewBox="0 0 8 8"
              refX="4"
              refY="4"
              markerWidth="5"
              markerHeight="5"
            >
              <circle cx="4" cy="4" r="3" fill={theme.palette.accent} />
            </marker>
          </defs>

          {connectors.map((c, idx) => {
            const edgeProgress = progress(frame, spec.frameAt + idx * 6, 18, ease.out);
            const isHighlighted = idx <= activeStepIdx;
            return (
              <g key={c.id || idx}>
                {/* Background subdued line visible at frame 0 */}
                <path
                  d={c.pathData}
                  fill="none"
                  stroke={theme.palette.line}
                  strokeWidth="2"
                  strokeDasharray="4 4"
                  opacity={0.4}
                />
                {/* Animated active path draw */}
                <path
                  d={c.pathData}
                  fill="none"
                  stroke={isHighlighted ? theme.palette.accent : theme.palette.line}
                  strokeWidth={isHighlighted ? 2.5 : 1.5}
                  strokeDasharray={c.direction === 'return_loop' ? '6 4' : 'none'}
                  opacity={0.35 + 0.65 * edgeProgress}
                  markerEnd={c.direction === 'bidirectional' ? 'url(#editorial-dot)' : 'url(#editorial-arrow)'}
                />
                {/* Connector label */}
                {c.label && c.p1 && c.p2 && (
                  <text
                    x={(c.p1.x + c.p2.x) / 2}
                    y={(c.p1.y + c.p2.y) / 2 - 8}
                    fill={isHighlighted ? theme.palette.accent : theme.palette.muted}
                    fontSize={layoutCtx.typography.connectorLabel}
                    fontFamily={theme.font.mono}
                    textAnchor="middle"
                    opacity={0.4 + 0.6 * edgeProgress}
                  >
                    {c.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* 2. Format-Aware Positioned Semantic Nodes */}
        {nodes.map((node, idx) => {
          const isCurrent = idx === activeStepIdx;
          const isPrimary = node.importance === NODE_IMPORTANCE.PRIMARY;
          const nodeProgress = progress(frame, spec.frameAt + idx * 8, 14, ease.out);

          // Frame-0: Base structure visible in subdued tone (0.45 opacity), settles to 1.0 on reveal
          const currentOpacity = 0.45 + 0.55 * nodeProgress;
          const liftY = (1 - nodeProgress) * (theme.isVertical ? 14 : 10);

          return (
            <div
              key={node.id}
              style={{
                position: 'absolute',
                left: node.box.x,
                top: node.box.y,
                width: node.box.width,
                height: node.box.height,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: node.align === 'center' ? 'center' : node.align === 'right' ? 'flex-end' : 'flex-start',
                textAlign: node.align || 'left',
                padding: `${theme.u(16)}px ${theme.u(20)}px`,
                boxSizing: 'border-box',
                opacity: currentOpacity,
                transform: `translateY(${liftY}px)`,
                zIndex: isCurrent ? 5 : 3,
                transition: 'border 0.2s ease',
              }}
            >
              {/* Semantic Container based on Node Visual Form */}
              <NodePresentation
                node={node}
                theme={theme}
                typography={layoutCtx.typography}
                isCurrent={isCurrent}
                isPrimary={isPrimary}
                grammar={grammar}
              />
            </div>
          );
        })}

        {/* 3. Central Conflict / Tension Badge for Comparison & Relationship Grammars */}
        {(grammar === DIAGRAM_GRAMMARS.COMPARISON || grammar === DIAGRAM_GRAMMARS.RELATIONSHIP) && (
          <CentralConflictBadge
            spec={spec}
            layoutCtx={layoutCtx}
            theme={theme}
            frame={frame}
          />
        )}
      </div>
    </AbsoluteFill>
  );
}

/**
 * Renders an editorial node without defaulting to generic rounded box cards.
 */
function NodePresentation({ node, theme, typography, isCurrent, isPrimary, grammar }) {
  const t = textStyles(theme);
  const { visualForm, label, role, supportText, stageNumber } = node;

  // 1. BAND FORM (Used in Comparison, Relationship, Stacks)
  if (visualForm === 'band') {
    return (
      <div
        style={{
          width: '100%',
          borderLeft: !theme.isVertical ? `3px solid ${isCurrent ? theme.palette.accent : theme.palette.line}` : 'none',
          borderTop: theme.isVertical ? `2px solid ${isCurrent ? theme.palette.accent : theme.palette.line}` : 'none',
          paddingLeft: !theme.isVertical ? theme.u(16) : 0,
          paddingTop: theme.isVertical ? theme.u(12) : 0,
        }}
      >
        {role && (
          <div
            style={{
              fontFamily: theme.font.mono,
              fontSize: typography.kicker * 0.85,
              color: isCurrent ? theme.palette.accent : theme.palette.muted,
              letterSpacing: '0.08em',
              marginBottom: theme.u(6),
              textTransform: 'uppercase',
            }}
          >
            {role}
          </div>
        )}
        <div
          style={{
            ...t.display,
            fontSize: isPrimary ? typography.primaryNode : typography.secondaryNode,
            lineHeight: 1.15,
            color: isCurrent ? theme.palette.text : theme.palette.muted,
            fontWeight: isPrimary ? 800 : 700,
          }}
        >
          {label}
        </div>
        {supportText && (
          <div
            style={{
              ...t.body,
              fontSize: typography.supportText,
              color: theme.palette.muted,
              marginTop: theme.u(8),
              lineHeight: 1.35,
            }}
          >
            {supportText}
          </div>
        )}
      </div>
    );
  }

  // 2. PILL / RESTRAINED ARCHITECTURAL CONTAINER (Used in Pipelines, Systems)
  if (visualForm === 'pill' || visualForm === 'card') {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          background: isCurrent ? 'rgba(255, 255, 255, 0.07)' : 'rgba(255, 255, 255, 0.02)',
          border: `1px solid ${isCurrent ? theme.palette.accent : theme.palette.line}`,
          borderTop: `2px solid ${isCurrent ? theme.palette.accent : 'rgba(255, 255, 255, 0.12)'}`,
          padding: `${theme.u(14)}px ${theme.u(18)}px`,
          boxSizing: 'border-box',
          boxShadow: isCurrent ? `0 0 24px ${theme.palette.accent}20` : 'none',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.u(6) }}>
          <div
            style={{
              fontFamily: theme.font.mono,
              fontSize: typography.kicker * 0.8,
              color: isCurrent ? theme.palette.accent : theme.palette.muted,
              letterSpacing: '0.06em',
            }}
          >
            {stageNumber ? `STAGE 0${stageNumber}` : (role || 'SYSTEM')}
          </div>
          {isCurrent && (
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: theme.palette.accent }} />
          )}
        </div>
        <div
          style={{
            ...t.display,
            fontSize: isPrimary ? typography.primaryNode : typography.secondaryNode,
            color: theme.palette.text,
            fontWeight: 700,
            lineHeight: 1.15,
          }}
        >
          {label}
        </div>
        {supportText && (
          <div
            style={{
              fontSize: typography.supportText,
              color: theme.palette.muted,
              marginTop: theme.u(6),
              lineHeight: 1.3,
            }}
          >
            {supportText}
          </div>
        )}
      </div>
    );
  }

  // 3. CIRCLE / RADIAL NODE (Used in Cycles, Hub Networks)
  if (visualForm === 'circle') {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
          background: isCurrent ? `${theme.palette.accent}14` : 'rgba(255, 255, 255, 0.03)',
          border: `1.5px solid ${isCurrent ? theme.palette.accent : theme.palette.line}`,
          borderRadius: 8,
          padding: theme.u(12),
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            ...t.display,
            fontSize: isPrimary ? typography.primaryNode : typography.secondaryNode,
            color: isCurrent ? theme.palette.text : theme.palette.muted,
            fontWeight: 700,
            lineHeight: 1.1,
          }}
        >
          {label}
        </div>
        {supportText && (
          <div
            style={{
              fontSize: typography.supportText * 0.9,
              color: theme.palette.muted,
              marginTop: theme.u(4),
              lineHeight: 1.25,
            }}
          >
            {supportText}
          </div>
        )}
      </div>
    );
  }

  // 4. TEXT ONLY / MINIMAL CAUSE-EFFECT
  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          ...t.display,
          fontSize: isPrimary ? typography.primaryNode * 1.1 : typography.secondaryNode,
          color: isCurrent ? theme.palette.text : theme.palette.muted,
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      {supportText && (
        <div style={{ fontSize: typography.supportText, color: theme.palette.muted, marginTop: theme.u(6) }}>
          {supportText}
        </div>
      )}
    </div>
  );
}

/**
 * Editorial Conflict / Balance Badge between opposing concepts in Comparison/Relationship.
 */
function CentralConflictBadge({ spec, layoutCtx, theme, frame }) {
  const { isVertical, primaryVisualArea, typography } = layoutCtx;
  const p = progress(frame, spec.frameAt + 4, 18, ease.out);
  const cx = primaryVisualArea.x + primaryVisualArea.width / 2;
  const cy = primaryVisualArea.y + primaryVisualArea.height / 2;

  const label = spec.conclusionLabel || (spec.grammar === 'COMPARISON' ? 'PARADIGM CONFLICT' : 'DECISION ARBITRATION');

  return (
    <div
      style={{
        position: 'absolute',
        left: cx,
        top: cy,
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        flexDirection: isVertical ? 'row' : 'column',
        alignItems: 'center',
        gap: theme.u(8),
        zIndex: 8,
        opacity: 0.4 + 0.6 * p,
      }}
    >
      <div style={{ height: 1, width: theme.u(isVertical ? 40 : 120), background: theme.palette.line }} />
      <div
        style={{
          fontFamily: theme.font.mono,
          fontSize: typography.kicker * 0.8,
          color: theme.palette.accent,
          background: 'rgba(10, 12, 18, 0.92)',
          border: `1px solid ${theme.palette.accent}55`,
          padding: `${theme.u(4)}px ${theme.u(12)}px`,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        ✦ {label}
      </div>
      <div style={{ height: 1, width: theme.u(isVertical ? 40 : 120), background: theme.palette.line }} />
    </div>
  );
}

// ─── Legacy Supporting Primitives with Format & Typography Polish ──────────

/**
 * Geopolitical Supply Chain & Location Map Primitive.
 */
export function MapShot({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const {
    title = 'GLOBAL DEPENDENCY MAP',
    regions = [
      { name: 'ASML // Netherlands', role: 'EUV Monopolist', x: 48, y: 30 },
      { name: 'TSMC // Taiwan', role: 'Fabrication Hub', x: 78, y: 54 },
      { name: 'NVIDIA // Silicon Valley', role: 'Chip Architecture', x: 20, y: 38 },
    ],
    at = 4,
  } = clip.overlay || {};

  const p = progress(frame, at, 22, ease.out);

  return (
    <AbsoluteFill>
      <Ground texture={clip.texture} durationInFrames={clip.durationInFrames} mode={clip.overlay?.backgroundMode || 'technicalGrid'} />
      <div
        style={{
          position: 'absolute',
          left: theme.safe.left,
          right: theme.safe.right,
          top: theme.safe.top,
          bottom: theme.safe.bottom + captionBand(theme) * 0.6,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        {title && (
          <div style={{ marginBottom: theme.u(20) }}>
            <Kicker text={title} at={0} />
          </div>
        )}

        <div
          style={{
            position: 'relative',
            width: '100%',
            height: theme.u(theme.isVertical ? 420 : 420),
            background: 'rgba(255, 255, 255, 0.02)',
            border: `1px solid ${theme.palette.line}`,
            overflow: 'hidden',
          }}
        >
          <svg width="100%" height="100%" style={{ position: 'absolute', left: 0, top: 0, opacity: 0.25 }}>
            <path
              d="M 120 120 Q 200 90 280 140 T 420 180 T 640 130 T 820 190 T 1100 160"
              fill="none"
              stroke={theme.palette.line}
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
          </svg>

          {regions.map((reg, i) => {
            const regProgress = progress(frame, at + i * 10, 16);
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${reg.x}%`,
                  top: `${reg.y}%`,
                  transform: 'translate(-50%, -50%)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  opacity: 0.4 + 0.6 * regProgress,
                }}
              >
                <div style={{ position: 'relative', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: theme.palette.accent }} />
                </div>
                <div style={{ ...t.label, color: theme.palette.text, fontWeight: 700, fontSize: theme.size.small * (theme.isVertical ? 1.25 : 1), marginTop: 4, whiteSpace: 'nowrap' }}>
                  {reg.name}
                </div>
                {reg.role && (
                  <div style={{ fontFamily: theme.font.mono, fontSize: theme.size.small * (theme.isVertical ? 1.05 : 0.85), color: theme.palette.accent, whiteSpace: 'nowrap' }}>
                    [{reg.role}]
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}

/**
 * Modern Code Shot with Syntax Highlighting and Line Focus.
 */
export function ModernCodeShot({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const {
    filename = 'src/agent/loop.js',
    code = `while (!task.completed) {\n  const plan = await model.reason(task);\n  const action = await plan.selectTool();\n  const result = await env.execute(action);\n}`,
    highlightLines = [2, 3],
    terminal = '$ agent run "refactor auth"\n[step 1/3] Reading auth.js...\n[step 2/3] Patch applied.',
    at = 4,
  } = clip.overlay || {};

  const lines = (code || '').split('\n');
  const p = progress(frame, at, 16, ease.out);

  return (
    <AbsoluteFill>
      <Ground texture={clip.texture} durationInFrames={clip.durationInFrames} mode={clip.overlay?.backgroundMode || 'neutralDark'} />
      <div
        style={{
          position: 'absolute',
          left: theme.safe.left,
          right: theme.safe.right,
          top: theme.safe.top,
          bottom: theme.safe.bottom + captionBand(theme) * 0.6,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            maxWidth: theme.u(theme.isVertical ? 960 : 1080),
            margin: '0 auto',
            width: '100%',
            background: 'rgba(15, 18, 25, 0.94)',
            border: `1px solid ${theme.palette.line}`,
            borderRadius: 6,
            overflow: 'hidden',
            boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
            opacity: 0.45 + 0.55 * p,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.03)', borderBottom: `1px solid ${theme.palette.line}`, padding: '8px 16px', gap: 12 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#27c93f' }} />
            </div>
            <div style={{ fontFamily: theme.font.mono, fontSize: theme.size.small * (theme.isVertical ? 1.2 : 1), color: theme.palette.accent, background: 'rgba(255,255,255,0.06)', padding: '3px 12px', borderRadius: 4 }}>
              {filename}
            </div>
          </div>

          <div style={{ padding: '18px 24px', fontFamily: theme.font.mono, fontSize: theme.size.body * (theme.isVertical ? 1.05 : 0.88), lineHeight: 1.6, overflowX: 'hidden' }}>
            {lines.map((line, i) => {
              const lineNum = i + 1;
              const isHl = highlightLines.includes(lineNum);
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    background: isHl ? `${theme.palette.accent}18` : 'transparent',
                    borderLeft: isHl ? `3px solid ${theme.palette.accent}` : '3px solid transparent',
                    paddingLeft: 8,
                    margin: '2px 0',
                  }}
                >
                  <span style={{ color: 'rgba(255,255,255,0.25)', width: 32, userSelect: 'none', textAlign: 'right', marginRight: 16 }}>
                    {lineNum}
                  </span>
                  <span style={{ color: isHl ? theme.palette.text : theme.palette.muted }}>
                    {line}
                  </span>
                </div>
              );
            })}
          </div>

          {terminal && (
            <div style={{ borderTop: `1px solid ${theme.palette.line}`, background: 'rgba(0,0,0,0.5)', padding: '12px 24px', fontFamily: theme.font.mono, fontSize: theme.size.small * (theme.isVertical ? 1.1 : 0.95), color: '#38bdf8' }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{terminal}</pre>
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
}

/**
 * Modern Workspace / UI Shot.
 */
export function ModernUiShot({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const {
    title = 'REPOSITORY WORKSPACE',
    activeFile = 'src/agent.js',
    fileTree = ['src/agent.js', 'src/tools.js', 'src/context.js', 'tests/agent.test.js'],
    searchQuery = 'semantic search: context window',
    status = 'Tool Call #14: git diff verified',
    at = 4,
  } = clip.overlay || {};

  const p = progress(frame, at, 18, ease.out);

  return (
    <AbsoluteFill>
      <Ground texture={clip.texture} durationInFrames={clip.durationInFrames} mode={clip.overlay?.backgroundMode || 'neutralDark'} />
      <div
        style={{
          position: 'absolute',
          left: theme.safe.left,
          right: theme.safe.right,
          top: theme.safe.top,
          bottom: theme.safe.bottom + captionBand(theme) * 0.6,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: theme.u(theme.isVertical ? 960 : 1080),
            margin: '0 auto',
            border: `1px solid ${theme.palette.line}`,
            borderRadius: 6,
            background: 'rgba(15, 18, 25, 0.95)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
            overflow: 'hidden',
            opacity: 0.45 + 0.55 * p,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', padding: '10px 18px', borderBottom: `1px solid ${theme.palette.line}`, background: 'rgba(255,255,255,0.03)', gap: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: theme.palette.accent }} />
            <div style={{ fontFamily: theme.font.mono, fontSize: theme.size.small * (theme.isVertical ? 1.2 : 1), color: theme.palette.muted, flex: 1 }}>
              🔍 {searchQuery}
            </div>
          </div>

          <div style={{ display: 'flex', minHeight: theme.u(260) }}>
            <div style={{ width: '35%', borderRight: `1px solid ${theme.palette.line}`, padding: '14px 18px', fontFamily: theme.font.mono, fontSize: theme.size.small * (theme.isVertical ? 1.1 : 1) }}>
              <div style={{ color: theme.palette.accent, marginBottom: 8, letterSpacing: '0.1em' }}>FILES</div>
              {fileTree.map((f, i) => {
                const isActive = f === activeFile;
                return (
                  <div key={i} style={{ color: isActive ? theme.palette.text : theme.palette.muted, fontWeight: isActive ? 700 : 400, margin: '6px 0', paddingLeft: 6, borderLeft: isActive ? `2px solid ${theme.palette.accent}` : '2px solid transparent' }}>
                    📄 {f}
                  </div>
                );
              })}
            </div>

            <div style={{ flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontSize: theme.size.h2 * (theme.isVertical ? 0.9 : 0.75), fontWeight: 700, color: theme.palette.text, marginBottom: 8 }}>
                {title}
              </div>
              <div style={{ fontFamily: theme.font.mono, fontSize: theme.size.body * (theme.isVertical ? 1.05 : 0.85), color: '#38bdf8', lineHeight: 1.5 }}>
                {status}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}
