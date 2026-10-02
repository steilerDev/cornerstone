---
sidebar_position: 11
title: Backups
---

# Backups

Cornerstone has a built-in backup feature that snapshots your entire app data directory -- the SQLite database and any associated files like diary photos -- into a single compressed archive. Backups can be created manually from the admin UI or run automatically on a schedule, with optional retention limits to keep the backup directory tidy.

This guide walks through configuring the backup directory, scheduling automatic backups, and restoring from an archive when you need to roll back.

## What Gets Backed Up

A backup is a `tar.gz` archive of the **entire app data directory** -- the same directory that contains your SQLite database file (`cornerstone.db` by default). That means a single archive captures:

- A consistent snapshot of the SQLite database (work items, budgets, users, vendors, diary entries, etc.)
- Diary photo attachments stored under the data directory
- Any other state Cornerstone keeps next to the database

Cornerstone uses SQLite's online backup API to snapshot the database safely while it is running, so you do not need to stop the container to take a backup. The snapshot is a frozen point-in-time copy of the database; it never includes the live database file or transaction log (`-wal` or `-shm` files).

Archives are named with a UTC timestamp:

```
cornerstone-backup-2026-04-29T143022Z.tar.gz
```

Archives created by earlier Cornerstone versions (which contained the live database files alongside snapshots) can still be restored; the restore process automatically detects the archive format and restores all restorable data.

## Configuration

All backup behaviour is controlled by three environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKUP_DIR` | `/backups` | Directory where backup archives are written. Must be outside the app data directory. |
| `BACKUP_CADENCE` | -- | Cron expression for automatic scheduled backups. If unset, only manual backups are available. |
| `BACKUP_RETENTION` | -- | Maximum number of backup archives to keep. Oldest are deleted when the limit is exceeded. If unset, archives are kept indefinitely. |

These are also listed alongside the other server settings in [Configuration](/getting-started/configuration#backups).

:::caution `BACKUP_DIR` must be outside the app data directory
Cornerstone refuses to start if `BACKUP_DIR` is the same as -- or a subdirectory of -- the app data directory (the directory that contains your SQLite database). Storing backups inside the data directory would mean the next backup would also archive the previous backup, ballooning archive size and defeating the purpose. Always mount a separate volume or path for backups.
:::

## Mounting the Backup Directory

The default `BACKUP_DIR` is `/backups` inside the container, but that path is only useful if you mount a host directory or named volume to it -- otherwise archives live in the container's writable layer and disappear when the container is recreated.

### Docker Run

```bash
docker run -d \
  --name cornerstone \
  -p 3000:3000 \
  -v cornerstone-data:/app/data \
  -v cornerstone-backups:/backups \
  steilerdev/cornerstone:latest
```

To bind-mount a host directory instead:

```bash
docker run -d \
  --name cornerstone \
  -p 3000:3000 \
  -v cornerstone-data:/app/data \
  -v /path/on/host/cornerstone-backups:/backups \
  steilerdev/cornerstone:latest
```

A bind mount is often the easier choice for backups because the archives are directly accessible from the host -- you can copy them off-site, list them with `ls`, or hand them to your existing backup tooling without having to enter the container.

### Docker Compose

```yaml
services:
  cornerstone:
    image: steilerdev/cornerstone:latest
    ports:
      - '3000:3000'
    volumes:
      - cornerstone-data:/app/data
      - cornerstone-backups:/backups
    environment:
      BACKUP_CADENCE: '0 2 * * *'
      BACKUP_RETENTION: '30'

volumes:
  cornerstone-data:
  cornerstone-backups:
```

## Manual Backups

When the backup feature is configured, a **Backups** entry appears in the admin sidebar (admins only).

From the Backups page you can:

- **Create Backup** -- triggers a new backup archive immediately
- **Restore** -- restores from a selected archive (see [Restoring from a Backup](#restoring-from-a-backup) below)
- **Delete** -- removes a specific archive from disk

The list shows each archive's filename, creation timestamp, and size on disk, sorted newest-first.

:::note Admin-only
All backup actions -- create, list, restore, and delete -- require an admin role. Members do not see the Backups page.
:::

## Scheduled Backups

Set `BACKUP_CADENCE` to a standard cron expression to run backups automatically. Cornerstone uses the [node-cron](https://www.npmjs.com/package/node-cron) parser, which supports the standard 5-field cron syntax:

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 7, 0 and 7 = Sunday)
│ │ │ │ │
* * * * *
```

