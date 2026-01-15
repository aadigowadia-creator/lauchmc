import React from 'react';

interface ProgressBarProps {
  progress: number; // 0-100
  label?: string;
  showPercentage?: boolean;
  variant?: 'default' | 'success' | 'warning' | 'error';
  size?: 'small' | 'medium' | 'large';
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  label,
  showPercentage = true,
  variant = 'default',
  size = 'medium',
}) => {
  const clampedProgress = Math.min(Math.max(progress, 0), 100);

  return (
    <div className={`progress-bar-container progress-bar-${size}`}>
      {label && (
        <div className="progress-bar-header">
          <span className="progress-bar-label">{label}</span>
          {showPercentage && (
            <span className="progress-bar-percentage">{clampedProgress.toFixed(0)}%</span>
          )}
        </div>
      )}
      <div className="progress-bar-track">
        <div
          className={`progress-bar-fill progress-bar-fill-${variant}`}
          style={{ width: `${clampedProgress}%` }}
        >
          {!label && showPercentage && (
            <span className="progress-bar-percentage-inline">
              {clampedProgress.toFixed(0)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
