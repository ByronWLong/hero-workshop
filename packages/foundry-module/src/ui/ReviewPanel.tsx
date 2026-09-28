import type { HdcWriteReport } from '@hero-workshop/shared';

interface ReviewPanelProps {
  report: HdcWriteReport;
  /** Number of Foundry-side changes kept at the start of the session */
  keptFromFoundry: number;
  applyLabel: string;
  onBack(): void;
  onApply(): void;
}

/** Summarizes what applying will change, before the actor is re-imported */
export function ReviewPanel({ report, keptFromFoundry, applyLabel, onBack, onApply }: ReviewPanelProps) {
  const foundryWarnings = report.foundryIssues.filter((i) => i.severity === 'warning');
  const foundryErrors = report.foundryIssues.filter((i) => i.severity === 'error');

  return (
    <section className="hw-panel">
      <h2>Review changes</h2>

      {foundryErrors.length > 0 && (
        <div className="hw-banner hw-banner-error">
          {foundryErrors.map((issue, i) => (
            <div key={i}>{issue.message}</div>
          ))}
        </div>
      )}

      {report.warnings.length > 0 && (
        <>
          <h3>Not saved</h3>
          <ul className="hw-list hw-list-warning">
            {report.warnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        </>
      )}

      {keptFromFoundry > 0 && (
        <p className="hw-muted">
          Includes {keptFromFoundry} {keptFromFoundry === 1 ? 'change' : 'changes'} kept from the Foundry sheet.
        </p>
      )}

      <h3>Changes</h3>
      {report.changes.length ? (
        <ul className="hw-list">
          {report.changes.map((change, i) => (
            <li key={i}>{change}</li>
          ))}
        </ul>
      ) : (
        <p className="hw-muted">Only changes kept from Foundry will be applied.</p>
      )}

      {foundryWarnings.length > 0 && (
        <details className="hw-details">
          <summary>
            {foundryWarnings.length} Foundry compatibility {foundryWarnings.length === 1 ? 'note' : 'notes'}
          </summary>
          <ul className="hw-list hw-list-muted">
            {foundryWarnings.map((issue, i) => (
              <li key={i}>{issue.message}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="hw-panel-actions">
        <button className="btn btn-secondary" onClick={onBack}>
          Back to editing
        </button>
        <button className="btn btn-primary" onClick={onApply} disabled={foundryErrors.length > 0}>
          {applyLabel}
        </button>
      </div>
    </section>
  );
}