### Common Cadences

| Cron expression | Schedule |
|-----------------|----------|
| `0 2 * * *` | Daily at 02:00 |
| `0 2 * * 0` | Weekly on Sunday at 02:00 |
| `0 2 1 * *` | Monthly on the 1st at 02:00 |
| `0 */6 * * *` | Every 6 hours |
| `30 1 * * 1-5` | Weekdays at 01:30 |

### Docker Compose Example

```yaml
services:
  cornerstone:
    image: steilerdev/cornerstone:latest
    volumes:
      - cornerstone-data:/app/data
      - cornerstone-backups:/backups
    environment:
      BACKUP_CADENCE: '0 2 * * *'   # Daily at 2 AM
      BACKUP_RETENTION: '14'        # Keep last 14 archives
```

Scheduled backups run with the same logic as manual ones -- they appear in the Backups page list immediately and respect the retention policy. The schedule uses the container's local time zone (UTC by default in most Docker images).

:::tip
If a scheduled backup fails -- for example because the backup directory is full or read-only -- the failure is logged but does not crash the server. Check the container logs to confirm scheduled backups are running successfully.
:::

## Retention Policy

Set `BACKUP_RETENTION` to a positive integer to cap the number of archives Cornerstone keeps. After every backup (manual or scheduled), Cornerstone counts the archives in `BACKUP_DIR` and deletes the oldest ones until the count is at or below the limit.

For example, with `BACKUP_RETENTION=7` and a daily cadence, you always have roughly the last week of backups on disk.

If `BACKUP_RETENTION` is unset, archives accumulate indefinitely -- you are responsible for pruning them manually.

:::caution Retention only counts valid archives
The retention sweep only inspects files matching the `cornerstone-backup-*.tar.gz` naming pattern. Other files in `BACKUP_DIR` are ignored, so you can safely keep notes or off-site copies alongside the managed archives without risking accidental deletion.
:::

## Restoring from a Backup

Restoring replaces the **entire app data directory** with the contents of the selected archive. Any work items, budgets, photos, or other data added since that backup was taken will be lost.

To restore:

1. Open the **Backups** page (admin only)
2. Find the archive you want to restore from
3. Click **Restore** and confirm the warning dialog
4. Cornerstone returns a confirmation, closes the database, swaps the data directory in place, and exits

After the process exits, your container orchestrator (Docker, Compose, Kubernetes, etc.) will restart the container automatically -- and the new instance comes up against the restored data.

:::caution Restoring is destructive
A restore replaces all current data with the archive contents. This is a **full replacement** -- work items, budgets, photos, and other files added since the backup was taken will be permanently deleted. There is no automatic "undo." Before restoring, take a fresh manual backup of your current data so you can roll forward again if you change your mind. The previous data is removed immediately after the restore succeeds; there is no timestamped copy kept for recovery.
:::

:::note Restart policy required
The restore flow exits the Node.js process intentionally so the new data directory is picked up cleanly on the next start. This requires your container restart policy to be set to **`unless-stopped`** or **`always`**. The policy `on-failure` does **not** work for a successful restore, because the process exits with code 0 (which signals "do not restart" to Docker). A bare `docker run` without a `--restart` flag will stop after the restore and stay stopped -- you must start it manually. The default `docker-compose.yml` and `docker run` examples in this documentation use `restart: unless-stopped`, which is correct.
:::

### Restoring on a New Host

To migrate Cornerstone to a different machine using a backup:

1. Copy the `.tar.gz` archive from the source host's `BACKUP_DIR` to the new host
2. Start a fresh Cornerstone container on the new host with the same `BACKUP_DIR` mount
3. Drop the archive into the mounted backup directory
4. Open the Backups page on the new host -- the archive appears in the list
5. Click **Restore** and confirm

The restore flow rebuilds the data directory from the archive, so the new host comes up with the same database, photos, and configuration.

### Restore Failure Handling

If a restore fails:

