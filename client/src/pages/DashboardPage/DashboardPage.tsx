import { ProjectSubNav } from '../../components/ProjectSubNav/ProjectSubNav.js';
import styles from './DashboardPage.module.css';

export function DashboardPage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Project</h1>
      <ProjectSubNav />
      <p className={styles.description}>
        Welcome to Cornerstone. This page will display an overview of your home building project,
        including recent activity, upcoming milestones, and budget summary.
      </p>
    </div>
  );
}

export default DashboardPage;
