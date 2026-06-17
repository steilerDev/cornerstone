# v2.9.0 Release Summary

## What's New

This release polishes the mobile photo workflow introduced in 2.8.0. The "Add photo details" modal now shows a preview of the photo you just picked, and choosing where a photo was taken is far clearer when your home has rooms with the same name on different floors. No manual migration steps are required.

### Highlights

- **Photo preview while tagging** -- The "Add photo details" modal now shows a preview of the photo you just selected, right above the description field. You can confirm you picked the right shot before adding its caption, area, and orientation -- handy when you are snapping several photos in a row on site.

- **Clearer area picker** -- When tagging a photo (or a work item or household item) with its location, the area picker now indents each option to show its place in your hierarchy and prints the full path (e.g. *Ground Floor › Kitchen*) beneath the name. Telling apart a "Bathroom" on the ground floor from one upstairs is now obvious. Once you pick an area, the field collapses to just the short room name to stay tidy.

- **Smarter orientation search** -- The orientation picker now searches your descriptions as well as the names. Typing *street* finds an orientation named *South* whose description reads *Street-facing side of house*, so you do not have to remember the exact label you gave it.

### Behind the Scenes

- Hardened the photo-capture and internationalization browser tests, and tightened the continuous-integration pipeline so releases stay reliable.

## Upgrade

\`\`\`bash
docker pull steilerdev/cornerstone:latest
\`\`\`

Restart your container. Schema migrations run automatically on first boot.