- **Archive rejected during validation** (corrupt, from a newer version, or missing the database) -- the server logs the failure (`RESTORE_FAILED`), **keeps running** with your current data intact, and another backup or restore can be started. No data is modified. Check the container logs for details and try a different archive. The web interface still shows the 'Server is restarting' message, so if the data looks unchanged after refreshing, check the container logs.
- **Swap failure** -- if the data swap encounters an error after the archive is validated, the server automatically rolls back to reinstate your original data, logs the error, and exits with code 1. On restart, your original data is restored.

:::info
If a restore is interrupted by a crash (for example, power loss) during the swap, the next startup detects it automatically. If the swap had not finished, your original data is reinstated. If it had finished, the leftover temporary files are removed and the restored data is kept.
:::

### Disk Space and Photo Storage Limitations

**Disk space during restore:** A restore temporarily needs free space on the data volume about equal to the extracted archive size. The restore process stages the extracted archive in the data directory, then swaps it in place. If the volume runs out of space during extraction, the restore fails and your original data is not modified.

**Photo storage limitation:** If `PHOTO_STORAGE_PATH` is configured to point outside the data directory, photos are neither backed up nor restored. Only the database and files stored within the data directory are included in archives. This is typically only relevant if you have customized the photo storage location.

## Off-Site Copies

Cornerstone's backup feature manages archives on a single volume. For true disaster recovery, copy archives to a different machine or cloud storage on a regular basis. Some options:

- **`rsync` to a remote host:** schedule `rsync` (or `restic`, `rclone`, etc.) on the host to mirror the bind-mounted backup directory to off-site storage
- **Cloud sync agents:** point a tool like `rclone` at the bind-mounted directory to sync to S3, Backblaze B2, Google Drive, etc.
- **Snapshot the volume:** if you use ZFS, btrfs, or a managed volume service, take periodic snapshots of the volume holding `BACKUP_DIR`

Bind mounts make this easier than named volumes, since the archives live at a known host path you can hand to standard tooling.

## Troubleshooting

### "The backup could not be created"

Backups are always enabled (`BACKUP_DIR` defaults to `/backups`). This UI message appears when a backup operation fails. Check the container logs for the specific error — the server logs one of three possible lines and the fix depends on which one:

- **`Backup directory could not be created or is not writable`** — `BACKUP_DIR` or its parent directory must be creatable and writable by the container user (typically `node`, UID 1000). A bind-mounted or named volume must exist and not be mounted read-only.
- **`Database snapshot failed`** — The database backup step failed. The underlying SQLite error (e.g., `SQLITE_FULL`, `SQLITE_CORRUPT`) is appended to this log line in the container log (`docker logs <container>`). Check the container logs for the specific error and ensure sufficient free space on the filesystem.
- **`Backup archive could not be created`** — The backup archive cannot be written. Verify the filesystem has sufficient free space and the backup directory is writable.

:::info
If no host directory or volume is mounted at `BACKUP_DIR`, backup archives land in Docker's anonymous `/backups` volume and are lost if the container is removed with its volumes. Always bind-mount or use a named volume at `BACKUP_DIR` to persist backups.
:::

**To fix:** Check container logs to identify which error occurred above, then apply the corresponding fix. `BACKUP_DIR` and its parent must be creatable and writable by the container user.

### "The backup archive could not be read, so nothing was restored"

This error occurs when a restore operation finds the backup archive file but cannot read it. The archive exists but is not readable by the container user (typically `node`, UID 1000). Check that:

- The archive file permissions allow the container user to read it
- The archive file ownership is correct (or the file is world-readable)
- The filesystem allows the container user to access the file

**To fix:** Adjust the archive file's permissions or ownership so the container user can read it, then retry the restore.

### A scheduled backup didn't run

- Check container logs for messages starting with `Backup scheduler initialized` (logged at startup) and `Scheduled backup` (logged on each run)
- Verify your cron expression with a tool like [crontab.guru](https://crontab.guru/)
- Remember the schedule uses the container's time zone (UTC by default) -- a `0 2 * * *` schedule fires at 02:00 UTC, which may not be 2 AM in your local time

### "Backup in progress"

Only one backup or restore can run at a time. If you trigger a manual backup while a scheduled one is still running -- or while a restore is mid-flight -- the second request is rejected. Wait for the first operation to finish and try again.
