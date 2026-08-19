export const DECISION_LABEL = {
  granted: 'Granted',
  denied: 'Denied',
  unknown: 'Unknown',
  no_detection: 'No plate',
}

export default function Badge({ decision = 'unknown' }) {
  return (
    <span className={`badge ${decision}`}>
      <i className="dot" />
      {DECISION_LABEL[decision] || decision.replace('_', ' ')}
    </span>
  )
}
