// Reusable skeleton loader primitives — uses the .skeleton shimmer from design-system.css

export function Sk({ w = '100%', h = 14, r = 6, style = {} }) {
  return (
    <div
      className="skeleton"
      style={{ width: w, height: h, borderRadius: r, flexShrink: 0, ...style }}
    />
  )
}

export function SkeletonTableRows({ rows = 5, cols }) {
  const widths = ['70%', '55%', '60%', '45%', '50%', '40%', '35%']
  return Array.from({ length: rows }).map((_, i) => (
    <tr key={i} style={{ opacity: 1 - i * 0.12 }}>
      {widths.slice(0, cols).map((w, j) => (
        <td key={j}><Sk w={w} h={13} /></td>
      ))}
    </tr>
  ))
}

export function SkeletonConvItems({ rows = 8 }) {
  return Array.from({ length: rows }).map((_, i) => (
    <div
      key={i}
      className="conv-item"
      style={{ opacity: 1 - i * 0.09, pointerEvents: 'none' }}
    >
      <div className="skeleton conv-avatar" style={{ borderRadius: '50%', flexShrink: 0 }} />
      <div className="conv-info" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Sk w="55%" h={13} />
          <Sk w="20%" h={11} />
        </div>
        <Sk w="80%" h={11} />
      </div>
    </div>
  ))
}
