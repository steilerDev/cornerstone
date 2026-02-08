import styles from './TimelinePage.module.css';

export function TimelinePage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Timeline</h1>
      <p className={styles.description}>
        View your project timeline in a Gantt chart. Visualize task dependencies, milestones, and
        project schedule.
      </p>
    </div>
  );
}

export default TimelinePage;
