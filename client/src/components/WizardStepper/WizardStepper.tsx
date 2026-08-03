import styles from './WizardStepper.module.css';

export interface WizardStep {
  id: string;
  label: string;
}

interface WizardStepperProps {
  steps: WizardStep[];
  currentStep: number; // 1-indexed
  onStepClick?: (step: number) => void;
  maxReachedStep?: number; // defaults to currentStep
  ariaLabel?: string; // aria-label for the stepper nav (defaults to "Report wizard")
  mobileStepLabel?: (current: number, total: number) => string; // custom step label for mobile
}

export function WizardStepper({
  steps,
  currentStep,
  onStepClick,
  maxReachedStep = currentStep,
  ariaLabel = 'Report wizard',
  mobileStepLabel = (current, total) => `Step ${current} of ${total}`,
}: WizardStepperProps) {
  return (
    <>
      {/* Mobile stepper - hidden on desktop via CSS */}
      <div className={styles.stepperMobile}>
        <p className={styles.stepCount}>{mobileStepLabel(currentStep, steps.length)}</p>
        <div className={styles.dotIndicators} aria-hidden="true">
          {steps.map((step) => {
            const stepNum = steps.indexOf(step) + 1;
            const isCompleted = stepNum < currentStep;
            const isCurrent = stepNum === currentStep;
            return (
              <div
                key={step.id}
                className={`${styles.dot} ${
                  isCompleted || isCurrent ? styles.dotFilled : styles.dotOutline
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* Desktop stepper - hidden on mobile via CSS */}
      <nav className={styles.stepper} aria-label={ariaLabel}>
        <ol className={styles.stepList}>
          {steps.map((step, idx) => {
            const stepNum = idx + 1;
            const isCompleted = stepNum < currentStep;
            const isCurrent = stepNum === currentStep;
            const isUpcoming = stepNum > maxReachedStep;

            const isClickable = stepNum <= maxReachedStep && onStepClick;

            return (
              <li
                key={step.id}
                className={`${styles.stepItem} ${
                  isCompleted ? styles.stepCompleted : ''
                } ${isCurrent ? styles.stepCurrent : ''} ${isUpcoming ? styles.stepUpcoming : ''}`}
              >
                {isClickable ? (
                  <button
                    type="button"
                    className={styles.stepButton}
                    onClick={() => onStepClick?.(stepNum)}
                    aria-label={step.label}
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    <span className={styles.circle}>{stepNum}</span>
                    <span className={styles.label}>{step.label}</span>
                  </button>
                ) : (
                  <div
                    className={styles.stepButtonDisabled}
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    <span className={styles.circle}>{stepNum}</span>
                    <span className={styles.label}>{step.label}</span>
                  </div>
                )}
                {idx < steps.length - 1 && <div className={styles.connector} />}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
