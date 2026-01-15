import React from 'react';

interface ErrorSolution {
  message: string;
  steps: string[];
}

interface LauncherErrorData {
  code: string;
  userMessage: string;
  solution: ErrorSolution;
}

interface ErrorDisplayProps {
  error: LauncherErrorData | Error | string;
  onDismiss?: () => void;
  onRetry?: () => void;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  onDismiss,
  onRetry,
}) => {
  const isLauncherError = (err: any): err is LauncherErrorData => {
    return err && typeof err === 'object' && 'code' in err && 'solution' in err;
  };

  const renderError = () => {
    if (isLauncherError(error)) {
      return (
        <>
          <div className="error-header">
            <span className="error-icon">❌</span>
            <h3 className="error-title">{error.userMessage}</h3>
          </div>

          <div className="error-body">
            <p className="error-description">{error.solution.message}</p>

            {error.solution.steps.length > 0 && (
              <div className="error-solutions">
                <h4>How to fix this:</h4>
                <ol className="solution-steps">
                  {error.solution.steps.map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ol>
              </div>
            )}

            {process.env.NODE_ENV === 'development' && (
              <details className="error-code-details">
                <summary>Error Code: {error.code}</summary>
              </details>
            )}
          </div>
        </>
      );
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    return (
      <>
        <div className="error-header">
          <span className="error-icon">❌</span>
          <h3 className="error-title">Error</h3>
        </div>
        <div className="error-body">
          <p className="error-description">{errorMessage}</p>
        </div>
      </>
    );
  };

  return (
    <div className="error-display">
      {renderError()}

      <div className="error-actions">
        {onRetry && (
          <button onClick={onRetry} className="btn-retry">
            Try Again
          </button>
        )}
        {onDismiss && (
          <button onClick={onDismiss} className="btn-dismiss">
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
};
